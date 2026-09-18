import type { PlayerInfo } from "@couchcade/protocol";
import { color, typeScale } from "@couchcade/theme";
import { GameObjects } from "phaser";
import type { Scene, Types } from "phaser";
import { drawSlab, textStyle } from "../draw/index.ts";
import { metrics, safeArea } from "../layout/index.ts";
import type { Rect } from "../layout/index.ts";
import { buildInterfacePipHead, interfacePipHeadSize } from "./pip-head.ts";

export * from "./pip-head.ts";

/**
 * Scoreboard measurements in overlay pixels, from the 1080p TV chip in the design canvas. Each
 * chip's avatar is the player's Interface Pip head, 56px (docs/architecture/pips.md "Sizes on
 * screen": "TV game menu and scoreboard chips"), replacing the plain player-shape icon this chip
 * drew before CC-6.6: at 8 simultaneous chips plus the round counter, the safe area (1728px at
 * 1080p) has no room left for both a 56px Pip head and a separate 36px shape icon per chip (that
 * combination overflowed by several hundred px in testing). The chip's name still sits next to
 * the Pip, so colour is never this chip's only cue (docs/HOUSE_STYLE.md, "shapes wherever a
 * player colour appears"): the Pip's jersey colour still shows through the head crop even without
 * the shape mark on it (pips.md: the jersey starts above the crop's bottom edge).
 */
export const scoreboardMetrics = {
  /** Chip height. */
  chipHeight: 72,
  /** Space before the Pip head. */
  padStart: 16,
  /** Space after the name or score. */
  padEnd: 24,
  /** Space between the Pip head, the name and the score. */
  gap: 12,
  /** Space between chips. */
  chipGap: 16,
  /** How far the active player's chip lifts. */
  lift: 8,
  /** The Interface Pip head crop, the chip's avatar. */
  pipHeadSize: interfacePipHeadSize,
} as const;

export interface RoundCounter {
  current: number;
  /** Omit when the game has no fixed number of rounds. */
  total?: number;
}

export interface ScoreboardOptions {
  /** Everyone in the room. Audience members (no slot) are left out. */
  players: readonly PlayerInfo[];
  /** Scores by player id. A player without a score shows no number. */
  scores?: Readonly<Record<string, number>>;
  /** The player whose turn it is, or null. */
  activePlayerId?: string | null;
  /** The round counter chip in the middle, or null for none. */
  round?: RoundCounter | null;
}

/** Where a chip ended up, for layout checks and for games that point at a player. */
export interface ScoreboardChip {
  readonly playerId: string;
  /** The chip's outline box, lift included. The shadow sits below it and the ring around it. */
  readonly bounds: Rect;
  readonly active: boolean;
  /** The name as shown: shortened with an ellipsis, or empty, when the row is too full. */
  readonly name: string;
}

const ELLIPSIS = "…";

/**
 * How the row gives way when it is too full, tried in order. Names shorten evenly within a step,
 * and the next step starts once a name would lose its first letter. First the round counter
 * drops its "Round" label, then the names go (the shape still tells players apart), then scores
 * drop to the `action` size, which is still above the 24px TV minimum.
 */
const compaction = [
  { roundLabel: true, names: true, scoreSize: typeScale.score.tv },
  { roundLabel: false, names: true, scoreSize: typeScale.score.tv },
  { roundLabel: false, names: false, scoreSize: typeScale.score.tv },
  { roundLabel: false, names: false, scoreSize: typeScale.action.tv },
] as const;

type Compaction = (typeof compaction)[number];

interface PlannedChip {
  player: PlayerInfo & { slot: number };
  name: string;
  score: string | null;
  x: number;
  width: number;
}

interface Plan {
  fits: boolean;
  scoreStyle: Types.GameObjects.Text.TextStyle;
  chips: PlannedChip[];
  counter: { rect: Rect; label: string | null; value: string } | null;
}

/**
 * A row of player chips across the top of the TV safe area, in join order, with a round counter
 * chip in the middle (HOUSE_STYLE "Scoreboard (TV)"). Each chip is a Chalk pill with the
 * player's shape, their name in Fredoka and their score in Pixelify Sans. The active player's
 * chip lifts and gets a Sunny ring.
 */
export class Scoreboard extends GameObjects.Container {
  #players: readonly PlayerInfo[];
  #scores: Record<string, number>;
  #activePlayerId: string | null;
  #round: RoundCounter | null;
  #chips: ScoreboardChip[] = [];
  #roundBounds: Rect | null = null;
  readonly #measure: GameObjects.Text;

