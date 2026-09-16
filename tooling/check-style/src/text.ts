/**
 * Blanks out `//` and `/* *‍/`-style comments (same length, so reported line numbers stay put) so a
 * doc comment with a colour example (`` `#1E2A4A` becomes... ``) never trips a rule. This is a
 * heuristic, not a parser: it doesn't understand string literals, so a `//` inside a string on the
 * same line is also blanked. That trades a rare false negative for never crying wolf on a comment,
 * which is the right side to err on for a CI gate.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, (match) => " ".repeat(match.length));
}

/** The 1-based line number of `index` within `source`. */
export function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}
