# Playtest: Target Range on the direct link

**Date:** 2026-09-19
**Players:** owner, solo
**Devices:** iPhone (phone, `?link=1&dev=1`), laptop (TV, `?link=1`)

## Direct link itself

- The phone's dev readout showed `direct` throughout, not `relay`.
- Feedback: "less laggy, the aim feels more responsive." Confirms the earlier spike numbers (6–9 ms round trip) translate into a real, felt improvement over the relay path.
- "Sometimes it bugs a bit out" — reported but not reproduced with enough detail to file precisely. Owner asked to treat as a later investigation, not a blocker.

## Gameplay issues found (apply with or without the link — not link-specific)

1. **The shot doesn't land where the crosshair was shown.** Root cause found in code: `games/target-range/src/controller/aim.ts`'s `shoot()` sends `channel.last("aim")`, the phone's own most recent live aim sample. But the TV's displayed crosshair (`games/target-range/src/host/aim-playback.ts`) is a *delayed and interpolated* rendering of past samples (`playbackDelayMs` behind), to smooth the 4/s relay path. The code comment even says the shot should carry "the aim the TV was shown" — but the implementation uses the phone's live value instead, not the delayed value the player actually saw at release. → CC-11.10.
2. **The target board's on-screen distance changes across rounds while the physics distance doesn't**, so later rounds visually mislead where a given aim actually lands. → CC-11.11.
3. **No vibration on iPhone.** Confirmed expected: iOS Safari has no Vibration API at all; `@couchcade/ui/haptics` already no-ops there by design (CC-7.5). Not a bug.
4. **No per-shot hit sound, only heard near a bullseye.** Confirmed in code: `games/target-range/src/host/cues.ts` defines draw/shoot/land/tick/reveal cues but nothing subscribes to them yet ("the sounds arrive with CC-11.5 and subscribe here; until then nothing listens" — still true). What's heard near a bullseye is the general "BULLSEYE!" callout pop, not a real hit sound. → matches an already-known pending follow-up (wire Quick Draw's and Target Range's game sounds); confirmed real by this playtest. → CC-7.8.
5. **A miscalibrated phone makes the game unplayable with no way to recalibrate.** No recalibration UI exists in `apps/controller/src/motion/`. → CC-5.11.
6. **Design suggestion: aim should track relative to where a draw started, not an absolute calibrated origin**, so a bad calibration doesn't ruin the whole game. A real architecture change to the shared motion/calibration model (`docs/architecture/motion.md`), not a quick fix — owner sign-off needed on the direction before building. → CC-5.12 (owner-gate design doc).
7. **Reload falls back to touch controls even when motion was already granted.** Not yet root-caused; `apps/controller/src/motion/` re-runs the full "tap to enable motion" step on every reload with no memory of a prior grant. → CC-5.13.
8. **No way to end a game early.** No host or VIP control exists to stop a running game before it finishes. → CC-3.27.
9. **(Strike Night, same session) A real full-arm bowling swing doesn't release the ball in motion mode — a swipe is needed instead.** Strike Night's swing detector was only ever tuned against synthetic traces, never a real phone; this is the first real-device signal the thresholds (or the permission state after reload — see item 7) are wrong. → CC-12.8.
10. The "went to sleep, tap to resume" notification is the intended CC-5.10 recovery screen, working as designed — noted, no change needed.

## Decision

Every item above is either a filed follow-up story or explicitly marked no-change (haptics on iPhone, the sleep/resume screen). None of the *link-specific* behaviour (connect reliability, latency, the fallback) showed a problem — the link itself performed exactly as the spike predicted.

**Still open:** whether to switch `VITE_REALTIME_LINK` on by default now (issues 1–8 above are pre-existing Target Range gameplay gaps, not caused by the link) or hold until the shot-landing bug (item 1) is fixed first, since that one directly affects how the game feels regardless of the link. Left for explicit owner approval before flipping the default.
