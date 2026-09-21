---
id: CC-9.4
title: Add friendly error and offline screens
status: In Progress
assignee: []
created_date: '2026-09-16 12:25'
updated_date: '2026-09-21 04:35'
labels:
  - story
dependencies:
  - CC-4.7
  - CC-4.8
references:
  - apps/host/src/errors/
  - apps/controller/src/errors/
  - apps/controller/src/App.vue
  - apps/controller/src/join/api.ts
  - apps/controller/src/join/copy.ts
  - apps/controller/test/api.test.ts
  - apps/controller/test/state.test.ts
  - apps/controller/test/errors/
  - apps/host/src/App.vue
  - apps/host/src/net/api.ts
  - apps/host/src/session/use-host-session.ts
  - apps/host/test/session/
  - apps/host/test/net/
  - apps/host/test/errors/
  - apps/host/src/screens/lobby/LobbyScreen.vue
parent_task_id: CC-9
type: feature
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Errors explain what happened and what to do next.

Type: deliverable
Branch: CC-9.4/friendly-error-screens
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Room not found, room full, quota reached (free limit hit), connection lost and offline each have a screen on phone and TV in the referee voice
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Research (session-flow.md, platform.md, docs/design/platform-screens.md "Errors" + "Not in this
canvas") shows: phone room-not-found (inline on join form) and room-full (RoomFullScreen.vue) are
already built and approved; phone connection-lost is already built and approved (WaitingScreen,
CC-3.4) and stays untouched. Net-new work: offline (phone+TV) and quota-reached/"free plays used
up" (phone+TV) don't exist anywhere; TV versions of the error screens are explicitly punted to this
story ("Not in this canvas": "The TV versions of the error screens (CC-9.4)"), so this story also
designs the TV connection-lost/offline indicators and the TV quota/room-not-found screens,
following the same panel+badge/Chalk-pill patterns as the phone screens and the existing
`.sound-chip` TV badge precedent.

Quota-reached detection: platform.md rule 12 says the app shows this "when the limit is hit
anyway" and explicitly forbids self-counting requests, so there is no counted threshold to key
off. Every error our own Worker returns is valid JSON (`errorResponse()` in
apps/server/src/api/errors.ts); the one thing our Worker cannot produce is a non-JSON error body,
which only happens when Cloudflare's own edge intercepts the request before our code runs. So: a
non-JSON error response on a request that should get JSON (join/rejoin/create) is treated as
"quota"; a JSON body we recognise is handled as today. This is implemented as a small classifier in
each app's new errors/ folder, reusing the existing "was the body JSON" signal the API helpers
already produce.

New files (in the story's References):
- apps/controller/src/errors/{network,quota,classify,copy}.ts + OfflineScreen.vue, QuotaScreen.vue
- apps/host/src/errors/{network,quota,classify,copy}.ts + OfflineScreen.vue, QuotaScreen.vue,
  ConnectionBadge.vue (Chalk-pill banner, same idea as App.vue's existing .sound-chip, shown after
  the same 1s delay as the phone's lostScreenDelayMs, suppressed on the lobby screen which already
  has its own inline "Reconnecting..." text, and never shown during "playing" since the host stays
  authoritative and games never pause for a dropped relay per session-flow.md)

Wiring glue outside the two errors/ folders (amending References explicitly, same pattern CC-3.10
used): apps/controller/src/{App.vue, join/api.ts, join/copy.ts}, apps/controller/test/{api,state}
.test.ts; apps/host/src/{App.vue, net/api.ts, session/use-host-session.ts}, apps/host/test/session/.
No packages/protocol or apps/server changes: no new close code or API error code is added, so no
server-side scope violation.

TV "room not found" has no natural trigger for a host that creates rooms rather than joining one;
the existing passcode-screen notice for a gone stored room (session-invalid/room-closed) already
covers that meaning and gets tightened copy, not a new screen.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

References amended 2026-09-21 (glue outside the two errors/ folders, exact files, same pattern CC-3.10 used): quota/offline detection needs a one-line hook in join/api.ts (controller) and net/api.ts + use-host-session.ts (host) to route an unrecognised non-JSON error response to the new classifier instead of the generic 'unavailable' bucket; join/copy.ts needs the new JoinFailure union member for type completeness; App.vue on both apps needs the new screens wired into the top-level v-if chain, the same way KickedScreen/RoomFullScreen already are; the two test files get new coverage for the added paths. No packages/protocol or apps/server files: no new close code or API error code is added, so nothing outside the two apps changes.

Adding apps/host/test/net/ to References too: net/api.ts's post() needed a direct test for the new quota-routing branch (no test file existed for it before).

Implementation summary. Verified what already existed vs. new (session-flow.md, platform.md,
docs/design/platform-screens.md): phone room-not-found (inline on the join form) and room-full
(RoomFullScreen.vue) were already built and approved (CC-3.10/CC-4.8); phone connection-lost was
already built and approved (WaitingScreen, CC-3.4) and was left untouched. Built net-new: offline
and quota-reached/"free plays used up" on both phone and TV, plus TV connection-lost, which
docs/design/platform-screens.md explicitly punts to this story ("Not in this canvas": "The TV
versions of the error screens (CC-9.4)").

Quota-reached detection: platform.md rule 12 forbids counting requests ourselves, so there's no
counted threshold. Read the one signal our own Worker can never produce instead: apps/server's
errorResponse() always answers JSON, so a non-JSON error body on a platform-load status (429, 5xx)
means Cloudflare's own edge answered, which is what an exhausted daily budget looks like from
here. Recommend the owner treat this as a best-effort heuristic pending real confirmation against
a deploy that actually hits the limit (no such deploy exists yet, and CC-1.4's probe didn't test
past the limit) -- flagging this rather than presenting it as verified fact.

TV design decisions (not in the approved canvas, so decided here, following the same panel+badge
and Chalk-pill patterns already approved for phone/`.sound-chip`): QuotaScreen and OfflineScreen
are full takeovers on passcode/lobby/calibration/menu/motion/results (nothing useful can happen
there without a network anyway); "playing" gets a small persistent Chalk-pill chip instead of a
takeover, since the host stays authoritative and a running game never pauses for connectivity
(session-flow.md, "On the host") -- the shared TV screen never gets hidden mid-game. TV
"room not found" has no natural trigger for a host that creates rooms rather than joining one; the
existing passcode-screen notice for a gone stored room (session-invalid/room-closed) already covers
that meaning, so no new screen was added for it.

References amended twice during delivery (same pattern CC-3.10 used) to add the wiring glue: see
notes above for the exact file list and reasoning. No packages/protocol or apps/server files
touched: no new close code or API error code was added.

Verify: pnpm check, pnpm check:style, pnpm check:deps, pnpm test and pnpm build all pass repo-wide;
pnpm budgets also passes (Controller initial JS 66.25/80 KB, Host platform JS 424.09/450 KB).

Round-1 reviewer feedback (block, 2 findings): (1) the new test/errors/ dirs on both apps were never added to References -- fixed by adding apps/controller/test/errors/ and apps/host/test/errors/ here, same amendment pattern as before. (2) room-full had no TV counterpart at all -- fixing by adding a small Signal 'Room full' tag to the TV lobby (apps/host/src/screens/lobby/LobbyScreen.vue), next to the existing 'Room locked' tag, shown once seated players + audience reach the 16-phone cap (seatCount * 2, mirrored from apps/server/src/room/audience.ts's maxPhones -- apps/host can't import apps/server across the app tier boundary, so the small constant is duplicated locally the same way errors/quota.ts already is per app).
<!-- SECTION:NOTES:END -->
