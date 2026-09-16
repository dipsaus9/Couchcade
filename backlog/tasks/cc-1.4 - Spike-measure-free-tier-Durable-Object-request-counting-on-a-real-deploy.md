---
id: CC-1.4
title: 'Spike: measure free-tier Durable Object request counting on a real deploy'
status: To Do
assignee: []
created_date: '2026-09-16 12:24'
labels:
  - story
  - needs-info
dependencies: []
references:
  - spikes/free-tier-probe/
parent_task_id: CC-1
priority: high
type: spike
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured facts for the request budget: whether 20 incoming WebSocket messages count as one request on the Free plan, and whether the Rate Limiting binding works on Free.
Justification: Cloudflare docs do not state either; only a real deploy can measure it.

Type: spike
Branch: CC-1.4/free-tier-probe
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A probe Worker in spikes/free-tier-probe/ sends a known number of incoming messages (at least 1,000) and the Durable Object request count from the dashboard is recorded
- [ ] #2 Whether the Rate Limiting binding enforces limits on the Free plan is recorded
- [ ] #3 A recommended maximum input rate per phone is recorded for CC-3.6
- [ ] #4 The probe Worker is deleted from the Cloudflare account afterwards
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Needs owner action: Cloudflare account created and `npx wrangler login` done on this machine. Remove needs-info once confirmed.
<!-- SECTION:NOTES:END -->
