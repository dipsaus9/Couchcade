# Couchcade house style: Clubhouse 🎨

**A Sunday-morning sports club meets the arcade cabinet.**

Every game, menu and phone screen on Couchcade uses this one style: a chunky, toy-like interface on top, and crisp pixel-art worlds underneath. This document is the reference for designers and developers. If a decision isn't covered here, check it against the four rules below.

---

## Contents

- [Four rules](#four-rules)
- [Colour](#colour)
- [Type](#type)
- [Shape and depth](#shape-and-depth)
- [Components](#components)
- [Pips: player avatars](#pips-player-avatars)
- [Game worlds](#game-worlds)
- [Screen layouts](#screen-layouts)
- [Motion, sound and haptics](#motion-sound-and-haptics)
- [Voice](#voice)
- [Accessibility](#accessibility)
- [Tokens in code](#tokens-in-code)
- [How the style is enforced](#how-the-style-is-enforced)
- [Review checklist](#review-checklist)

---

## Four rules

### 1. Solid like a toy
Everything has a thick Ink outline and a hard shadow underneath, so it looks like moulded plastic you could pick up. Buttons physically sink when pressed. No soft blurry shadows, no gradients, no glass.

### 2. Readable from the couch
Design the TV for someone three metres away with slightly bad eyesight. Nothing on the TV is smaller than 24px at 1080p. If you have to lean in, it's too small.

### 3. One big action on the phone
During play, the phone shows one primary action in the thumb zone. Players look at the TV, not their phone, so the controller must work without looking at it.

### 4. Pixel worlds, chunky chrome
Game worlds are pixel art. Everything on top of them (scores, menus, callouts, the controller) is the chunky rounded interface. Never mix the two inside a single element.

---

## Colour

### Core palette

Six colours carry the entire interface.

| Name | Hex | Use |
|---|---|---|
| **Ink** | `#1E2A4A` | Outlines, text, shadows |
| **Chalk** | `#FAFCFF` | Panels, controller background |
| **Sky** | `#8FD3F4` | Menus, lobby, letterboxing |
| **Sunny** | `#FFC83D` | Primary action, focus ring |
| **Turf** | `#37B26C` | Go, success, your turn |
| **Signal** | `#EF4F5A` | Stop, foul, leave |

Rules:

- Text is always Ink on light colours, or Chalk with an Ink text shadow on Turf and Signal.
- Sunny is reserved for the single most important action on a screen.
- Turf and Signal carry meaning (go/stop). Don't use them as decoration.

### Player colours

Eight players, eight colour and shape pairs, assigned in join order. **The shape appears everywhere the colour does**, so players never need to tell colours apart.

| Player | Name | Hex | Shape |
|---|---|---|---|
| 1 | Cherry | `#EF4F5A` | ● Circle |
| 2 | Ocean | `#2F7DE1` | ■ Square |
| 3 | Sunny | `#FFC83D` | ▲ Triangle |
| 4 | Turf | `#37B26C` | ◆ Diamond |
| 5 | Grape | `#8C5BD6` | ★ Star |
| 6 | Tangerine | `#FF8A3D` | ⬢ Hexagon |
| 7 | Bubblegum | `#F277B6` | ♥ Heart |
| 8 | Teal | `#1FB5B0` | ✚ Plus |

Rules:

- Player colours never carry text. Names sit on Chalk, next to the player's shape.
- A player keeps their colour and shape for the whole session, across all games.

### Scene palettes

Each game world picks one scene palette on top of the core colours. Pixel art may only use core colours plus its scene palette: **16 colours per game, maximum**.

| Scene | Game | Colours | Mood |
|---|---|---|---|
| **Alley** | Strike Night | `#E0A15E` `#B8743F` `#33397A` `#F4E3C1` | Warm wood lanes under a dusk ceiling |
| **Desert** | Quick Draw | `#F1CF8B` `#E0A15E` `#8FD3F4` `#37B26C` | Sand, mesas and one lonely cactus |
| **Track** | Pixel Derby | `#D8664B` `#FAFCFF` `#37B26C` `#6B7AA6` | Clay lanes, chalk lines, stadium seats |

New games add a new scene palette to `@couchcade/theme` through review. They don't define colours locally.

### Skin and hair tones for Pips

| Skin tones | Hair colours |
|---|---|
| `#FBDDC0` `#F5C9A0` `#E8B083` `#C68B5E` `#8D5A3B` `#5C3A24` | `#1E2A4A` `#5C3A24` `#E0A15E` `#F4E3C1` `#EF4F5A` `#8C5BD6` |

---

## Type

Two families with clearly separate jobs. Both are open-source and self-hosted as subsetted WOFF2 files.

| Family | Weights | Use |
|---|---|---|
| **Fredoka** | 500 body, 700 headings and buttons | Everything people read: buttons, menus, instructions, names |
| **Pixelify Sans** | 500, 700 | Only numbers, scores, timers, room codes and in-game callouts |

Fallback stacks:

```css
--font-ui: "Fredoka", "Nunito", "Arial Rounded MT Bold", system-ui, sans-serif;
--font-pixel: "Pixelify Sans", "Courier New", monospace;
```

Rules:

- Sentence case everywhere: "Start game", not "Start Game" or "START GAME".
- In-game callouts (STRIKE!, DRAW!, FOUL!) are the only uppercase text.
- Never use Pixelify Sans for sentences.

### Type scale

| Token | TV (1080p) | Phone | Use |
|---|---|---|---|
| `callout` | 160px Pixelify 700 | n/a | STRIKE!, DRAW!, FOUL! |
| `score` | 72px Pixelify 700 | 40px Pixelify 700 | Points, timers, room code |
| `title` | 56px Fredoka 700 | 28px Fredoka 700 | Screen titles |
| `action` | 40px Fredoka 700 | 28px Fredoka 700 | Button labels |
| `body` | 32px Fredoka 500 | 18px Fredoka 500 | Instructions, names |
| `small` | 24px Fredoka 500 | 16px Fredoka 500 | Hints, captions (minimum size) |

### Callout treatment

Callouts are Sunny text with a 2px Ink stroke (4px on TV), a hard 5px Ink shadow straight down, rotated −4°, and pop in with the `celebrate` motion.

---

## Shape and depth

Three things make the interface feel solid: an Ink outline, a hard Ink shadow straight down, and rounded corners.

| Token | Value | Use |
|---|---|---|
| `outline` | 3px on phone, 4px on TV, always Ink | Every button, panel, chip and avatar |
| `depth-rest` | `0 6px 0 Ink` | Anything tappable, at rest |
| `depth-pressed` | `0 2px 0 Ink`, element moves down 4px | Pressed state |
| `depth-panel` | `0 6px 0 Ink` | Panels and scoreboards (not tappable, no press) |
| `radius-pill` | `999px` | Buttons, player chips |
| `radius-panel` | `20px` | Panels, cards, scoreboards |
| `radius-tag` | `10px` | Tabs, small tags |
| `space` | `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64` | All spacing; nothing in between |
| `touch-min` | `56px` | Smallest tap target on the phone |
| `safe-tv` | 5% of the screen on every side | Nothing important outside this area |

### Do

- Flat fills with at most one highlight
- Hard offset shadows
- The same outline weight across a whole screen
- Big, friendly, simple shapes

### Don't

- Blurred shadows or glows
- Gradients (except dither bands in pixel art)
- Transparency over gameplay
- Thin 1px borders in the interface
- Icons without outlines
- A game inventing its own button

---

## Components

All interface components live in `@couchcade/ui` (Vue, phone and menus) and `@couchcade/stage` (Phaser, TV overlays). Use them; don't rebuild them.

### Buttons

| Variant | Fill | Label | Use |
|---|---|---|---|
| `primary` | Sunny | Ink | The one main action on a screen: Start game, Join |
| `go` | Turf | Chalk + Ink shadow | Ready, Tap!, Throw |
| `stop` | Signal | Chalk + Ink shadow | Leave room, Kick |
| `quiet` | Chalk | Ink | Secondary actions: How to play, Back |

All buttons: pill radius, outline, `depth-rest`, `depth-pressed` on press, Sunny 4px focus ring with 4px offset, triggered on `pointerdown` during gameplay.

### The big action

The in-game controller button. A circle filling about 85% of the phone's width, placed in the thumb zone. Changes fill to show state:

| State | Fill | Label example |
|---|---|---|
| Waiting | Chalk | Watch the TV |
| Don't tap yet | Signal | Wait… |
| Act now | Turf | Tap! |
| Hold | Sunny | Hold to aim |
| Disabled | Chalk at Ink 20% outline | — |

### Panels

Chalk fill, outline, `radius-panel`, `depth-panel`. May carry a tab (Sky fill, `radius-tag`) overlapping the top edge.

### Player chip

Chalk pill with the player's shape on the left, name in Fredoka, optional score in Pixelify Sans on the right.

### Scoreboard (TV)

A row of player chips across the top safe area in join order, with a round counter chip in the middle. The active player's chip lifts 8px and gets a **Sunny 4px outline**.

### Room code

Always visible on the TV in the bottom-right corner: Pixelify Sans `score` size on a Chalk panel, with the join URL underneath in `small`.

---

## Pips: player avatars

Every player is a **Pip**: a round head, dot eyes, a small smile, one hairstyle and a jersey in their player colour. Pips are built from parts so players can personalise them in the lobby.

### Parts

| Part | Options |
|---|---|
| Skin tone | 6 |
| Hairstyle | 8 (short, bun, cap, long, curls, buzz, ponytail, bald) |
| Hair colour | 6 |
| Jersey | Always the player colour |
| Eyes and mouth | Fixed: two Ink dots and a small Ink smile |

### Two forms

| Form | Where | Spec |
|---|---|---|
| **Interface Pip** | Lobby, scoreboards, phone | Vector, `outline` weight, flat fills, head overlaps jersey |
| **World Pip** | Inside game worlds | 16×24 pixel sprite, 1px Ink outline, same parts and colours |

Both forms must always match: a player recognises themselves instantly in both.

### Expressions

Pips have four expressions, used by `stage`: neutral, happy (bigger smile, eyes as arcs), surprised (O mouth) and sad (flat mouth). Pips never look angry and never mock other players.

---

## Game worlds

These rules keep every game looking like part of one console.

| Rule | Value | Why |
|---|---|---|
| Internal resolution | 480×270 | Crisp pixels and cheap rendering |
| Scaling | Integer only: ×4 at 1080p, ×8 at 4K, nearest-neighbour | No blurry or uneven pixels |
| Letterbox | Sky | Consistent framing on odd screen ratios |
| Outlines | 1px Ink on characters and interactive objects; none on backgrounds | Players and balls always stand out |
| Palette | Core + one scene palette, 16 colours max | Games look related even with different settings |
| Gradients | Only as 2×2 dither bands | Retro texture without breaking the palette |
| Camera | Side or ¾ view, horizon in the upper third | Leaves room for the scoreboard |
| Light | Always daytime or warm indoor light; no dark or scary scenes | Party-friendly for all ages |
| Overlays | Only from `@couchcade/stage` | A game cannot restyle the interface |
| Animation | 8–12 fps sprite animation, smooth movement | Retro feel, readable motion |

---

## Screen layouts

### TV (16:9)

```
┌──────────────────────────────────────────────────────────┐
│  ┌────────────────────────────────────────────────────┐  │
│  │ Scoreboard: player chips · round counter           │  │  ← top 14%
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │        Game world (pixel art)                      │  │
│  │        Callouts appear centred here                │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────┐  ┌──────────────────┐  │
│  │ Whose turn + instruction     │  │ Room code + URL  │  │  ← bottom 15%
│  └──────────────────────────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────┘
          5% safe margin on every side
```

### Phone (portrait only)

```
┌────────────────────┐
│ Pip · name · score │  ← top bar
│                    │
│ "Your turn"        │  ← status
│ "Watch the TV"     │
│                    │
│   ┌────────────┐   │
│   │            │   │
│   │    BIG     │   │  ← one big action
│   │   ACTION   │   │     (thumb zone, bottom half)
│   │            │   │
│   └────────────┘   │
│                    │
│ hint text          │  ← one line
└────────────────────┘
```

Rules:

- Portrait only. If the phone is rotated, show a Chalk panel asking to rotate back (unless the game needs landscape for tilt).
- No scrolling during gameplay.
- Never more than one primary action on screen during play.

---

## Motion, sound and haptics

Motion answers what the player did. Big celebrations are saved for big moments, so a strike still feels special on the tenth throw. All sound plays on the TV; the phone stays silent.

| Token | Duration | Easing | Sound (TV) | Haptic (phone) |
|---|---|---|---|---|
| `press` | 80ms | `ease-out` | Wood-block tock | 10ms tick |
| `ui` | 180ms | `cubic-bezier(.34,1.56,.64,1)` (bounce) | Soft pop | — |
| `scene` | 400ms | `ease-in-out`, wipe transition | Whoosh | — |
| `your-turn` | 600ms | Squash and stretch | Referee whistle | Two 40ms pulses |
| `celebrate` | 900ms | Pop in + 4px screen shake | Three rising notes + crowd | One 120ms pulse |
| `foul` | 500ms | Horizontal wobble | Low buzz | Three short pulses |

### Music

- Chiptune, bright and major-key, around 110–130 BPM.
- Each game has one loop; the lobby has its own.
- Music ducks by 50% during callouts.

### Reduced motion

When the host setting is on, or `prefers-reduced-motion` is set on a phone:

- No screen shake, no flashing
- Bounces become 180ms fades
- Callouts appear without scaling

### Haptics

iPhones don't support vibration in the browser. Haptics are always a bonus and never the only feedback.

---

## Voice

Couchcade talks like a **friendly referee**: short, warm, a little bit cheeky, and never mean about a bad throw.

| Sounds like us | Doesn't |
|---|---|
| Your turn, Sam | It is now your turn to perform an action |
| Watch the TV | Please direct your attention to the main screen |
| Nice spin! | Excellent performance achieved |
| Too early, that's a foul | ERROR: INVALID INPUT TIMING |
| Room is full. Ask the host to start a new one. | Oops! Something went wrong 😢 |
| That code doesn't match a room. Check the TV. | Invalid room code |
| So close! | Wow, terrible throw lol |

Rules:

- Sentence case, plain verbs, no jargon.
- Buttons say exactly what happens: "Start game", "Leave room".
- An action keeps the same name throughout: the button says "Kick", the message says "Kicked".
- Errors explain what happened and what to do next. They don't apologise and aren't vague.
- Commentary celebrates good moments and softens bad ones. Never make fun of a player.
- Keep text under 40 characters on the phone during play.

---

## Accessibility

- Player colour is always paired with a shape.
- All text meets WCAG AA contrast; checked automatically in `@couchcade/theme` tests.
- Touch targets are at least 56px on the phone.
- Minimum text size: 16px on the phone, 24px on the TV.
- Visible focus ring (Sunny, 4px) on everything interactive.
- Every motion input has a touch fallback.
- Reduced motion is supported on both the TV and phones.
- Sound is never the only cue; every sound has a visual counterpart.

---

## Tokens in code

`@couchcade/theme` is the single source of truth. It generates CSS variables for the Vue controller and numeric colours for Phaser, so the TV and phone can never drift apart.

```ts
// packages/theme/src/tokens.ts
export const color = {
  ink: '#1E2A4A',
  chalk: '#FAFCFF',
  sky: '#8FD3F4',
  sunny: '#FFC83D',
  turf: '#37B26C',
  signal: '#EF4F5A',
} as const;

export const players = [
  { id: 'cherry',    color: '#EF4F5A', shape: 'circle'   },
  { id: 'ocean',     color: '#2F7DE1', shape: 'square'   },
  { id: 'sunny',     color: '#FFC83D', shape: 'triangle' },
  { id: 'turf',      color: '#37B26C', shape: 'diamond'  },
  { id: 'grape',     color: '#8C5BD6', shape: 'star'     },
  { id: 'tangerine', color: '#FF8A3D', shape: 'hexagon'  },
  { id: 'bubblegum', color: '#F277B6', shape: 'heart'    },
  { id: 'teal',      color: '#1FB5B0', shape: 'plus'     },
] as const;

export const scenes = {
  alley:  ['#E0A15E', '#B8743F', '#33397A', '#F4E3C1'],
  desert: ['#F1CF8B', '#E0A15E', '#8FD3F4', '#37B26C'],
  track:  ['#D8664B', '#FAFCFF', '#37B26C', '#6B7AA6'],
} as const;

export const font = {
  ui: '"Fredoka", "Nunito", "Arial Rounded MT Bold", system-ui, sans-serif',
  pixel: '"Pixelify Sans", "Courier New", monospace',
} as const;

export const shape = {
  outline: { phone: 3, tv: 4 },
  depth: { rest: 6, pressed: 2 },
  radius: { pill: 999, panel: 20, tag: 10 },
  space: [4, 8, 12, 16, 24, 32, 48, 64],
  touchMin: 56,
} as const;

export const motion = {
  press:     { ms: 80,  ease: 'ease-out' },
  ui:        { ms: 180, ease: 'cubic-bezier(.34,1.56,.64,1)' },
  scene:     { ms: 400, ease: 'ease-in-out' },
  yourTurn:  { ms: 600, ease: 'squash' },
  celebrate: { ms: 900, ease: 'pop' },
  foul:      { ms: 500, ease: 'wobble' },
} as const;

export const world = { width: 480, height: 270, maxColors: 16 } as const;

// Generated outputs:
// toCssVars(tokens)   → :root { --cc-ink: #1E2A4A; … } for Vue
// toPhaserColor(hex)  → 0x1E2A4A for Phaser
```

---

## How the style is enforced

1. **Single source of truth.** All tokens live in `@couchcade/theme`.
2. **Games don't draw the interface.** Scoreboards, callouts, menus, transitions and Pips come from `@couchcade/stage` and `@couchcade/ui`. Game scenes extend `StageScene`, which owns the overlay layer.
3. **CI style check.** `pnpm check:style` fails on:
   - Raw hex, `rgb()` or `hsl()` values outside `@couchcade/theme`
   - `font-family` declarations outside `@couchcade/theme`
   - Sprite PNGs using colours outside the game's palette
   - Sprite sheets whose frame sizes aren't multiples of the world grid
4. **Visual regression.** Every `ui` and `stage` component has screenshot tests.
5. **Contrast tests.** Every text/background pairing in `theme` is checked against WCAG AA.
6. **Review.** A new game or screen isn't done until it passes the checklist below.

---

## Review checklist

Copy this into the pull request for any new game or screen.

```markdown
### House style review

- [ ] Only colours from @couchcade/theme (core + one scene palette, ≤ 16 in the world)
- [ ] Every player colour is shown with its shape
- [ ] Fredoka for text, Pixelify Sans only for numbers, codes and callouts
- [ ] Sentence case everywhere except callouts
- [ ] All interface elements come from @couchcade/ui or @couchcade/stage
- [ ] Outlines and hard shadows; no gradients, blurs or glows
- [ ] TV text ≥ 24px at 1080p; phone text ≥ 16px; touch targets ≥ 56px
- [ ] Nothing important outside the 5% TV safe area; room code visible
- [ ] Phone shows one big action during play, portrait, no scrolling
- [ ] World at 480×270, integer scaled, 1px Ink outlines on characters
- [ ] World Pips match Interface Pips
- [ ] Motion uses theme tokens; reduced motion works
- [ ] Every sound has a visual cue; haptics are optional
- [ ] Copy matches the friendly-referee voice and never mocks players
- [ ] All art, names and sounds are original
```
