import { expect, test } from "../src/fixtures.ts";
import { openRoom } from "../src/flows.ts";
import { playFullMatch, startMatch, tvState } from "../src/target-range.ts";

// Bots play a whole Target Range match (docs/games/target-range.md): one TV, two phones, 4 rounds of
// 3 arrows. `../src/target-range.ts` drives it, shared with platform/realtime-link.spec.ts
// (CC-3.22).
//
// The match starts the way people start it: the VIP picks Target Range on her phone, the TV counts
// down from 3, and the motion step runs (docs/architecture/session-flow.md, "Game menu", and
// motion.md, "Permission, calibration and resume flow"). Each phone gets the fake sensor adapter
// through `window.__couchcadeMotion` (e2e/README.md, "Motion sensors"):
//
// - Ana's browser denies motion, so she plays with touch. She aims exactly: she reads the target and
//   the wind from the TV, drags the aim pad to where a full draw lands in the gold, and pulls a full
//   draw. She scores (almost) a bullseye with every arrow.
// - Ben's browser grants motion. His phone rests in his hand the whole match, so every arrow flies
//   from the crosshair's home at full draw. The rules roll every target at least 6 px away from
//   where such an arrow lands (spec, "Arrow flight"), so he never beats a bullseye and mostly misses.
//
// That makes Ana the winner whatever the seed rolls. As in games/quick-draw.spec.ts, the bots read
// the TV's game state through the host's stage in the Vite dev build.

test("two bots play a full match and the one who aims wins", async ({ host, phones }) => {
  test.setTimeout(240_000);

  const code = await openRoom(host);
  const [ana] = await phones(1, { motion: { permission: "denied" } });
  const [ben] = await phones(1, { motion: { permission: "granted" } });
  if (!ana || !ben) throw new Error("expected two phones");

  await startMatch(host, ana, ben, code);
  // 12 volleys. Both bots shoot in every one, so each volley closes as soon as both arrows are away.
  // The match ends after round 4. Ana, who aimed, has far more points than Ben, who didn't.
  await playFullMatch(host, ana, ben);

  const final = await tvState(host);
  const points = Object.fromEntries(final?.players.map((p) => [p.name, p.points]) ?? []);
  expect(points["Ana"]).toBeGreaterThanOrEqual(100);
  expect(points["Ana"]).toBeGreaterThan(points["Ben"] ?? Infinity);

  // The TV shows the final standings with Ana as the winner. Only Ana, the VIP, gets "Play again";
  // Ben sees his placement (docs/architecture/session-flow.md, "Results").
  const tvResults = host.getByRole("region", { name: "Results" });
  await expect(tvResults.getByRole("heading", { name: "Ana wins!" })).toBeVisible();
  await expect(ana.getByRole("button", { name: "Play again" })).toBeVisible();
  await expect(ben.getByText("2nd")).toBeVisible();
  await expect(ben.getByRole("button", { name: "Play again" })).toHaveCount(0);
});
