/**
 * `apps/controller/src/pips`: the "Make your Pip" customiser (docs/architecture/pips.md
 * "Customiser"), the `couchcade:player` record it reads and writes, and the send rule that keeps
 * a customising phone inside its message budget.
 */
export {
  browserPlayerStorage,
  ensureStoredPlayer,
  loadStoredPlayer,
  playerRecordKey,
  saveStoredPlayer,
  type PlayerStorageLike,
  type StoredPlayer,
} from "./pip-record.ts";
export { firstRandomPip, shufflePip } from "./random-pip.ts";
export {
  createProfileSender,
  type ProfileSender,
  type ProfileSenderOptions,
} from "./profile-sender.ts";
export { profileToReconcile } from "./sync.ts";
export { reconcileOnEntry } from "./reconcile.ts";
export {
  createPipCustomiser,
  type PipCustomiser,
  type PipCustomiserOptions,
} from "./use-pip-customiser.ts";
export { default as PipCustomiserPanel } from "./PipCustomiser.vue";
