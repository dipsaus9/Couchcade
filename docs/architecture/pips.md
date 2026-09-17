# Pips spec

Pips are the players' avatars. This spec turns the approved Pip parts sheet from the platform screens canvas into rules the CC-6 stories can build from: the parts, the profile a phone sends, how a phone remembers it, and how a Pip is drawn as an Interface Pip and as a World Pip.

**For the owner.** Read [Decisions at a glance](#decisions-at-a-glance) and [Owner decisions](#owner-decisions-2026-09-17), then look at the parts sheet. That takes about 10 minutes.

**Parts sheet:** [Pip Parts Sheet](https://claude.ai/artifact/EhifwbxiX6GNRUFzJ9CUYa). It shows every part in both forms, eight example Pips and the World Pip chest options the owner chose between.

**For agents.** Everything after the owner sections is binding for CC-6.2 to CC-6.6, next to [platform.md](platform.md), [security.md](security.md), [session-flow.md](session-flow.md), [HOUSE_STYLE.md](../HOUSE_STYLE.md) and [platform-screens.md](../design/platform-screens.md). Where they disagree, stop and flag it. [Found while writing this spec](#found-while-writing-this-spec) lists the known ones.

Status: approved by the owner on 17 September 2026 (CC-6.1), with the two [owner decisions](#owner-decisions-2026-09-17).

---

## Contents

- [Decisions at a glance](#decisions-at-a-glance)
- [Owner decisions (2026-09-17)](#owner-decisions-2026-09-17)
- [Words used in this spec](#words-used-in-this-spec)
- [Parts](#parts)
- [Profile data model](#profile-data-model)
- [Random Pips](#random-pips)
- [On the phone: remembering a Pip](#on-the-phone-remembering-a-pip)
- [Interface Pip](#interface-pip)
- [World Pip](#world-pip)
- [Pips on the TV](#pips-on-the-tv)
- [Accessibility](#accessibility)
- [Budgets](#budgets)
- [Found while writing this spec](#found-while-writing-this-spec)
- [Which story builds what](#which-story-builds-what)

---

## Decisions at a glance

Approving this doc approves these. Rows 13 and 14 are [owner decisions](#owner-decisions-2026-09-17) from 17 September 2026.

| # | Decision | In plain words |
|---|---|---|
| 1 | The approved canvas is the art | The Interface Pip and World Pip geometry is ported from the CC-4.1 canvas. No new drawing style. |
| 2 | A profile is three numbers | `{ skin, hair, hairColour }`: 6 skin tones, 8 hairstyles, 6 hair colours, so 288 looks. 34 bytes as JSON. |
| 3 | The jersey comes from the seat | Jersey colour and chest shape follow the player's slot, so they are never in the profile. Audience members wear a plain Chalk jersey. |
| 4 | Option order is frozen | Index 3 is always "long". New options are only ever added at the end, so a saved Pip never changes look. |
| 5 | Every new phone gets a random Pip | A random look on the first visit, so a room never fills with identical Pips. Players can change it or shuffle it. |
| 6 | The phone remembers the name and Pip | One `localStorage` record on the player's own phone: the name and the three numbers. No ids, codes or tokens. It is sent only to a room the player joins. |
| 7 | Edits send one message, not one per tap | The phone sends the latest Pip 400 ms after the last change, at most once per second. |
| 8 | Pips change only outside games | The customiser opens from the lobby and the screens between games, never during play. Games read Pips when they start. |
| 9 | Two forms, one look | Interface Pip: vector with the `outline` weight (4px TV, 3px phone). World Pip: a 16×24 sprite with a 1px Ink outline, facing right, mirrored to face left. |
| 10 | Both kits draw from the same part data | The vector part geometry lives in `@couchcade/theme`, so the Vue Pip (`ui`) and the Phaser scoreboard heads (`stage`) can't drift apart. |
| 11 | The TV never shows a sad Pip | Neutral by default, happy for winners, surprised for a miss. Sad exists only for a player's own phone. |
| 12 | Pip colours don't count against a game's 16 colours | Player colours, skin tones and hair colours are platform colours, drawn by `stage` at runtime. |
| 13 | World Pips show the shape at their feet | A 2×2 Chalk chest mark, and the 9×9 seat shape under the feet (owner, 2026-09-17). |
| 14 | The random Pip button is "Shuffle" | "Surprise me" stays the VIP's random game (owner, 2026-09-17). |

## Owner decisions (2026-09-17)

The owner approved this spec on 17 September 2026 and made two product choices.

1. **The seat shape on a World Pip.** A World Pip's jersey is 12×9 pixels, too small for a clean shape (at 5×5 the circle and hexagon look the same). A World Pip wears a 2×2 Chalk mark on the chest, and the player's shape stands under its feet at 9×9 pixels, as Quick Draw already does. Interface Pips keep the full shape on the chest. Rejected: a 5×5 shape on the chest.
2. **The random Pip button is called "Shuffle".** "Surprise me" stays the VIP's random game button (session-flow.md), so each action keeps one name. Rejected: renaming the game button to "Random game".

---

## Words used in this spec

| Word | Meaning |
|---|---|
| Pip | A player's avatar: a round head, dot eyes, a small smile, one hairstyle and a jersey. |
| Profile | The part of a Pip a player chooses: `PipProfile` in `@couchcade/protocol`. |
| Seat | The player's `slot` (0 to 7) from platform.md. It picks the jersey colour and shape. `null` is audience. |
| Look | Everything needed to draw one Pip: profile, seat and expression. |
| Interface Pip | The vector Pip for phones, menus and TV overlays. |
| World Pip | The 16×24 pixel sprite Pip inside a 480×270 game world. |
| Customiser | The "Make your Pip" panel on the phone (CC-6.5). |

---

## Parts

A profile stores one index per part. The index order is part of the wire format and never changes (decision 4).

### Skin tones (`skin`, 0 to 5)

| Index | Hex | Screen reader name |
|---|---|---|
| 0 | `#FBDDC0` | Tone 1 |
| 1 | `#F5C9A0` | Tone 2 |
| 2 | `#E8B083` | Tone 3 |
| 3 | `#C68B5E` | Tone 4 |
| 4 | `#8D5A3B` | Tone 5 |
| 5 | `#5C3A24` | Tone 6 |

Skin tones are numbered, not named after people.

### Hairstyles (`hair`, 0 to 7)

| Index | Id | Label | Notes |
|---|---|---|---|
| 0 | `short` | Short | Fringe falls to the front |
| 1 | `bun` | Bun | Bun on top, drawn behind the head |
| 2 | `cap` | Cap | The cap takes the hair colour |
| 3 | `long` | Long | Falls behind the shoulders |
| 4 | `curls` | Curls | A ring of curls around the top of the head |
| 5 | `buzz` | Buzz | A thin cap of hair |
| 6 | `ponytail` | Ponytail | Front view: to the right. World Pip: at the back |
| 7 | `bald` | Bald | No hair; `hairColour` is kept but not drawn |

### Hair colours (`hairColour`, 0 to 5)

| Index | Hex | Screen reader name |
|---|---|---|
| 0 | `#1E2A4A` | Navy |
| 1 | `#5C3A24` | Brown |
| 2 | `#E0A15E` | Caramel |
| 3 | `#F4E3C1` | Blond |
| 4 | `#EF4F5A` | Red |
| 5 | `#8C5BD6` | Purple |

### Fixed parts

| Part | Rule |
|---|---|
| Jersey | The seat's player colour with a Chalk V-neck and the seat's shape in Chalk on the chest. Audience (`slot: null`): Chalk jersey, no emblem. |
| Eyes and mouth | Ink. Four expressions: neutral (dot eyes, small smile), happy (arc eyes, open smile), surprised (bigger dots, O mouth), sad (dot eyes, flat mouth). |
| Outline | Ink around every part: `outline` weight on Interface Pips, 1px on World Pips. |

### Where each list lives

| What | Package | Why |
|---|---|---|
| Part counts and hairstyle ids (`pipParts`) | `@couchcade/utils` (`src/pips/`) | Tier 0. Protocol, theme and the generator all read the same counts. |
| `pipProfileSchema`, `PipProfile` | `@couchcade/protocol` | Imports the counts from utils instead of its own `pipPartCounts` copy. |
| Colours (`pip.skin`, `pip.hair`) | `@couchcade/theme` (exists) | Hex only in theme. A theme test checks the list lengths match `pipParts`. |
| Colour and label names | `@couchcade/theme` (`src/pips/`) | Screen reader names from the tables above. |
| Vector part geometry | `@couchcade/theme` (`src/pips/`) | `ui` and `stage` can't import each other ([decision 10](#decisions-at-a-glance)). |
| World Pip pixel rules | `@couchcade/stage` (`src/pips/`) | Only Phaser draws World Pips. |

---

## Profile data model

### Type and JSON

```ts
// @couchcade/utils pips
export const pipParts = {
  skin: 6,
  hair: ["short", "bun", "cap", "long", "curls", "buzz", "ponytail", "bald"],
  hairColour: 6,
} as const;

// @couchcade/protocol shared (shape unchanged from CC-1.8)
type PipProfile = { skin: number; hair: number; hairColour: number };
```

```json
{ "skin": 1, "hair": 0, "hairColour": 1 }
```

### Validation

1. Each field is an integer from 0 up to its count minus one. `pipProfileSchema` already checks this.
2. All three fields are required. Unknown keys are stripped, so an old host ignores a field a newer phone adds.
3. The relay validates `player:profile` and the join body. An invalid profile drops the message, as for every other message.
4. Renderers take a validated profile, but wrap an out-of-range index (modulo the count) instead of throwing, so a bad value can never crash the TV.

### Size on the wire

| Where | Bytes (largest values) |
|---|---|
| The profile | 34 |
| `player:profile`, phone to relay | 73 |
| `player:profile`, relay to host (with `from`) | 91 |
| Added to `PlayerInfo` in `player:joined` and `room:welcome` | about 45 |
| Added to the join body | about 45 |
| Socket attachment and the `players` row | 34 |

Every frame stays far under the 1 KB cap.

### Where a profile is stored

| Place | Lifetime | Owner |
|---|---|---|
| The phone's `localStorage` | Until the player clears site data | CC-6.5 |
| The room's `players` row and socket attachment | Until the room closes (security.md: nothing kept after that) | Exists (CC-1.9) |
| The host's player list | The TV tab | Exists (CC-1.12) |

### Changing the model later

1. **New option** (a ninth hairstyle): add it at the end of its list. Old phones keep their Pip. Old hosts wrap the new index until they update, which is fine because every deploy updates all clients.
2. **New part** (glasses): add an optional field. A missing field means "none". The phone's stored record keeps `v: 1`.
3. **Removing or reordering options** changes saved Pips. That is a breaking change: bump the protocol `v` and the storage `v`, and amend this spec first.

---

## Random Pips

```ts
// @couchcade/utils pips
export function randomPip(seed: number): PipProfile;
```

1. `randomPip` uses `createRng(seed)` from `@couchcade/utils` and draws `skin`, `hair` and `hairColour` in that order, each uniform over its count. The same seed gives the same Pip on every device, so tests are exact.
2. **First visit.** When the phone has no stored Pip, it seeds `randomPip` with 32 random bits from `crypto.getRandomValues` and stores the result.
3. **Shuffle.** Each tap draws a new seed the same way. If the result equals the current Pip, it redraws with `seed + 1`, so a tap always changes something.
4. **Fallback in the room.** When a join carries no profile, the room seats the player with `randomPip` seeded from their player id (FNV-1a of the 8 letters), not `{ 0, 0, 0 }`. See [Found while writing this spec](#found-while-writing-this-spec), item 1.
5. `randomPip` is not cryptographic and needs not be. A Pip is not a secret.

---

## On the phone: remembering a Pip

### The record

| Key | Storage | Value |
|---|---|---|
| `couchcade:player` | `localStorage` | `{ "v": 1, "name": "Noor", "profile": { "skin": 4, "hair": 4, "hairColour": 0 } }` |

About 75 bytes. It is separate from `couchcade:session` in `sessionStorage`, which holds the room code, player id and rejoin token and is gone when the tab closes.

### Reading

1. Read and parse `couchcade:player` inside `try`. Storage can be blocked (private mode, sandboxed frames) or hold anything.
2. `v` must be 1. Otherwise start fresh.
3. `name` must pass `playerNameSchema`. Otherwise leave the name field empty.
4. Check each profile field on its own. Keep valid fields and draw a fresh random value for any field that is missing or out of range. Write the repaired record back.
5. With no usable storage, the phone makes a random Pip for this page load and plays normally. It just won't remember it.

### Writing

1. After the first random Pip is made.
2. After every customiser change, straight away, before the network send.
3. After a successful join, with the name the server returned (the normalised name).

### When the Pip is sent

1. **Join.** The phone puts its stored profile in the `POST /api/rooms/:code/join` body (the optional `profile` field exists since CC-1.8).
2. **After `room:welcome`.** If `you.profile` differs from the stored profile, the phone sends one `player:profile`. Today it almost always fires, because the room ignores the join body ([item 1](#found-while-writing-this-spec)). Once that is fixed it only fires in rare races.
3. **Customiser changes.** The phone sends the latest profile 400 ms after the last change, at most once per second, and only when it differs from the last one sent. A player tapping through all 8 hairstyles costs one or two requests, not eight.
4. **Rejoin in the same room.** Nothing to send. The room kept the profile.

### Privacy

1. The record holds a chosen name and three small numbers. No room codes, player ids, tokens, device ids or timestamps.
2. It never leaves the phone except inside a join or `player:profile` to a room the player chose to join, and the room forgets it when it closes (security.md, decision 12).
3. No cookies and no tracking. The TV never reads a phone's storage.
4. On a shared phone the next guest sees the last name and Pip filled in and changes them. That is accepted. Clearing the browser's site data removes the record.

---

## Interface Pip

### Geometry

The Interface Pip is the `pip()` drawing from the approved canvas, moved into `@couchcade/theme` as data.

| Item | Value |
|---|---|
| Full Pip viewBox | `0 0 100 112` |
| Head crop viewBox | `6 4 88 88` |
| Head | Circle `cx 50, cy 48, r 30`, skin tone |
| Jersey | The canvas path from y 73 to the bottom edge, player colour; Chalk V-neck; seat shape at `translate(41 89) scale(0.75)` in Chalk |
| Hair | One back layer (bun, long, ponytail) behind the head and one front layer over it, per the canvas paths. Curls are drawn as one merged outline. |
| Face | Eyes at x 39 and 61, y 53. Face line width is `outline × 0.8`, kept between 2.4 and 4.4 viewBox units. |
| Outline | Ink stroke with round joins. The stroke width in viewBox units is `outline px × viewBox width ÷ rendered px`, so the outline is exactly 4px on the TV and 3px on a phone at every size. |

`@couchcade/theme` exports the parts as plain element data (`{ tag, attrs, paint }`), like the player shapes in `packages/ui/src/components/shapes.ts`. `paint` is a role (`skin`, `hair`, `jersey`, `chalk`, `ink`), resolved to a hex by the renderer. No HTML strings, so Vue never needs `v-html` (security.md, decision 11).

### The Vue component

```vue
<CcPip :profile="player.profile" :slot="player.slot" expression="happy" crop="head" :size="44" surface="phone" :label="`${player.name}'s Pip`" />
```

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `profile` | `PipProfile` | required | The look |
| `slot` | `number \| null` | required | Jersey colour and shape; `null` is audience |
| `expression` | `"neutral" \| "happy" \| "surprised" \| "sad"` | `"neutral"` | |
| `crop` | `"full" \| "head"` | `"full"` | |
| `size` | `number` | required | Rendered width in CSS px |
| `surface` | `"phone" \| "tv"` | `"phone"` | Picks the `outline` weight |
| `label` | `string` | none | With a label the SVG is `role="img"`; without one it is `aria-hidden` (the name is next to it) |

### Sizes on screen

| Where | Crop | Size | Outline |
|---|---|---|---|
| TV lobby player card | Full | 140px | 4px |
| TV footer "Sam is choosing" | Head | 96px | 4px |
| TV results podium | Full | 190px, winner 220px | 4px |
| TV results standings, lag check chips | Head | 64px, 56px | 4px |
| TV game menu and scoreboard chips | Head | 56px | 4px |
| Phone customiser preview | Full | 150px | 3px |
| Phone customiser hairstyle tiles | Head | 52px | 3px |
| Phone top chip | Head | 48px | 3px |
| Phone VIP player list | Head | 44px | 3px |

### Expressions in platform screens

| Screen | Expression |
|---|---|
| Lobby cards, chips, menus | Neutral |
| Customiser preview | Happy |
| Results podium (top 3), winner's row | Happy |
| Everyone else on results | Neutral |
| The player's own phone after a game | Happy |

Games pick expressions in their own spec, within decision 11.

---

## World Pip

### The sprite

A World Pip is a 16×24 grid, built at runtime from the profile and seat by `buildWorldPip` in `@couchcade/stage`. The rules below are the canvas `worldPip()` with the face shift Quick Draw added in CC-10.9. Coordinates are `(x, y)` from the top-left pixel.

| Layer (in draw order) | Pixels |
|---|---|
| Hair behind | Long: columns 2, 3, 12, 13 on rows 5 to 15. Ponytail: columns 1 and 2 on rows 4 to 11 (the back of the head). Bun: columns 6 to 9 on rows 1 and 2. |
| Jersey | Rows 14 to 22. Row 14 spans columns 4 to 11, row 15 columns 3 to 12, rows 16 to 22 columns 2 to 13. Player colour. |
| Chest | Chalk at (7,17), (8,17), (7,18), (8,18) ([owner decision 1](#owner-decisions-2026-09-17)). |
| Head | Every pixel with `(x − 7.5)² + (y − 8)² ≤ 5.6²`, skin tone |
| Hair on top | Head pixels on rows up to: buzz 3, short 4, bun 4, long 4, ponytail 4, cap 5, curls 5 (curls also fill the ring out to radius 6.7 on rows up to 6), bald none. Short adds a fringe on row 5 from column 9. Cap adds a brim on row 6 from column 3 to 14. |
| Face | See below |
| Chin | Where a skin pixel on row 13 sits above a jersey pixel on row 14, that row 14 pixel becomes Ink |
| Outline | Every empty pixel that touches a filled pixel on one of its four sides becomes Ink |

The sprite faces right: the face sits one pixel right of centre, the fringe and cap brim point right, and the ponytail hangs left. Scenes mirror it with `flipX` to face left. There is no back view.

### Faces

| Expression | Eyes | Mouth |
|---|---|---|
| Neutral | (6,9), (11,9) | (7,10), (10,10), (8,11), (9,11) |
| Happy | Arcs: (5,9), (6,8), (7,9) and (10,9), (11,8), (12,9) | (6,10), (11,10), (7,11) to (10,11) |
| Surprised | (6,9), (11,9) | (8,11), (9,11), (8,12), (9,12) |
| Sad | (6,9), (11,9) | (7,11) to (10,11) |
| Blink (extra frame, any expression) | (5,9), (6,9) and (10,9), (11,9) | That expression's mouth |

Surprised World Pips keep 1px eyes. The Interface Pip's bigger dots don't fit at 16×24, and the O mouth carries the expression.
### In a scene

1. **Anchor.** A Pip standing at world position `(x, feetY)` has its top-left pixel at `(x − 8, feetY − 24)`. Depth sorts by `feetY`.
2. **Shape marker** (owner decision 1). `drawPlayerShape` draws the 9×9 seat shape with its top-left at `(x − 5, feetY)`, just under the feet, one depth step behind the Pip.
3. **Scale.** World Pips live in the 480×270 world and get the world's integer scale: ×4 at 1080p (64×96 on screen), ×8 at 4K.
4. **Animation.** Games move Pips smoothly and swap the face at 8 to 12 fps (blink, expression). Poses and props, such as Quick Draw's popgun and Target Range's bow, belong to the game.
5. **Textures.** `stage` paints each look once into a canvas texture keyed `pip:world:<skin>-<hair>-<hairColour>-<slot>-<expression>-<eyes>` and reuses it. Textures are made when a game starts or a player joins, never in the update loop. At most 8 players × 5 faces = 40 textures of 16×24 pixels.
6. **Palette.** World Pips use Ink, Chalk, the 8 player colours, 6 skin tones and 6 hair colours. These are platform colours drawn by `stage` and don't count towards a game's 16-colour scene budget (decision 12). They are generated at runtime, so the sprite PNG palette check never sees them.

---

## Pips on the TV

| Place | Form | Built with |
|---|---|---|
| Lobby player cards | Interface Pip, full, 140px | `CcPip` in the Vue lobby (`apps/host/src/screens/lobby/`) |
| Game menu chips, results, lag check | Interface Pip, head or full | `CcPip` in the Vue host screens |
| Stage scoreboard chips during games | Interface Pip head, 56px | `stage` turns the theme geometry into an SVG data URI, loads it as a texture at the overlay scale (×2 on 4K) and caches it per look. CSP allows `data:` images. |
| Inside game worlds | World Pip | `buildWorldPip` from `stage` |

Rules:

1. **Profile changes.** The host applies `player:profile` to its player list at once. Vue screens and the scoreboard redraw. A running game keeps the looks it read at start. Because the customiser is never open during play (decision 8), players in a game can't change their Pip mid-game.
2. **Late joiners and promoted audience** customise on the `next-game` screen and appear in the next game with that Pip.
3. **Audience** members have a profile but no seat. Their phone chip shows their Pip head with a plain Sky circle where the seat shape would be. The TV shows them only as "2 watching".
4. **Where the customiser opens.** The lobby ("Make your Pip" for players, "Edit my Pip" for the VIP) and the `waiting`, `results`, `next-game` and `audience` screens. Never on a game's controller.
5. **Looks on the TV.** Pips always sit on Sky or Chalk in platform screens and get the full Ink outline, so the lightest skin tone and blond hair stay visible from the couch.

---

## Accessibility

1. **Colour is never the only cue.** The Interface Pip jersey carries the seat shape. World Pips stand on their 9×9 seat shape ([owner decision 1](#owner-decisions-2026-09-17)). Names sit next to Pips in every chip and card.
2. **Screen readers.** `CcPip` takes a `label` ("Noor's Pip") when it stands alone and is hidden when the name is next to it. Customiser options are radio groups with the labels from [Parts](#parts): "Short", "Tone 3", "Caramel".
3. **Selection is not colour only.** A selected customiser tile gets the Sky fill and `aria-checked`, and the preview Pip changes at once.
4. **Touch targets.** Customiser tiles and tabs are at least 56px.
5. **Bald.** The Colour tab stays visible but disabled (Ink 20% outline, Ink 45% label) with the hint "Bald Pips have no hair colour", so switching back to a hairstyle restores the old colour.
6. **Reduced motion.** Pip pop-ins and expression swaps become 180ms fades. World Pip blinks stay (they don't move the screen).
7. **Kind faces.** Pips never look angry and the TV never shows a sad Pip (decision 11).

---

## Budgets

Measured on `main` on 17 September 2026 with `pnpm budgets`: controller initial JS 54.2 of 80 KB, host platform JS 412.8 of 450 KB.

| Item | Budget (gzip) | Checked by |
|---|---|---|
| Theme Pip geometry and `CcPip` in the phone's initial JS (chips show Pip heads on most screens) | ≤ 3 KB | `pnpm budgets`, noted in CC-6.3's PR |
| Customiser screen as a lazy chunk | ≤ 4 KB | `pnpm budgets`, noted in CC-6.5's PR |
| `buildWorldPip`, scoreboard head textures and geometry on the host | ≤ 4 KB | `pnpm budgets`, noted in CC-6.4 and CC-6.6 |
| Every message carrying a profile | < 100 bytes | Protocol fixture tests |
| Pip requests per player | 1 at join, then at most 1 per second while customising | CC-6.5 unit test for the send rule |
| TV textures | Built outside the update loop; at most 40 World Pip textures and 8 scoreboard heads | CC-6.4 and CC-6.6 tests |

---

## Found while writing this spec

Approving the doc approves the proposed fixes. Each names who makes it.

1. **The room ignores the join body's profile.** `apps/server/src/api/join.ts` parses `profile` but drops it, and the room seats every new player as `{ skin: 0, hair: 0, hairColour: 0 }`, so every Pip looks the same until its phone sends `player:profile`. Fix in a **new story** (References `apps/server/src/api/join.ts`, `apps/server/src/security/tickets.ts`, `apps/server/src/room/`): carry the profile in the ticket as an optional `pf: [skin, hair, hairColour]` claim, seat the player with it, and fall back to `randomPip` seeded from the player id. It amends the platform.md ticket table in the same PR. Until it lands, CC-6.5's send after `room:welcome` covers it at one request per join.
2. **CC-6.6 criterion 1** says the TV lobby renders Interface Pips "in Phaser". The lobby is a Vue screen, so it uses `CcPip`. Only the stage scoreboard needs Phaser. Reword through `backlog-plan` to "The TV lobby shows each player's Interface Pip".
3. **CC-6.3 criterion 1** names the component `<Pip>`. The UI kit prefixes every component with `Cc`, so it is `CcPip`. CC-6.3's References also need `packages/theme/src/pips/` for the shared geometry.
4. **Part counts live in protocol.** CC-1.8 put `pipPartCounts` in `@couchcade/protocol` because utils had no Pip module yet. CC-6.2 adds `pipParts` to utils and switches protocol to import it, so its References need `packages/protocol/src/shared/`.
5. **Placeholder World Pips.** Quick Draw has a game-local `games/quick-draw/src/host/world-pip.ts`: short hair for everyone, and a sad face that falls back to the neutral smile. Target Range's TV scene (CC-11.4, in progress) copies it, as target-range.md allows until CC-6.4 lands. A **new story** after CC-6.4 swaps every game-local copy for `buildWorldPip` and deletes them. Its References are the `src/host/` folders of the games that have a copy by then.
6. **"Surprise me" meant two things.** The canvas used it for the random Pip too. Settled by [owner decision 2](#owner-decisions-2026-09-17): the Pip button is "Shuffle".
7. **The canvas World Pip's ponytail** hangs on the right, which is the front once World Pips face right. This spec moves it to the back.

---

## Which story builds what

| Area | Story |
|---|---|
| `pipParts`, `randomPip`, protocol importing the counts | CC-6.2 |
| Theme Pip geometry and names, `CcPip` | CC-6.3 |
| `buildWorldPip`, faces, textures, shape marker placement | CC-6.4 |
| Customiser, `couchcade:player` storage, join body, send rule | CC-6.5 |
| TV lobby and menu Pips, scoreboard heads | CC-6.6 |
| Profile in the ticket and random fallback in the room | New story (item 1) |
| Quick Draw and Target Range on stage World Pips | New story (item 5) |