  constructor(scene: Scene, options: ScoreboardOptions) {
    super(scene, 0, 0);
    this.#players = options.players;
    this.#scores = { ...options.scores };
    this.#activePlayerId = options.activePlayerId ?? null;
    this.#round = options.round ?? null;
    this.#measure = scene.make.text({}, false);
    this.once(GameObjects.Events.DESTROY, () => this.#measure.destroy());
    this.#build();
  }

  /** The chips in the order shown, left to right. */
  get chips(): readonly ScoreboardChip[] {
    return this.#chips;
  }

  /** The round counter chip's outline box, or null when there is none. */
  get roundCounterBounds(): Rect | null {
    return this.#roundBounds;
  }

  setPlayers(players: readonly PlayerInfo[]): this {
    this.#players = players;
    return this.#build();
  }

  setScore(playerId: string, score: number): this {
    if (this.#scores[playerId] === score) return this;
    this.#scores[playerId] = score;
    return this.#build();
  }

  setScores(scores: Readonly<Record<string, number>>): this {
    const next = { ...scores };
    const keys = new Set([...Object.keys(next), ...Object.keys(this.#scores)]);
    if ([...keys].every((key) => next[key] === this.#scores[key])) return this;
    this.#scores = next;
    return this.#build();
  }

  setActivePlayer(playerId: string | null): this {
    if (this.#activePlayerId === playerId) return this;
    this.#activePlayerId = playerId;
    return this.#build();
  }

  setRound(round: RoundCounter | null): this {
    const current = this.#round;
    const same =
      round === current ||
      (round !== null &&
        current !== null &&
        round.current === current.current &&
        round.total === current.total);
    if (same) return this;
    this.#round = round;
    return this.#build();
  }

  #width(text: string, style: Types.GameObjects.Text.TextStyle): number {
    if (text === "") return 0;
    return Math.ceil(this.#measure.setStyle(style).setText(text).width);
  }

  #build(): this {
    this.removeAll(true);
    this.#chips = [];
    this.#roundBounds = null;

    const seated = this.#players
      .filter((player): player is PlayerInfo & { slot: number } => player.slot !== null)
      .toSorted((a, b) => a.joinedAt - b.joinedAt || a.slot - b.slot);
    let plan = this.#plan(seated, compaction[0]);
    for (const step of compaction.slice(1)) {
      if (plan.fits) break;
      plan = this.#plan(seated, step);
    }
    this.#draw(plan);
    return this;
  }

  #plan(seated: readonly (PlayerInfo & { slot: number })[], step: Compaction): Plan {
    const { padStart, padEnd, gap, chipGap, chipHeight } = scoreboardMetrics;
    const nameStyle = textStyle("body");
    const scoreStyle = { ...textStyle("score"), fontSize: `${step.scoreSize}px` };

    let counter: Plan["counter"] = null;
    if (this.#round) {
      const { current, total } = this.#round;
      const value = total === undefined ? String(current) : `${current}/${total}`;
      const label = step.roundLabel ? "Round" : null;
      const labelWidth = label ? this.#width(label, nameStyle) + gap : 0;
      const width = padEnd + labelWidth + this.#width(value, scoreStyle) + padEnd;
      counter = { rect: { x: 0, y: 0, width, height: chipHeight }, label, value };
    }

    const measured = seated.map((player) => {
      const value = this.#scores[player.id];
      const score = value === undefined ? null : String(value);
      return {
        player,
        score,
        nameWidth: this.#width(player.name, nameStyle),
        // The narrowest a shortened name gets before this step gives way: one letter and "…".
        minNameWidth: Math.min(
          this.#width(player.name, nameStyle),
          this.#width(`${player.name.slice(0, 1)}${ELLIPSIS}`, nameStyle),
        ),
        fixed:
          padStart +
          scoreboardMetrics.pipHeadSize +
          (score ? gap + this.#width(score, scoreStyle) : 0) +
          padEnd,
      };
    });

    // One row: the first half of the chips, the counter, the second half, centred in the safe
    // area. Names share one width limit, so they shorten evenly when the row is too wide.
    const slots = measured.length + (counter ? 1 : 0);
    const capacity =
      safeArea.width - chipGap * Math.max(0, slots - 1) - (counter ? counter.rect.width : 0);
    const nameSpace = (width: number) => (width > 0 ? gap + width : 0);
    const needed = (limit: number) =>
      measured.reduce(
        (sum, part) => sum + part.fixed + nameSpace(Math.min(part.nameWidth, limit)),
        0,
      );
    let limit = step.names ? Math.max(0, ...measured.map((part) => part.nameWidth)) : 0;
    while (limit > 0 && needed(limit) > capacity) limit -= 1;
    const fits = step.names
      ? measured.every((part) => limit >= part.minNameWidth)
      : needed(0) <= capacity;

    const chips: PlannedChip[] = measured.map((part) => {
      const name = this.#shorten(part.player.name, limit, nameStyle);
      return {
        player: part.player,
        name,
        score: part.score,
        x: 0,
        width: part.fixed + nameSpace(this.#width(name, nameStyle)),
      };
    });
    const half = Math.ceil(chips.length / 2);
    const row: { width: number; x: number }[] = counter
      ? [...chips.slice(0, half), counter.rect, ...chips.slice(half)]
      : chips;
    const total =
      row.reduce((sum, item) => sum + item.width, 0) + chipGap * Math.max(0, row.length - 1);
    let x = Math.max(safeArea.left, Math.round(safeArea.left + (safeArea.width - total) / 2));
    for (const item of row) {
      item.x = x;
      x += item.width + chipGap;
    }
    return { fits, scoreStyle, chips, counter };
  }

  /** The longest start of `name` (plus an ellipsis) that is at most `limit` wide. */
  #shorten(name: string, limit: number, style: Types.GameObjects.Text.TextStyle): string {
    if (this.#width(name, style) <= limit) return name;
    for (let length = name.length - 1; length > 0; length--) {
      const short = `${name.slice(0, length).trimEnd()}${ELLIPSIS}`;
      if (this.#width(short, style) <= limit) return short;
    }
    return "";
  }

  #draw(plan: Plan): void {
    const { chipHeight, padStart, padEnd, gap, lift, pipHeadSize } = scoreboardMetrics;
    const top = safeArea.top + metrics.outline + lift;
    const centreY = top + chipHeight / 2;
    const text = (content: string, style: Types.GameObjects.Text.TextStyle, x: number) =>
      this.scene.make
        .text({ text: content, style }, false)
        .setOrigin(0, 0.5)
        .setPosition(x, centreY);

    for (const chip of plan.chips) {
      const active = chip.player.id === this.#activePlayerId;
      const y = active ? top - lift : top;
      const bounds = { x: chip.x, y, width: chip.width, height: chipHeight };

      // The chip's Chalk pill sits behind everything else, so it's added first; the Pip head
      // (docs/architecture/pips.md "Pips on the TV") sits on top of it.
      const graphics = this.scene.make.graphics({}, false);
      drawSlab(graphics, bounds, { radius: "pill", ...(active ? { ring: color.sunny } : {}) });
      this.add(graphics);
      const pipHeadX = chip.x + padStart;

      const pipHeadKey = buildInterfacePipHead(this.scene, {
        profile: chip.player.profile,
        slot: chip.player.slot,
      });
      const pipHead = this.scene.make
        .image({}, false)
        .setTexture(pipHeadKey)
        .setOrigin(0, 0)
        .setDisplaySize(pipHeadSize, pipHeadSize)
        .setPosition(pipHeadX, y + Math.floor((chipHeight - pipHeadSize) / 2));
      this.add(pipHead);

      let x = pipHeadX + pipHeadSize;
      const liftBy = (object: GameObjects.Text) => object.setY(object.y - (top - y));
      if (chip.name) {
        const name = liftBy(text(chip.name, textStyle("body"), x + gap));
        this.add(name);
        x = name.x + Math.ceil(name.width);
      }
      if (chip.score !== null) this.add(liftBy(text(chip.score, plan.scoreStyle, x + gap)));
      this.#chips.push({ playerId: chip.player.id, bounds, active, name: chip.name });
    }

    if (plan.counter) {
      const rect = { ...plan.counter.rect, y: top };
      const graphics = this.scene.make.graphics({}, false);
      drawSlab(graphics, rect, { radius: "pill" });
      this.add(graphics);
      let x = rect.x + padEnd;
      if (plan.counter.label) {
        const label = text(plan.counter.label, textStyle("body"), x);
        this.add(label);
        x += Math.ceil(label.width) + gap;
      }
      this.add(text(plan.counter.value, plan.scoreStyle, x));
      this.#roundBounds = rect;
    }
  }
}
