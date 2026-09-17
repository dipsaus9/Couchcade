---
id: CC-5.10
title: Add the motion permission step and wake lock to the controller
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 09:33'
labels:
  - story
dependencies:
  - CC-5.2
  - CC-1.16
  - CC-1.17
references:
  - apps/controller/src/motion/
  - e2e/platform/motion-permission.spec.ts
  - apps/host/src/motion/
  - apps/controller/test/motion/
  - apps/host/test/motion/
  - apps/controller/src/App.vue
  - apps/controller/src/session/state.ts
  - apps/controller/src/session/session.ts
  - apps/controller/src/device/screen.ts
  - apps/controller/package.json
  - apps/controller/test/device.test.ts
  - apps/controller/test/state.test.ts
  - apps/host/src/App.vue
  - apps/host/src/runtime/host-runtime.ts
  - apps/host/src/session/use-host-session.ts
  - apps/host/test/runtime/host-runtime.test.ts
parent_task_id: CC-5
type: feature
ordinal: 80000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Before a motion game, every phone enables sensors or falls back to touch.

Type: deliverable
Branch: CC-5.10/motion-permission-step
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When the selected game has needsMotion, phones show "Tap to enable motion"
- [x] #2 Denied or unsupported phones continue with touch fallback and the host is told
- [x] #3 A "tap to resume" overlay appears after the page was hidden
- [x] #4 An E2E test with the injected adapter covers granted and denied
- [x] #5 The host shows the motion step, waits for every seated phone's motion:status or 20 seconds, and marks touch-fallback players with the touch icon
- [x] #6 The approved motion permission screen shows the one-line Portrait Orientation Lock hint on iPhone, and Android requests fullscreen with a portrait lock during motion games
- [ ] #7 The task notes record the owner's real-iPhone check of the approved motion-denied hint (steps written for the owner); if Safari does not ask again, a one-line copy change is proposed to the owner
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Host (apps/host/src/motion/): createMotionCheck: motion-permission views {gameId,title,step} for every seated player, motion:status answers per player, done when every seated player answered or after 20 s (unanswered = touch), touch-fallback set; TV MotionStepScreen.vue with player chips marked waiting / motion / touch icon. Runtime glue: needsMotion games go menu/results -> motion-check -> playing; ui:action ignored during the step; presence changes re-check; motion:status during play updates the running game's touch set (rule 7); fit re-checked when the step ends.
2. Phone (apps/controller/src/motion/): adapter.ts picks the fake from window.__couchcadeMotion in dev/test builds only (branch on import.meta.env.DEV so production drops it), else createBrowserAdapter; view.ts parses the motion-permission view; platform.ts detects iPhone/Android and enters fullscreen + portrait lock on Android (exit when the game ends); session.ts: the step flow (Tap to enable motion: request() synchronously in the click, wake lock renew, fullscreen; granted -> 1 s real-data check -> rest calibration with progress -> motion:status granted; denied / Use touch instead / unsupported / no gyroscope -> touch + status), per-step state kept across reconnects, Tap to resume after the page was hidden during a motion game (request + restart + wake lock), 2 s no-sample watchdog during play (rule 7), rotate notice suppressed during motion games. MotionStepScreen.vue (ask with iPhone Portrait Orientation Lock hint, hold still with progress ring, touch controls it is + Ready + hint, ready) and MotionResume.vue overlay.
3. Wake lock: adjust CC-1.12's keepScreenAwake to return { renew, release } so the enable and resume taps renew the one existing lock; session exposes keepAwake().
4. Glue: state.ts screenOf routes motion-permission; App.vue mounts the step, overlay and rotate-notice suppression; host App.vue + use-host-session.ts show the TV step; controller package.json depends on @couchcade/motion.
5. Tests: unit tests for motion check, runtime integration, adapter selection, flow/session (fake adapter + fake timers), platform helpers, wake lock renew, screenOf. E2E e2e/platform/motion-permission.spec.ts: TV + 2 phones with the injected fake (granted, denied); Quick Draw is made to need motion in the test only by wrapping the host registry through the Vite dev module; asserts phone permission screens, iPhone hint on WebKit only, touch icon on the TV for the denied phone, calibration on the granted phone with a still trace, and the game starting.
6. Amend References with glue files; AC#7 owner steps in notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-16 after the owner approved docs/architecture/motion.md (conflicts 2, 4 and 7; owner decision 4).

