---
id: CC-1.13
title: 'Build the game SDK contract, auto-discovery registry and contract test kit'
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 16:28'
labels:
  - story
dependencies:
  - CC-1.1
  - CC-1.7
  - CC-1.8
references:
  - packages/game-sdk/package.json
  - packages/game-sdk/src/contract/
  - packages/game-sdk/src/registry/
  - packages/game-sdk/testing/
  - packages/game-sdk/
parent_task_id: CC-1
priority: high
type: feature
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Games plug in by existing in games/<id>; no shared registry file is ever edited.

Type: deliverable
Branch: CC-1.13/game-sdk-contract
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The CouchcadeGame type matches the contract in docs/architecture/platform.md
- [x] #2 The registry discovers games/*/src/index.ts with import.meta.glob and needs no manual list
- [x] #3 testGameContract(game) checks unique id, player bounds, seed-deterministic init and pure onPlayerInput
- [x] #4 A fixture game in packages/game-sdk/testing/fixtures/ passes testGameContract
- [x] #5 package.json uses wildcard subpath exports so later SDK modules need no package.json edits
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Scaffold packages/game-sdk (package.json with wildcard exports plus ./testing, tsconfig, vitest config, src/index.ts). Deps: protocol, theme (ScenePaletteId type), utils, zod; vue and phaser as type-only devDependencies; vitest as peer + dev.
2. src/contract: CouchcadeGame and friends exactly as platform.md, defineGame, tickMs, clampInputAtMs, checkGameDefinition helper shared by registry and kit.
3. src/registry: createRegistry(eager glob record) and createLazyRegistry(lazy glob record): id matches folder, unique ids, sorted by title; empty record works.
4. testing/: testGameContract(game, options) built from runnable checks (id kebab-case and equal to folder, 1<=min<=max<=8, seed-deterministic JSON-safe init, pure and repeatable onPlayerInput/onTick over a scripted session, valid views, outcome shape, snapshot/restore); sample inputs derived from inputSchema via toJSONSchema; createPlayers; createFakeRoom with manual tick clock; replay(recording).
5. Fixture games in testing/fixtures/<id>/src/index.ts (a realtime reaction game with 100 ms false start and seeded go time; a turn-based guessing game).
6. Tests in packages/game-sdk/test: exports, contract types, registry (fixtures glob + empty glob + bad inputs), kit catches broken games, fixture games pass testGameContract, fake room and replay determinism.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verify: pnpm check && pnpm test

Owner-approved amendment (2026-09-16, session-flow doc conflict 1), relayed by the orchestrator: phones lazy-load a per-game controller-only entry games/<id>/src/controller/index.ts that default-exports defineController({ id, component }) (interface CouchcadeController { id: string; component: () => Promise<Component> }). The controller loader is removed from CouchcadeGame (hostScene stays). The phone registry is createControllerRegistry over that glob (unique ids, lazy load by id, UnknownGameError for an unknown id); the host keeps createRegistry (eager over src/index.ts). createLazyRegistry over src/index.ts is dropped. platform.md is amended by the orchestrator in its own PR. Also from the session-flow design: titles over 16 characters are rejected (menu cards).
Scaffolding implied by the package: packages/game-sdk/{tsconfig.json,vitest.config.ts,src/index.ts,test/}. vue and phaser are type-only devDependencies for Component and Scene in the contract; vitest is an optional peer for the testing kit. pnpm-lock.yaml changes are implied bookkeeping.
Design notes: testGameContract(game, options?) infers the folder from a games/<id>/ test path (fixtures pass { folder }); sample inputs come from inputSchema via zod toJSONSchema, extra ones via { inputs }. Recording gains an optional ticks field so a replay can run past the last input. Game time of tick n is n * 1000 / 60.

Review round 1: block on scope only (package scaffolding tsconfig.json, vitest.config.ts, src/index.ts, test/ and pnpm-lock.yaml). All 5 criteria met. Fix: References amended to add packages/game-sdk/ (existing refs re-passed). pnpm-lock.yaml stays out of References by orchestrator rule (implied bookkeeping, otherwise every package story collides). Advisory taken: the kit's id check now uses isGameId. Advisory left: scene is not checked against registered palettes (theme's registry is Vite-only; the type covers it).
<!-- SECTION:NOTES:END -->
