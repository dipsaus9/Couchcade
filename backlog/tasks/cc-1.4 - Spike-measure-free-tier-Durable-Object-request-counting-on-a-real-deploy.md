---
id: CC-1.4
title: 'Spike: measure free-tier Durable Object request counting on a real deploy'
status: Done
assignee: []
created_date: '2026-09-16 12:24'
updated_date: '2026-09-16 15:32'
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
- [x] #1 A probe Worker in spikes/free-tier-probe/ sends a known number of incoming messages (at least 1,000) and the Durable Object request count from the dashboard is recorded
- [x] #2 Whether the Rate Limiting binding enforces limits on the Free plan is recorded
- [x] #3 A recommended maximum input rate per phone is recorded for CC-3.6
- [x] #4 The probe Worker is deleted from the Cloudflare account afterwards
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Needs owner action: Cloudflare account created and `npx wrangler login` done on this machine. Remove needs-info once confirmed.

Owner confirmed Cloudflare login on 2026-09-16: `npx wrangler login` done, `wrangler whoami` shows account 35ee53c3b77e566a5e8e2242f752f668. needs-info label removed.

2026-09-16 first deploy attempt (wrangler 4.131.2) blocked: Cloudflare API error 10034 'You need to verify your email address to use Workers'. Nothing was uploaded (account script list is empty). Side effect: wrangler deploy non-interactively registered the account's workers.dev subdomain as 'couchcade-spike-free-tier-probe' (derived from the package name), so the Worker URL would be couchcade-free-tier-probe.couchcade-spike-free-tier-probe.workers.dev and the later production Worker would get couchcade.couchcade-spike-free-tier-probe.workers.dev unless the subdomain is changed. Probe code is committed and passes wrangler deploy --dry-run. GraphQL Analytics API works with the wrangler OAuth token (durableObjectsInvocationsAdaptiveGroups, durableObjectsPeriodicGroups queried successfully). Cloudflare pricing docs state the 20:1 ratio is billing-only and 'does not affect Durable Object metrics and analytics, which reflect actual usage', so analytics will show raw message counts.

2026-09-16 resume: owner chose workers.dev subdomain 'dipsaus9' and reports the email is verified. The agent's attempts to change the subdomain through the API and to re-run wrangler deploy were both refused by the Claude Code permission classifier (category: DNS / Domain / Cert Changes). Neither action ran. Needs the owner to change the subdomain in the dashboard and to allow the deploy (or run it).

2026-09-16 probe run. The owner changed the account subdomain to dipsaus9 and deployed https://couchcade-free-tier-probe.dipsaus9.workers.dev (version 3771c0d3-fd69-4fbc-906b-bc30145625ab). The first attempt at 15:01Z failed with a TLS handshake error until the new subdomain's certificate was live at 15:01:57Z.

Messages sent (scripts/send-messages.mjs, one socket per room, each message sent after the previous ack):
- room probe-1000: 1,000 sent, 1,000 acked, 15:02:04Z to 15:02:27Z
- room probe-20: 20 sent, 20 acked, 15:02:27Z to 15:02:28Z

GraphQL Analytics (durableObjectsInvocationsAdaptiveGroups, filtered by namespace 6e9c850d614746569d37182504857640), complete at 15:24Z (about 22 minutes of lag):
- probe-1000: http 1 + hibernation 1,001 = 1,002 requests
- probe-20: http 1 + hibernation 21 = 22 requests
- total 1,024 Durable Object requests, 0 errors

Reading: each socket costs 1 request for the upgrade, 1 per incoming message, and 1 for the webSocketClose event (1,001 = 1,000 messages + close; 21 = 20 + close). durableObjectsPeriodicGroups showed outboundWebsocketMsgCount 1,001 and 21, but inboundWebsocketMsgCount 0 for hibernated sockets, so that counter is not usable. Cloudflare's pricing docs say the 20:1 ratio is billing-only and analytics 'reflect actual usage', so these raw counts cannot show whether the Free daily limit applies 20:1. Only a quota or billing view can.

Gotcha: filtering by scriptName returned nothing. For the first minutes, Worker analytics showed scriptName '__unknown__' for this new Worker. Filter by namespaceId instead (scripts/analytics.mjs now does).

Rate Limiting binding on Free (simple limit 10 per 60 s, key 'probe', scripts/rate-limit.mjs):
- The binding deploys fine on the Free plan.
- 15:02:28Z, 30 sequential hits on one keep-alive connection: 22 x 200, then 8 x 429.
- 15:02:50Z, 30 hits: again 22 allowed, 8 limited.
- 15:04:17Z to 15:04:21Z, 4 more rounds of 30: each 22 allowed, 8 limited.
- 15:04:40Z, 60 hits in one process: all 60 limited.
- 15:04:43Z, 30 curl calls, each on a new connection: 19 allowed, 11 limited, interleaved.

