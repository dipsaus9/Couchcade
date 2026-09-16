# Quick Draw credits

Every CC0 asset Quick Draw uses, recoloured onto the `desert` scene palette with
`pnpm assets:recolour <input> desert` (see [`docs/HOUSE_STYLE.md`](../../docs/HOUSE_STYLE.md#assets-and-credits)
and [`docs/games/quick-draw.md`](../../docs/games/quick-draw.md#cc0-asset-shortlist)). Licences were checked on
each source page on 16 September 2026.

Sprites not listed here (`mesa.png`, `tumbleweed.png`, `popgun-bang.png`, `dust-puff.png`, `crow.png`,
`popgun-sparkle.png`) are drawn from scratch for Couchcade, as the game spec calls for, and need no credit.

| Asset | Author | Source | Licence |
| --- | --- | --- | --- |
| Sand ground tile (`assets/sprites/ground-sand.png`, Desert Shooter Pack tile 54) | Kenney | https://kenney.nl/assets/desert-shooter-pack | CC0 |
| Sand ground tile, speckled variant (`assets/sprites/ground-sand-speckled.png`, tile 55) | Kenney | https://kenney.nl/assets/desert-shooter-pack | CC0 |
| Rock pile (`assets/sprites/rock-pile.png`, tile 58) | Kenney | https://kenney.nl/assets/desert-shooter-pack | CC0 |
| Rock boulder (`assets/sprites/rock-boulder.png`, tile 59) | Kenney | https://kenney.nl/assets/desert-shooter-pack | CC0 |
| Cactus, saguaro (`assets/sprites/cactus-saguaro.png`, tile 62) | Kenney | https://kenney.nl/assets/desert-shooter-pack | CC0 |
| Cactus, barrel (`assets/sprites/cactus-barrel.png`, tile 63) | Kenney | https://kenney.nl/assets/desert-shooter-pack | CC0 |
| DRAW sting (`assets/sounds/draw-sting.ogg`, Music Jingles "Hit jingles/jingles_HIT01") | Kenney | https://kenney.nl/assets/music-jingles | CC0 |
| Fake sting (`assets/sounds/fake-sting.ogg`, Music Jingles "Hit jingles/jingles_HIT00") | Kenney | https://kenney.nl/assets/music-jingles | CC0 |
| Round win jingle (`assets/sounds/round-win.ogg`, Music Jingles "Pizzicato jingles/jingles_PIZZI00") | Kenney | https://kenney.nl/assets/music-jingles | CC0 |
| Intro tick (`assets/sounds/intro-tick.ogg`, Interface Sounds "tick_001") | Kenney | https://kenney.nl/assets/interface-sounds | CC0 |
| Glint ting (`assets/sounds/glint-ting.ogg`, Interface Sounds "bong_001") | Kenney | https://kenney.nl/assets/interface-sounds | CC0 |
| Popgun pop (`assets/sounds/popgun-pop.ogg`, Impact Sounds "impactGeneric_light_000") | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Dust puff thud (`assets/sounds/dust-thud.ogg`, Impact Sounds "impactSoft_medium_000") | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Standoff wind loop (`assets/sounds/wind-loop.ogg`) | SketchMan3 | https://opengameart.org/content/wind-whoosh-loop | CC0 |
| Crow caw, fake-out (`assets/sounds/crow-caw.wav`) | zeroisnotnull | https://opengameart.org/content/crow-caw | CC0 |

## Not included in this story

- **Game music loop.** The shortlist's [Chiploop](https://opengameart.org/content/chiploop) (iamoneabe, CC0) is
  confirmed CC0, but its only downloadable file is a ~2 minute, ~1.4-5 MB render, not a short loop — too large for
  the TV bundle and not "short" as this story requires. No audio trimming tool was available in this environment
  (no `ffmpeg`/`sox`; macOS `afconvert` cannot cut a time range or encode mp3). Left as a follow-up for whoever
  wires playback (CC-7): either trim a short segment from Chiploop with a proper audio tool, or pick a smaller
  CC0 loop, and confirm the 110–130 BPM range the spec calls for.
- **Pop backup** ([100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx), rubberduck) was on the shortlist as a
  backup for the popgun pop; skipped since Kenney's Impact Sounds already covers it and downloading a second pack
  for a redundant sound would only grow the bundle.
