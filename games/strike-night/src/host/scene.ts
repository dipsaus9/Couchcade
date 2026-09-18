import type { HostSceneData } from "@couchcade/game-sdk/contract";
import type { WorldPipLook } from "@couchcade/stage";
import { StageScene, worldToOverlay } from "@couchcade/stage";
import type { Callout, Scoreboard } from "@couchcade/stage";
import { findPlayer, frameCount, type StrikeNightState } from "../shared/index.ts";
import { strikeNightCueEvent, cuesBetween } from "./cues.ts";
import { benchSlot, bowlerStandPoint } from "./layout.ts";
import { InstructionPanel, PinMap, Scorecard } from "./overlays.ts";
import { present } from "./present.ts";
import type { Places, RollCache } from "./present.ts";
import { BallActor, LaneBackdrop, PinPool, PipPool } from "./world.ts";

/** Scene key: the game id, which the host stage uses to add and remove the scene. */
export const strikeNightSceneKey = "strike-night";

/** The address players type, as the lobby shows it: the host name, like `couchcade.workers.dev`. */
function joinAddress(joinUrl: string): string {
  return URL.canParse(joinUrl) ? new URL(joinUrl).host : joinUrl;
}

const emptyCache: RollCache = { pins: [], ball: null, gutter: false, gutterEndAtMs: null };

/**
 * Strike Night on the TV (docs/games/strike-night.md, "TV scene"): the lane in two shots, the
 * ball, the pins, the bowler and the bench, with the stage's scoreboard, callout and room code
 * panel and the game's own bottom panel, pin map and scorecard on the overlay layer. The host
 * stage starts it with `HostSceneData`; every frame it reads the latest state, emits the sound
 * cues that changed (`strikeNightCueEvent`) and shows `present(state)`. It never changes the
 * state.
 */
export default class StrikeNightScene extends StageScene<StrikeNightState> {
  private host!: HostSceneData<StrikeNightState>;
  private lane!: LaneBackdrop;
  private ball!: BallActor;
  private pins!: PinPool;
  private pips!: PipPool;
  private scoreboard!: Scoreboard;
  private panel!: InstructionPanel;
  private pinMap!: PinMap;
  private scorecard!: Scorecard;
  private previous: StrikeNightState | null = null;
  private rollCache: RollCache = emptyCache;
  private callout: { key: string; object: Callout } | null = null;

  constructor() {
    super({ key: strikeNightSceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("Strike Night starts with HostSceneData");
    this.host = host;
    this.previous = null;
    this.rollCache = emptyCache;
    this.callout = null;
  }

  create(): void {
    this.cameras.main.setRoundPixels(true);
    this.lane = new LaneBackdrop(this);
    this.ball = new BallActor(this);
    this.pins = new PinPool(this);
    this.pips = new PipPool(
      this,
      (id) => this.host.players.find((player) => player.id === id)?.slot ?? 0,
      (id) => this.lookOf(id),
    );

    const state = this.host.getState();
    this.scoreboard = this.addScoreboard({
      players: this.host.players,
      scores: this.scores(state),
      activePlayerId: state.bowlerId,
      round: { current: state.frame, total: frameCount },
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
    this.pinMap = new PinMap(this);
    this.scorecard = new Scorecard(this);
    this.overlay.add([this.panel, this.pinMap, this.scorecard]);

    this.addCallout("Strike Night", { holdMs: 1500 });
    this.paint(state);
  }

  override update(): void {
    this.paint(this.host.getState());
  }

  private lookOf(id: string): WorldPipLook {
    const info = this.host.players.find((player) => player.id === id);
    const seat = findPlayer(this.host.getState(), id)?.seat ?? 0;
    return {
      profile: info?.profile ?? { skin: 0, hair: 0, hairColour: 0 },
      slot: info?.slot ?? seat,
    };
  }

  private scores(state: StrikeNightState): Record<string, number> {
    return Object.fromEntries(state.players.map((player) => [player.id, player.total]));
  }

  /** Keeps the last live roll (ball and pins) so `result` and a gutter ball can keep showing what
   * `@couchcade/physics` already dropped from state (`present.ts`'s doc comment). Cleared at
   * every new lineup. */
  private updateCache(state: StrikeNightState): void {
    if (state.phase === "lineup") {
      this.rollCache = emptyCache;
      return;
    }
    const roll = state.activeRoll;
    if (roll === null) return;
    const ball =
      roll.ball !== null
        ? { x: roll.ball.x, y: roll.ball.y, vx: roll.ball.vx, vy: roll.ball.vy, atMs: state.nowMs }
        : this.rollCache.ball;
    this.rollCache = {
      pins: roll.pins,
      ball,
      gutter: roll.gutter,
      gutterEndAtMs: roll.gutterEndAtMs,
    };
  }

  private places(state: StrikeNightState): Places {
    const bowler = findPlayer(state, state.bowlerId);
    const bench = state.players
      .filter((player) => !player.left && player.id !== state.bowlerId)
      .toSorted((a, b) => a.seat - b.seat);
    return {
      bowler:
        bowler === undefined
          ? null
          : { id: bowler.id, point: bowlerStandPoint(bowler.x), holding: bowler.gripped },
      bench: bench.map((player, index) => ({ id: player.id, ...benchSlot(index) })),
    };
  }

  private paint(state: StrikeNightState): void {
    for (const cue of cuesBetween(this.previous, state)) this.events.emit(strikeNightCueEvent, cue);
    this.previous = state;
    this.updateCache(state);

    const view = present(state, this.rollCache, this.places(state));
    this.lane.setShot(view.shot);
    if (view.ball) this.ball.show(view.ball);
    else this.ball.hide();
    this.pins.update(view.pins);
    this.pips.update(view.bowler ? [view.bowler, ...view.bench] : view.bench);

    this.scoreboard
      .setScores(this.scores(state))
      .setActivePlayer(state.bowlerId)
      .setRound({ current: view.frame.current, total: view.frame.total });
    this.panel.setText(view.panel).setClock(view.clock);
    this.pinMap.show(view.pinMap);
    this.scorecard.show(view.scorecard);
    this.paintCallout(view.callout);
  }

  /** STRIKE!/SPARE!/TURKEY! use the stage callout, over the pin deck (docs/games/strike-night.md,
   * "Readability from the couch", rule 5: never over the pins themselves, y = 40 to 95). */
  private paintCallout(shown: string | null): void {
    const key = shown ?? null;
    if (key === (this.callout?.key ?? null)) return;
    if (this.callout) {
      this.callout.object.dismiss();
      this.callout = null;
    }
    if (shown === null) return;
    const object = this.addCallout(shown, { y: worldToOverlay(70) });
    this.callout = { key: shown, object };
  }
}
