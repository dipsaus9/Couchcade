# Platform sound credits

Every CC0 sound and loop the platform ships in `public/audio/`, picked from the shortlist in
[`docs/architecture/audio.md`](../../docs/architecture/audio.md#cc0-sources-for-platform-sounds-and-lobby-music)
(see [`docs/HOUSE_STYLE.md`](../../docs/HOUSE_STYLE.md#assets-and-credits)). Licences were checked on each
source page on 17 September 2026, the same day as the shortlist. Files are the primary pick from each row of
the shortlist unless noted below; every file is cut, faded, levelled and encoded to OGG Vorbis with `ffmpeg`
(`ffmpeg` and `aubio`, both open source, installed locally for this story; neither ships with the project or
is needed to build or run it).

| Asset | Author | Source | Licence |
| --- | --- | --- | --- |
| Press tock (`audio/press.ogg`, "Wood block hit") | thomasjaunism | https://freesound.org/people/thomasjaunism/sounds/218460/ | CC0 |
| UI pop (`audio/ui.ogg`, "cartoon pop or drip") | AlaskaRobotics | https://freesound.org/people/AlaskaRobotics/sounds/221091/ | CC0 |
| Scene whoosh (`audio/scene.ogg`, "Whoosh") | qubodup | https://freesound.org/people/qubodup/sounds/60013/ | CC0 |
| Your-turn whistle (`audio/your-turn.ogg`, "Referee whistle sound.wav") | Rosa-Orenes256 | https://freesound.org/people/Rosa-Orenes256/sounds/538422/ | CC0 |
| Celebrate chime (`audio/celebrate.ogg`, notes layer, Digital Audio `threeTone2.ogg`) | Kenney | https://kenney.nl/assets/digital-audio | CC0 |
| Celebrate crowd (`audio/celebrate.ogg`, crowd layer, "Short Crowd Cheer 2.flac") | qubodup | https://freesound.org/people/qubodup/sounds/182572/ | CC0 |
| Foul buzzer (`audio/foul.ogg`, "Wrong Buzzer") | KevinVG207 | https://freesound.org/people/KevinVG207/sounds/331912/ | CC0 |
| Lobby loop (`audio/lobby-loop.ogg`, "Adventure Begins Loop", Happy Chiptunes (Collection)) | Holizna | https://opengameart.org/content/happy-chiptunes-collection | CC0 |

## Notes for the reviewer

- **Downloaded, not hand-picked by ear.** Freesound's high-quality OGG preview needs no account
  (audio.md CC0 sources rule 4), so every Freesound row above was fetched from its page's own preview
  stream (`https://cdn.freesound.org/previews/<id>/<id>_<user>-hq.ogg`), the same CC0 work as the
  original upload. Kenney's Digital Audio pack and OpenGameArt's Happy Chiptunes Collection were
  downloaded as their published zip. This agent has no ears, so "listens before it commits a file"
  (audio.md, CC-7.3 rules) was done as level-matching with `ffmpeg volumedetect`/`volume` instead of
  a literal listen: every token's peak was normalised to about -3 dBFS, `your-turn.ogg` and
  `foul.ogg` were brought down further (-4 dB and -7.7 dB respectively) per the shortlist's own notes
  that the whistle is shrill and the buzzer "is mastered very loud", and each is cut with a short
  (15-30 ms) fade-out so there's no edge click. **Follow-up:** the doc's own manual check (Testing
  item 7, before CC-7.4 is Done) is the first time anyone actually listens to these on a TV; if
  `foul.ogg` or `your-turn.ogg` still reads wrong there, re-level or swap to the shortlist's backup
  (`buzzer.wav`/hypocore or "Referee whistle blow, gymnasium.wav"/SpliceSound) at that point.
- **`celebrate.ogg` mixes two sources**, per the shortlist's own instruction ("two CC0 sources mixed
  into one file"). `threeTone2.ogg`'s first three onsets (`aubio onset`: 0.049 s, 0.182 s, 0.275 s)
  are its "first run", trimmed to 0-0.4 s. The crowd cut (`Short Crowd Cheer 2.flac` preview, trimmed
  to 1.5 s with a 20 ms fade-in and a 300 ms fade-out) starts at the third note's onset, 275 ms in, so
  it comes in "under the last note" as the shortlist describes, and the mix runs 1.77 s end to end.
- **`lobby-loop.ogg` is the shortlist's primary, "Adventure Begins Loop"**, cut from its start to
  22.154 s (12 bars at the shortlist's 130 BPM: `12 × 4 × 60 / 130`). This agent's own `aubio tempo`
  read the downloaded file at 101.46 BPM, not 130 BPM — tempo detection is prone to
  half/double/triplet octave errors and this agent could not resolve the discrepancy by ear. The
  130 BPM figure is the owner-approved one from `docs/architecture/audio.md` (CC-7.1), so the cut
  length follows it; either way the track is titled and described as "made to loop" and the cut
  starts at 0 s, its own top. **Follow-up:** confirm the loop's tempo and seam by ear alongside the
  manual check above, and re-cut if the seam isn't clean.
- Every file above is OGG Vorbis (HOUSE_STYLE "Music", `docs/architecture/audio.md` "Loading, formats
  and size" rule 1). `apps/host/public/audio/` totals **~303 KB** (`press.ogg` 7.2 KB, `ui.ogg` 4.6 KB,
  `scene.ogg` 10.0 KB, `your-turn.ogg` 13.3 KB, `celebrate.ogg` 44.1 KB, `foul.ogg` 9.1 KB — 88.3 KB for
  the six tokens together — and `lobby-loop.ogg` 214.2 KB), inside the 500 KB platform budget, the
  150 KB token budget and the 350 KB lobby-loop budget (`docs/architecture/audio.md`, "Size budget").
- No playback wiring in this story — that's CC-7.4. `apps/host/src/` is untouched.
