---
id: CC-2.8
title: 'Turn on GitHub repo security: CodeQL, Dependabot alerts and pnpm audit in CI'
status: Done
assignee: []
created_date: '2026-09-16 15:58'
updated_date: '2026-09-20 12:30'
labels:
  - story
dependencies:
  - CC-1.6
  - CC-2.1
references:
  - .github/workflows/ci.yml
parent_task_id: CC-2
type: chore
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The public repo gets free GitHub security scanning, so vulnerable dependencies and risky code are flagged without anyone checking by hand.

Type: deliverable
Branch: CC-2.8/repo-security-setup
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CodeQL default setup is enabled for JavaScript/TypeScript and GitHub Actions and has completed one scan on main
- [x] #2 Dependabot alerts and Dependabot security updates are enabled (Renovate stays the version-update bot)
- [x] #3 The CI workflow runs pnpm audit --prod --audit-level high as its own job, and a known-vulnerable fixture proves the job fails
- [x] #4 docs/architecture/security.md is not changed; the story notes record which settings were turned on and how to check them
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1) Repo settings via gh api (admin, no code): PATCH code-scanning/default-setup to enable CodeQL default setup; PUT vulnerability-alerts to enable Dependabot alerts; PUT automated-security-fixes to enable Dependabot security updates (leave dependabot.yml version updates untouched, Renovate owns those). Verify each with a read-back GET/PUT and confirm a completed scan exists on main via code-scanning/analyses. 2) Code: add a standalone 'audit' job to .github/workflows/ci.yml running 'pnpm audit --prod --audit-level high', mirroring the existing job's checkout/pnpm/node steps. Prove it fails on a real high-severity vuln using an isolated scratchpad fixture (never committed to the repo) rather than adding a vulnerable dependency to the monorepo. 3) Do not touch docs/architecture/security.md (AC#4); record settings + verification commands in this task's notes instead.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up from the approved security doc (CC-2.1). Private vulnerability reporting and branch protection on main are already on. Repo settings are changed with gh api; if Claude Code's permission check refuses a settings change, return exact dashboard steps for the owner instead. All features are free for public repos (EUR 0).

## Implementation notes (repo settings changed via gh api, verified with read-back calls)

### AC#1 — CodeQL default setup
- Enabled: `gh api -X PATCH repos/dipsaus9/Couchcade/code-scanning/default-setup -f state=configured -f query_suite=default -f 'languages[]=javascript-typescript' -f 'languages[]=actions'` -> 202, returned `run_id 35510435450`.
- Read-back: `gh api repos/dipsaus9/Couchcade/code-scanning/default-setup` now returns `state: configured`, `languages: [actions, javascript, javascript-typescript, typescript]` (GitHub auto-detects all present languages once configured), `schedule: weekly`, `updated_at: 2026-09-20T12:24:27Z`.
- Confirmed a scan actually ran on main (not just the PUT succeeding): `gh api repos/dipsaus9/Couchcade/actions/runs/35510435450` -> `status: completed`, `conclusion: success` ("CodeQL Setup" workflow). `gh api "repos/dipsaus9/Couchcade/code-scanning/analyses?ref=refs/heads/main"` returns two completed analyses on commit `bca4451` dated 2026-09-20: `language:javascript-typescript` (2 results, 87 rules) and `language:actions` (0 results, 17 rules).
- To re-verify later: `gh api repos/dipsaus9/Couchcade/code-scanning/default-setup` and `gh api "repos/dipsaus9/Couchcade/code-scanning/analyses?ref=refs/heads/main"`, or Settings -> Code security -> Code scanning in the GitHub UI.

### AC#2 — Dependabot alerts + security updates (not version updates)
- Alerts: `gh api -X PUT repos/dipsaus9/Couchcade/vulnerability-alerts` -> 204. Read-back: `gh api repos/dipsaus9/Couchcade/vulnerability-alerts` -> 204 (enabled; a 404 would mean disabled).
- Security updates: `gh api -X PUT repos/dipsaus9/Couchcade/automated-security-fixes` -> 204. Read-back: `gh api repos/dipsaus9/Couchcade/automated-security-fixes` -> `{"enabled":true,"paused":false}`.
- Dependabot version updates were deliberately left off: no `.github/dependabot.yml` was added. Renovate (`renovate.json`, already configured per CC-1.6/TECH_STACK) keeps owning routine version bumps; enabling Dependabot version updates too would run two update bots against the same lockfile.
- To re-verify later: same two `gh api GET` calls above, or Settings -> Code security -> Dependabot in the GitHub UI.

### AC#3 — pnpm audit CI job + proof it catches a real vulnerability
- Added a standalone `audit` job to `.github/workflows/ci.yml` (not part of the existing script matrix, since `pnpm audit` isn't a root package.json script) running `pnpm audit --prod --audit-level high` with the same checkout/pnpm/node steps as the other jobs.
- Proof the job actually catches a real vulnerability, without adding a vulnerable dependency to the tracked monorepo: built an isolated fixture outside the git working tree (in the session scratchpad, never committed) with `lodash@4.17.15` as its only dependency, ran `pnpm install` then the exact CI command `pnpm audit --prod --audit-level high`. Result: 6 advisories (3 high, 3 moderate) including GHSA-35jh-r3h4-6jhm (Command Injection, high) and GHSA-p6mc-m468-83gw (Prototype Pollution, high); command exited 1. The fixture was deleted immediately after (`rm -rf`), so nothing vulnerable is part of the repo history.
- Confirmed no false positive: ran the same `pnpm audit --prod --audit-level high` against the real repo's lockfile -> "No known vulnerabilities found", exit 0.
- To re-verify later (manual, since a permanent vulnerable fixture isn't kept in the repo): repeat the scratchpad-fixture steps above, or temporarily downgrade a real dependency in a throwaway branch, run `pnpm audit --prod --audit-level high`, then discard the branch.
- Not changed: branch protection required checks (still `check`, `check:style`, `check:deps`, `test`, `build`). Making `audit` a required check is a follow-up repo-settings change the story didn't ask for; flagging it as an option for the owner rather than doing it silently.

### AC#4 — docs/architecture/security.md untouched
- Confirmed no diff to `docs/architecture/security.md`; this section is the record the AC asks for instead.

Reviewer verdict (round 1): pass. All 4 acceptance criteria met (AC#1/#2 judged from task-file evidence as out-of-band GitHub settings not visible in the diff; AC#3/#4 judged directly from the ci.yml diff). No scope violations, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Enabled GitHub repo security via gh api: CodeQL default setup for javascript-typescript + actions (confirmed by a completed scan on main, two analyses on commit bca4451), Dependabot alerts, and Dependabot security updates (Renovate keeps version updates — no dependabot.yml added). Added a standalone 'audit' job to .github/workflows/ci.yml running 'pnpm audit --prod --audit-level high', proved it fails on a real high-severity vulnerability using an isolated, never-committed scratchpad fixture, and confirmed the real repo passes clean. docs/architecture/security.md was left untouched; all settings and re-verification commands are recorded in this task's Implementation Notes. Reviewer verdict: pass, round 1, no scope violations.
<!-- SECTION:FINAL_SUMMARY:END -->
