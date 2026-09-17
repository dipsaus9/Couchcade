# CC-3.13 spike: does the direct link work with no STUN server?

This is a throwaway test page, not part of the game. It answers one question: on your own
iPhone and laptop, does a direct connection between them work well enough that Couchcade can
skip paying for a STUN/TURN server? You'll run it once (about 20 minutes) and paste the results
into chat so the answer can be written down.

You do **not** need to know what WebRTC, STUN, ICE or a data channel are to run this. Just
follow the steps below in order.

## What you need

- Your laptop and your iPhone, both connected to your home Wi-Fi.
- About 20 minutes.
- Nobody else needs to be involved, though if a friend with an Android phone is around, step 7
  is a bonus (optional).

## Steps

1. **Start the test server.** Open Terminal, go to the project folder, and run:

   ```bash
   pnpm install
   pnpm --dir spikes/realtime-link dev
   ```

   Leave this running. It prints a line like `Local: http://localhost:5199/` — that confirms it
   started.

2. **Open a second Terminal tab or window** (⌘T) and run:

   ```bash
   npx cloudflared tunnel --url http://localhost:5199
   ```

   Wait for it to print a web address that looks like `https://some-random-words.trycloudflare.com`.
   That's a temporary, private address that lets your iPhone reach the test server running on
   your laptop. It stops working the moment you close this Terminal tab — that's expected, and
   fine.

3. **On the laptop**, open that address in a browser with `/tv` added to the end, for example:
   `https://some-random-words.trycloudflare.com/tv`. Leave that tab open and visible — this is
   the "TV" side of the test, and it'll show a little dot once the phone connects.

   **On the iPhone**, open Safari and go to the *same* address, but with `/phone` at the end
   instead, e.g. `https://some-random-words.trycloudflare.com/phone`.

4. **On the iPhone page**, first check the two boxes near the top are set the way you're testing
   right now — leave "Network condition" on "Wi-Fi" and "Device name" on "iPhone" for the first
   run. Then tap **Start**. Safari will ask permission to use motion & orientation — tap **Allow**.
   Now pick the phone up and move it around gently for about a minute (walk around the room,
   wave it side to side). While that happens:
   - The laptop's TV page shows a status line and a yellow dot that should visibly follow the
     phone's movement.
   - The phone shows "Connecting…", then "Connected in …ms", then "Running 30 messages/s…" and
     "Running 60 messages/s…", then "Done — results ready to copy".
   - If it instead says **"Not connected"** within about 5 seconds, that's a real result too —
     it means the direct link didn't work under that condition. Move on to the next step either
     way.

5. **Tap "Copy results"** on the iPhone page, then paste it straight into the chat (Messages,
   Slack, wherever you're talking to the assistant). It's a few lines of plain text, nothing
   personal or identifying in it.

6. **Repeat step 4 and 5 three more times**, changing only the "Network condition" dropdown and
   the phone's own settings each time, then tapping Start again on the *same* `/phone` page (no
   need to reopen it):
   - **4G**: turn Wi-Fi off on the iPhone (Settings → Wi-Fi → off, or swipe down and tap the
     Wi-Fi icon off). The direct link is expected to fail here — the page should say
     "Not connected" within about 5 seconds. That's the expected result, not a bug.
   - **iCloud Private Relay**: turn Wi-Fi back on, then turn Private Relay on
     (Settings → your name → iCloud → Private Relay → on).
   - **Low Power Mode**: turn Private Relay back off, then turn Low Power Mode on
     (Settings → Battery → Low Power Mode → on, or Control Centre).

   Turn Low Power Mode and Private Relay back off when you're done — they're not needed day to
   day.

7. **Optional, only if a friend has an Android phone on your Wi-Fi**: have them open the same
   `/phone` address in Chrome, set "Device name" to something like "Android" and "Network
   condition" to "Android Wi-Fi", tap Start, and copy their results the same way.

8. **Optional, only if you want to**: film the iPhone screen and the laptop's TV page together
   with a second phone in slow motion, so the dot's delay behind your hand can be counted in
   frames later. Not required — skip it if it's fiddly.

9. **When you're done**, go back to the first Terminal tab and press **Ctrl+C** to stop the test
   server, and Ctrl+C in the tunnel tab too.

That's it — four (or five, with Android) pasted results and you're done. Nothing here talks to
the real game, nothing is deployed, and nothing is saved anywhere except in the terminal window.

## What "Copy results" gives you

A few lines of plain text like this (this exact example is a fabricated illustration, not a
prediction):

```
Realtime-link spike (CC-3.13) — iPhone on Wi-Fi
Connected: yes
Time to connect: 412ms
Offer size: full=612B compact=118B
Answer size: full=598B compact=104B
Candidate pair: local=host remote=host
Round trip @30/s: p50=8ms p90=15ms (sent=900, lost=1, 0.11/100)
Round trip @60/s: p50=9ms p90=19ms (sent=1800, lost=4, 0.22/100)
```

- **Connected** — did a direct link open at all.
- **Offer/Answer size** — how big the connection messages are; the design keeps these under 1 KB
  because the room server (Cloudflare) refuses anything bigger. "compact" is the shrunk version
  the real game will send.
- **Candidate pair** — `host` means a plain local-network connection (the cheap, simple kind);
  anything else here would be unexpected with no STUN server configured.
- **Round trip** — how long a message takes to go phone → laptop → phone, at two speeds. Lower
  is better; this is the number that decides whether the game feels responsive.
- **lost** — how many of the messages never got a reply in time.

If a run says "Not connected", that's the whole result for that condition — there's nothing else
to copy.

## What's in this folder

| File | Role |
|---|---|
| `vite.config.ts` | The dev server, plus a tiny in-memory mailbox (`/api/offer`, `/api/answer`) that lets the phone and TV pages trade one WebRTC offer/answer without a real signalling server. |
| `tv.html`, `src/tv.ts` | The laptop page: answers the phone's offer, echoes every position sample straight back, and moves a dot to show it's alive. |
| `phone.html`, `src/phone.ts` | The iPhone page: offers the connection with `iceServers: []` (no STUN, no TURN), runs 30 seconds at 30 messages/s then 30 seconds at 60/s, and builds the copyable results. |
| `src/shared.ts` | Small helpers shared by both pages: percentile math, byte sizes, and a size-only re-creation of the design doc's compact description format (CC-3.16 builds the real, tested codec — this only measures how big it would be). |
| `browser-test.mjs` | A developer-only sanity check: opens `/tv` and `/phone` as two tabs on the same laptop and confirms the link connects. Not what the owner runs — see the steps above for that. |

## Why this isn't the real thing

This harness signals over a local dev-server mailbox instead of the Couchcade room, and it
measures message round trips instead of running an actual game. That's deliberate: it isolates
the one open question a desk review can't answer — does a no-STUN direct link connect reliably
between the owner's actual devices, and how fast is it — without needing the room, the game SDK,
or a deploy. The full production wiring is CC-3.15 (signalling through the room) and CC-3.16 (the
link core), both designed in `docs/architecture/realtime-link.md`.

## A known snag when testing two tabs on one laptop (not the owner's run)

Two browser tabs on the *same* machine can fail to connect if the machine has just started up
and the OS hasn't granted the browser "Local Network" permission yet for multicast DNS (macOS
15+ prompts for this per app). That's a same-machine testing quirk, not something the iPhone +
laptop run should hit, since a real device pair does a real network handshake instead of relying
on the OS's own loopback multicast. If the owner's real run ever reports "Not connected" on
plain Wi-Fi where it should work, check System Settings → Privacy & Security → Local Network for
the browser being used.
