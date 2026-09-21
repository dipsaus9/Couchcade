import { StageScene } from "@couchcade/stage";
import type { HostSceneData } from "@couchcade/game-sdk/contract";

/** Scene key: the game id, which the host stage uses to add and remove the scene. */
export const bandejaSceneKey = "bandeja";

/**
 * A placeholder: `hostScene` in `../index.ts` needs a class to load, but the real TV scene
 * (docs/games/bandeja.md, "TV scene") is CC-23.4's story, not this one's. It draws only the stage
 * scoreboard and a callout, exactly as `pnpm create-game`'s own template does, so games never draw
 * their own interface (HOUSE_STYLE, "How the style is enforced") until CC-23.4 replaces it. Left
 * generic over the host state (`StageScene`'s own default) rather than importing the real
 * `BandejaState`: this placeholder never reads it, and CC-23.4 will type its own scene against the
 * game's actual (rewind-wrapped) runtime state.
 */
export default class BandejaScene extends StageScene {
  private host!: HostSceneData<unknown>;

  constructor() {
    super({ key: bandejaSceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("Bandeja starts with HostSceneData");
    this.host = host;
  }

  create(): void {
    this.addScoreboard({ players: this.host.players });
    this.addCallout("Bandeja is coming soon", { holdMs: 1500 });
  }
}