Delivered 2026-09-17 (worktree lane).

Host (apps/host/src/motion/motion-check.ts, MotionStepScreen.vue; glue in runtime/host-runtime.ts, session/use-host-session.ts, App.vue): needsMotion games go menu/Play again -> motion-check -> playing. Every seated phone gets { screen: motion-permission, data: { gameId, title, step } }; step counts motion steps so Play again asks again. Done when every currently seated phone answered or after 20 s; unanswered, denied and unsupported players are touch players, marked on the TV chip with the touch icon (aria-label Touch controls) and kept on RunningGame.touchPlayers (a later unsupported during play adds to it, rule 7). ui:action is ignored during the step; a freed seat re-checks; fit is re-checked when the step ends (else back to the menu).

Phone (apps/controller/src/motion/): adapter.ts returns the fake from window.__couchcadeMotion only behind import.meta.env.DEV (checked: the production bundle has no __couchcadeMotion or setPermission). session.ts: Tap to enable motion calls adapter.request() synchronously in the click, renews the wake lock and enters Android fullscreen + portrait lock; granted -> waitForCapability (1 s) -> rest calibration with a progress ring -> motion:status granted; denied/unsupported/no data/no gyroscope -> touch + status; Use touch instead -> denied. Hidden during calibration restarts the step; hidden while motion is on -> Tap to resume overlay (click, not pointerdown, so it is a user gesture on iOS), which re-requests, restarts the adapter and the wake lock and keeps calibration. 2 s without samples while playing and visible -> touch + unsupported (rule 7); 8 s wall-clock give-up if samples stop during calibration. A phone still deciding when the host starts after 20 s switches to touch locally without another message. Fullscreen exits when the motion game ends. Rotate notice hidden during motion games (rule 8). iPhone detection by user agent (iPadOS desktop UA with touch points counts).

Wake lock: CC-1.12's keepScreenAwake now returns { renew, release } (no second lock); renew only requests when the browser let go (sentinel.released) and never after release; PhoneSession.keepAwake() exposes it.

needsGyroscope: the game contract has no per-game gesture list, so the app passes true (accelerometer-only phones play with touch). Follow-up: add a contract field before a tilt/shake-only game (Bumper Sumo) so those phones keep motion (owner decision 5). Follow-up: no contract yet hands the local motion result (status, capability, calibration, adapter) to a game controller; the first motion game story needs it.

E2E fixture: no motion game is registered, so e2e/platform/motion-permission.spec.ts wraps the TV's game registry through the Vite dev module /host/src/runtime/games.ts (same trick quick-draw.spec.ts uses for the stage) so Quick Draw reports needsMotion: true on that TV only; phones load the real Quick Draw controller after the step. The spec covers granted (still trace played into the fake, calibration, game starts) and denied (touch screen, TV touch icon), the iPhone hint on WebKit only, and Tap to resume after a simulated sleep. Full e2e suite green locally on Chromium and WebKit (12/12).

Copy: approved artboard copy, except the game-specific lines (the phone has no game code): body 'Move your phone to play. Hold on tight.' and denied body 'Motion is off on this phone, so you play with touch. The TV knows.' CC-4.8 adds the illustrations.

Verify: pnpm check, test, build, check:deps, check:style, budgets (controller initial JS 52.74 KB / 80 KB) all green.

