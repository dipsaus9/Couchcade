import type { ControllerView, HostToRelayMessage, PlayerId } from "@couchcade/protocol";

type ViewEntry = Extract<HostToRelayMessage, { t: "controller:state" }>["d"]["views"][number];

/**
 * Picks the one view a phone receives from a host `controller:state` batch
 * (docs/architecture/platform.md, "Message catalogue"). An entry that lists the phone's id wins.
 * Otherwise the first entry for its group (`players` when seated, `audience` when not), then the
 * first `all` entry. Returns undefined when no entry matches, and the phone gets nothing.
 */
export function pickView(
  views: readonly ViewEntry[],
  phone: { id: PlayerId; slot: number | null },
): ControllerView | undefined {
  const group = phone.slot === null ? "audience" : "players";
  let groupView: ControllerView | undefined;
  let allView: ControllerView | undefined;
  for (const { to, view } of views) {
    if (Array.isArray(to)) {
      if (to.includes(phone.id)) return view;
    } else if (to === group) {
      groupView ??= view;
    } else if (to === "all") {
      allView ??= view;
    }
  }
  return groupView ?? allView;
}
