/**
 * Plays `scene` on every phase change on the TV (docs/architecture/audio.md's token table:
 * "scene... Every phase change on the TV"). A sibling watch callback to phase-music.ts's
 * `applyPhaseMusic`, on the same `screen.value.name` (`HostScreen["name"]`) App.vue already
 * watches -- Vue's `watch` only calls its callback on an actual change, never on setup, so this
 * never fires for the very first screen a fresh TV shows.
 */
import { audio } from "@couchcade/audio";

export function applyPhaseScene(): void {
  audio.play("scene");
}
