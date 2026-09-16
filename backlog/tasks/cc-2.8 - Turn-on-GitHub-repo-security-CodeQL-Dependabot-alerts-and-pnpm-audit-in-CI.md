---
id: CC-2.8
title: 'Turn on GitHub repo security: CodeQL, Dependabot alerts and pnpm audit in CI'
status: To Do
assignee: []
created_date: '2026-09-16 15:58'
updated_date: '2026-09-16 15:58'
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
- [ ] #1 CodeQL default setup is enabled for JavaScript/TypeScript and GitHub Actions and has completed one scan on main
- [ ] #2 Dependabot alerts and Dependabot security updates are enabled (Renovate stays the version-update bot)
- [ ] #3 The CI workflow runs pnpm audit --prod --audit-level high as its own job, and a known-vulnerable fixture proves the job fails
- [ ] #4 docs/architecture/security.md is not changed; the story notes record which settings were turned on and how to check them
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Follow-up from the approved security doc (CC-2.1). Private vulnerability reporting and branch protection on main are already on. Repo settings are changed with gh api; if Claude Code's permission check refuses a settings change, return exact dashboard steps for the owner instead. All features are free for public repos (EUR 0).
<!-- SECTION:NOTES:END -->
