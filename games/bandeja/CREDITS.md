# Bandeja credits

Every CC0 asset Bandeja uses, per the shortlist in
[`docs/games/bandeja.md`](../../docs/games/bandeja.md#cc0-asset-shortlist) (CC-23.5). Hand-drawn
sprites are authored directly on the core + `padel` scene palette, then run through
`pnpm assets:recolour <input> padel` as the documented pipeline step (see
[`docs/HOUSE_STYLE.md`](../../docs/HOUSE_STYLE.md#assets-and-credits)) — every one reported
`0 pixels changed`, confirming they were already on-palette.

**Kenney's site is unreachable from this environment.** Every `kenney.nl` URL failed to fetch on
21 September 2026 with a TLS error ("self signed certificate in certificate chain"), through both
`curl` and this session's web-fetch tool — the same finding the spec itself flags
([`docs/games/bandeja.md`](../../docs/games/bandeja.md#cc0-asset-shortlist), finding 9), still true
today. So no fresh Kenney pack could be downloaded this session. Where the shortlist's Kenney
candidate is a sample already downloaded, extracted and CC0-verified for a shipped game
(`games/strike-night/CREDITS.md`, verified 17–18 September 2026; `games/target-range/CREDITS.md`,
verified 17 September 2026), that exact file is reused here under its original verification —
copied, not re-fetched, so nothing below is claimed as independently re-checked that wasn't. The
OpenGameArt rows were fetched and re-verified live on 21 September 2026 (this story).

Sprites not listed below (`ball.png`, `ball-shadow.png`, `racket-swing.png`, `swing-ring.png`,
`net-band.png`, `glass-band.png`, `mesh-band.png`, `floodlight-pole.png`, `court.png`,
`court-line.png`, `court-deep.png`) are drawn from scratch for Couchcade directly on the
core + `padel` palette, as the spec calls for ("Drawn from scratch: the court surface with its
lines and service boxes, the glass and mesh cage in both its side and far bands, the net with its
tape, the racket prop in 3 swing frames, the ball and its shadow, the floodlight poles, and the
swing ring" — none of the CC0 packs checked have pixel art of a padel court, a cage or a racket at
this size) — no CC0 source, so no credit needed.

| Asset | Author | Source | Licence |
| --- | --- | --- | --- |
| Racket on ball, mishit/ok grade x5 (`assets/sounds/racket-pock-1.ogg` to `-5.ogg`, Impact Sounds `impactWood_light_000` to `_004`, reused from `games/strike-night/assets/sounds/pin-crash-light-*.ogg`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Ball on mesh, the side panels x5 (`assets/sounds/mesh-rattle-1.ogg` to `-5.ogg`, Impact Sounds `impactMetal_light_000` to `_004`, reused from `games/strike-night/assets/sounds/sweep-clunk-*.ogg`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Ball on glass, the back and corner walls (`assets/sounds/glass-ping.ogg`, Interface Sounds `glass_001`, reused from `games/strike-night/assets/sounds/spare-ding.ogg`) | Kenney | https://kenney.nl/assets/interface-sounds | CC0 |
| Point ding (`assets/sounds/point-ding.ogg`, Interface Sounds `bong_001`, reused from `games/target-range/assets/sounds/bullseye-ding.ogg`) | Kenney | https://kenney.nl/assets/interface-sounds | CC0 |
| Match end jingle (`assets/sounds/match-end.ogg`, Music Jingles "Hit jingles/jingles_HIT02", reused from `games/strike-night/assets/sounds/match-end.ogg`) | Kenney | https://kenney.nl/assets/music-jingles | CC0 |
| Net flub, slowed (`assets/sounds/net-flub.mp3`, Impact Sounds `impactSoft_heavy_000`, source reused from `games/target-range/assets/sounds/arrow-thud-straw.ogg`, re-processed with `ffmpeg asetrate=0.75x`) | Kenney | https://kenney.nl/assets/impact-sounds | CC0 |
| Game music loop (`assets/sounds/game-music-loop.ogg`, "Summer Park – 8bit tune (loop)", already Target Range's loop) | Scribe (Daniel Stephens) | https://opengameart.org/content/summer-park-8bit-tune-loop | CC0 |
| Music backup (`assets/sounds/music-backup.mp3`, "Happy Adventure (Loop)", already Strike Night's backup) | TinyWorlds | https://opengameart.org/content/happy-adventure-loop | CC0 |

## Notes for the reviewer

- **Sound files are reused, not re-downloaded.** Every Kenney-sourced `.ogg` above is a byte-copy of
  the exact file already shipped (and CC0-verified) in `games/strike-night/assets/sounds/` or
  `games/target-range/assets/sounds/`, renamed for Bandeja's own cue. This is the same underlying
  licensed asset under the same licence; nothing here is a new, unverified fetch. `net-flub.mp3` is
  the one exception: its source bytes are reused, then re-processed locally with `ffmpeg` (pitch
  dropped 25% via `asetrate`, matching the shortlist's "slowed" instruction) — the processing tool
  is open source and neither ships with the project nor is needed to build or run it.
- **`net-flub.mp3` ships as MP3, not Ogg**, the same fallback Quick Draw's `crow-caw.wav` and
  Strike Night's `game-music-loop.mp3` took: no Vorbis/Opus encoder is available in this
  environment's `ffmpeg` build (only `libmp3lame` and `aac`).
- **The two OpenGameArt music tracks were re-fetched and re-verified live on 21 September 2026**
  (this story): both pages still list CC0, matching the spec's own same-day verification.
- Every sprite is a multiple of the 8 px world grid and passes
  `pnpm --filter ./tooling/assets run check-sprites`. Total asset weight: sprites are all
  well under 1 KB combined (11 tiny PNGs, largest 311 bytes); sounds are ~120 KB (dominated by the
  two reused music/backup tracks).

## Not included in this story

- **Courtside furniture** (benches, planters from Kenney's Roguelike Indoors pack, per the
  shortlist). `kenney.nl` is unreachable from this environment (see above), and no in-repo crop of
  that pack is recoverable — Strike Night's own `bench.png`/`potted-plant.png` are already
  recoloured onto the `alley` palette, not the original pixels, so they can't be re-recoloured onto
  `padel` without a fresh download. Follow-up once the pack can be fetched and its `License.txt`
  checked.
- **`impactBell_heavy` (the "bright" racket tone for a `clean` grade hit).** The shortlist wants
  this pitched against `impactWood_light` ("dull" for `mishit`) so a clean hit sounds brighter than
  a shanked one. Only `impactWood_light` was recoverable in-repo; `racket-pock-*.ogg` above covers
  one tone for now. A brighter `clean`-grade variant is a follow-up once Kenney is reachable again.
- **`impactSoft_medium` (the floor-bounce turf thud).** No in-repo Kenney "Soft" sample besides
  `impactSoft_heavy_000` (used above for the net flub) was recoverable. Follow-up once Kenney is
  reachable again.
- **`impactGlass_light` (the primary glass-ping candidate).** `glass-ping.ogg` above ships the
  shortlist's own listed *backup* (Interface Sounds `glass_001`) instead, since the primary
  candidate couldn't be fetched fresh and no in-repo copy of it exists.
- **Crowd swell on `POINT!`.** Deliberately not sourced: the spec's own finding says
  `@couchcade/audio`'s `celebrate` token already carries a crowd layer, and CC-23.5 should reuse
  that rather than ship a new asset, hunting for a dedicated one only if the playtest (CC-23.7)
  asks for it.
- **Sound playback wiring and the TV scene.** `games/bandeja/src/` is untouched — this story is
  files and credits only, the same split Quick Draw, Target Range and Strike Night shipped their
  own art under. CC-23.4 (TV scene) and whichever story wires `@couchcade/audio` come next.
