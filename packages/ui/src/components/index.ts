/**
 * `@couchcade/ui/components`: the Clubhouse building blocks for phones and menus.
 *
 * Every colour, size and duration comes from the `--cc-*` CSS variables of `@couchcade/theme`.
 * Apps declare them once, for example with a `<style>` holding `toCssVars()`.
 */
export { default as CcBigAction } from "./CcBigAction.vue";
export { default as CcButton } from "./CcButton.vue";
export { default as CcPanel } from "./CcPanel.vue";
export { default as CcPlayerChip } from "./CcPlayerChip.vue";
export { default as CcPlayerShape } from "./CcPlayerShape.vue";
export type { BigActionState, ButtonTrigger, ButtonVariant, PlayerId, Screen } from "./types.ts";
