import { toJSONSchema } from "zod/mini";
import type { ZodMiniType } from "zod/mini";

/** A JSON Schema node, as far as the sampler reads it. */
interface SchemaNode {
  $ref?: string;
  $defs?: Record<string, SchemaNode>;
  const?: unknown;
  enum?: unknown[];
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  items?: SchemaNode;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minLength?: number;
  minItems?: number;
}

/** Most sample inputs derived from one schema. */
const maxSamples = 32;
/** Deepest `$ref` chain followed, so recursive schemas such as `z.json()` stop. */
const maxDepth = 4;

/**
 * A few valid inputs for a game's `inputSchema`: every literal, enum value and union branch, and
 * the bounds of numbers. The contract test kit feeds them to `onPlayerInput`. Values the sampler
 * can't guess (a `pattern`, a refinement) are filtered out by parsing, so every sample is valid.
 */
export function sampleInputs<T>(schema: ZodMiniType<T>): T[] {
  let root: SchemaNode;
  try {
    root = toJSONSchema(schema, { unrepresentable: "any" }) as SchemaNode;
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const samples: T[] = [];
  for (const candidate of valuesOf(root, root, 0)) {
    const parsed = schema.safeParse(candidate);
    if (!parsed.success) continue;
    const key = JSON.stringify(parsed.data);
    if (seen.has(key)) continue;
    seen.add(key);
    samples.push(parsed.data);
    if (samples.length === maxSamples) break;
  }
  return samples;
}

function valuesOf(node: SchemaNode, root: SchemaNode, depth: number): unknown[] {
  if (depth > maxDepth) return [null];
  if (node.$ref !== undefined) {
    const def = root.$defs?.[node.$ref.replace("#/$defs/", "")];
    return def === undefined ? [null] : valuesOf(def, root, depth + 1);
  }
  if ("const" in node) return [node.const];
  if (node.enum !== undefined) return node.enum;
  const branches = node.anyOf ?? node.oneOf;
  if (branches !== undefined) {
    return branches.flatMap((branch) => valuesOf(branch, root, depth + 1));
  }
  const types = node.type === undefined ? [] : [node.type].flat();
  return types.flatMap((type) => valuesOfType(type, node, root, depth));
}

function valuesOfType(type: string, node: SchemaNode, root: SchemaNode, depth: number): unknown[] {
  switch (type) {
    case "object":
      return objectValues(node, root, depth);
    case "array": {
      const items = node.items === undefined ? [null] : valuesOf(node.items, root, depth + 1);
      const length = Math.max(1, node.minItems ?? 0);
      return [[], ...items.map((item) => Array.from({ length }, () => item))];
    }
    case "integer":
    case "number": {
      const low =
        node.minimum ??
        (node.exclusiveMinimum === undefined ? -Infinity : node.exclusiveMinimum + 1);
      const high =
        node.maximum ??
        (node.exclusiveMaximum === undefined ? Infinity : node.exclusiveMaximum - 1);
      return [low, high, Math.round((low + high) / 2), 0, 1].filter(
        (value) => Number.isFinite(value) && value >= low && value <= high,
      );
    }
    case "string":
      return ["a".repeat(Math.max(1, node.minLength ?? 0))];
    case "boolean":
      return [true, false];
    case "null":
      return [null];
    default:
      return [];
  }
}

/** Objects that walk every property's values side by side, with and without optional keys. */
function objectValues(node: SchemaNode, root: SchemaNode, depth: number): unknown[] {
  const properties = Object.entries(node.properties ?? {}).map(
    ([key, schema]) => [key, valuesOf(schema, root, depth + 1)] as const,
  );
  const required = new Set(node.required ?? []);
  const variants = Math.max(1, ...properties.map(([, values]) => values.length));
  const objects: Record<string, unknown>[] = [];
  for (let i = 0; i < variants; i++) {
    const full: Record<string, unknown> = {};
    const minimal: Record<string, unknown> = {};
    for (const [key, values] of properties) {
      if (values.length === 0) continue;
      const value = values[i % values.length];
      full[key] = value;
      if (required.has(key)) minimal[key] = value;
    }
    objects.push(full, minimal);
  }
  return objects;
}
