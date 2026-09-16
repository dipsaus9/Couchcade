/**
 * Small vector and quaternion maths for calibration and the pose tracker. `@couchcade/motion` has
 * no npm dependencies (motion.md adapter rule 9), so this stays a handful of plain functions.
 */
import type { RotationRate, Vec3 } from "../sensors/types.ts";

/** A unit quaternion `w + xi + yj + zk`. As a pose it turns device-frame vectors into the motion frame. */
export type Quaternion = { w: number; x: number; y: number; z: number };

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);

export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);

export const scale = (v: Vec3, factor: number): Vec3 =>
  vec(v.x * factor, v.y * factor, v.z * factor);

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

/** `v` scaled to length 1, or `null` when it is too short to have a direction. */
export function normalise(v: Vec3): Vec3 | null {
  const size = length(v);
  return size < 1e-9 ? null : scale(v, 1 / size);
}

/** The part of `v` at right angles to the unit vector `axis`. */
export const perpendicular = (v: Vec3, axis: Vec3): Vec3 => sub(v, scale(axis, dot(v, axis)));

/** A rotation rate as a vector around x, y and z. */
export const rateVector = (rate: RotationRate): Vec3 => vec(rate.alpha, rate.beta, rate.gamma);

export const IDENTITY: Quaternion = { w: 1, x: 0, y: 0, z: 0 };

export const multiply = (a: Quaternion, b: Quaternion): Quaternion => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});

export const conjugate = (q: Quaternion): Quaternion => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z });

export function normaliseQuaternion(q: Quaternion): Quaternion {
  const size = Math.hypot(q.w, q.x, q.y, q.z);
  return { w: q.w / size, x: q.x / size, y: q.y / size, z: q.z / size };
}

/**
 * The rotation by the length of `rotation` (radians) around its direction, right-handed. A zero
 * vector is no rotation.
 */
export function fromRotationVector(rotation: Vec3): Quaternion {
  const angle = length(rotation);
  if (angle < 1e-12) return IDENTITY;
  const s = Math.sin(angle / 2) / angle;
  return { w: Math.cos(angle / 2), x: rotation.x * s, y: rotation.y * s, z: rotation.z * s };
}

/** `v` turned by `q`: `q v q*`. */
export function rotate(q: Quaternion, v: Vec3): Vec3 {
  const p = multiply(multiply(q, { w: 0, ...v }), conjugate(q));
  return vec(p.x, p.y, p.z);
}

/**
 * The rotation whose matrix has the rows `x`, `y` and `z`: it turns a vector `v` into
 * `(x · v, y · v, z · v)`. The rows must be orthonormal and right-handed (`x = y × z`).
 */
export function fromRows(x: Vec3, y: Vec3, z: Vec3): Quaternion {
  // Shoemake's method, picking the largest diagonal term for numerical stability.
  const trace = x.x + y.y + z.z;
  let q: Quaternion;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = { w: 0.25 / s, x: (z.y - y.z) * s, y: (x.z - z.x) * s, z: (y.x - x.y) * s };
  } else if (x.x > y.y && x.x > z.z) {
    const s = 0.5 / Math.sqrt(1 + x.x - y.y - z.z);
    q = { w: (z.y - y.z) * s, x: 0.25 / s, y: (x.y + y.x) * s, z: (x.z + z.x) * s };
  } else if (y.y > z.z) {
    const s = 0.5 / Math.sqrt(1 - x.x + y.y - z.z);
    q = { w: (x.z - z.x) * s, x: (x.y + y.x) * s, y: 0.25 / s, z: (y.z + z.y) * s };
  } else {
    const s = 0.5 / Math.sqrt(1 - x.x - y.y + z.z);
    q = { w: (y.x - x.y) * s, x: (x.z + z.x) * s, y: (y.z + z.y) * s, z: 0.25 / s };
  }
  return normaliseQuaternion(q);
}
