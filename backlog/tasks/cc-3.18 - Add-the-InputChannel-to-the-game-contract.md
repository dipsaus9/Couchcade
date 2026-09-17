---
id: CC-3.18
title: Add the InputChannel to the game contract
status: In Progress
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 21:52'
labels:
  - story
dependencies:
  - CC-3.16
  - CC-3.17
references:
  - packages/game-sdk/src/contract/index.ts
  - packages/game-sdk/src/input/channel.ts
  - packages/game-sdk/src/input/stream.ts
  - packages/game-sdk/src/input/index.ts
  - packages/game-sdk/test/input/channel.test.ts
  - packages/game-sdk/test/contract.test.ts
parent_task_id: CC-3
priority: high
type: feature
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Game controllers get one input channel that sends over the direct link or the relay path without games knowing which, and host scenes can read each player's path and playback delay (docs/architecture/realtime-link.md, Game SDK API sketch).

Type: deliverable
Branch: CC-3.18/input-channel-contract
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ControllerProps has input: InputChannel with stream, fire, last, clear and path, and CouchcadeController accepts streams with hz 30 or 60
- [x] #2 On the relay path stream packs up to 7 earlier samples in more and a fake-timer test proves at most 4 messages per second, 250 ms apart
- [x] #3 On the direct path stream sends each type at most at its hz and skips a value equal to the last one sent (fake link test)
- [x] #4 fire sends at once on the direct path, and on a switch to relay resends events from the last 500 ms (at most 4) with the same event id
- [x] #5 HostSceneData has link(playerId) returning path, rttMs and playbackDelayMs
- [x] #6 testGameContract and the existing contract and input stream tests pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add createInputChannel (packages/game-sdk/src/input/channel.ts) implementing InputChannel from
docs/architecture/realtime-link.md's API sketch: stream/fire/last/clear/path, DOM-free, driven by
injected transport hooks (path/onPathChange + 4 send hooks) so it's testable with createFakeLink
and plain mocks, mirroring createInputStream's pattern for the relay-only path today.

- contract/index.ts: add InputChannelPath, InputChannel<TInput> (per doc sketch), add
  streams?/CouchcadeController, input?/ControllerProps, link?()/HostSceneData. `input` and `link`
  are optional (not required, deviating slightly from the doc's literal sketch) because the real
  wiring lands in later stories (CC-3.19 controller runtime, CC-3.20 host runtime) that aren't
  built yet; existing literal-object construction sites (apps/controller/src/runtime/controller.ts,
  games/target-range/test/host/stage.ts, packages/stage/test/boot.ts, tooling/create-game template)
  are all outside this story's References and must not be touched. This mirrors the existing
  roomCode?/joinUrl? "tests and tools may leave it out" precedent already in HostSceneData.
- input/channel.ts: createInputChannel. Direct stream: per-type hz gate + last-sent-value dedupe,
  no queueing (doc: "latest value wins"). Relay stream: buffers up to 8 samples/type (7 "more" +
  newest), shared 250ms/4-per-sec pacer with fire (events first), mirroring createInputStream's
  pump loop but generalised for routing + more-packing. fire: direct sends at once; every fired
  event recorded for 500ms; a direct->relay path transition resends the most recent 4 of those
  with their original event id, paced through the same relay queue.
- input/stream.ts: export the existing private jsonEqual helper for reuse by channel.ts's direct
  dedupe (both enforce session-flow.md rule 3: a repeated value isn't resent).
- input/index.ts: export channel.ts.
- test/input/channel.test.ts: fake-timer + createFakeLink tests for AC 2-4 plus last/clear/path.
- test/contract.test.ts: the CouchcadeController exhaustive-keys type test needed "streams" added.

Verified: pnpm check, pnpm check:deps, pnpm check:style, pnpm test, pnpm build all green repo-wide
(not just game-sdk), confirming the optional fields don't break any existing construction site.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.

Design decision (flagged for the orchestrator, not blocking): ControllerProps.input and
HostSceneData.link are typed optional (input?/link?) rather than required as the doc's literal
sketch shows. Reason: the real wiring lands in CC-3.19 (controller runtime) and CC-3.20 (host
runtime), neither built yet, and several existing files outside this story's References construct
literal ControllerProps/HostSceneData objects without these fields (apps/controller/src/runtime/
controller.ts; games/target-range/test/host/stage.ts; packages/stage/test/boot.ts; tooling/
create-game template). Making the fields required would break pnpm check for those out-of-scope
files. Optional mirrors the existing roomCode?/joinUrl? "tests and tools may leave it out, the
[runtime] always passes it" pattern already in HostSceneData. CC-3.19/CC-3.20 should populate them
for real; nothing here prevents that.

Relay message shape: `more`'s dtMs is computed from local (performance-clock) timestamps, not room
time, since only relative offsets matter and clock offset is effectively constant over the sub-
second windows a relay message spans -- this avoids requiring createInputChannel to know about
room-time translation (a browser-wiring/app-tier concern per the doc's "Where the code lives").

createInputChannel's InputChannelOptions (path/onPathChange + 4 send hooks: sendDirectStream,
sendDirectEvent, sendRelayStream, sendRelayEvent) are an original design not spelled out in the
doc's sketch (which only fixes the public InputChannel shape); CC-3.19's browser wiring is the
next story that will supply real hooks (e.g. adapting the fake-link-shaped cc-stream/cc-events
channels) matching these signatures.

Reviewer round 1 (sonnet): verdict block. All 6 acceptance criteria judged met (AC1/AC5's
input?/link? optionality noted as advisory only, not blocking, per the disclosed rationale). The
sole blocking finding: packages/game-sdk/test/contract.test.ts was touched (one line, the
CouchcadeController exhaustive-keys expectTypeOf assertion) but wasn't in the declared References.
Reviewer's own recommended fix: add it to References (lower-friction than splitting into a
separate story for a one-line, mechanically-forced consistency update). Done: References amended
via `backlog task edit CC-3.18 --ref ...` to include packages/game-sdk/test/contract.test.ts.
Re-review requested.
<!-- SECTION:NOTES:END -->
