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
- **`lobby-loop.ogg` is the shortlist's primary, "Adventure Begins Loop"**, re-cut in CC-7.7 after
  the follow-up above turned out to matter: the original CC-7.3 cut (0 to 22.154 s, "12 bars at
  130 BPM") wrapped from full-level audio into a near-silent gap at the seam (measured: a
  4303-of-32768 sample jump and a music-bus RMS drop from 4839 to 1335 between the last and first
  30 ms, i.e. the file's own end was loud and its own start was quiet). CC-7.7 re-downloaded the
  original, uncut 58.986 s track from the same OpenGameArt zip and measured its real tempo with a
  beat-grid fit (aubio's onset times against a 16th-note grid, searched jointly over tempo and
  phase for the best autocorrelation-style score): **97.494 BPM**, not 130 — `docs/architecture/
  audio.md`'s "Lobby loop" table (12 bars, 130 BPM measured) is now known wrong and is flagged to
  the owner as a documentation follow-up, not corrected here (that doc is owner-approved). At
  97.494 BPM a bar is 2.4617 s, so 9 bars is 22.155 s, close to the original cut's length by
  coincidence of the wrong-BPM math, but not its seam. The exact loop points were then chosen with
  a small (±6 ms) sample-accurate search around the 9-bar grid boundary, minimizing the jump
  between the sample just before the loop end and the sample at the loop start (and their local
  slopes): the chosen points (`startS: 0.030204s`, `endS: 22.178821s`, both in
  `apps/host/src/audio/platform-sounds.ts`) scored 31.25 on that cost versus a median of about
  7.85 million across 500 candidate points spread through the track (0th percentile — strictly
  better than every one of them) and versus 19.0 million for the original cut. Re-encoding to lossy
  Vorbis reintroduces some of that discontinuity (the encoder's own block boundaries don't line up
  with a hard file start/end), so the shipped file is **not** a bare 22.15 s loop: it's the track
  from 0 s through about 0.53 s past `endS` (about 22.68 s of audio, encoder unchanged from CC-7.3's
  `ffmpeg`/`Lavc63.1.101 vorbis`, since this environment's `ffmpeg` has no `libvorbis`), with
  `platform-sounds.ts` using `loop: { startS, endS }` (already supported by `@couchcade/audio`,
  previously unused here) instead of `loop: true` over the whole buffer — Web Audio's own
  `AudioBufferSourceNode.loopStart`/`loopEnd` then loop only the 0.030204 s to 22.178821 s span
  sample-accurately, so the lossy encoder's real edge artifacts, now about half a second past
  `endS`, are never heard. Measured after that re-encode, at the actual loop points: a
  41-of-32768 jump (down from 1356 with a bare hard-edge encode of the same cut, and from 4303 in
  the original file) — about 0.12% of full scale. Level: normalised to -2.9 dBFS peak, matching the
  rest of the platform's -3 dBFS convention. This agent still has no ears; "verified" above means
  measured with `ffprobe`/`ffmpeg volumedetect` and the sample-jump/RMS script described, not
  listened to — the doc's own manual TV check is still the first real listen.
- Every file above is OGG Vorbis (HOUSE_STYLE "Music", `docs/architecture/audio.md` "Loading, formats
  and size" rule 1). `apps/host/public/audio/` totals **~340.5 KB** (`press.ogg` 7.2 KB, `ui.ogg` 4.6 KB,
  `scene.ogg` 9.9 KB, `your-turn.ogg` 13.3 KB, `celebrate.ogg` 44.1 KB, `foul.ogg` 9.1 KB — 88.2 KB for
  the six tokens together — and `lobby-loop.ogg` 252.3 KB), inside the 500 KB platform budget, the
  150 KB token budget and the 350 KB lobby-loop budget (`docs/architecture/audio.md`, "Size budget").
- CC-7.3 had no playback wiring; CC-7.7 adds `press`/`scene`/`ui` wiring in `apps/host/src/` for the
  moments `docs/architecture/audio.md`'s token table left unwired after CC-7.4 (see this repo's
  `apps/host/src/audio/`, `MenuScreen.vue`, `App.vue`, `use-host-session.ts`).
