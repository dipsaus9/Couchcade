# Sensor traces

Recorded and synthetic phone motion, saved as JSON. Playwright can't emulate motion sensors
(`docs/TECH_STACK.md`), so every swing, aim, flick, tilt and shake detector in `@couchcade/motion`
is unit-tested as pure code against these traces instead, with `traceSamples()`
(`packages/motion/src/sensors/trace.ts`) turning a trace's `samples` back into the `MotionSample`s
the detector's `push()` expects. See `docs/architecture/motion.md`, "Testing with recorded traces",
for the full picture.

This is the format's reference doc (CC-5.9, acceptance criterion 2). Where this file and
`docs/architecture/motion.md`'s "Trace format (version 1)" section disagree, the doc wins - fix
this file to match.

## Recording one: `pnpm trace:record`

```bash
pnpm trace:record
```

Starts a dev-only page at `http://localhost:5176` (`apps/controller/src/dev/trace-recorder/`,
never part of the production controller build - it has its own Vite config and entry, and nothing
under `apps/controller/src/main.ts` imports it). The terminal then prints a tunnel command; run it
in another terminal and open the HTTPS URL it prints on the phone:

```bash
npx cloudflared tunnel --url http://localhost:5176
```

### Reaching it from a phone: why a tunnel

iOS only grants motion access from a secure context reached by a real user gesture
(`docs/architecture/motion.md`, "What phones give us"). Plain HTTP on the LAN doesn't qualify, so
the page needs HTTPS. Two free options were weighed:

| Option | Verdict |
|---|---|
| **Cloudflare quick tunnel** (`npx cloudflared tunnel --url ...`) | **Chosen.** A real, browser-trusted HTTPS URL with zero setup on the phone, zero new dependencies (the binary is fetched by `npx` on first use, nothing added to `package.json`), and it's the approach the README's own "Testing on a real phone" section and `docs/architecture/platform.md`'s dev topology already use for the whole app. One extra terminal, torn down by `Ctrl+C` when done. |
| `server.https` with a self-signed cert (`@vitejs/plugin-basic-ssl`) | Rejected. It's also free, but the CC-5.9 amendment (motion.md conflict 6) only lets this story add the `trace:record` script *line* to `apps/controller/package.json` - not a new `devDependencies` entry, which a plugin needs. It would also need the owner to trust a self-signed certificate on every phone before Safari or Chrome allow it, extra friction a tunnel skips entirely. |

Both are €0; the tunnel wins on simplicity and by already being this project's convention.