Conclusion: the binding works and does enforce on Free, but loosely. Counters are local to the Cloudflare machine and eventually consistent. Across bursts and connections, well over 10 per 60 s got through (roughly 100 of 181 hits in 2 minutes). Use it for abuse control only, never as an exact quota, as the docs warn. About 270 Worker requests were used for this test; they do not count against the Durable Object limit.

Recommended CC-3.6 input rate: 4 messages per second per phone during real-time play (minimum 250 ms between sends; release/fire flushes still count), sending only changed input.

Arithmetic, on the safe assumption that every incoming message is a full Durable Object request (measured: 1 request per message, plus 1 per connect and 1 per close):
- Daily budget: 100,000 Durable Object requests.
- Keep 20,000 in reserve for connects, closes, reconnects after deploys, host-to-relay messages and turn-based messages. That leaves 80,000 for phone input.
- One 2-hour game night, 8 phones, 30% real-time (the TECH_STACK typical case): 8 x 7,200 s x 0.3 = 17,280 real-time phone-seconds.
- 80,000 / 17,280 = 4.6 messages per second, rounded down to 4. Check: 17,280 x 4 = 69,120, under 80,000.
- Worst case (8 phones fully real-time at 4 per second = 32 requests per second): 80,000 / 32 = 2,500 s, about 42 minutes of pure real-time play per day.
- If the dashboard proves 20:1 on Free, TECH_STACK's 15 per second stays valid (worst case 972,000 messages / 20 = 48,600 requests). Make the rate a single config constant so it can be raised.

Implication outside CC-3.6: host-to-relay messages also count 1:1. A per-tick controller:state from the host at 10 per second would be 72,000 per 2 hours by itself, so the host send rate needs its own cap (follow-up).

Correction to the rate-limit note: the exact total is 151 allowed out of 271 hits between 15:02:28Z and 15:04:45Z (22 + 22 + 4 x 22 + 0 + 19), against a configured limit of 10 per 60 s.

2026-09-16 dashboard check: the owner opened Billing > Billable usage and it showed 'No data.' (the page refreshes daily and only lists billable activity). So whether the Free daily limit counts incoming WebSocket messages 20:1 is still unknown. Decision (orchestrator sign-off, delegated by the owner): assume 1:1, so every incoming message is a full Durable Object request.
- CC-3.6: cap phone input at 4 messages per second per phone.
- Host-to-relay messages also count 1:1, so host broadcasts such as controller:state need their own send cap.
- Follow-up: on 2026-09-17 or 2026-09-18, re-check Billing > Billable usage for 16 Sep. About 1,024 Durable Object requests means 1:1; about 50-60 means 20:1, and then the phone cap can go back up to 15 per second.

AC4 check 2026-09-16: the owner ran pnpm run destroy ('Successfully deleted couchcade-free-tier-probe'). From 15:31:26Z, https://couchcade-free-tier-probe.dipsaus9.workers.dev returns Cloudflare 'error code: 1042' (no Worker behind the route) on 3 tries 20 s apart; before that it returned the Worker's own 404. The account API lists 0 Worker scripts and 0 Durable Object namespaces.

Review gate (dipsaus-ai:story-reviewer, round 1): pass. All criteria met, no scope violations. Advisories: (1) the 20:1 question remains open, so the billing re-check should become a tracked task; (2) the host broadcast send cap should be captured as a task or criterion; (3) account_id is committed in wrangler.jsonc (not a secret, left as is).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The probe Worker (spikes/free-tier-probe: a SQLite-backed Durable Object using the WebSocket Hibernation API, plus a Rate Limiting binding) was deployed to the Free plan and received 1,000 + 20 WebSocket messages. GraphQL analytics counted 1,024 Durable Object requests: 1 per connect, 1 per incoming message and 1 per close. Analytics show raw usage, and Billing > Billable usage showed 'No data', so whether the Free limit counts messages 20:1 is still unknown. Decision (signed off by the orchestrator for the owner): assume 1:1. CC-3.6 caps phone input at 4 messages per second per phone (80,000 of the 100,000 daily requests / 17,280 real-time phone-seconds in a 2-hour night with 8 phones = 4.6, rounded down). Host-to-relay messages also count 1:1, so host broadcasts need their own cap. The Rate Limiting binding works on Free but only loosely (151 of 271 hits allowed against 10 per 60 s): use it for abuse control only. Follow-up: re-check Billable usage for 16 Sep on 17 or 18 Sep (about 1,024 means 1:1, about 50-60 means 20:1, which would allow 15 per second). The probe Worker was deleted and verified gone (error 1042; the account has 0 scripts and 0 namespaces).
<!-- SECTION:FINAL_SUMMARY:END -->
