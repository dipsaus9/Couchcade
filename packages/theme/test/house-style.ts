/** Reads docs/HOUSE_STYLE.md so tests can compare the tokens with the document they come from. */
import houseStyle from "../../../docs/HOUSE_STYLE.md?raw";

export { houseStyle };

/**
 * Evaluates the `packages/theme/src/tokens.ts` example in the "Tokens in code" section and
 * returns its constants (color, players, scenes, font, shape, motion, world).
 */
export function documentedTokens(): Record<string, unknown> {
  const block = /```ts\n\/\/ packages\/theme\/src\/tokens\.ts\n([\s\S]*?)```/.exec(houseStyle)?.[1];
  if (!block) throw new Error("HOUSE_STYLE.md has no tokens.ts example");
  const names = [...block.matchAll(/^export const (\w+)/gm)].map((match) => match[1]);
  const body = block.replaceAll("export const", "const").replaceAll(" as const", "");
  // The block is our own documentation, plain object literals only.
  // oxlint-disable-next-line no-new-func
  return new Function(`${body}\nreturn { ${names.join(", ")} };`)() as Record<string, unknown>;
}
