import { StageScene } from "@couchcade/stage";
import type { Scoreboard } from "@couchcade/stage";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import type { __ID_PASCAL__State } from "../shared/rules.ts";

/** Scene key: the game id, which the host stage uses to add and remove the scene. */
export const __ID_CAMEL__SceneKey = "__ID__";

/**
 * __TITLE__ on the TV. This placeholder draws nothing of its own: it only adds the stage
 * scoreboard and a callout, so games never draw their own interface (HOUSE_STYLE, "How the style
 * is enforced") and this scene needs no changes when CC-4.11 moves overlay text to output
 * resolution. Replace this with the game's real world once docs/games/__ID__.md exists.
 */
export default class __ID_PASCAL__Scene extends StageScene<__ID_PASCAL__State> {
  private host!: HostSceneData<__ID_PASCAL__State>;
  private scoreboard!: Scoreboard;

  constructor() {
    super({ key: __ID_CAMEL__SceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("__TITLE__ starts with HostSceneData");
    this.host = host;
  }

  create(): void {
    this.scoreboard = this.addScoreboard({
      players: this.host.players,
      scores: this.host.getState().taps,
    });
    this.addCallout("Tap to score!", { holdMs: 1500 });
  }

  override update(): void {
    this.scoreboard.setScores(this.host.getState().taps);
  }
}
