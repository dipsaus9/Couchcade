<script setup lang="ts">
import { pipPartCounts } from "@couchcade/protocol";
import type { PipProfile } from "@couchcade/protocol";
import {
  pipChestTransform,
  pipEyes,
  pipHairBack,
  pipHairFront,
  pipHairstyleIds,
  pipHead,
  pipJersey,
  pipJerseyNeck,
  pipMouth,
  pipViewBox,
  pipViewBoxWidth,
  players,
  shape,
} from "@couchcade/theme";
import type { PipElement, PipExpression, PipHairstyleId, PipPaint } from "@couchcade/theme";
import { computed } from "vue";
import { shapeGeometry } from "../components/shapes.ts";
import type { Screen } from "../components/types.ts";

/**
 * The Interface Pip: a player's avatar for phones, menus and TV overlays
 * (docs/architecture/pips.md "Interface Pip"). Draws the same part geometry
 * `@couchcade/theme` exposes to `@couchcade/stage`'s scoreboard heads, so the two forms can't
 * drift apart (pips.md decision 10). Every part is plain SVG element data resolved to house
 * colours, never raw markup, so nothing here needs the banned inner-HTML directive
 * (security.md decision 11).
 */
const props = withDefaults(
  defineProps<{
    profile: PipProfile;
    /** 0 to 7 picks the jersey colour and chest shape; `null` is audience (plain Chalk jersey). */
    slot: number | null;
    expression?: PipExpression;
    crop?: "full" | "head";
    /** Rendered width in CSS px. */
    size: number;
    surface?: Screen;
    /** With a label the SVG is `role="img"`; without one it is `aria-hidden` (pips.md "CcPip"). */
    label?: string;
  }>(),
  { expression: "neutral", crop: "full", surface: "phone", label: undefined },
);

/** Wraps an out-of-range index instead of throwing, so a bad stored value can never crash the TV. */
function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}

// `wrap` guarantees an index within `pipHairstyleIds`' fixed length, so the cast is sound.
const hairstyleId = computed<PipHairstyleId>(
  () => pipHairstyleIds[wrap(props.profile.hair, pipHairstyleIds.length)] as PipHairstyleId,
);

const seat = computed(() =>
  props.slot === null ? null : players[wrap(props.slot, players.length)],
);

function resolvePaint(paint: PipPaint | undefined): string {
  switch (paint) {
    case "skin":
      return `var(--cc-skin-${wrap(props.profile.skin, pipPartCounts.skin) + 1})`;
    case "hair":
      return `var(--cc-hair-${wrap(props.profile.hairColour, pipPartCounts.hairColour) + 1})`;
    case "jersey":
      return seat.value ? `var(--cc-player-${seat.value.id})` : "var(--cc-chalk)";
    case "chalk":
      return "var(--cc-chalk)";
    case "ink":
    case undefined:
      return "var(--cc-ink)";
  }
}

interface RenderPart {
  key: string;
  tag: PipElement["tag"];
  attrs: PipElement["attrs"];
  fill: string;
  transform?: string;
}

/** Body parts, in draw order: hair behind, jersey, chest mark, head, hair on top (head overlaps jersey). */
const bodyParts = computed<RenderPart[]>(() => {
  const parts: RenderPart[] = [];
  const back = pipHairBack[hairstyleId.value];
  if (back)
    parts.push({
      key: "hair-back",
      tag: back.tag,
      attrs: back.attrs,
      fill: resolvePaint(back.paint),
    });

  parts.push({
    key: "jersey",
    tag: pipJersey.tag,
    attrs: pipJersey.attrs,
    fill: resolvePaint(pipJersey.paint),
  });

  const seatValue = seat.value;
  if (seatValue) {
    parts.push({
      key: "jersey-neck",
      tag: pipJerseyNeck.tag,
      attrs: pipJerseyNeck.attrs,
      fill: resolvePaint(pipJerseyNeck.paint),
    });
    const mark = shapeGeometry[seatValue.shape];
    parts.push({
      key: "chest-shape",
      tag: mark.tag,
      attrs: mark.attrs,
      fill: "var(--cc-chalk)",
      transform: pipChestTransform,
    });
  }

  parts.push({
    key: "head",
    tag: pipHead.tag,
    attrs: pipHead.attrs,
    fill: resolvePaint(pipHead.paint),
  });

  const front = pipHairFront[hairstyleId.value];
  if (front) {
    parts.push({
      key: "hair-front",
      tag: front.tag,
      attrs: front.attrs,
      fill: resolvePaint(front.paint),
    });
  }

  return parts;
});

interface RenderFacePart {
  key: string;
  tag: PipElement["tag"];
  attrs: PipElement["attrs"];
  fill: string;
  stroke: string;
  strokeWidth?: number;
}

/** A dot or a filled shape (`paint` set, or a bare circle) is filled ink with no stroke; an
 * unpainted path is an ink line at the face stroke width (arcs, the small smile, the flat mouth). */
function renderFace(key: string, part: PipElement): RenderFacePart {
  const filled = part.paint !== undefined || part.tag === "circle";
  return {
    key,
    tag: part.tag,
    attrs: part.attrs,
    fill: filled ? resolvePaint(part.paint ?? "ink") : "none",
    stroke: filled ? "none" : "var(--cc-ink)",
    strokeWidth: filled ? undefined : faceStrokeWidth.value,
  };
}

const eyes = computed(() => pipEyes[props.expression].map((eye, i) => renderFace(`eye-${i}`, eye)));
const mouth = computed(() => renderFace("mouth", pipMouth[props.expression]));

const viewBox = computed(() => pipViewBox[props.crop]);
const viewBoxWidth = computed(() => pipViewBoxWidth[props.crop]);

// The stroke width in viewBox units, so the outline is exactly 4px on the TV and 3px on a phone
// at every rendered size (pips.md "Interface Pip" geometry table).
const outlinePx = computed(() => (props.surface === "tv" ? shape.outline.tv : shape.outline.phone));
const strokeWidth = computed(() => (outlinePx.value * viewBoxWidth.value) / props.size);
// Face line width: outline × 0.8, kept between 2.4 and 4.4 viewBox units.
const faceStrokeWidth = computed(() => Math.min(4.4, Math.max(2.4, strokeWidth.value * 0.8)));
</script>

<template>
  <svg
    class="cc-pip"
    :width="size"
    :height="crop === 'head' ? size : (size * 112) / 100"
    :viewBox="viewBox"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <component
      :is="part.tag"
      v-for="part in bodyParts"
      :key="part.key"
      v-bind="part.attrs"
      :transform="part.transform"
      :style="{ fill: part.fill }"
      :stroke-width="strokeWidth"
    />
    <component
      :is="eye.tag"
      v-for="eye in eyes"
      :key="eye.key"
      v-bind="eye.attrs"
      :style="{ fill: eye.fill, stroke: eye.stroke }"
      :stroke-width="eye.strokeWidth"
    />
    <component
      :is="mouth.tag"
      v-bind="mouth.attrs"
      :style="{ fill: mouth.fill, stroke: mouth.stroke }"
      :stroke-width="mouth.strokeWidth"
    />
  </svg>
</template>

<style scoped>
.cc-pip {
  display: block;
  flex: none;
  stroke: var(--cc-ink);
  stroke-linejoin: round;
  stroke-linecap: round;
}
</style>
