---
id: CC-3.18
title: Add the InputChannel to the game contract
status: To Do
assignee: []
created_date: '2026-09-17 17:50'
updated_date: '2026-09-17 17:50'
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
- [ ] #1 ControllerProps has input: InputChannel with stream, fire, last, clear and path, and CouchcadeController accepts streams with hz 30 or 60
- [ ] #2 On the relay path stream packs up to 7 earlier samples in more and a fake-timer test proves at most 4 messages per second, 250 ms apart
- [ ] #3 On the direct path stream sends each type at most at its hz and skips a value equal to the last one sent (fake link test)
- [ ] #4 fire sends at once on the direct path, and on a switch to relay resends events from the last 500 ms (at most 4) with the same event id
- [ ] #5 HostSceneData has link(playerId) returning path, rttMs and playbackDelayMs
- [ ] #6 testGameContract and the existing contract and input stream tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check, pnpm test, pnpm build.
<!-- SECTION:NOTES:END -->
