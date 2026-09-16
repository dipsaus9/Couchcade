---
id: CC-1.16
title: Render game controllers on phones from controller state
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 20:45'
labels:
  - story
dependencies:
  - CC-1.12
  - CC-1.13
references:
  - apps/controller/src/runtime/
  - .dependency-cruiser.cjs
  - tooling/check-deps/
  - apps/controller/src/App.vue
  - apps/controller/src/session/session.ts
  - apps/controller/package.json
  - apps/controller/test/runtime/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phones show the right game controller and send inputs for it.

Type: deliverable
Branch: CC-1.16/controller-game-runtime
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The phone lazy-loads the controller component of the running game by id
- [x] #2 controller:state data is passed to the component
- [x] #3 Inputs go through one send helper
- [x] #4 An unknown game id shows a friendly error in the referee voice
- [x] #5 The phone registry uses createControllerRegistry over games/*/src/controller/index.ts (defineController) and never loads a game's src/index.ts (owner decision 2026-09-16)
- [x] #6 .dependency-cruiser.cjs forbids anything under games/*/src/controller/ from reaching planck, @couchcade/physics or phaser (also through shared/), with a failing fixture test in tooling/check-deps
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. apps/controller/src/runtime/games.ts: createControllerRegistry over import.meta.glob('../../../../games/*/src/controller/index.ts') (lazy). Never globs src/index.ts.
2. runtime/send.ts: createInputSender, the one send helper. Stamps at = toHostTime(performance.timeOrigin + event.timeStamp) (falls back to now for a missing or bogus timestamp), returns the integer at, or null when this phone may not send (audience, offline). No pacing: the <=4/s input stream wraps it in CC-3.6.
3. runtime/controller.ts: useGameController(gameId getter, registry) keeps a shallowRef status (loading | ready component | missing), ignores stale loads; controllerProps(state, send) builds ControllerProps (screen, data, player, send) from the room state. runtime/copy.ts holds the referee-voice copy.
4. runtime/GameController.vue renders the loaded component with those props, or the 'That game isn't on this phone yet. Reload the page.' screen.
5. Glue: App.vue shows GameController when gameId is set (online, TV connected); session.ts exposes send(message) and starts roomClock on every room:welcome, feeds clock:pong, stops it on socket loss/end; package.json adds @couchcade/game-sdk.
6. .dependency-cruiser.cjs: split rule 6 per app (host -> games/*/src/index.ts only, controller -> games/*/src/controller/index.ts only) and add a reachable rule: nothing under games/*/src/controller/ reaches planck, @couchcade/physics or phaser, also through shared/. tooling/check-deps runs reachable rules on a runtime-only graph (type-only imports erased), because game-sdk's contract type-imports phaser. Fixture tests in tooling/check-deps (fails through shared/, passes a type-only path).
7. Tests in apps/controller/test/runtime/ with a test-only fixture controller entry. Verify pnpm check, test, build, check:deps; report phone bundle gzip.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Amended 2026-09-16 after the owner approved the session-flow doc (conflict 1): phones load a controller-only entry. See docs/architecture/platform.md 'How the phone shows a controller' and 'Auto-discovery registry'. If CC-1.13 did not add defineController/createControllerRegistry to @couchcade/game-sdk, add them here (packages/game-sdk/src/registry/).

Implementation (2026-09-16):
- References amended at delivery start to add the glue the criteria need outside apps/controller/src/runtime/: apps/controller/src/App.vue (mount the runtime), apps/controller/src/session/session.ts (send(message) and room clock wiring), apps/controller/package.json (@couchcade/game-sdk) and apps/controller/test/runtime/ (tests and the test-only fixture controller entry). No in-flight story touches them.
- CC-1.12 had not wired the room clock (clock:pong was ignored). session.ts now calls roomClock.connect on every room:welcome, feeds clock:pong to it and disconnects on socket loss, end and dispose.
- Send helper (runtime/send.ts): at = toHostTime(performance.timeOrigin + event.timeStamp), integer; falls back to the call time for a missing, NaN or future timeStamp; returns at, or null (nothing sent) for audience or offline phones. It does not pace: session-flow.md makes the CC-3.6 input stream the <=4/s pacer that wraps it.
- Controller shows while online and the TV is connected; otherwise the existing waiting copy (CC-3.4 refines Connection lost). Unknown id and a failed chunk load both show 'That game isn't on this phone yet.' / 'Reload the page.'
- dependency-cruiser: rule 6 split per app (host -> src/index.ts, controller -> src/controller/index.ts); game-index lazy loads only host/; new reachable rule game-controller-never-reaches-physics (planck, @couchcade/physics, phaser). dependency-cruiser's reachable walk ignores dependency types and game-sdk's contract type-imports phaser, so tooling/check-deps runs reachable rules in a second cruise with tsPreCompilationDeps false. A .vue file's own type-only imports still count there (direct phaser type import in a controller was already an error). check:deps 1.4 s.
- Smoke (headless Chromium, built app on vite preview with a temporary games/smoke-tap removed afterwards; Playwright faked /join and the room socket): 5 clock:ping on connect; controller:state gameId smoke-tap rendered 'SMOKE Sam tap {round:1}' and updated to round 2; a pointerdown sent {t:input,d:{type:tap,at}} with integer at = local + 2000 ms room offset; unknown gameId showed the referee copy; gameId null went back to the lobby. The build put the controller entry and component in their own lazy chunks (0.27 + 0.28 KB gzip) and did not bundle the game's src/index.ts.
- Phone bundle: 45.55 KB gzip initial JS without games (46.15 KB with one game registered), 2.0 KB CSS; budget 80 KB.
- Follow-up: platform.md 'How the phone shows a controller' step 3 still writes toHostTime(event.timeStamp) as shorthand.

Review gate (dipsaus-ai:story-reviewer, round 1): pass. AC 1-6 met, no scope violations. Advisory: (1) GameController.vue has no render test; the criteria are covered through the controller.ts helpers, a fixture registry and the headless-browser smoke. (2) check-deps merges only summary fields from the runtime cruise, which is all the err reporter reads today.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Phones now render the running game's controller. apps/controller/src/runtime/games.ts builds createControllerRegistry from a lazy glob over games/*/src/controller/index.ts and never touches a game's src/index.ts. useGameController loads the entry and its component by gameId, follows game changes, ignores stale loads, and treats an unknown id or a failed chunk as missing. GameController.vue passes ControllerProps (screen, data from controller:state, player, send) or shows the referee copy "That game isn't on this phone yet. Reload the page." Every input goes through createInputSender, which stamps at = toHostTime(performance.timeOrigin + event.timeStamp) as an integer and returns it (null and nothing sent for audience or offline phones). Pacing to 4 inputs/s is left to the CC-3.6 stream. session.ts exposes send(message) and syncs the room clock on every room:welcome, which CC-1.12 had not wired. .dependency-cruiser.cjs splits rule 6 per app and adds game-controller-never-reaches-physics, a reachable rule for planck, @couchcade/physics and phaser. check-deps checks that rule on a runtime-only second cruise, because game-sdk's contract type-imports phaser. Fixture tests cover reaching physics through shared/, reaching planck or phaser through packages, direct planck, and a type-only path that passes. Phone bundle is 45.55 KB gzip (budget 80 KB). There are 14 new controller tests and 5 new or changed check-deps tests, plus a headless Chromium smoke of the built app.
<!-- SECTION:FINAL_SUMMARY:END -->
