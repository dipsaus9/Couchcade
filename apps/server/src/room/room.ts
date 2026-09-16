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
  type RelayToHostMessage,
  type RelayToPhoneMessage,
} from "@couchcade/protocol";
import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { readIdentity } from "./identity.ts";
import {
  activityResolutionMs,
  closeDeadline,
  roomState,
  type LifecycleFacts,
} from "./lifecycle.ts";
import { arrivalOf, isSeatDue, seatExpiresAt } from "./reconnect.ts";
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
  /** Open phone sockets, players and audience together. */
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
 * - No storage write per message. `onMessage` only checks size, parses, checks the role and
 *   forwards.
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
        phones: [...this.#phones()].length,
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
    const state = connection.state as SocketState | null;
    // CC-2.5: the flood bucket counts the frame here, before any check can drop it.
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
    const previous = this.#firstHost(connection.id);
    connection.setState({ role: "host", lastActiveAt: now });
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
    // CC-3.5 sends the stored room:snapshot here.
    if (!previous) this.#sendToPhones({ t: "room:host", d: { connected: true } });
  }

  #connectPhone(connection: Socket, meta: RoomMeta, id: string, name: string): void {
    const now = Date.now();
    // Seats whose window ran out are free before anyone is seated, even if the alarm is late.
    const reserved = this.#releaseDueSeats(now);
    const previous = this.#phoneById(id, connection.id);
    const record = this.#storage.readPlayer(id);

    // CC-2.5 (revoked, 4008) and CC-2.6 (kicked, 4003) refuse a returning player here, first.
    const arrival = arrivalOf(record, now);
    if (arrival === "expired") {
      connection.close(closeCodes.seatExpired, "Seat expired");
      return;
    }
    // Back inside the seat window, or a second tab: the host already knows this player.
    const returning = arrival === "returning" && (previous !== undefined || record?.leftAt != null);

    const taken = new Set<number>();
    for (const phone of this.#phones()) {
      const state = phone.state as PhoneSocketState;
      if (phone.id !== previous?.id && state.slot !== null) taken.add(state.slot);
    }
    for (const seat of reserved) {
      if (seat.id !== id && seat.slot !== null) taken.add(seat.slot);
    }
    const wanted = (previous?.state as PhoneSocketState | undefined)?.slot ?? record?.slot ?? null;
    // CC-3.10 caps the audience and promotes audience members to free seats.
    const slot = wanted !== null && !taken.has(wanted) ? wanted : lowestFreeSlot(taken, seatCount);

    const state: PhoneSocketState = {
      role: slot === null ? "audience" : "player",
      id,
      name,
      slot,
      profile: record?.profile ?? defaultProfile,
      joinedAt: record?.joinedAt ?? now,
      lastActiveAt: now,
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
    if (returning) this.#sendToHost({ t: "player:reconnected", d: { id } });
    else this.#sendToHost({ t: "player:joined", d: { player: you } });
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
        if (meta && meta.phase !== message.d.phase) this.#storage.setPhase(message.d.phase);
        return;
      }
      case "room:end":
        await this.#closeRoom();
        return;
      // room:kick and room:lock arrive with CC-2.6, room:snapshot with CC-3.5.
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
      case "player:profile":
        connection.setState({ ...state, profile: message.d.profile });
        this.#storage.setProfile(state.id, message.d.profile);
        this.#sendToHost({ t: "player:profile", d: message.d, from: state.id });
        return;
      case "player:leave":
        // Leaving frees the seat at once. No seat window.
        this.#storage.releasePlayer(state.id, Date.now());
        this.#sendToHost({ t: "player:left", d: { id: state.id, reason: "left" } });
        connection.close(1000, "Left the room");
        return;
    }
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
   * `player:left { reason: "expired" }`. A later rejoin closes with 4011. Returns the seats that
   * stay reserved.
   */
  #releaseDueSeats(now: number): PlayerRecord[] {
    const reserved: PlayerRecord[] = [];
    for (const record of this.#storage.readReservedPlayers()) {
      if (record.leftAt === null || !isSeatDue(record.leftAt, now)) {
        reserved.push(record);
        continue;
      }
      this.#storage.releasePlayer(record.id, now);
      this.#sendToHost({ t: "player:left", d: { id: record.id, reason: "expired" } });
    }
    return reserved;
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
