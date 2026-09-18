import { StageScene } from "@couchcade/stage";
import type { Scoreboard } from "@couchcade/stage";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import type { StrikeNightState } from "../shared/state.ts";

/** Scene key: the game id, which the host stage uses to add and remove the scene. */
export const strikeNightSceneKey = "strike-night";

function scores(state: StrikeNightState): Record<string, number> {
  return Object.fromEntries(state.players.map((player) => [player.id, player.total]));
}

/**
 * Strike Night on the TV. This placeholder draws nothing of its own: it only adds the stage
 * scoreboard and a callout, so games never draw their own interface (HOUSE_STYLE, "How the style
 * is enforced") and this scene needs no changes when CC-4.11 moves overlay text to output
 * resolution. CC-12.4 replaces this with the lane, the ball and the pins from
 * docs/games/strike-night.md.
 */
export default class StrikeNightScene extends StageScene<StrikeNightState> {
  private host!: HostSceneData<StrikeNightState>;
  private scoreboard!: Scoreboard;

  constructor() {
    super({ key: strikeNightSceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("Strike Night starts with HostSceneData");
    this.host = host;
  }

  create(): void {
    this.scoreboard = this.addScoreboard({
      players: this.host.players,
      scores: scores(this.host.getState()),
    });
    this.addCallout("Strike Night", { holdMs: 1500 });
  }

  override update(): void {
    this.scoreboard.setScores(scores(this.host.getState()));
  }
}
