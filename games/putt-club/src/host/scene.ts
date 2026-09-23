import type { HostSceneData } from "@couchcade/game-sdk/contract";
import { AIM_PLAYBACK_DELAY_MS } from "@couchcade/game-sdk/input";
import { StageScene } from "@couchcade/stage";
import type { Callout, Scoreboard, WorldPipLook } from "@couchcade/stage";
import { holeCount } from "../shared/index.ts";
import type { PuttClubState } from "../shared/index.ts";
import { createAimPlayback } from "./aim-playback.ts";
import type { AimPlayback } from "./aim-playback.ts";
import { BallChip, InstructionPanel } from "./overlays.ts";
import { present } from "./present.ts";
import type { Presentation } from "./present.ts";
import { PuttClubWorld } from "./world.ts";

/** Scene key: the game id, which the host stage uses to add and remove the scene. */
export const puttClubSceneKey = "putt-club";

/** The address players type, as the lobby shows it: the host name, like `couchcade.workers.dev`. */
function joinAddress(joinUrl: string): string {
  return URL.canParse(joinUrl) ? new URL(joinUrl).host : joinUrl;
}

/** A generic look for a player the host doesn't know a seat for (never expected in practice, but
 * `World Pip` needs some look). */
function fallbackLook(): WorldPipLook {
  return { profile: { skin: 0, hair: 0, hairColour: 0 }, slot: 0 };
}

/**
 * Putt Club on the TV (docs/games/putt-club.md, "TV scene"): the green in its timber kerbs, the
 * cup and flag, every player's ball, World Pips for the putter and the players waiting their
 * turn, and the aim line, drawn at 480×270 with the stage's scoreboard, callout and room code
 * panel and the game's own bottom instruction panel. Putt Club doesn't use `withRewind`
 * (`docs/games/putt-club.md`, "Fairness": "Nothing moves while you aim"), so `HostSceneData`
 * hands this scene `PuttClubState` directly. The host stage starts it with `HostSceneData`; every
 * frame it reads the latest state and shows `present(state, ...)`. It never changes the state.
 */
export default class PuttClubScene extends StageScene<PuttClubState> {
  private host!: HostSceneData<PuttClubState>;
  private world!: PuttClubWorld;
  private scoreboard!: Scoreboard;
  private panel!: InstructionPanel;
  private chip!: BallChip;
  private aimPlayback: AimPlayback = createAimPlayback();
  private callout: { key: string; object: Callout } | null = null;

  constructor() {
    super({ key: puttClubSceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("Putt Club starts with HostSceneData");
    this.host = host;
    this.aimPlayback = createAimPlayback();
    this.callout = null;
  }

  create(): void {
    this.cameras.main.setRoundPixels(true);
    const view = this.present(this.host.getState(), 0);
    this.world = new PuttClubWorld(this, view, (id) => this.lookOf(id));

    this.scoreboard = this.addScoreboard({
      players: this.host.players,
      scores: view.scoreByPlayer,
      round: { current: view.round.current, total: view.round.total },
    });
    const { roomCode, joinUrl } = this.host;
    const roomCodePanel =
      roomCode === undefined
        ? null
        : this.addRoomCode({
            code: roomCode,
            url: joinUrl === undefined ? "" : joinAddress(joinUrl),
          });
    this.panel = new InstructionPanel(this, roomCodePanel?.panelBounds.x);
    this.chip = new BallChip(this);
    this.overlay.add([this.panel, this.chip]);

    this.paint(view);
  }

  override update(_time: number, delta: number): void {
    this.paint(this.present(this.host.getState(), delta));
  }

  /** How far behind the putter's aim line plays, from the link (CC-11.9), or the old default
   * before the host runtime has one (tests and tools) -- Target Range's own pattern. */
  private playbackDelayMsOf(playerId: string): number {
    return this.host.link?.(playerId).playbackDelayMs ?? AIM_PLAYBACK_DELAY_MS;
  }

  private present(state: PuttClubState, frameMs: number): Presentation {
    const delayMs =
      state.putterId === null ? AIM_PLAYBACK_DELAY_MS : this.playbackDelayMsOf(state.putterId);
    const aimYaw = this.aimPlayback.at(state, frameMs, delayMs);
    return present(state, { aimYaw, holeCount });
  }

  /** A player's look: jersey and shape from their seat, skin and hair from their Pip profile. */
  private lookOf(id: string): WorldPipLook {
    const seat = this.host.players.find((player) => player.id === id);
    return seat ? { profile: seat.profile, slot: seat.slot ?? 0 } : fallbackLook();
  }

  private paint(view: Presentation): void {
    this.world.update(view);
    this.scoreboard
      .setScores(view.scoreByPlayer)
      .setActivePlayer(this.host.getState().putterId)
      .setRound({ current: view.round.current, total: view.round.total });
    this.panel.setText(view.panel);
    this.paintChip(view);
    this.paintCallout(view);
  }

  private paintChip(view: Presentation): void {
    if (view.chip === null) {
      this.chip.hide();
      return;
    }
    this.chip.showAt(view.chip.text, view.chip.worldX, view.chip.worldY);
  }

  /** IN!/BIRDIE!/HOLE IN ONE!/MATCH! use the stage callout, centred over the green. */
  private paintCallout(view: Presentation): void {
    const shown = view.callout;
    const key = shown?.key ?? null;
    if (key === (this.callout?.key ?? null)) return;
    if (this.callout) {
      this.callout.object.dismiss();
      this.callout = null;
    }
    if (shown === null) return;
    const object = this.addCallout(shown.text);
    this.callout = { key: shown.key, object };
  }
}
