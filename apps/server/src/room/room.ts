import {
  canSend,
  closeCodes,
  decode,
  encode,
  hostToRelaySchema,
  keepAlive,
  phoneToRelaySchema,
  seatCount,
  type HostToRelayMessage,
  type PhoneToRelayMessage,
  type PlayerId,
  type RelayToHostMessage,
  type RelayToPhoneMessage,
} from "@couchcade/protocol";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { isRoomFull, memberCount, planPromotions, promotesIn, type Waiting } from "./audience.ts";
import { fullBucket, takeToken } from "./flood.ts";
import { readIdentity } from "./identity.ts";
import {
  activityResolutionMs,
  closeDeadline,
  roomState,
  type LifecycleFacts,
} from "./lifecycle.ts";
import { kickPlayer, lockRoom, refusalFor } from "./moderation.ts";
import { arrivalOf, isSeatDue, seatExpiresAt } from "./reconnect.ts";
import { answerTarget } from "./rtc.ts";
import { defaultProfile, RoomStorage, type PlayerRecord, type RoomMeta } from "./storage.ts";
import {
  hostTag,
  isHostState,
  isPhoneState,
  lowestFreeSlot,
  phoneTag,
  toPlayerInfo,
  type HostSocketState,
  type PhoneSocketState,
  type SocketState,
} from "./sockets.ts";
import { pickView } from "./views.ts";

type Socket = Connection<SocketState>;

/** Paths the Worker calls with `stub.fetch()`. Never routed from the internet. */
export const internalPaths = {
  create: "/internal/create",
  status: "/internal/status",
} as const;

/** Body of a `GET /internal/status` answer. */
export interface RoomStatus {
  state: ReturnType<typeof roomState>;
  locked: boolean;
  /**
   * Phones in the room, players and audience together: every connected player, plus players who
   * dropped and still hold their place (audience.ts, `memberCount`).
   */
  phones: number;
}

/**
 * One room: who is connected, and forwarding between the host and the phones. It never runs game
 * rules. Rules it follows (docs/architecture/platform.md, "Hibernation rules"):
 *
 * - Sockets are accepted with the Hibernation API, and memory is treated as wiped between events.
 *   Per-socket data lives in socket state, room data in SQLite.
 * - Deadlines use one Durable Object alarm: the room's close deadline and every reserved seat's
 *   2-minute window. Nothing in this folder waits on a timer.
 * - No storage write per message. `onMessage` only takes a token from the socket's flood bucket
 *   (socket state, flood.ts), checks size, parses, checks the role and forwards. A flooding socket
 *   costs one write, when it is revoked.
 */
export class Room extends Server {
  static override options = { hibernate: true };

