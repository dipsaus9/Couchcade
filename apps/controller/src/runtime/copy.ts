// Copy around a game controller, in the friendly-referee voice (docs/HOUSE_STYLE.md, "Voice").

/** A game this build doesn't have, or its controller failed to load. Reloading fetches the new build. */
export const missingGameCopy = {
  title: "That game isn't on this phone yet.",
  body: "Reload the page.",
} as const;

/** While the controller's code downloads. */
export const loadingControllerCopy = {
  title: "Watch the TV",
  body: "Your controller is on its way.",
} as const;
