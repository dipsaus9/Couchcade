import type { HostSceneData } from "@couchcade/game-sdk/contract";
import { StageScene, worldToOverlay } from "@couchcade/stage";
import type { Callout, Scoreboard } from "@couchcade/stage";
import { roundCount } from "../shared/index.ts";
import type { Point, TargetRangeState } from "../shared/index.ts";
import { loadSprites } from "./art.ts";
import { cuesBetween, targetRangeCueEvent } from "./cues.ts";
import { placeTagsBelow } from "./label-layout.ts";
import { InstructionPanel, PointsTag, RoundResults, scoreboardBottom, tagGap } from "./overlays.ts";
import { present } from "./present.ts";
import type { Presentation } from "./present.ts";
import { RangeWorld } from "./world.ts";
import { worldPipLook } from "./world-pip.ts";
import type { WorldPipLook } from "./world-pip.ts";

/** Scene key: the game id, which the host stage uses to add and remove the scene. */
export const targetRangeSceneKey = "target-range";

/** The address players type, as the lobby shows it: the host name, like `couchcade.workers.dev`. */
function joinAddress(joinUrl: string): string {
  return URL.canParse(joinUrl) ? new URL(joinUrl).host : joinUrl;
}

/**
 * Target Range on the TV (docs/games/target-range.md, "TV scene"): the range, the target, the
 * wind flag, a crosshair per aiming player and the arrows in the 480×270 world, with the stage's
 * scoreboard, callout and room code panel and the game's own panels on the overlay layer. The
 * host stage starts it with `HostSceneData`; every frame it reads the latest state, emits the
 * sound cues that changed (`targetRangeCueEvent`) and shows `present(state)`. It never changes
 * the state.
 */
export default class TargetRangeScene extends StageScene<TargetRangeState> {
  private host!: HostSceneData<TargetRangeState>;
  #range: RangeWorld | null = null;
  private scoreboard!: Scoreboard;
  private panel!: InstructionPanel;
  private tags: PointsTag[] = [];
  private results!: RoundResults;
  private previous: TargetRangeState | null = null;
  private callout: { key: string; object: Callout } | null = null;
  /** The target of the round before, so the target slides from there in the next intro. */
  private lastTarget: { round: number; target: Point } | null = null;
  private slideFrom: Point | null = null;

  constructor() {
    super({ key: targetRangeSceneKey });
  }

  init(): void {
    const host = this.hostData;
    if (host === undefined) throw new Error("Target Range starts with HostSceneData");
    this.host = host;
    this.previous = null;
    this.callout = null;
    this.lastTarget = null;
    this.slideFrom = null;
    this.tags = [];
  }

  preload(): void {
    loadSprites(this.load, this.textures);
  }

  create(): void {
    const state = this.host.getState();
    const view = this.present(state);
    this.cameras.main.setRoundPixels(true);
    this.#range = new RangeWorld(this, view, (id) => this.lookOf(id));

    this.scoreboard = this.addScoreboard({
      players: this.host.players,
      scores: this.scores(state),
      round: { current: view.round, total: roundCount },
    });
    // The room code stays in the bottom-right corner for the whole game, for anyone joining late.
    const { roomCode, joinUrl } = this.host;
    const roomCodePanel =
      roomCode === undefined
        ? null
        : this.addRoomCode({
            code: roomCode,
            url: joinUrl === undefined ? "" : joinAddress(joinUrl),
          });
    this.panel = new InstructionPanel(this, roomCodePanel?.panelBounds.x);
    this.tags = state.players.map(() => new PointsTag(this));
    this.results = new RoundResults(this);
    this.overlay.add([this.panel, ...this.tags, this.results]);

    this.paint(state);
  }

  /** The world objects: the target, the flag, Pips, crosshairs and arrows. */
  get rangeWorld(): RangeWorld {
    if (this.#range === null) throw new Error("Target Range hasn't been created yet");
    return this.#range;
  }

  override update(): void {
    this.paint(this.host.getState());
  }

  /** The world look of a player: jersey and shape from their seat, skin and hair from their Pip. */
  private lookOf(id: string): WorldPipLook {
    const players = this.host.players;
    const seat = players.find((player) => player.id === id);
    const index = this.host.getState().players.findIndex((player) => player.id === id);
    return worldPipLook(seat?.slot ?? Math.max(0, index), seat?.profile);
  }

  private slotOf(id: string): number {
    const seat = this.host.players.find((player) => player.id === id);
    return (
      seat?.slot ??
      Math.max(
        0,
        this.host.getState().players.findIndex((p) => p.id === id),
      )
    );
  }

  private scores(state: TargetRangeState): Record<string, number> {
    return Object.fromEntries(state.players.map((player) => [player.id, player.points]));
  }

  private present(state: TargetRangeState): Presentation {
    // Remember where the target stood, so a new round's intro slides it from there.
    if (this.lastTarget !== null && this.lastTarget.round !== state.round) {
      this.slideFrom = this.lastTarget.target;
    }
    if (state.phase !== "intro") this.slideFrom = null;
    this.lastTarget = { round: state.round, target: state.target };
    return present(state, {
      reducedMotion: this.reducedMotion,
      previousTarget: this.slideFrom,
    });
  }

  private paint(state: TargetRangeState): void {
    for (const cue of cuesBetween(this.previous, state)) this.events.emit(targetRangeCueEvent, cue);
    this.previous = state;

    const view = this.present(state);
    this.rangeWorld.update(view, this.reducedMotion, state.nowMs);
    this.paintOverlays(state, view);
    this.paintCallout(view);
  }

  private paintOverlays(state: TargetRangeState, view: Presentation): void {
    this.scoreboard
      .setScores(this.scores(state))
      .setRound({ current: view.round, total: roundCount });
    this.panel.setText(view.panel).setClock(view.clock);
    this.results.show(view.results, (id) => this.slotOf(id));

    // Each points tag hangs under its player's chip, moving down a row when it would touch the
    // tag next to it.
    const chips = new Map(this.scoreboard.chips.map((chip) => [chip.playerId, chip.bounds]));
    const byId = new Map(view.tags.map((tag) => [tag.id, tag]));
    const requests = state.players.map((player, index) => {
      const tag = byId.get(player.id) ?? null;
      const size = this.tags[index]?.setTag(tag) ?? null;
      const chip = chips.get(player.id);
      if (size === null || chip === undefined) return null;
      return {
        x: Math.round(chip.x + chip.width / 2),
        top: scoreboardBottom + tagGap,
        ...size,
      };
    });
    placeTagsBelow(requests, tagGap).forEach((box, index) => {
      if (box) this.tags[index]?.place(box);
    });
  }

  /** BULLSEYE! uses the stage callout once per reveal where anyone hit a 10. */
  private paintCallout(view: Presentation): void {
    const shown = view.callout;
    const key = shown?.key ?? null;
    if (key === (this.callout?.key ?? null)) return;
    if (this.callout) {
      this.callout.object.dismiss();
      this.callout = null;
    }
    if (shown === null || key === null) return;
    const object = this.addCallout(shown.text, {
      x: worldToOverlay(shown.at.x),
      y: worldToOverlay(shown.at.y),
    });
    this.callout = { key, object };
  }
}
