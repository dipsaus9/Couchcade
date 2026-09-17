// Copy for the motion step and "Tap to resume", from the approved "Phone: motion" artboards
// (docs/design/platform-screens.md, "Motion"), in the friendly-referee voice. The artboards name
// the game's own move ("swipe up to bowl"). The phone has no game code, so these say "motion" and
// "touch" instead.

export const motionCopy = {
  ask: {
    title: (game: string) => `${game} uses motion`,
    body: "Move your phone to play. Hold on tight.",
    enable: "Tap to enable motion",
    touch: "Use touch instead",
    hint: "Your phone asks for permission next.",
    /** iPhones only: the page can't lock portrait itself (motion.md, owner decision 4). */
    iphoneHint: "Tip: turn on Portrait Orientation Lock",
  },
  starting: {
    title: "Hold your phone still",
    body: "Rest it in your hand for a second so we can find down.",
    hint: "Almost there…",
  },
  ready: {
    title: "Motion is on",
    body: "Watch the TV. The game starts when every phone is ready.",
  },
  touch: {
    title: "Touch controls it is",
    denied: "Motion is off on this phone, so you play with touch. The TV knows.",
    unsupported: "This phone can't use motion here, so you play with touch. The TV knows.",
    ready: "Ready",
    /** The owner checks on a real iPhone whether Safari asks again (CC-5.10 criterion 7). */
    deniedHint: "Want motion? Allow it when the next game asks.",
  },
  acknowledged: {
    title: "Watch the TV",
    body: "You play with touch. The game starts when every phone is ready.",
  },
  resume: {
    title: (name: string) => `Welcome back, ${name}`,
    body: "Your screen went to sleep. Tap to switch motion back on.",
    action: "Tap to resume",
    hint: "Your turn is safe. Nobody skipped you.",
  },
} as const;