AC#7 OWNER CHECK (real iPhone, motion-denied hint). No motion game is live yet, so the live site can't reach the motion step until the first motion game ships. Until then, run it locally over HTTPS:
1. On the Mac, in the repo on main after this PR merged: pnpm dev, then in a second terminal npx cloudflared tunnel --url http://localhost:5173 and copy the https://...trycloudflare.com URL.
2. On the laptop open <URL>/host/, enter the host passcode, open a room. Open the browser console (Cmd+Option+J) and paste: const { registry } = await import('/host/src/runtime/games.ts'); const get = registry.get.bind(registry); const m = (g) => (g && g.id === 'quick-draw' ? { ...g, needsMotion: true } : g); registry.games = registry.games.map(m); registry.get = (id) => m(get(id));   (this makes Quick Draw ask for motion on this TV only).
3. On the iPhone, in Safari, open <URL>/?room=CODE and join first (you are the VIP). Join a second player from a laptop browser window at <URL>/?room=CODE.
4. iPhone: Choose a game -> Quick Draw (it shows a Motion tag). After the 3 s countdown check the screen says 'Quick Draw uses motion' with the one line 'Tip: turn on Portrait Orientation Lock'.
5. Tap 'Tap to enable motion'. Safari asks for Motion & Orientation Access: tap Don't Allow (Cancel). Look for: 'Touch controls it is', 'Motion is off on this phone, so you play with touch. The TV knows.', a green Ready button and the hint 'Want motion? Allow it when the next game asks.' The TV chip next to your name shows the pointing-finger touch icon. On the laptop player tap 'Use touch instead'; the game starts.
6. Retry, the question the hint makes a promise about: finish the match (or VIP 'Back to menu' after results) and pick Quick Draw again, then tap 'Tap to enable motion'. Note whether Safari shows the permission prompt again. If not, try: (a) reload the page (it rejoins) and pick Quick Draw again; (b) close the tab, open <URL>/?room=CODE in a new tab, join again, pick Quick Draw; (c) quit Safari from the app switcher and repeat (b).
7. Record in these notes which of step 6, (a), (b), (c) asked again. If step 6 asks again, the hint stays. If only (b) or (c) asks, the proposed one-line copy change is 'Want motion? Close this tab and join again.' If nothing asks, the proposed line is 'Want motion? Turn it on in Safari: aA > Website Settings.' Either change needs a one-line owner OK. To reset between tries: aA in the address bar > Website Settings > Motion & Orientation Access > Ask (or Settings > Apps > Safari > Clear History and Website Data). Stop pnpm dev and the tunnel afterwards.

Review gate round 1 (dipsaus-ai:story-reviewer): pass. Criteria 1-6 met, 7 pending the owner's iPhone, no scope violations. Advisory 1: oxlint consistent-function-scoping on withMotion in the e2e registry wrapper; fixed by inlining it. Advisory 2: the reviewer saw two cold-cache WebKit failures (denied phone briefly 'Connection lost') around the registry wrap, then 4 passes; the wrap now runs right after the room opens, before any phone joins, and the spec passed again on both browsers. CI retries once.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Before a needsMotion game the host now runs the motion-check phase: every seated phone gets the motion-permission view, the host waits for each seated phone's motion:status or 20 s, and the TV motion step marks touch players with a touch icon (kept on RunningGame.touchPlayers). Phones show 'Tap to enable motion' / 'Use touch instead' (plus the Portrait Orientation Lock hint on iPhone), ask inside the click, renew the CC-1.12 wake lock (now { renew, release }), enter fullscreen with a portrait lock on Android, calibrate for a second with a progress ring and report granted; denied, unsupported, no-data and no-gyroscope phones switch to touch and tell the host. 'Tap to resume' covers the controller after the page was hidden, and 2 s without samples during play switches to touch. The E2E fake adapter is picked from window.__couchcadeMotion in dev builds only. E2E covers granted, denied, the TV touch icon, the iPhone hint and resume, using Quick Draw wrapped as needsMotion on the test TV. Criterion 7 (owner's real-iPhone check of the denied hint) awaits the owner; steps are in the notes.
<!-- SECTION:FINAL_SUMMARY:END -->
