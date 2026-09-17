import {
  pipProfileSchema,
  roomPhaseSchema,
  type PipProfile,
  type PlayerId,
  type RoomPhase,
} from "@couchcade/protocol";

/**
 * The room's SQLite tables (docs/architecture/platform.md, "Room storage"). The room writes only
 * on create, join, leave, seat release, profile change, phase change and flood
 * revocation, never per message. CC-2.6 sets `kicked`, and CC-3.5 adds the `snapshot` table.
 *
 * Tables are created by `create()`, not on start, so a socket or request that reaches a room that
 * was never created leaves no tables behind.
 */
const schema = `
CREATE TABLE IF NOT EXISTS meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  phase TEXT NOT NULL DEFAULT 'lobby',
  host_seen_at INTEGER,
  host_revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slot INTEGER,
  profile TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  kicked INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0,
  released INTEGER NOT NULL DEFAULT 0
);
`;

export interface RoomMeta {
  code: string;
  createdAt: number;
  locked: boolean;
  phase: RoomPhase;
  /** Room time when the host last left. Null while the host has never connected. */
  hostSeenAt: number | null;
  /** True once the host socket flooded. The host's rejoin token no longer works. */
  hostRevoked: boolean;
}

export interface PlayerRecord {
  id: PlayerId;
  name: string;
  slot: number | null;
  profile: PipProfile;
  joinedAt: number;
  /** Room time the player's socket last closed, or null while they are connected. */
  leftAt: number | null;
  /** True once the seat was given up: the player left, was revoked, or their seat window ran out. */
  released: boolean;
  /** True once the player's socket flooded. Their rejoin token no longer works. */
  revoked: boolean;
}

type MetaRow = {
  code: string;
  created_at: number;
  locked: number;
  phase: string;
  host_seen_at: number | null;
  host_revoked: number;
};

type PlayerRow = {
  id: string;
  name: string;
  slot: number | null;
  profile: string;
  joined_at: number;
  left_at: number | null;
  released: number;
  revoked: number;
};

const playerColumns = "id, name, slot, profile, joined_at, left_at, released, revoked";

/** Every Pip part at its first option, until the player customises it (CC-6.5). */
export const defaultProfile: PipProfile = { skin: 0, hair: 0, hairColour: 0 };

export class RoomStorage {
  readonly #sql: SqlStorage;
  #migrated = false;

  constructor(sql: SqlStorage) {
    this.#sql = sql;
  }

  /** Creates the tables and the meta row. Returns false when the room already exists. */
  create(code: string, now: number): boolean {
    if (this.readMeta()) return false;
    this.#sql.exec(schema);
    this.#sql.exec(
      "INSERT INTO meta (id, code, created_at, host_seen_at) VALUES (1, ?, ?, NULL)",
      code,
      now,
    );
    return true;
  }

  /** The meta row, or null when the room was never created or has closed. */
  readMeta(): RoomMeta | null {
    const exists = this.#sql
      .exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
      .toArray();
    if (exists.length === 0) return null;
    this.#migrate();
    const [row] = this.#sql
      .exec<MetaRow>(
        "SELECT code, created_at, locked, phase, host_seen_at, host_revoked FROM meta WHERE id = 1",
      )
      .toArray();
    if (!row) return null;
    const phase = roomPhaseSchema.safeParse(row.phase);
    return {
      code: row.code,
      createdAt: row.created_at,
      locked: row.locked === 1,
      phase: phase.success ? phase.data : "lobby",
      hostSeenAt: row.host_seen_at,
      hostRevoked: row.host_revoked === 1,
    };
  }

  setPhase(phase: RoomPhase): void {
    this.#sql.exec("UPDATE meta SET phase = ? WHERE id = 1", phase);
  }

  setHostSeenAt(now: number): void {
    this.#sql.exec("UPDATE meta SET host_seen_at = ? WHERE id = 1", now);
  }

  /** The host socket flooded. Later host connects close with 4008. */
  revokeHost(): void {
    this.#sql.exec("UPDATE meta SET host_revoked = 1 WHERE id = 1");
  }

  readPlayer(id: PlayerId): PlayerRecord | null {
    const [row] = this.#sql
      .exec<PlayerRow>(`SELECT ${playerColumns} FROM players WHERE id = ?`, id)
      .toArray();
    return row ? toPlayerRecord(row) : null;
  }

  /** Players who disconnected and still hold their seat, in join order. */
  readReservedPlayers(): PlayerRecord[] {
    return this.#sql
      .exec<PlayerRow>(
        `SELECT ${playerColumns} FROM players WHERE left_at IS NOT NULL AND released = 0
         ORDER BY joined_at`,
      )
      .toArray()
      .map(toPlayerRecord);
  }

  /** Records a join. A player who joins again keeps their row, with `left_at` cleared. */
  savePlayer(player: Omit<PlayerRecord, "leftAt" | "released" | "revoked">): void {
    this.#sql.exec(
      `INSERT INTO players (id, name, slot, profile, joined_at, left_at) VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, slot = excluded.slot,
         profile = excluded.profile, left_at = NULL`,
      player.id,
      player.name,
      player.slot,
      JSON.stringify(player.profile),
      player.joinedAt,
    );
  }

  setProfile(id: PlayerId, profile: PipProfile): void {
    this.#sql.exec("UPDATE players SET profile = ? WHERE id = ?", JSON.stringify(profile), id);
  }

  /** The player's socket closed. Their seat stays reserved until `releasePlayer`. */
  markLeft(id: PlayerId, now: number): void {
    this.#sql.exec("UPDATE players SET left_at = ? WHERE id = ?", now, id);
  }

  /** Gives up the player's seat: they left the room, or their seat window ran out. */
  releasePlayer(id: PlayerId, now: number): void {
    this.#sql.exec(
      "UPDATE players SET left_at = COALESCE(left_at, ?), released = 1 WHERE id = ?",
      now,
      id,
    );
  }

  /**
   * The player's socket flooded: their seat is released and later connects with their id close
   * with 4008. One write, on the violation only.
   */
  revokePlayer(id: PlayerId, now: number): void {
    this.#sql.exec(
      "UPDATE players SET left_at = COALESCE(left_at, ?), released = 1, revoked = 1 WHERE id = ?",
      now,
      id,
    );
  }

  /**
   * Adds columns that later stories introduced to a room created before them, so a room that lives
   * through a deploy keeps working. Runs once per instance.
   */
  #migrate(): void {
    if (this.#migrated) return;
    this.#migrated = true;
    const [row] = this.#sql
      .exec<{ released: number; hostRevoked: number }>(
        `SELECT
           (SELECT COUNT(*) FROM pragma_table_info('players') WHERE name = 'released') AS released,
           (SELECT COUNT(*) FROM pragma_table_info('meta') WHERE name = 'host_revoked') AS hostRevoked`,
      )
      .toArray();
    if (row?.released === 0) {
      this.#sql.exec("ALTER TABLE players ADD COLUMN released INTEGER NOT NULL DEFAULT 0");
    }
    if (row?.hostRevoked === 0) {
      this.#sql.exec("ALTER TABLE meta ADD COLUMN host_revoked INTEGER NOT NULL DEFAULT 0");
    }
  }
}

function toPlayerRecord(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    name: row.name,
    slot: row.slot,
    profile: parseProfile(row.profile),
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    released: row.released === 1,
    revoked: row.revoked === 1,
  };
}

function parseProfile(text: string): PipProfile {
  try {
    const profile = pipProfileSchema.safeParse(JSON.parse(text));
    return profile.success ? profile.data : defaultProfile;
  } catch {
    return defaultProfile;
  }
}
