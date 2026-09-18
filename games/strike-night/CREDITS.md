# Strike Night credits

Every CC0 asset Strike Night uses, per the shortlist in
[`docs/games/strike-night.md`](../../docs/games/strike-night.md#cc0-asset-shortlist) (CC-12.5). Furniture
sprites are recoloured onto the `alley` scene palette with `pnpm assets:recolour <input> alley` (see
[`docs/HOUSE_STYLE.md`](../../docs/HOUSE_STYLE.md#assets-and-credits)). Licences were checked on each source
page, and in the `License.txt` inside every Kenney download, on 18 September 2026.

Sprites not listed here (`ball.png`, `pin.png`, `ceiling-light.png`, `target-arrow.png`, `lane-plank.png`)
are drawn from scratch for Couchcade directly on the core + `alley` palette, as the game spec calls for
("Drawn from scratch: the lane in both shots with its gutters, target arrows and kickbacks, the back wall
and ceiling lights, pins ..., the ball ..., the sweep bar, the ball return and the Pip's ball-holding prop" —
none of the CC0 packs checked had pixel-art bowling pins or a lane from behind that read well at this size).
The ball texture doubles as the bowler's held-ball prop and the pin texture is rotated 90° for a fallen pin,
so no separate prop/tumble sprites were drawn. The sweep bar and ball return described in the spec are not
yet drawn — see "Not included in this story" below.

| Asset | Author | Source | Licence |
| --- | --- | --- | --- |
| Bench (`assets/sprites/bench.png`, Roguelike Indoors tile at sheet position 68,102) | Kenney | https://kenney.nl/assets/roguelike-indoors | CC0 |
| Chair (`assets/sprites/chair.png`, tile at 34,34) | Kenney | https://kenney.nl/assets/roguelike-indoors | CC0 |
| Small table (`assets/sprites/table.png`, tile at 34,0) | Kenney | https://kenney.nl/assets/roguelike-indoors | CC0 |
| Framed picture (`assets/sprites/picture-frame.png`, tile at 306,0) | Kenney | https://kenney.nl/assets/roguelike-indoors | CC0 |
| Potted plant (`assets/sprites/potted-plant.png`, tile at 272,0) | Kenney | https://kenney.nl/assets/roguelike-indoors | CC0 |
| Ball rolling on the lane (`assets/sounds/bowling-roll.ogg`, `qubodup-bowling_roll.ogg`) | qubodup | https://opengameart.org/content/bowling-ball-rolling | CC0 |
| Ball rolling, no fade-out, for a gutter ball (`assets/sounds/bowling-roll-nofade.ogg`, `qubodup-bowling_roll-nofadeout.ogg`) | qubodup | https://opengameart.org/content/bowling-ball-rolling | CC0 |
| Ball into pins, heavy crash x5 (`assets/sounds/pin-crash-heavy-1.ogg` to `-5.ogg`, Impact Sounds `impactWood_heavy_000` to `_004`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Ball into pins, medium crash x5 (`assets/sounds/pin-crash-medium-1.ogg` to `-5.ogg`, Impact Sounds `impactWood_medium_000` to `_004`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Ball into pins, light crash x5 (`assets/sounds/pin-crash-light-1.ogg` to `-5.ogg`, Impact Sounds `impactWood_light_000` to `_004`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Pin into a kickback x5 (`assets/sounds/kickback-thud-1.ogg` to `-5.ogg`, Impact Sounds `impactPlank_medium_000` to `_004`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Sweep bar clunk x5 (`assets/sounds/sweep-clunk-1.ogg` to `-5.ogg`, Impact Sounds `impactMetal_light_000` to `_004`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Clock tick, last 5 seconds (`assets/sounds/clock-tick.ogg`, Interface Sounds `tick_001`) | Kenney | https://kenney.nl/assets/interface-sounds | CC0 |
| Spare ding (`assets/sounds/spare-ding.ogg`, Interface Sounds `glass_001`) | Kenney | https://kenney.nl/assets/interface-sounds | CC0 |
| Strike jingle (`assets/sounds/strike-jingle.ogg`, Music Jingles "8-Bit jingles/jingles_NES00") | Kenney | https://kenney.nl/assets/music-jingles | CC0 |
| Turkey jingle (`assets/sounds/turkey-jingle.ogg`, Music Jingles "8-Bit jingles/jingles_NES03") | Kenney | https://kenney.nl/assets/music-jingles | CC0 |
| Match end jingle (`assets/sounds/match-end.ogg`, Music Jingles "Hit jingles/jingles_HIT02") | Kenney | https://kenney.nl/assets/music-jingles | CC0 |
| Game music loop (`assets/sounds/game-music-loop.mp3`) | iamoneabe (Aron Elal) | https://opengameart.org/content/funky-menu-loop | CC0 |
| Music backup (`assets/sounds/music-backup.mp3`), Target Range's backup too | TinyWorlds | https://opengameart.org/content/happy-adventure-loop | CC0 |

## Notes for the reviewer

- **The game music loop's tempo measures under the spec's 110-130 BPM range.** The spec
  ("CC0 asset shortlist") asked CC-12.5 to check the loop lands in that range. The source MP3's own ID3
  `TBPM` tag (embedded by the artist, Aron Elal) says **104 BPM**; `aubio tempo` independently measured
  **100.22 BPM** on the same file, close enough to the tag to trust both readings. Both are below 110.
  No other CC0 "funky"/upbeat short loop turned up in the same shortlisting pass (`docs/games/strike-night.md`
  rejects the alternatives it checked for other reasons, not tempo), and the track is otherwise exactly the
  fit the spec describes (funky, already loop-length, CC0, small once re-encoded). Shipped anyway, tempo
  flagged here rather than silently claimed as compliant — a genuine 110-130 BPM CC0 loop is a follow-up if
  the owner wants one.
- **Game music loop was re-encoded smaller.** The source (`funkymenuloop_0.mp3`, 741 KB, 320 kbps, 18.5 s —
  already a purpose-built short loop, unlike Quick Draw's rejected Chiploop or Target Range's 44 s chiptune
  that needed cutting) was re-encoded to 128 kbps MP3 with `ffmpeg`, 296 KB. No Vorbis/Opus encoder was
  available in this environment's `ffmpeg` build (only `libmp3lame` and `aac`), so it ships as `.mp3`
  rather than `.ogg`, the same fallback Quick Draw's `crow-caw.wav` and Target Range's `release-twang.wav`/
  `arrow-whoosh.wav` took when their preferred encoder wasn't available. `ffmpeg` (already installed) and
  `aubio` (installed for this story, `brew install aubio`) are open source and neither ships with the
  project or is needed to build or run it.
- **Music backup was left at its source length** (636 KB, 46.8 s) rather than trimmed: it's the documented
  fallback for the primary loop, not the default track, so the same size diligence as the primary loop
  wasn't spent on it, matching how Target Range treated its own backup slot.
- **Roguelike Indoors tile positions** are given as pixel `(x,y)` in the packed `roguelikeIndoor_transparent.png`
  sheet (16x16 tiles, 1 px margin, so a stride of 17 px), since the pack's own tilesheet info file gives only
  the frame size, not a name-to-position index.
- **No colour pre-shifting was needed before recolouring** (the CC-10.9 cactus-turned-blue problem): the five
  Roguelike Indoors crops are warm wood browns, a cream picture mat and a green plant with no teal or
  dusty-rose tones, so `pnpm assets:recolour <file> alley` landed them on `alley`'s maple/walnut/cream and
  the core Turf without a stray hue. Checked visually at 8x scale before and after recolouring.
- Every sprite is a multiple of the 8 px world grid and passes
  `pnpm --filter ./tooling/assets run check-sprites`. Total asset weight: **~3.9 KB of sprites** (11 tiny
  PNGs, all `?inline`d into the host bundle — the `Host per-game chunk` budget, 60 KB gzip, measured
  57.33 KB after this story), **~1.4 MB of sounds** (not bundled: `games/strike-night/src/host/` has no
  sound-playback code yet, matching Quick Draw's and Target Range's own `cues.ts` doc comment — "Sound
  arrives with `@couchcade/audio` ... until then nothing listens" — so these ship as credited assets for
  whoever wires playback next).

## Not included in this story

- **Sweep bar and ball return props.** The spec's "drawn from scratch" list includes a sweep bar and a ball
  return; CC-12.5 spent its sprite budget on the ball, pins, lane/gutter boards, ceiling lights, target
  arrows and the seating area (all of which the TV scene already positions every frame) and left these two
  static props for a follow-up, since the `Host per-game chunk` budget had roughly 2.7 KB of headroom left
  by the time everything above was wired in and the strike/pin/ball art mattered more for readability.
- **Sound playback wiring.** `games/strike-night/src/host/cues.ts` already emits every cue token this
  shortlist's sounds map to; nothing calls `@couchcade/audio` yet. Wiring playback is a separate story, the
  same split Quick Draw and Target Range shipped their own sound assets under.
