import { repoRoot } from "./repo-root.ts";
import { recolourFile } from "./recolour.ts";

// Usage: pnpm assets:recolour <input.png> <scene>
// Recolours <input.png> in place onto the core + <scene> palette from @couchcade/theme.
const [inputPath, sceneId] = process.argv.slice(2);

try {
  if (!inputPath || !sceneId) {
    throw new Error("Usage: pnpm assets:recolour <input.png> <scene>");
  }
  const result = await recolourFile(inputPath, sceneId, repoRoot);
  process.stdout.write(
    `Recoloured ${inputPath} onto scene "${result.scene.id}" (${result.scene.world.length} colours): ` +
      `${result.changedPixels}/${result.totalPixels} pixels changed.\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`assets:recolour failed: ${message}\n`);
  process.exitCode = 1;
}
