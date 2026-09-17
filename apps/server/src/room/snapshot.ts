import type { JsonValue, PayloadOf } from "@couchcade/protocol";

/** A `room:snapshot` payload: `{ round, gameId, data }`. */
export type RoomSnapshot = PayloadOf<"room:snapshot">;

/**
 * The `snapshot` table from docs/architecture/platform.md, "Room storage": 0 or 1 row with the last
 * round snapshot the host sent. The relay never reads `data`. It stores it and hands it back to a
 * host that rejoins (docs/architecture/session-flow.md, "Host refresh and deploy recovery").
 */
export const snapshotTableSql = `
CREATE TABLE IF NOT EXISTS snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  round INTEGER NOT NULL,
  game_id TEXT,
  data TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);
`;

type SnapshotRow = { round: number; game_id: string | null; data: string };

/** Replaces the stored snapshot with one write. A new game's round 0 replaces the last game's. */
export function saveSnapshot(sql: SqlStorage, snapshot: RoomSnapshot, now: number): void {
  sql.exec(
    `INSERT INTO snapshot (id, round, game_id, data, saved_at) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET round = excluded.round, game_id = excluded.game_id,
       data = excluded.data, saved_at = excluded.saved_at`,
    snapshot.round,
    snapshot.gameId,
    JSON.stringify(snapshot.data),
    now,
  );
}

/** The stored snapshot, or null when the host never sent one. */
export function readSnapshot(sql: SqlStorage): RoomSnapshot | null {
  const [row] = sql
    .exec<SnapshotRow>("SELECT round, game_id, data FROM snapshot WHERE id = 1")
    .toArray();
  if (!row) return null;
  try {
    return { round: row.round, gameId: row.game_id, data: JSON.parse(row.data) as JsonValue };
  } catch {
    return null;
  }
}
