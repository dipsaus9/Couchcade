/**
 * Event de-duplication, from docs/architecture/realtime-link.md: an event's `e` "counts up per
 * phone per page load and is the same on both paths, so the host applies an event once even if it
 * arrives twice" (switching between the link and the relay resends the last few events). "The
 * host applies each `e` once. It remembers the last 64 per player."
 */

/** Ids remembered per player before the oldest is forgotten. */
export const eventDedupeWindow = 64;

export interface EventDedupe {
  /**
   * `true` the first time `eventId` is seen for `playerId`, which also remembers it; `false`
   * every time after, until it ages out past the remembered window.
   */
  apply(playerId: string, eventId: number): boolean;
}

/** A per-player FIFO of the last `remembered` event ids, so a duplicate is applied once. */
export function createEventDedupe(remembered: number = eventDedupeWindow): EventDedupe {
  const seen = new Map<string, Set<number>>();
  const order = new Map<string, number[]>();

  return {
    apply(playerId, eventId) {
      let ids = seen.get(playerId);
      let fifo = order.get(playerId);
      if (ids === undefined || fifo === undefined) {
        ids = new Set();
        fifo = [];
        seen.set(playerId, ids);
        order.set(playerId, fifo);
      }
      if (ids.has(eventId)) return false;

      ids.add(eventId);
      fifo.push(eventId);
      if (fifo.length > remembered) {
        const oldest = fifo.shift();
        if (oldest !== undefined) ids.delete(oldest);
      }
      return true;
    },
  };
}
