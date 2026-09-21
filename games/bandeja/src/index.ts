import { defineGame } from "@couchcade/game-sdk/contract";
import { withRewind } from "@couchcade/game-sdk/rewind";
import meta from "./meta.ts";
import {
  init,
  inputSchema,
  onPlayerInput,
  onPlayerLeft,
  onTick,
  outcome,
  restore,
  snapshot,
  view,
} from "./shared/index.ts";

/**
 * Bandeja's complete definition (docs/games/bandeja.md). Loaded lazily, once a room starts this
 * game (apps/host/src/runtime/games.ts, CC-3.25): the host's eager menu reads only `./meta.ts`.
 * Phones find `./controller/index.ts` the same way.
 *
 * Wrapped in `withRewind({ subtractDisplayLag: true })` (CC-3.7, "Fairness" rule 1): players react
 * to the ball on the TV, so a swing is judged on the tick the player acted in as they saw it, not
 * the tick their message happened to arrive on. `packages/game-sdk/src/rewind/with-rewind.ts`
 * names Bandeja (alongside Duck Season) as exactly this case.
 *
 * `hidden: true` in `./meta.ts` until CC-23.6 registers Bandeja: no controller or TV scene exist
 * yet (CC-23.3, CC-23.4), so `hostScene` below is the scaffold's own placeholder.
 */
const rules = withRewind(
  { init, onPlayerInput, onTick, onPlayerLeft },
  { subtractDisplayLag: true },
);

export default defineGame({
  ...meta,
  inputSchema,

  init: rules.init,
  onPlayerInput: rules.onPlayerInput,
  onTick: rules.onTick,
  onPlayerLeft: rules.onPlayerLeft,
  view: (state, player) => view(rules.unwrap(state), player),
  outcome: (state) => outcome(rules.unwrap(state)),
  snapshot: (state) => snapshot(rules.unwrap(state)),
  restore: (players, seed, saved) => rules.wrap(restore(players, seed, saved)),

  hostScene: () => import("./host/scene.ts").then((module) => module.default),
});
