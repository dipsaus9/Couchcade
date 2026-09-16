---
id: CC-1.4
title: 'Spike: measure free-tier Durable Object request counting on a real deploy'
status: In Progress
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 14:57'
labels:
  - story
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

Owner confirmed Cloudflare login on 2026-09-16: `npx wrangler login` done, `wrangler whoami` shows account 35ee53c3b77e566a5e8e2242f752f668. needs-info label removed.

2026-09-16 first deploy attempt (wrangler 4.131.2) blocked: Cloudflare API error 10034 'You need to verify your email address to use Workers'. Nothing was uploaded (account script list is empty). Side effect: wrangler deploy non-interactively registered the account's workers.dev subdomain as 'couchcade-spike-free-tier-probe' (derived from the package name), so the Worker URL would be couchcade-free-tier-probe.couchcade-spike-free-tier-probe.workers.dev and the later production Worker would get couchcade.couchcade-spike-free-tier-probe.workers.dev unless the subdomain is changed. Probe code is committed and passes wrangler deploy --dry-run. GraphQL Analytics API works with the wrangler OAuth token (durableObjectsInvocationsAdaptiveGroups, durableObjectsPeriodicGroups queried successfully). Cloudflare pricing docs state the 20:1 ratio is billing-only and 'does not affect Durable Object metrics and analytics, which reflect actual usage', so analytics will show raw message counts.

2026-09-16 resume: owner chose workers.dev subdomain 'dipsaus9' and reports the email is verified. The agent's attempts to change the subdomain through the API and to re-run wrangler deploy were both refused by the Claude Code permission classifier (category: DNS / Domain / Cert Changes). Neither action ran. Needs the owner to change the subdomain in the dashboard and to allow the deploy (or run it).
<!-- SECTION:NOTES:END -->
