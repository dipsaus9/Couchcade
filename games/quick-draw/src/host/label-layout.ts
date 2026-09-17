import { metrics } from "@couchcade/stage/layout";

/**
 * Where the tags over the Pips go, so none of them covers a winner's BANG! or another tag
 * (CC-10.9). With 3 or more players, the rows stand close together: a winner's BANG! sticks out
 * over the next Pip's tag, and a tag sits right over its own Pip's BANG!. Every box is in overlay
 * pixels.
 */

/** An axis-aligned box in overlay pixels. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A tag to place: centred on `x`, with its bottom edge (shadow included) at `bottom` or higher. */
export interface TagRequest {
  x: number;
  bottom: number;
  width: number;
  height: number;
}

/** The air kept between a tag and whatever it moves out of the way of. */
export const labelGap = metrics.outline;

/** True when the boxes are closer than `gap`. Boxes that only touch don't overlap. */
export function overlaps(a: Box, b: Box, gap = 0): boolean {
  return (
    a.left < b.right + gap &&
    b.left < a.right + gap &&
    a.top < b.bottom + gap &&
    b.top < a.bottom + gap
  );
}

/** The box of a tag centred on `x` with its bottom at `bottom`, as `PipTag` draws it. */
export function tagBox(request: TagRequest, bottom = request.bottom): Box {
  const left = request.x - Math.round(request.width / 2);
  return { left, top: bottom - request.height, right: left + request.width, bottom };
}

/**
 * Places the tags from the front row back (the lowest tag first). A tag starts at its
 * `bottom` and moves straight up, over every BANG! box in `flags` and every tag placed before
 * it that it would come within `labelGap` of. It stays over its own Pip. Returns each tag's box,
 * in the order given, or null where there is no tag.
 */
export function placeTags(
  tags: readonly (TagRequest | null)[],
  flags: readonly Box[],
): (Box | null)[] {
  const placed: (Box | null)[] = tags.map(() => null);
  const obstacles = [...flags];
  const order = tags
    .map((tag, index) => ({ tag, index }))
    .filter((entry): entry is { tag: TagRequest; index: number } => entry.tag !== null)
    .toSorted((a, b) => b.tag.bottom - a.tag.bottom || a.index - b.index);

  for (const { tag, index } of order) {
    let box = tagBox(tag);
    for (;;) {
      const hits = obstacles.filter((obstacle) => overlaps(box, obstacle, labelGap));
      if (hits.length === 0) break;
      box = tagBox(tag, Math.min(...hits.map((hit) => hit.top)) - labelGap);
    }
    placed[index] = box;
    obstacles.push(box);
  }
  return placed;
}
