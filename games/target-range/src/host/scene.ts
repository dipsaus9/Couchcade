import { StageScene } from "@couchcade/stage";
import type { Scoreboard } from "@couchcade/stage";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import type { TargetRangeState } from "../shared/index.ts";

/** Scene key: the game id, which the host stage uses to add and remove the scene. */
export const targetRangeSceneKey = "target-range";

/** Points by player id, for the scoreboard. */
function scores(state: TargetRangeState): Record<string, number> {
  return Object.fromEntries(state.players.map((player) => [player.id, player.points]));
}

/**
 * Target Range on the TV. A placeholder from `pnpm create-game`: it only shows the stage
 * scoreboard. CC-11.4 builds the range, the target, crosshairs and arrows. The game is `hidden`
 * until then, so this never reaches a real room.
 */
export default class TargetRangeScene extends StageScene<TargetRangeState> {
  private host!: HostSceneData<TargetRangeState>;
  private scoreboard!: Scoreboard;

  constructor() {
    super({ key: targetRangeSceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("Target Range starts with HostSceneData");
    this.host = host;
  }

  create(): void {
    this.scoreboard = this.addScoreboard({
      players: this.host.players,
      scores: scores(this.host.getState()),
    });
  }

  override update(): void {
    this.scoreboard.setScores(scores(this.host.getState()));
  }
}
