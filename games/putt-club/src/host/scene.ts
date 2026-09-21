import { StageScene } from "@couchcade/stage";
import type { Scoreboard } from "@couchcade/stage";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import type { PuttClubState } from "../shared/state.ts";

/** Scene key: the game id, which the host stage uses to add and remove the scene. */
export const puttClubSceneKey = "putt-club";

/**
 * Putt Club on the TV. This placeholder draws nothing of its own: it only adds the stage
 * scoreboard and a callout, so games never draw their own interface (HOUSE_STYLE, "How the style
 * is enforced") and this scene needs no changes when CC-4.11 moves overlay text to output
 * resolution.
 *
 * CC-13.4 builds the real green (docs/games/putt-club.md, "TV scene"), once CC-13.8's nine holes
 * exist. `meta.hidden` keeps the game off the menu until then, so this placeholder only proves the
 * wiring compiles against `../shared/state.ts`.
 */
export default class PuttClubScene extends StageScene<PuttClubState> {
  private host!: HostSceneData<PuttClubState>;
  private scoreboard!: Scoreboard;

  constructor() {
    super({ key: puttClubSceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("Putt Club starts with HostSceneData");
    this.host = host;
  }

  create(): void {
    this.scoreboard = this.addScoreboard({
      players: this.host.players,
      scores: totalsOf(this.host.getState()),
    });
    this.addCallout("Putt Club", { holdMs: 1500 });
  }

  override update(): void {
    this.scoreboard.setScores(totalsOf(this.host.getState()));
  }
}

function totalsOf(state: PuttClubState): Record<string, number> {
  return Object.fromEntries(state.players.map((player) => [player.id, player.total]));
}
