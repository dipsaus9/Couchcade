/**
 * Dev-only Vite server for `pnpm trace:record` (docs/architecture/motion.md, "Recording (CC-5.9)").
 * Serves the recorder page from this directory and a save endpoint that writes recorded traces to
 * packages/motion/test/traces/<gesture>/<platform>-<label>.json.
 *
 * This config, and everything it imports, lives entirely under
 * apps/controller/src/dev/trace-recorder/. Nothing the production controller loads (main.ts and
 * everything reachable from it) ever imports this directory, so `vite build` (the default
 * apps/controller/vite.config.ts) never bundles it - verified by grepping dist/ after a build.
 *
 * Per the CC-5.9 amendment (motion.md conflict 6), only the `trace:record` script line touches
 * apps/controller/package.json, so this adds no new dependency: it reuses vue and
 * @vitejs/plugin-vue (already dependencies of @couchcade/controller) and talks to
 * `DeviceMotionEvent` directly from RecorderApp.vue instead of importing @couchcade/motion, which
 * isn't declared here.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

const RECORDER_DIR = fileURLToPath(new URL(".", import.meta.url));
// apps/controller/src/dev/trace-recorder/ -> repo root is 5 levels up.
const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const TRACES_DIR = join(REPO_ROOT, "packages/motion/test/traces");

/** apps/server, apps/host and apps/controller use 5173-5175 (@couchcade/config/vite devPorts). */
const PORT = 5176;

const GESTURES = ["swing", "aim", "flick", "tilt", "shake", "still"] as const;
const PLATFORMS = ["ios", "android"] as const;
const LABEL_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface IncomingTrace {
  v?: unknown;
  gesture?: unknown;
  label?: unknown;
  platform?: unknown;
  samples?: unknown;
  marks?: unknown;
}

/** Rejects anything that isn't a well-formed version 1 trace before it touches the filesystem. */
function validationError(trace: IncomingTrace): string | null {
  if (trace.v !== 1) return "v must be 1";
  if (typeof trace.gesture !== "string" || !(GESTURES as readonly string[]).includes(trace.gesture))
    return `gesture must be one of ${GESTURES.join(", ")}`;
  if (
    typeof trace.platform !== "string" ||
    !(PLATFORMS as readonly string[]).includes(trace.platform)
  )
    return `platform must be one of ${PLATFORMS.join(", ")}`;
  if (typeof trace.label !== "string" || !LABEL_PATTERN.test(trace.label))
    return "label must be kebab-case (lowercase letters, digits and hyphens)";
  if (!Array.isArray(trace.samples) || trace.samples.length === 0)
    return "samples must be a non-empty array";
  if (!Array.isArray(trace.marks)) return "marks must be an array";
  return null;
}

/** The next free `<platform>-<label>[-2, -3, ...].json` path, so a repeat take is never overwritten. */
function targetPath(gesture: string, platform: string, label: string): string {
  const dir = join(TRACES_DIR, gesture);
  let suffix = "";
  let attempt = 1;
  while (existsSync(join(dir, `${platform}-${label}${suffix}.json`))) {
    attempt += 1;
    suffix = `-${String(attempt)}`;
  }
  return join(dir, `${platform}-${label}${suffix}.json`);
}

/**
 * Dev-server-only endpoint: `POST /api/trace` writes the recorded trace to
 * packages/motion/test/traces/. This plugin, and the endpoint, exist only here - never in
 * apps/server or a production build (motion.md, "Recording (CC-5.9)" rule 4).
 */
function saveTracePlugin(): Plugin {
  return {
    name: "trace-recorder-save",
    configureServer(server) {
      server.middlewares.use("/api/trace", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          res.setHeader("Content-Type", "application/json");
          let trace: IncomingTrace;
          try {
            trace = JSON.parse(Buffer.concat(chunks).toString("utf8")) as IncomingTrace;
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "invalid JSON" }));
            return;
          }
          const problem = validationError(trace);
          if (problem) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: problem }));
            return;
          }
          const file = targetPath(
            trace.gesture as string,
            trace.platform as string,
            trace.label as string,
          );
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, `${JSON.stringify(trace, null, 2)}\n`);
          res.statusCode = 200;
          res.end(JSON.stringify({ path: file.slice(REPO_ROOT.length) }));
        });
      });
    },
  };
}

/** Prints the quick-tunnel command once the dev server is up (motion.md, "Recording (CC-5.9)"). */
function printTunnelHintPlugin(): Plugin {
  return {
    name: "trace-recorder-tunnel-hint",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        console.log(
          "\n  Phones need HTTPS for motion sensors. In another terminal, run:\n\n" +
            `    npx cloudflared tunnel --url http://localhost:${String(PORT)}\n\n` +
            "  then open the printed https://*.trycloudflare.com URL on the phone. See\n" +
            "  packages/motion/test/traces/README.md for the full recording steps.\n",
        );
      });
    },
  };
}

export default defineConfig({
  root: RECORDER_DIR,
  server: {
    port: PORT,
    strictPort: true,
    // Reachable on the LAN too, but only the HTTPS tunnel URL is a secure context for iOS.
    host: true,
    // The cloudflared quick tunnel's hostname is random and changes every run.
    allowedHosts: [".trycloudflare.com"],
  },
  plugins: [vue(), saveTracePlugin(), printTunnelHintPlugin()],
});
