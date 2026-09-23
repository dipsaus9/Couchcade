import { audio } from "@couchcade/audio";
import type { HostSceneData } from "@couchcade/game-sdk/contract";
import type { Rewound } from "@couchcade/game-sdk/rewind";
import { StageScene, worldToOverlay } from "@couchcade/stage";
import type { Callout, Scoreboard, WorldPipLook } from "@couchcade/stage";
import { Scenes } from "phaser";
import type { BandejaInput, BandejaState } from "../shared/index.ts";
import { loadSprites } from "./art.ts";
import { bandejaCueEvent, cuesBetween } from "./cues.ts";
import { InstructionPanel } from "./overlays.ts";
import { present } from "./present.ts";
import type { Presentation } from "./present.ts";
import { bandejaSounds, playCueSound } from "./sounds.ts";
import { BandejaWorld } from "./world.ts";

/** Scene key: the game id, which the host stage uses to add and remove the scene. */
export const bandejaSceneKey = "bandeja";

/** The state the host runtime actually hands the scene: `index.ts` wraps the rules in
 * `withRewind` (CC-3.7), so `HostSceneData.getState()` returns the wrapper, not `BandejaState`
 * itself. `.now` is the latest game state, exactly like `unwrap` inside `with-rewind.ts`. */
type BandejaHostState = Rewound<BandejaState, BandejaInput>;

/** The address players type, as the lobby shows it: the host name, like `couchcade.workers.dev`. */
function joinAddress(joinUrl: string): string {
  return URL.canParse(joinUrl) ? new URL(joinUrl).host : joinUrl;
}

/** A generic look for an auto-returning or empty slot (rule 10): no seated player owns it. */
function fallbackLook(index: number): WorldPipLook {
  return { profile: { skin: 0, hair: 0, hairColour: 0 }, slot: index };
}

/**
 * Bandeja on the TV (docs/games/bandeja.md, "TV scene"): the padel court in a glass-and-mesh cage,
 * the ball and its shadow, World Pips walking toward the ball's predicted landing spot
 * (`BandejaState.positions`, CC-23.8) and the closing swing ring, with the stage's scoreboard,
 * callout and room code panel and the game's own bottom panel on the overlay layer. The host stage
 * starts it with `HostSceneData`; every frame it reads the latest state, emits the sound cues that
 * changed (`bandejaCueEvent`) and shows `present(state)`. It never changes the state.
 */
export default class BandejaScene extends StageScene<BandejaHostState> {
  private host!: HostSceneData<BandejaHostState>;
  private world!: BandejaWorld;
  private scoreboard!: Scoreboard;
  private panel!: InstructionPanel;
  private previous: BandejaState | null = null;
  /** The rally's shot count just before it ended, for the WINNER!/POINT! split (`present.ts`). */
  private lastRallyShots: number | null = null;
  private callout: { key: string; object: Callout } | null = null;

  constructor() {
    super({ key: bandejaSceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("Bandeja starts with HostSceneData");
    this.host = host;
    this.previous = null;
    this.lastRallyShots = null;
    this.callout = null;
  }

  preload(): void {
    loadSprites(this.load, this.textures);
  }

  create(): void {
    void audio.load(bandejaSounds);
    this.events.on(bandejaCueEvent, playCueSound);
    this.events.once(Scenes.Events.SHUTDOWN, () => {
      this.events.off(bandejaCueEvent, playCueSound);
      audio.unload(bandejaSounds);
    });

    this.cameras.main.setRoundPixels(true);
    const view = this.prepare(this.state);
    this.world = new BandejaWorld(this, view, (id, index) => this.lookOf(id, index));

    this.scoreboard = this.addScoreboard({
      players: this.host.players,
      scores: view.scoreByPlayer,
      round: { current: view.counter },
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
    this.overlay.add(this.panel);

    this.paint(view);
  }

  override update(): void {
    this.paint(this.prepare(this.state));
  }

  /** The latest unwrapped game state (`index.ts` wraps it with `withRewind`, CC-3.7). */
  private get state(): BandejaState {
    return this.host.getState().now;
  }

  /**
   * Emits this frame's sound cues, updates the small cache `present` needs but can't reconstruct
   * from `state` alone (`lastRallyShots`), then returns the frame's presentation. Must run before
   * `paint` uses the presentation, so the very frame a rally ends already classifies its own
   * POINT!/WINNER! correctly instead of one frame late.
   */
  private prepare(state: BandejaState): Presentation {
    for (const cue of cuesBetween(this.previous, state)) this.events.emit(bandejaCueEvent, cue);
    if (this.previous !== null && this.previous.rally !== null && state.rally === null) {
      this.lastRallyShots = this.previous.rally.shots;
    }
    this.previous = state;
    return present(state, { lastRallyShots: this.lastRallyShots });
  }

  /** A player's look: jersey and shape from their seat, skin and hair from their Pip profile. An
   * auto-returning or empty slot (`id` null) gets a generic look instead. */
  private lookOf(id: string | null, index: number): WorldPipLook {
    if (id === null) return fallbackLook(index);
    const seat = this.host.players.find((player) => player.id === id);
    return seat ? { profile: seat.profile, slot: seat.slot ?? index } : fallbackLook(index);
  }

  private paint(view: Presentation): void {
    this.world.update(view);
    this.scoreboard.setScores(view.scoreByPlayer).setRound({ current: view.counter });
    this.panel.setText(view.panel);
    this.paintCallout(view);
  }

  /** POINT!/NET!/WINNER!/MATCH! use the stage callout, centred over the court. */
  private paintCallout(view: Presentation): void {
    const shown = view.callout;
    const key = shown?.key ?? null;
    if (key === (this.callout?.key ?? null)) return;
    if (this.callout) {
      this.callout.object.dismiss();
      this.callout = null;
    }
    if (shown === null) return;
    const object = this.addCallout(shown.text, { y: worldToOverlay(120) });
    this.callout = { key: shown.key, object };
  }
}
