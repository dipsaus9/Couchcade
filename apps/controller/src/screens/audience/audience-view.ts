import type { ControllerView } from "@couchcade/protocol";
import { placeLabel } from "../results/results-view.ts";

/**
 * The `audience` view from the host (docs/architecture/session-flow.md, "Late joiners and
 * audience"): `{ position }`, the phone's place in the line for the next free seat, 1 for next.
 */
export interface AudienceView {
  position: number;
}

/** The audience view, or null when `view` isn't one or has no valid position yet. */
export function parseAudienceView(view: ControllerView | null): AudienceView | null {
  if (view?.screen !== "audience") return null;
  const { data } = view;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { position } = data;
  return typeof position === "number" && Number.isInteger(position) && position >= 1
    ? { position }
    : null;
}

/** "You're next", "2nd in line", "3rd in line", ... */
export function lineLabel(position: number): string {
  return position === 1 ? "You're next" : `${placeLabel(position)} in line`;
}

/** Copy from the approved "Audience" artboard (docs/design/platform-screens.md, "Waiting"). */
export const audienceCopy = {
  tag: "Audience",
  title: "Watching",
  body: "All 8 player spots are taken. You get the next free spot between games.",
  hint: "Keep this page open to stay in line.",
} as const;
