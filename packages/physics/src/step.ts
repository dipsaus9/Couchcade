import { Chain, Circle, World } from "planck";
import type { Body, Contact } from "planck";
import { POSITION_ITERATIONS, STEP_SECONDS, VELOCITY_ITERATIONS } from "./constants.ts";
import type { BodyState, Push, StepResult, WorldSpec } from "./types.ts";

/**
 * Steps a world exactly one fixed step (1/60 s) and returns the new body states.
 *
 * A pure function over plain numbers (session-flow.md, physics package). Every call builds a
 * fresh Planck world from `spec` and `bodies`: walls in `spec.walls` order, bodies sorted by id,
 * warm starting and sleeping off. It applies `pushes` as forces for this step, steps once and
 * reads the bodies back. Nothing survives between calls, so the same arguments always give the
 * same result in the same JavaScript engine, and a state restored from JSON carries on exactly
 * where it left off.
 *
 * Inputs are never changed. Bodies come back in input order. Every id in `bodies` needs a spec in
 * `spec.bodies`; ids must be unique across bodies and walls.
 */
export function stepWorld(
  spec: WorldSpec,
  bodies: readonly BodyState[],
  pushes: readonly Push[],
): StepResult {
  const world = new World({
    gravity: { x: spec.gravity[0], y: spec.gravity[1] },
    allowSleep: false,
    warmStarting: false,
    continuousPhysics: true,
    subStepping: false,
    blockSolve: true,
  });
  const ids = new Set<string>();

  spec.walls.forEach((wall, index) => {
    const id = wall.id ?? `wall:${index}`;
    claimId(ids, id);
    const body = world.createBody({ type: "static", userData: id });
    body.createFixture({
      shape: new Chain(
        wall.points.map(([x, y]) => ({ x, y })),
        wall.loop,
      ),
      friction: wall.friction,
      restitution: wall.restitution,
    });
  });

  const byId = new Map<string, Body>();
  for (const state of sortById(bodies)) {
    claimId(ids, state.id);
    const bodySpec = spec.bodies[state.id];
    if (bodySpec === undefined) {
      throw new RangeError(`Body "${state.id}" has no spec in spec.bodies`);
    }
    requireFiniteState(state);
    const body = world.createBody({
      type: "dynamic",
      position: { x: state.x, y: state.y },
      angle: state.a,
      linearVelocity: { x: state.vx, y: state.vy },
      angularVelocity: state.w,
      linearDamping: bodySpec.linearDamping,
      angularDamping: bodySpec.angularDamping,
      bullet: bodySpec.bullet,
      userData: state.id,
    });
    body.createFixture({
      shape: new Circle(bodySpec.radius),
      density: bodySpec.density,
      friction: bodySpec.friction,
      restitution: bodySpec.restitution,
    });
    byId.set(state.id, body);
  }

  for (const push of pushes) {
    const body = byId.get(push.id);
    if (body === undefined) {
      throw new RangeError(`Push for unknown body "${push.id}"`);
    }
    if (!Number.isFinite(push.fx) || !Number.isFinite(push.fy)) {
      throw new RangeError(`Push for "${push.id}" needs finite fx and fy`);
    }
    body.applyForceToCenter({ x: push.fx, y: push.fy }, true);
  }

  const touched = new Map<string, [string, string]>();
  world.on("begin-contact", (contact: Contact) => {
    const a = contact.getFixtureA().getBody().getUserData() as string;
    const b = contact.getFixtureB().getBody().getUserData() as string;
    const pair: [string, string] = a < b ? [a, b] : [b, a];
    touched.set(JSON.stringify(pair), pair);
  });

  world.step(STEP_SECONDS, VELOCITY_ITERATIONS, POSITION_ITERATIONS);

  const next = bodies.map((state): BodyState => {
    const body = byId.get(state.id) as Body;
    const position = body.getPosition();
    const velocity = body.getLinearVelocity();
    return {
      id: state.id,
      x: plainZero(position.x),
      y: plainZero(position.y),
      vx: plainZero(velocity.x),
      vy: plainZero(velocity.y),
      a: plainZero(body.getAngle()),
      w: plainZero(body.getAngularVelocity()),
    };
  });

  const contacts = [...touched.values()].toSorted(
    (left, right) => compareCodeUnits(left[0], right[0]) || compareCodeUnits(left[1], right[1]),
  );

  return { bodies: next, contacts };
}

/** Sorts by id in UTF-16 code unit order, which doesn't depend on locale like `localeCompare`. */
function sortById<T extends { id: string }>(items: readonly T[]): T[] {
  return items.toSorted((left, right) => compareCodeUnits(left.id, right.id));
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function claimId(ids: Set<string>, id: string): void {
  if (ids.has(id)) {
    throw new RangeError(`Id "${id}" is used twice in one world`);
  }
  ids.add(id);
}

function requireFiniteState(state: BodyState): void {
  for (const key of ["x", "y", "vx", "vy", "a", "w"] as const) {
    if (!Number.isFinite(state[key])) {
      throw new RangeError(`Body "${state.id}" has a non-finite ${key}: ${state[key]}`);
    }
  }
}

/** JSON writes -0 as 0, so state never holds -0. Adding 0 turns -0 into 0 and leaves the rest. */
function plainZero(value: number): number {
  return value + 0;
}
