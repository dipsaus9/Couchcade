# Platform screens design 🛋️

The design canvas for every screen around the games: joining, the lobby, the game menu, results, the TV lag check, motion setup, errors and the Pip parts. CC-4.7 (host) and CC-4.8 (controller) build their screens from it, and CC-6.1 builds the Pips spec on its Pip sheet.

**Canvas:** [Couchcade Platform Screens](https://claude.ai/artifact/XEmb9sFHz2dVKYMVrKYZEz)

Status: approved by the owner on 2026-09-16 (CC-4.1).

---

## Contents

- [How to read the canvas](#how-to-read-the-canvas)
- [Shared rules](#shared-rules)
- [TV screens](#tv-screens)
- [Phone screens](#phone-screens)
- [Pip parts sheet](#pip-parts-sheet)
- [Owner decisions (2026-09-16)](#owner-decisions-2026-09-16)
- [Proposed additions to the house style](#proposed-additions-to-the-house-style)
- [Not in this canvas](#not-in-this-canvas)

---

## How to read the canvas

- TV artboards are drawn at 1920×1080 and phone artboards at 390×844, then scaled down. The zoom control switches between three sizes. The label above each artboard shows its native size and the current scale.
- All example content is made up: players Sam, Noor, Jesse, Lotte and Daan (players 1–5), the audience member Mees, and room code `BEAN`.
- The QR code is a placeholder pattern, not a real code.
- Game thumbnails are rough pixel sketches to show the card layout. They are not final game art.

## Shared rules

Every screen follows [`HOUSE_STYLE.md`](../HOUSE_STYLE.md). The per-screen tables below only list what each screen uses on top of these:

| Token | Where it applies |
|---|---|
| Ink `#1E2A4A` | All text on light fills, every outline, every hard shadow |
| `outline` | 4px on TV, 3px on phone, on every button, panel, chip, tag, tile and Pip |
| `depth-rest` / `depth-panel` | `0 6px 0 Ink` under every button, panel and chip |
| `radius-pill` | Buttons and player chips |
| `radius-panel` | Panels, cards, input fields |
| `radius-tag` | Tabs, tags, room code tiles |
| `space` | Only 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 |
| `safe-tv` | 96px left and right, 54px top and bottom on every TV screen |
| Player shapes | Wherever a player colour appears, its shape appears too |

Type roles use the house style scale: `callout`, `score`, `title`, `action`, `body` and `small`. TV sizes are 160 / 72 / 56 / 40 / 32 / 24px and phone sizes are – / 40 / 28 / 28 / 18 / 16px.

---

## TV screens

### Join and lobby

| | |
|---|---|
| Colours | Sky background; Chalk panels and player cards; Sunny focus ring on the hovered card; Signal `stop` Kick button; player colours on Pip jerseys and shapes; Ink 20% on Sky outline for empty slots |
| Type | `title` "Players"; `score` "5/8" and room code tiles; `action` buttons; `body` names and "Sam starts the game from their phone"; `small` hints, "Player N", "Scan to join" |
| Shape | Panels with Sky `tab` "Join on your phone"; `radius-panel` cards; `radius-tag` VIP tag and code tiles; `radius-pill` quiet buttons "Check TV lag" and "Lock room" |
| Components | Panel, tab, quiet button, stop button, tag, Interface Pip, QR code, room code |

The join panel sits in the right column, so the room code ends up in the bottom-right corner. Empty slots show the shape the next player will get.

### Game menu

| | |
|---|---|
| Colours | Sky background; Chalk game cards; Sunny focus ring and 8px lift on the selected card; disabled cards use an Ink 20% outline, Ink 45% name and a greyscale thumbnail; scene palettes inside thumbnails |
| Type | `title` "Pick a game"; `action` game names; `small` player counts and input tags; `body` "Sam is choosing on their phone"; `score` room code |
| Shape | `radius-panel` cards; `radius-tag` thumbnail frame and input tags; `radius-pill` player chips |
| Components | Player chip (Pip head, shape, name), game card, tag, room code panel |

With 5 players, games for up to 4 players are disabled but stay visible.

### Results

| | |
|---|---|
| Colours | Sky background; Chalk podium blocks and standings chips; Sunny outline and 8px lift on the winner's row; player colours on confetti shapes, jerseys and shapes |
| Type | `small` tag "Quick Draw · final standings"; `title` "Noor wins!"; `score` places and points; `body` names |
| Shape | `radius-panel` podium blocks (top corners); Sky `tab` "Points"; `radius-pill` standings chips |
| Components | Interface Pip (happy expression for the top 3), player chip with score, panel, tab, room code panel |

### TV lag calibration

| | |
|---|---|
| Colours | Sky background; Turf flash panel (the "tap now" state); Sunny `callout` with Ink stroke and shadow; Turf dots for finished flashes, Sunny ring for the current one; Ink 70% for players still waiting |
| Type | `title` "Check the TV lag"; `body` explanation; `callout` "TAP!"; `score` "4/5" and tap times; `small` "ms" |
| Shape | Panel with Sky `tab` "Last tap"; `radius-pill` chips without depth (not tappable); quiet "Skip" button |
| Components | Callout, player chip with score, quiet button, room code panel |

---

## Phone screens

All phone screens use a 16px side gutter, keep every tap target at 56px or more, and are portrait only.

### Join

Two artboards: joining from the QR code (code filled in) and typing the code.

| | |
|---|---|
| Colours | Sky background; Chalk panel, code tiles and name field; Sunny `primary` "Join" button and Sunny focus ring on the active field or tile; Turf tick for "Filled in from the QR code"; disabled Join uses the Ink 20% outline and Ink 45% label |
| Type | `title` wordmark; `score` code letters; `small` labels and hints; `body` name field; `action` "Join" |
| Shape | Panel with Sky `tab` "Join a game"; `radius-tag` code tiles; `radius-panel` name field (no depth, it isn't a button); `radius-pill` Join button |

### Lobby

Two artboards: a player dressing up their Pip, and the VIP.

| | |
|---|---|
| Colours | Sky background; Chalk panels; Sky for the selected tab and selected hairstyle; Sunny `primary` "Choose a game" (VIP only); quiet "Surprise me" and "Edit my Pip"; player colours on Pips and shapes |
| Type | `body` name in the top chip; `title` "You're the VIP"; `body` player names; `small` hints and the waiting line |
| Shape | `radius-pill` top chip; Sky `tab` "Make your Pip" and "Players 5/8"; `radius-tag` tags and customiser tabs; `radius-panel` option tiles |
| Components | Player chip, tag, panel, tab, Interface Pip (full and head crops), primary and quiet buttons |

### Waiting

Four artboards: VIP is choosing, after a game (player), after a game (VIP) and audience.

| | |
|---|---|
| Colours | Sky background; Chalk panels and TV illustration; Sunny `primary` "Play again" (VIP only); audience chip uses a plain Sky circle because audience members have no player colour |
| Type | `title` "Watch the TV" and "Watching"; `score` placement "4th" / "2nd" and score in the chip; `body` explanations; `small` hints |
| Shape | `radius-pill` chip and buttons; `radius-panel` result panel; `radius-tag` Audience tag |
| Components | Player chip, Interface Pip (happy), primary and quiet buttons |

### Big action

Five artboards, one per state in the house style: waiting, don't tap yet, act now, hold and disabled.

| State | Circle fill | Label |
|---|---|---|
| Waiting | Chalk | Ink "Watch the TV" |
| Don't tap yet | Signal | Chalk with Ink shadow "Wait…" |
| Act now | Turf | Chalk with Ink shadow "Tap!" |
| Hold | Sunny | Ink "Hold to aim" |
| Disabled | Chalk, Ink 20% outline, no depth | Ink 45% "—" |

| | |
|---|---|
| Colours | Chalk background (controller) |
| Type | `score` score in the top chip; `small` game and round tag; `title` status; `body` instruction; `action` circle label; `small` one-line hint |
| Shape | Circle 332px (85% of 390px) in the bottom half with `outline` and `depth-rest`; `radius-tag` tag; `radius-pill` top chip |
| Components | Player chip with score, tag, big action |

### Motion

Four artboards: asking for motion, holding still for calibration, motion denied, and tap to resume.

| | |
|---|---|
| Colours | Sky background for setup screens, Chalk for tap to resume (it is part of the controller); Sunny `primary` "Tap to enable motion" and Sunny big action "Tap to resume"; Turf `go` "Ready" after a denial; Turf progress ring with an Ink 20% track while holding still |
| Type | `title` headline; `body` explanation; `action` buttons; `small` hints |
| Shape | `radius-pill` buttons and chip; illustrations use the same Ink outline |
| Components | Player chip, primary, quiet and go buttons, big action |

### Errors

Eight artboards: room not found (inline on the join form), room is full, room is locked, kicked, connection lost, offline, free plays used up, and rotate your phone.

| | |
|---|---|
| Colours | Sky background; Chalk error panel; Signal badges for stop situations (not found, full, locked, kicked); Chalk badges for waiting or info situations (connection lost, offline, free plays, rotate); Signal `stop` "Leave room"; Sunny `primary` only where retrying is the main action; Turf dots for reconnect progress |
| Type | `title` error name; `body` what happened and what to do next; `score` "8/8" in the full badge and the "02:00" reset time; `action` buttons |
| Shape | `radius-panel` error panel with the badge overlapping its top edge; inline error in a `radius-panel` Chalk box with a Signal circle |
| Components | Panel, badge, primary, quiet and stop buttons |

The "free plays used up" time is shown in local Dutch summer time (00:00 UTC).

---

## Pip parts sheet

| | |
|---|---|
| Colours | 6 skin tones and 6 hair colours from the house style; jerseys in the 8 player colours with the player's shape in Chalk on the chest; eyes and mouth in Ink |
| Type | `title` "Pip parts"; `body` intro and part names; `small` captions; hex codes in Pixelify Sans |
| Shape | Panels with Sky tabs; Pips carry the 4px (TV) or 3px (phone) Ink outline at every size |
| Content | Anatomy, skin tones, 8 hairstyles (short, bun, cap, long, curls, buzz, ponytail, bald), jerseys, hair colours, 4 expressions (neutral, happy, surprised, sad), Interface Pip next to the 16×24 World Pip, and the three sizes used on screens (96, 56 and 44px heads) |

The chest shape on the jersey was approved by the owner on 2026-09-16. It keeps a Pip recognisable without colour, in line with the house style rule that shapes appear wherever player colours do.

---

## Owner decisions (2026-09-16)

The owner approved the canvas and these three decisions:

1. **Jersey shape.** Every Pip jersey shows the player's shape in Chalk on the chest.
2. **Tints.** The `ink-20`, `ink-45` and `ink-70` tints below become theme tokens. CC-4.2 adds them to `@couchcade/theme`. `ink-45` is for disabled text only.
3. **Kick button.** The TV lobby card uses a 64px-high button for Kick.

## Proposed additions to the house style

The canvas needed a few values the house style doesn't define yet. The owner approved all of them on 2026-09-16, and CC-4.2 adds them to `@couchcade/theme`:

| Proposal | Value | Used for |
|---|---|---|
| `ink-20` tint on Chalk | `#CED2DB` | Disabled outlines, progress ring track |
| `ink-20` tint on Sky | `#78B1D2` | Empty lobby slot outline |
| `ink-45` tint on Chalk | `#979EAE` | Disabled labels only (disabled controls are exempt from WCAG AA) |
| `ink-70` tint on Chalk | `#60697F` | Placeholders, waiting values, secondary hints (about 5.3:1 on Chalk, passes AA) |
| Jersey emblem | Player shape in Chalk on the chest | Pips without relying on colour |
| Small TV button | 64px high, `action` label | Kick on a lobby card |

## Not in this canvas

These screens are outside CC-4.1's criteria and follow the same patterns when they are built:

- The host passcode screen on the TV (CC-1.11)
- The VIP's game list on the phone (CC-3.2)
- The TV versions of the error screens (CC-9.4)
