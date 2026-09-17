---
id: CC-6.2
title: Add Pip profile defaults and a seeded random generator
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-17 16:33'
labels:
  - story
dependencies:
  - CC-6.1
  - CC-1.7
  - CC-1.8
references:
  - packages/utils/src/pips/
  - packages/protocol/src/shared/
  - packages/utils/test/pips.test.ts
  - packages/protocol/test/shared.test.ts
  - packages/utils/src/index.ts
  - packages/protocol/package.json
parent_task_id: CC-6
type: feature
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every player gets a valid random Pip.

Type: deliverable
Branch: CC-6.2/pip-generator
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 randomPip(seed) returns a valid profile for the protocol schema
- [x] #2 Unit tests cover every part range
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add packages/utils/src/pips/ (pipParts counts+hairstyle ids, PipProfile type, randomPip(seed) via createRng). 2. Export it from packages/utils/src/index.ts. 3. Add packages/utils/test/pips.test.ts: pipParts shape, randomPip returns a schema-valid profile for every seed, deterministic per seed, uniform enough across all 288 looks (fast-check). 4. Switch packages/protocol/src/shared/index.ts to import pipParts from @couchcade/utils/pips and derive pipPartCounts + pipProfileSchema bounds from it (protocol's PipProfile type unchanged). Add @couchcade/utils to protocol/package.json. 5. Add packages/protocol/test/shared.test.ts: pipProfileSchema rejects out-of-range/extra fields, JSON size bound (34 bytes). 6. Amend CC-6.2 References to add packages/protocol/src/shared/ and the exact test paths, re-passing existing refs; note it for the reviewer. Scope: no other package touches pipPartCounts (e.g. game-sdk/testing/players.ts) -- protocol keeps re-exporting pipPartCounts (now derived) so that stays untouched.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Implemented: packages/utils/src/pips/ (pipParts counts+hairstyle ids, PipProfile type, randomPip(seed) via createRng, uniform over all 288 looks). packages/protocol/src/shared/index.ts now imports pipParts from @couchcade/utils/pips and derives pipPartCounts + pipProfileSchema bounds from it instead of a hand-copied 6/8/6 (protocol's PipProfile type/zod schema unchanged in shape). Added @couchcade/utils + fast-check deps to packages/protocol/package.json. References amended (packages/protocol/src/shared/, packages/utils/test/pips.test.ts, packages/protocol/test/shared.test.ts added; original packages/utils/src/pips/ kept) because the follow-up in pips.md 'Found while writing this spec' item 4 required touching protocol's shared schema too. Scope note for reviewer: packages/game-sdk/testing/players.ts imports pipPartCounts from @couchcade/protocol and was intentionally left untouched -- protocol keeps re-exporting pipPartCounts (now derived from utils) for exactly that backward compatibility, so no other package needed touching. pnpm-lock.yaml and the fast-check catalog dependency are implied bookkeeping, not a declared Reference.

Review round 1 (story-reviewer, sonnet): block on scope grounds only -- both acceptance criteria met, but packages/protocol/package.json and packages/utils/src/index.ts were changed without being declared References (strict prefix match). Advisory: pipPartCounts re-export left in protocol to avoid touching game-sdk/testing/players.ts judged a reasonable, spec-compliant interpretation, no fix required. Fix: amended References to add packages/utils/src/index.ts and packages/protocol/package.json (re-passing all existing refs).
<!-- SECTION:NOTES:END -->