`vite.config.ts` sets `server.allowedHosts: [".trycloudflare.com"]` because the tunnel's hostname is
random and changes every run (Vite rejects requests for hosts it doesn't recognise). It also sets
`server.host: true`, so the page is reachable on the LAN too - useful for a laptop or desktop
browser, but LAN HTTP still isn't a secure context, so only the tunnel URL works for motion on a
phone.

### On the phone

1. Open the tunnel's `https://…trycloudflare.com` URL.
2. Pick a **gesture** and type a **label** (kebab-case, e.g. `bowling-straight-medium`), pick the
   **platform** (auto-detected from the user agent, override if wrong) and type the **device**
   (free text, e.g. "iPhone 15").
3. Tap **Enable motion**. iOS asks for permission here; Android doesn't ask.
4. Hold the phone still for a second - the page measures the gyroscope-free settle and the gravity
   sign, and the live readout starts (rotation rate, acceleration, gravity + acceleration, sample
   interval), so you can check any phone's gyroscope works without starting a game.
5. Press and hold the big button - it's the grip, the same hold used everywhere in
   `docs/architecture/motion.md`. Perform the gesture, then release.
6. **Save** writes the file, or **Discard** and try again. A repeat label never overwrites an
   earlier take: the recorder appends `-2`, `-3`, … automatically.

### What the owner should record

The optional owner action from CC-5.9: on an iPhone and an Android phone, record one trace per row
below (label suggestions in brackets - keep them kebab-case and unique per gesture and platform).

| Gesture | What to record |
|---|---|
| `swing` | Slow, medium and firm bowling-style swings (`bowling-straight-slow/medium/firm`), plus a couple with a left and a right wrist twist for spin (`bowling-spin-left`, `bowling-spin-right`) |
| `aim` | A few slow sweeps left-right and up-down while pointing the phone like a remote (`sweep-horizontal`, `sweep-vertical`) |
| `flick` | A couple of dart-style forward wrist snaps (`flick-forward`) |
| `tilt` | Tilting left, right, forward and back past the dead zone (`tilt-left`, `tilt-right`, `tilt-forward`, `tilt-back`) |
| `shake` | A couple of side-to-side shakes (`shake-side`) |
| `still` | The phone flat on a table, untouched, for a few seconds (`resting`) - nothing should fire |

Traces contain no personal data: no user agent string, no name, only the platform and the free-text
device model typed into the recorder.

## Format (version 1)

```json
{
  "v": 1,
  "gesture": "swing",
  "label": "bowling-straight-medium",
  "platform": "ios",
  "device": "iPhone 15",
  "recordedAt": "2026-09-20",
  "rawSigns": "w3c",
  "expect": { "events": 1, "fields": { "speed": [0.4, 0.8], "angle": [-15, 15] } },
  "marks": [[1200, "grip-down"], [2830, "grip-up"]],
  "samples": [
    [0, 16.7, [0.01, -0.03, 0.12], [0.1, 6.2, 7.6], [1.2, -0.4, 0.3]],
    [16.7, 16.7, [0.02, -0.05, 0.10], [0.1, 6.3, 7.5], [1.5, -0.2, 0.1]]
  ]
}
```

| Field | Meaning |
|---|---|
| `v` | Format version. Readers (`traceSamples()`) reject anything other than `1`. |
| `gesture` | `swing`, `aim`, `flick`, `tilt`, `shake`, or `still` for "nothing should fire" traces. |
| `label` | Kebab-case description, unique per gesture and platform. |
| `platform` | `ios` or `android`. |
| `device` | Free text, e.g. "iPhone 15", "Pixel 8". No personal data. |
| `recordedAt` | `YYYY-MM-DD`. |
| `rawSigns` | How the browser reported gravity for this take: `w3c` or `inverted` (`docs/architecture/motion.md`, "Sign conventions"). The recorder measures it during the hold-still step; the fake adapter applies the same normalisation either way, so calibration tests replay both. |
| `expect` | What a detector with default config should produce: an event count, and optionally allowed ranges per field. The recorder only fills in `events` (`0` for `still`, `1` otherwise) - add `fields` ranges by hand once you've reviewed the trace. |
| `marks` | `[t, type]` for `grip-down`, `grip-up` or `recentre`, in ms from the first sample. |
| `samples` | `[t, interval, acceleration, gravityAcceleration, rotationRate]`. `t` is ms from the first sample. Vectors are `[x, y, z]` in m/s², rotation rate is `[alpha, beta, gamma]` in deg/s, all exactly as the browser delivered them (before calibration's sign correction), rounded to 3 decimals. A missing field is `null`. |

A 3-second swing at 60 Hz is about 15 KB. Keep traces under 10 seconds.

## File naming

`packages/motion/test/traces/<gesture>/<platform>-<label>.json` - one folder per gesture, so
`synthetic.*` builders and detector tests can glob a gesture's real traces alongside their own
synthetic ones. The recorder's save endpoint (`apps/controller/src/dev/trace-recorder/vite.config.ts`)
is the only writer; it creates the gesture folder on first save.

## Reading a trace in a test

```ts
import { traceSamples } from "@couchcade/motion/sensors";
import raw from "./traces/swing/ios-bowling-straight-medium.json" with { type: "json" };

const samples = traceSamples(raw); // MotionSample[], ready to push() into a detector
```

`synthetic.*` (`packages/motion/src/sensors/synthetic.ts`) builds traces in this same format from
simple curves, for thresholds and edge cases a real recording is awkward to reproduce on demand.
