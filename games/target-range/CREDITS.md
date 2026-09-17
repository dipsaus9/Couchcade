# Target Range credits

Every CC0 asset Target Range uses, recoloured onto the `range` scene palette with
`pnpm assets:recolour <input> range` (see [`docs/HOUSE_STYLE.md`](../../docs/HOUSE_STYLE.md#assets-and-credits)
and [`docs/games/target-range.md`](../../docs/games/target-range.md#cc0-asset-shortlist)). Licences were checked
on each source page, and in the `License.txt` inside every Kenney download, on 17 September 2026.

Sprites not listed here (`target-near.png`, `target-middle.png`, `target-far.png`, `target-stand.png`,
`hay-bale.png`, `wind-flag-calm.png`, `wind-flag-light.png`, `wind-flag-stiff.png`, `wind-flag-flapping.png`,
`bow.png`, `arrow-flight.png`, `arrow-stub.png`) are drawn from scratch for Couchcade directly on the
core + `range` palette, as the game spec calls for (none of the CC0 packs checked had a ring target or a bow
that reads well at this size) — no CC0 source, so no credit needed.

| Asset | Author | Source | Licence |
| --- | --- | --- | --- |
| Grass tile (`assets/sprites/grass.png`, Tiny Town tile row 1 col 1) | Kenney | https://kenney.nl/assets/tiny-town | CC0 |
| Grass tile, light variant (`assets/sprites/grass-light.png`, tile row 1 col 2) | Kenney | https://kenney.nl/assets/tiny-town | CC0 |
| Pine tree (`assets/sprites/pine-tree.png`, tile row 1-2 col 5) | Kenney | https://kenney.nl/assets/tiny-town | CC0 |
| Round hedge bush (`assets/sprites/hedge-bush.png`, tile row 3 col 5) | Kenney | https://kenney.nl/assets/tiny-town | CC0 |
| Wooden fence post (`assets/sprites/fence.png`, tile row 6 col 9) | Kenney | https://kenney.nl/assets/tiny-town | CC0 |
| Draw creak (`assets/sounds/draw-creak.ogg`, RPG Audio `creak1`) | Kenney | https://kenney.nl/assets/rpg-audio | CC0 |
| Release twang (`assets/sounds/release-twang.wav`, Battle Sound Effects `Bow.wav`) | artisticdude | https://opengameart.org/content/battle-sound-effects | CC0 |
| Arrow whoosh (`assets/sounds/arrow-whoosh.wav`, Battle Sound Effects `swish_2.wav`) | artisticdude | https://opengameart.org/content/battle-sound-effects | CC0 |
| Arrow thud into straw (`assets/sounds/arrow-thud-straw.ogg`, Impact Sounds `impactSoft_heavy_000`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Arrow thud into the fence (`assets/sounds/arrow-thud-fence.ogg`, Impact Sounds `impactPlank_medium_000`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Clock tick, last 3 seconds (`assets/sounds/clock-tick.ogg`, Interface Sounds `tick_001`) | Kenney | https://kenney.nl/assets/interface-sounds | CC0 |
| Bullseye ding (`assets/sounds/bullseye-ding.ogg`, Interface Sounds `bong_001`) | Kenney | https://kenney.nl/assets/interface-sounds | CC0 |
| Round start jingle (`assets/sounds/round-start.ogg`, Music Jingles "8-Bit jingles/jingles_NES00") | Kenney | https://kenney.nl/assets/music-jingles | CC0 |
| Match end jingle (`assets/sounds/match-end.ogg`, Music Jingles "Pizzicato jingles/jingles_PIZZI02") | Kenney | https://kenney.nl/assets/music-jingles | CC0 |
| Wind loop, rounds 2 to 4 (`assets/sounds/wind-loop.ogg`) | SketchMan3 | https://opengameart.org/content/wind-whoosh-loop | CC0 |
| Game music loop (`assets/sounds/game-music-loop.ogg`) | Scribe (Daniel Stephens) | https://opengameart.org/content/summer-park-8bit-tune-loop | CC0 |

## Notes for the reviewer

- **Battle Sound Effects (`release-twang.wav`, `arrow-whoosh.wav`) is multi-licensed.** OpenGameArt lists
  CC0 alongside CC-BY, CC-BY-SA and GPL 2.0/3.0 for this upload; we take it under CC0 (confirmed on the
  source page, `license_images/cc0.png` next to the listing) and credit it as CC0 only, per HOUSE_STYLE's
  CC0-only rule.
- **Game music loop was trimmed.** The source file (`8bit attempt.ogg`, 850.5 KB, 44 s) is a whole
  chiptune, not a short loop, so shipping it as-is would repeat CC-10.5's "Chiploop too big to ship"
  problem. `aubio tempo` measured it at **118.7 BPM**, inside the spec's 110–130 BPM range. `aubio beat`
  found a steady groove starting at 8.000 s that repeats every 16.0 s (beats land again at 24.0 s and
  40.0 s, almost exactly 16 s apart), so `assets/sounds/game-music-loop.ogg` is `ffmpeg -ss 8.000 -to
  24.000` cut from the source and re-encoded as Vorbis: a clean 16.0 s loop at the track's own repeat
  point, 243 KB. `ffmpeg` and `aubio` (both open source, installed locally with `brew install ffmpeg
  aubio` for this story) were the tools used; neither ships with the project or is needed to build or
  run it.
- **Tiny Town tile positions** are given as `row, col` (1-indexed) in the packed `Tilemap/tilemap_packed.png`
  sheet (16×16 tiles, no spacing, 12 columns × 11 rows), since the pack's individual `Tiles/tile_NNNN.png`
  files aren't numbered in the same reading order as that sheet.
- **No colour needed pre-shifting before recolouring** (the CC-10.9 cactus-turned-blue problem). The five
  Tiny Town crops use true greens and warm browns, no teal or dusty-rose tones, so `pnpm assets:recolour
  <file> range` mapped every one of them onto the expected `range`/`turf`/`wood`/`straw` shades on the first
  pass. Checked visually with a rendered contact sheet before and after recolouring, and the fence and
  round-tree sprites individually at 8–10× scale.
- **Battle Sound Effects wasn't converted to Ogg.** No Vorbis encoder was available when Quick Draw shipped
  (CC-10.5); this story installed `ffmpeg`, but its `Bow.wav`/`swish_2.wav` are already small (66–97 KB) so
  they ship as `.wav`, matching Quick Draw's `crow-caw.wav` precedent.
- Every sprite is a multiple of the 8 px world grid and passes `pnpm --filter ./tooling/assets run
  check-sprites`. Total asset weight: **~68 KB of sprites, ~740 KB of sounds** (dominated by the two music/wind
  loops), close to Quick Draw's footprint.
- Files and credits only, no playback wiring — that's CC-7. `games/target-range/src/` is untouched: CC-11.4
  (the TV scene) is being built in parallel against placeholders.