  readonly #storage: RoomStorage;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.#storage = new RoomStorage(ctx.storage.sql);
    // Keep-alive never wakes the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(keepAlive.ping, keepAlive.pong));
  }

  // ---- Internal HTTP ---------------------------------------------------------------------------

  override async onRequest(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && pathname === internalPaths.create) {
      const now = Date.now();
      if (!this.#storage.create(this.name, now)) {
        return Response.json({ error: "room-active" }, { status: 409 });
      }
      await this.#scheduleAlarm(now);
      return Response.json({ code: this.name }, { status: 201 });
    }
    if (request.method === "GET" && pathname === internalPaths.status) {
      const meta = this.#storage.readMeta();
      if (!meta) {
        await this.#forgetStrayRoom();
        return Response.json({ error: "not-found" }, { status: 404 });
      }
      const status: RoomStatus = {
        state: roomState(this.#facts(meta)),
        locked: meta.locked,
        phones: this.#memberCount(),
      };
      return Response.json(status);
    }
    return Response.json({ error: "not-found" }, { status: 404 });
  }

  // ---- Sockets ---------------------------------------------------------------------------------

  override getConnectionTags(_connection: Connection, ctx: ConnectionContext): string[] {
    const identity = readIdentity(ctx.request.headers);
    if (!identity) return [];
    return [identity.role === "host" ? hostTag : phoneTag];
  }

  override async onConnect(connection: Socket, ctx: ConnectionContext): Promise<void> {
    const meta = this.#storage.readMeta();
    if (!meta) {
      connection.close(closeCodes.roomClosed, "Room closed");
      await this.#forgetStrayRoom();
      return;
    }
    const identity = readIdentity(ctx.request.headers);
    if (!identity) {
      connection.close(1008, "Missing identity");
      return;
    }
    if (identity.role === "host") {
      this.#connectHost(connection, meta);
    } else {
      this.#connectPhone(connection, meta, identity.playerId, identity.name);
    }
  }

  override async onMessage(connection: Socket, message: WSMessage): Promise<void> {
    // Frames still queued behind a flood close are ignored, so the violation is handled once.
    if (connection.readyState !== WebSocket.READY_STATE_OPEN) return;
    const stored = connection.state as SocketState | null;
    if (!stored) return;
    // Every frame counts, before any check can drop it (docs/architecture/security.md).
    const now = Date.now();
    const flood = takeToken(stored.flood, now);
    if (!flood) {
      this.#revoke(connection, stored, now);
      return;
    }
    const state = { ...stored, flood };
    connection.setState(state);
    if (isHostState(state)) {
      const result = decode(hostToRelaySchema, message);
      if (result.ok && canSend("host", result.message.t)) {
        await this.#onHostMessage(connection, state, result.message);
      }
    } else if (isPhoneState(state)) {
      const result = decode(phoneToRelaySchema, message);
      if (result.ok && canSend(state.role, result.message.t)) {
        this.#onPhoneMessage(connection, state, result.message);
      }
    }
  }

  override async onClose(connection: Socket): Promise<void> {
    const state = connection.state as SocketState | null;
    if (!state) return;
    const meta = this.#storage.readMeta();
    if (!meta) return;
    const now = Date.now();

    if (isHostState(state)) {
      // A newer host tab replaced this one: the room still has its host.
      if (this.#firstHost(connection.id)) return;
      this.#storage.setHostSeenAt(now);
      this.#sendToPhones({ t: "room:host", d: { connected: false } });
      await this.#scheduleAlarm(now);
      return;
    }
    if (isPhoneState(state)) {
      if (this.#phoneById(state.id, connection.id)) return;
      if (this.#storage.readPlayer(state.id)?.leftAt != null) return;
      // The seat, colour and score stay reserved for 2 minutes. The alarm releases them after.
      this.#storage.markLeft(state.id, now);
      this.#sendToHost({ t: "player:left", d: { id: state.id, reason: "disconnected" } });
      await this.#scheduleAlarm(now);
    }
  }

  override async onAlarm(): Promise<void> {
    const meta = this.#storage.readMeta();
    if (!meta) {
      await this.#forgetStrayRoom();
      return;
    }
    const now = Date.now();
    const reserved = this.#releaseDueSeats(now);
    if (now >= closeDeadline(this.#facts(meta))) {
      await this.#closeRoom();
    } else {
      await this.ctx.storage.setAlarm(this.#nextDeadline(meta, now, reserved));
    }
  }

  // ---- Connecting ------------------------------------------------------------------------------

  #connectHost(connection: Socket, meta: RoomMeta): void {
    const now = Date.now();
    if (meta.hostRevoked) {
      connection.close(closeCodes.flooding, "Flooding");
      return;
    }
    const previous = this.#firstHost(connection.id);
    connection.setState({ role: "host", lastActiveAt: now, flood: fullBucket(now) });
    if (previous) previous.close(closeCodes.replaced, "Replaced by a newer connection");

    this.#send(connection, {
      t: "room:welcome",
      d: { role: "host", code: meta.code, phase: meta.phase, locked: meta.locked },
    });
    for (const phone of this.#phones()) {
      const player = toPlayerInfo(phone.state as PhoneSocketState);
      this.#send(connection, { t: "player:joined", d: { player } });
    }
    // Seats kept for dropped phones, so a TV that reloaded shows them as away.
    for (const record of this.#storage.readReservedPlayers()) {
      this.#send(connection, { t: "player:joined", d: { player: toPlayerInfo(record, false) } });
    }
    // The last round snapshot, so a TV that reloaded mid-game resumes at the next round.
    const snapshot = this.#storage.readSnapshot();
    if (snapshot) this.#send(connection, { t: "room:snapshot", d: snapshot });
    if (!previous) this.#sendToPhones({ t: "room:host", d: { connected: true } });
  }

  #connectPhone(connection: Socket, meta: RoomMeta, id: string, name: string): void {
    const now = Date.now();
    // Seats whose window ran out are free before anyone is seated, even if the alarm is late.
    const reserved = this.#releaseDueSeats(now);
    const previous = this.#phoneById(id, connection.id);
    const record = this.#storage.readPlayer(id);

    // Kicked (4003) and revoked (4008) players are refused before any seat check.
    const refusal = refusalFor(record);
    if (refusal) {
      connection.close(refusal.code, refusal.reason);
      return;
    }
    const arrival = arrivalOf(record, now);
    if (arrival === "expired") {
      connection.close(closeCodes.seatExpired, "Seat expired");
      return;
    }
    // Back inside the seat window, or a second tab: the host already knows this player.
    const returning = arrival === "returning" && (previous !== undefined || record?.leftAt != null);

    // The Worker's status check and this connect are separate calls, so two joins can both pass
    // it. The room refuses a phone it has never seen once 16 phones are in. A phone that already
    // has a place always gets back in.
    if (arrival === "new" && isRoomFull(this.#memberCount(connection.id, reserved))) {
      connection.close(closeCodes.roomFull, "Room is full");
      return;
    }

    const taken = new Set<number>();
    for (const phone of this.#phones()) {
      const state = phone.state as PhoneSocketState;
      if (phone.id !== previous?.id && state.slot !== null) taken.add(state.slot);
    }
    for (const seat of reserved) {
      if (seat.id !== id && seat.slot !== null) taken.add(seat.slot);
    }
    const wanted = (previous?.state as PhoneSocketState | undefined)?.slot ?? record?.slot ?? null;
    // A seat that is free right now goes to this phone, even during a game: late joiners play from
    // the next game (platform.md, "Join flow", steps 4 and 5).
    const slot = wanted !== null && !taken.has(wanted) ? wanted : lowestFreeSlot(taken, seatCount);

    const state: PhoneSocketState = {
      role: slot === null ? "audience" : "player",
      id,
      name,
      slot,
      profile: record?.profile ?? defaultProfile,
      joinedAt: record?.joinedAt ?? now,
      lastActiveAt: now,
      flood: fullBucket(now),
    };
    connection.setState(state);
    if (previous) previous.close(closeCodes.replaced, "Replaced by a newer connection");
    this.#storage.savePlayer(state);

    const you = toPlayerInfo(state);
    this.#send(connection, {
      t: "room:welcome",
      d: { role: state.role, code: meta.code, phase: meta.phase, you },
    });
    this.#send(connection, { t: "room:host", d: { connected: this.#firstHost() !== undefined } });
    // A returning player's host re-sends their current view on player:reconnected.
    if (returning) {
      this.#sendToHost({ t: "player:reconnected", d: { id } });
      // An audience member who came back to a free seat: the host still has them in the line.
      if (slot !== null && record?.slot === null) {
        this.#sendToHost({ t: "player:promoted", d: { id, slot } });
      }
    } else {
      this.#sendToHost({ t: "player:joined", d: { player: you } });
    }
  }

  // ---- Messages --------------------------------------------------------------------------------

  async #onHostMessage(
    connection: Socket,
    state: HostSocketState,
    message: HostToRelayMessage,
  ): Promise<void> {
    if (message.t === "clock:ping") {
      this.#send(connection, { t: "clock:pong", d: { ...message.d, t1: Date.now() } });
      return;
    }
    this.#touch(connection, state);
    switch (message.t) {
      case "controller:state": {
        const { gameId, views } = message.d;
        for (const phone of this.#phones()) {
          const view = pickView(views, phone.state as PhoneSocketState);
          if (view) this.#send(phone, { t: "controller:state", d: { gameId, view } });
        }
        return;
      }
      case "room:phase": {
        const meta = this.#storage.readMeta();
        if (meta && meta.phase !== message.d.phase) {
          this.#storage.setPhase(message.d.phase);
          // Seats that freed during a game go to the audience once it's over.
          this.#promoteAudience();
        }
        return;
      }
      case "room:kick":
        kickPlayer(
          {
            storage: this.#storage,
            socketsOf: (id) => this.#phonesById(id),
            sendToHost: (kicked) => this.#sendToHost(kicked),
          },
          message.d.id,
          Date.now(),
        );
        this.#promoteAudience();
        return;
      case "room:lock": {
        const meta = this.#storage.readMeta();
        if (meta) lockRoom(this.#storage, meta, message.d.locked);
        return;
      }
      case "room:end":
        await this.#closeRoom();
        return;
      case "room:snapshot":
        // One write per round (docs/architecture/session-flow.md, "When the host sends a snapshot").
        this.#storage.saveSnapshot(message.d, Date.now());
        return;
      case "rtc:answer": {
        // Signalling only: forwarded unopened, with `to` removed, no storage write
        // (docs/architecture/realtime-link.md, "What the room does").
        const { to, s, desc } = message.d;
        const phone = answerTarget(this.#phones(), (p) => (p.state as PhoneSocketState).id, to);
        if (phone) this.#send(phone, { t: "rtc:answer", d: { s, desc } });
        return;
      }
      default:
        return;
    }
  }

  #onPhoneMessage(connection: Socket, state: PhoneSocketState, message: PhoneToRelayMessage): void {
    if (message.t === "clock:ping") {
      this.#send(connection, { t: "clock:pong", d: { ...message.d, t1: Date.now() } });
      return;
    }
    this.#touch(connection, state);
    switch (message.t) {
      case "input":
        this.#sendToHost({ t: "input", d: message.d, from: state.id });
        return;
      case "ui:action":
        this.#sendToHost({ t: "ui:action", d: message.d, from: state.id });
        return;
      case "calibration:tap":
        this.#sendToHost({ t: "calibration:tap", d: message.d, from: state.id });
        return;
      case "motion:status":
        this.#sendToHost({ t: "motion:status", d: message.d, from: state.id });
        return;
      case "rtc:offer":
        // Only a seated player reaches here with this type (senders, @couchcade/protocol).
        this.#sendToHost({ t: "rtc:offer", d: message.d, from: state.id });
        return;
      case "player:profile":
        connection.setState({ ...state, profile: message.d.profile });
        this.#storage.setProfile(state.id, message.d.profile);
        this.#sendToHost({ t: "player:profile", d: message.d, from: state.id });
        return;
      case "player:leave":
        // Leaving frees the seat at once. No seat window.
        this.#storage.releasePlayer(state.id, Date.now());
        this.#sendToHost({ t: "player:left", d: { id: state.id, reason: "left" } });
        this.#promoteAudience();
        connection.close(1000, "Left the room");
        return;
    }
  }

  /**
   * A socket emptied its flood bucket: revoke its rejoin token and close it with 4008. A player's
   * seat is freed and the host gets `player:left { reason: "kicked" }`, because platform.md has no
   * separate flooding reason. A revoked host leaves the room host-away until it closes.
   */
  #revoke(connection: Socket, state: SocketState, now: number): void {
    if (isHostState(state)) {
      this.#storage.revokeHost();
    } else {
      this.#storage.revokePlayer(state.id, now);
      this.#sendToHost({ t: "player:left", d: { id: state.id, reason: "kicked" } });
      this.#promoteAudience();
    }
    connection.close(closeCodes.flooding, "Flooding");
  }

  /** Refreshes the socket's last activity, at most once per `activityResolutionMs`. */
  #touch(connection: Socket, state: SocketState): void {
    const now = Date.now();
    if (now - state.lastActiveAt >= activityResolutionMs) {
      connection.setState({ ...state, lastActiveAt: now });
    }
  }

  // ---- Lifecycle -------------------------------------------------------------------------------

  #facts(meta: RoomMeta): LifecycleFacts {
    let lastActivityAt: number | null = null;
    let hostConnected = false;
    for (const connection of this.#sockets()) {
      const state = connection.state as SocketState | null;
      if (!state) continue;
      if (state.role === "host") hostConnected = true;
      lastActivityAt = Math.max(lastActivityAt ?? 0, state.lastActiveAt);
    }
    return {
      createdAt: meta.createdAt,
      hostSeenAt: meta.hostSeenAt,
      hostConnected,
      lastActivityAt,
    };
  }

  /** Makes sure the alarm fires no later than the room's next deadline. */
  async #scheduleAlarm(now: number): Promise<void> {
    const meta = this.#storage.readMeta();
    if (!meta) return;
    const deadline = this.#nextDeadline(meta, now, this.#storage.readReservedPlayers());
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > deadline) await this.ctx.storage.setAlarm(deadline);
  }

  /** The earliest of the close deadline and every reserved seat's expiry, never in the past. */
  #nextDeadline(meta: RoomMeta, now: number, reserved: readonly PlayerRecord[]): number {
    let deadline = closeDeadline(this.#facts(meta));
    for (const { leftAt } of reserved) {
      if (leftAt !== null) deadline = Math.min(deadline, seatExpiresAt(leftAt));
    }
    return Math.max(now, deadline);
  }

  /**
   * Releases every seat whose 2-minute window has run out and tells the host with
   * `player:left { reason: "expired" }`. A later rejoin closes with 4011. Freed seats go to the
   * audience outside a game. Returns the seats that stay reserved.
   */
  #releaseDueSeats(now: number): PlayerRecord[] {
    const reserved: PlayerRecord[] = [];
    let released = false;
    for (const record of this.#storage.readReservedPlayers()) {
      if (record.leftAt === null || !isSeatDue(record.leftAt, now)) {
        reserved.push(record);
        continue;
      }
      this.#storage.releasePlayer(record.id, now);
      this.#sendToHost({ t: "player:left", d: { id: record.id, reason: "expired" } });
      released = true;
    }
    if (released) this.#promoteAudience();
    return reserved;
  }

  // ---- Audience --------------------------------------------------------------------------------

  /**
   * Phones in the room (audience.ts, `memberCount`): connected players and audience, plus dropped
   * players who still hold their place. `exceptId` skips the socket that is connecting now.
   */
  #memberCount(
    exceptId?: string,
    reserved: readonly PlayerRecord[] = this.#storage.readReservedPlayers(),
  ): number {
    const connected: PhoneSocketState[] = [];
    for (const phone of this.#phones()) {
      if (phone.id !== exceptId) connected.push(phone.state as PhoneSocketState);
    }
    return memberCount(connected, reserved);
  }

  /**
   * Gives every free seat to the connected audience member who waited longest
   * (docs/architecture/session-flow.md, "Promotion"), unless a game is running. Each promotion is
   * one `players` write and `player:promoted` to the host and that phone. Audience phones that are
   * away keep their place in line but are skipped until they are back.
   */
  #promoteAudience(): void {
    const meta = this.#storage.readMeta();
    if (!meta || !promotesIn(meta.phase)) return;
    const taken = new Set<number>();
    const waiting = new Map<PlayerId, Waiting>();
    for (const phone of this.#phones()) {
      const state = phone.state as PhoneSocketState;
      // A socket that is closing after a leave, kick or flood gave its seat up already.
      if (this.#storage.readPlayer(state.id)?.released !== false) continue;
      if (state.slot !== null) taken.add(state.slot);
      else waiting.set(state.id, { id: state.id, joinedAt: state.joinedAt });
    }
    for (const seat of this.#storage.readReservedPlayers()) {
      if (seat.slot !== null) taken.add(seat.slot);
    }
    for (const { id, slot } of planPromotions(taken, [...waiting.values()])) {
      let promoted: PhoneSocketState | null = null;
      for (const phone of this.#phonesById(id)) {
        promoted = { ...(phone.state as PhoneSocketState), role: "player", slot };
        phone.setState(promoted);
        this.#send(phone, { t: "player:promoted", d: { id, slot } });
      }
      if (promoted) this.#storage.savePlayer(promoted);
      this.#sendToHost({ t: "player:promoted", d: { id, slot } });
    }
  }

  /** Closes every socket with 4004 and deletes everything the room stored. */
  async #closeRoom(): Promise<void> {
    for (const connection of this.#sockets()) {
      connection.close(closeCodes.roomClosed, "Room closed");
    }
    await this.#forgetStrayRoom();
  }

  /** Deletes all storage and the alarm, for a closed room or one that never existed. */
  async #forgetStrayRoom(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  // ---- Connections -----------------------------------------------------------------------------

  #sockets(): Iterable<Socket> {
    return this.getConnections<SocketState>();
  }

  /** Open phone sockets. Checks the state too, so a tag alone never makes a socket a phone. */
  *#phones(): Generator<Socket> {
    for (const connection of this.getConnections<SocketState>(phoneTag)) {
      if (isPhoneState(connection.state as SocketState | null)) yield connection;
    }
  }

  /** The open host socket, skipping `exceptId`. */
  #firstHost(exceptId?: string): Socket | undefined {
    for (const connection of this.getConnections<SocketState>(hostTag)) {
      if (connection.id !== exceptId && isHostState(connection.state as SocketState | null)) {
        return connection;
      }
    }
    return undefined;
  }

  /** Every open phone socket of one player. */
  *#phonesById(id: string): Generator<Socket> {
    for (const phone of this.#phones()) {
      if ((phone.state as PhoneSocketState).id === id) yield phone;
    }
  }

  #phoneById(id: string, exceptId: string): Socket | undefined {
    for (const phone of this.#phones()) {
      if (phone.id !== exceptId && (phone.state as PhoneSocketState).id === id) return phone;
    }
    return undefined;
  }

  // ---- Sending ---------------------------------------------------------------------------------

  #send(connection: Socket, message: RelayToHostMessage | RelayToPhoneMessage): void {
    const frame = encodeOrNull(message);
    if (frame !== null) connection.send(frame);
  }

  #sendToHost(message: RelayToHostMessage): void {
    const host = this.#firstHost();
    if (host) this.#send(host, message);
  }

  #sendToPhones(message: RelayToPhoneMessage): void {
    const frame = encodeOrNull(message);
    if (frame === null) return;
    for (const phone of this.#phones()) phone.send(frame);
  }
}

/**
 * Encodes a frame, or returns null when it would go over 1 KB. That can happen when the relay adds
 * `from` to a phone message that was just under the limit. The message is dropped.
 */
function encodeOrNull(message: RelayToHostMessage | RelayToPhoneMessage): string | null {
  try {
    return encode(message);
  } catch {
    return null;
  }
}
