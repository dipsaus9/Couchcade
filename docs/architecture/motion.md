# Motion controls

This is the design for using phones as motion controllers: which sensors we read, how iPhones and Android phones get permission, how a phone learns which way is down, what each gesture sends to the TV, the touch fallback for every gesture, and how recorded sensor traces test all of it.

**For the owner.** Read [Decisions at a glance](#decisions-at-a-glance) and [Open decisions for the owner](#open-decisions-for-the-owner). That takes about 15 minutes. The rest is detail for the stories.

**For agents.** Everything after the owner sections is binding for CC-5.2 to CC-5.10 and for every game controller that uses `@couchcade/motion`. [platform.md](platform.md), [security.md](security.md), [session-flow.md](session-flow.md), [platform-screens.md](../design/platform-screens.md), README.md, [TECH_STACK.md](../TECH_STACK.md) and [HOUSE_STYLE.md](../HOUSE_STYLE.md) still apply, and this doc doesn't repeat them. Where this doc, platform.md and a story disagree, stop and flag it. [Conflicts found while writing this doc](#conflicts-with-stories-and-other-docs) lists the ones already known.

Status: waiting for owner approval (CC-5.1).

---

## Contents

- [Decisions at a glance](#decisions-at-a-glance)
- [Open decisions for the owner](#open-decisions-for-the-owner)
- [Words used in this doc](#words-used-in-this-doc)
- [What phones give us](#what-phones-give-us)
- [How Wii-style games map to our gestures](#how-wii-style-games-map-to-our-gestures)
- [Sensor adapter](#sensor-adapter)
- [Permission, calibration and resume flow](#permission-calibration-and-resume-flow)
- [Calibration and the motion frame](#calibration-and-the-motion-frame)
- [Gesture contracts](#gesture-contracts)
- [Fitting the input budget](#fitting-the-input-budget)
- [Safety](#safety)
- [Testing with recorded traces](#testing-with-recorded-traces)
- [Conflicts with stories and other docs](#conflicts-with-stories-and-other-docs)
- [Which story builds what](#which-story-builds-what)
- [Sources](#sources)

---

## Decisions at a glance

Approving this doc approves these.

| # | Decision | In plain words |
|---|---|---|
| 1 | One sensor event on both platforms: `devicemotion` | iPhone Safari and Android Chrome both deliver it at about 60 per second. We don't use the Generic Sensor API, because Safari and Firefox don't have it. |
| 2 | Gyroscope first | Swings, aim and flicks are read from the rotation rate, which is clean and means the same on every phone. The accelerometer finds "down" and catches shakes. |
| 3 | No compass | We never read `deviceorientation` or the magnetometer. Compass readings jump near speakers, laptops and TVs. Aim comes from the gyroscope, and players recentre it. |
| 4 | The phone does the maths | Raw sensor data never leaves the phone. It turns 60 readings a second into one small event per swing, flick or shake, or a few aim or tilt values. That keeps us inside the approved 4 messages per second. |
| 5 | Five gestures, one package | `@couchcade/motion` detects swing, aim, flick, tilt and shake. Games combine them and never read sensors themselves. |
| 6 | Every gesture has a touch fallback with the same event | Swipe for swing and flick, drag for aim, a joystick for tilt, a button for shake. A game can't tell which one the player used, so nobody is stuck. |
| 7 | One tap asks for permission | iPhones only show the motion prompt after a tap, so "Tap to enable motion" is the first step, as in the approved screens. Android doesn't ask. Denied or missing sensors switch to touch at once, and the TV is told. |
| 8 | One second of holding still | Before each motion game the phone measures down and its own gyroscope error. Phone model, grip and platform sign quirks stop mattering after that. |
| 9 | Swings only count while the grip is held | A swing is read only while the thumb holds the on-screen grip. Letting go of the grip is the bowling release. Nothing ever asks a player to let go of the phone. |
| 10 | Timing comes from the phone's clock | Every gesture carries the room-clock time of its peak, so a home run doesn't depend on Wi-Fi speed. |
| 11 | Shots use the aim on the phone | When a player shoots or throws, the input carries where the phone pointed at that moment. The TV's crosshair may trail the hand a little, but the hit is judged on the real aim. |
| 12 | Aim and tilt stream at most 4 messages a second | The phone samples aim 15 times a second and packs up to 4 samples into each message. Tilt is sent only when it changes. |
| 13 | Tests replay recorded motion | `pnpm trace:record` records real swings on real phones as JSON. Detectors are pure code that unit tests feed with those traces, because Playwright can't fake sensors. |
| 14 | Screens stay awake | The phone holds the screen wake lock that session-flow.md already keeps on during the menu and every game. If the screen still locks, "Tap to resume" switches the sensors back on. |

---

## Open decisions for the owner

Each has a recommendation. Everything else in this doc follows from the approved platform, security and session flow docs.

1. **Which game tests the gyroscope first?** You asked for a game that really uses the phone's gyroscope. The candidates are Target Range (hold the phone like a bow, aim with the gyroscope, drag to draw, let go to shoot), Duck Season (a fast pointer at moving birds) and Strike Night (swing and twist for spin).
   **Recommendation: Target Range.** Continuous gyroscope aim is the purest test of the sensor, everyone plays at once so every phone at the party gets tested in one round, and slow bow aiming hides the TV crosshair delay from decision 2. Strike Night follows as the first swing game. Until then, the trace recorder page shows live gyroscope readings for any phone (see [Recording](#recording-cc-59)).
2. **Is a slightly trailing crosshair on the TV acceptable?** At the approved 4 messages a second, the TV shows each phone's aim about 250 ms behind the hand, smoothed so it glides instead of jumping. Shots and throws are always judged on the aim the phone had at that instant, so it's fair, it just looks a little floaty. The alternative is letting aim games send 15 messages a second, which uses almost 4 times the phone budget. 8 phones aiming at that rate would use up the day's free requests in about 15 minutes.
   **Recommendation: accept the smoothed 4 per second.** Revisit only if Duck Season feels wrong in its playtest, or if the 20:1 request ratio is ever confirmed on the free plan, which would raise the phone cap to 15 per second anyway (platform.md).
3. **How hard does a player have to swing for full power?** Option A: speed keeps growing up to the sensor's limit, so the hardest swing always wins. Option B: full power comes at a firm, controlled swing (about 900 degrees a second, a brisk bowling swing), and swinging harder adds nothing.
   **Recommendation: B.** Wild swings with a phone and no wrist strap are how phones hit TVs. Nintendo still asks players to wear straps and leave room ([Nintendo tips](https://play.nintendo.com/news-tips/tips-tricks/tips-tricks-nintendo-switch-sports/)), and we have no strap. Skill comes from timing, angle and spin instead. Each game may tune the full-power point.
4. **Should phones stop the screen rotating during motion games?** iPhones can't lock the page to portrait from the browser ([caniuse](https://caniuse.com/mdn-api_screenorientation_lock)). A sideways swing can flip the page to landscape halfway through a game. Android Chrome can lock portrait, but only in fullscreen.
   **Recommendation: yes, where we can.** On Android, the "Tap to enable motion" tap also enters fullscreen and locks portrait until the game ends. On iPhone, the same screen adds one hint line, "Tip: turn on Portrait Orientation Lock". Motion controllers also stay usable if the page does rotate (see [flow rule 8](#permission-calibration-and-resume-flow)). This adds one line of copy to the approved motion screen.
5. **What about phones without a gyroscope?** Some cheap Android phones only have an accelerometer. The original Wii Remote also had only an accelerometer and still did bowling and tennis, but Nintendo said it couldn't tell the angle of a swing ([Iwata Asks](https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-Wii-MotionPlus/Read-more/1-The-Gyro-Sensor-A-New-Sense-Of-Control/1-The-Gyro-Sensor-A-New-Sense-Of-Control-225595.html)). Option A: those phones use the touch fallback for swing, aim and flick, and keep motion for tilt and shake. Option B: build a second, accelerometer-only swing and flick detector.
   **Recommendation: A.** It is half the tuning work, and the touch fallback already exists and is fair. Build B only if a regular player turns out to have such a phone.

---

## Words used in this doc

| Word | Meaning |
|---|---|
| Sample | One `devicemotion` event, normalised by the adapter. About 60 per second. |
| Rotation rate | How fast the phone turns, in degrees per second, around its three axes. Measured by the gyroscope. |
| Linear acceleration | Acceleration without gravity, in m/s². |
| Gravity vector | Which way is down, measured while the phone is still. |
| Device frame | The phone's own axes: x to the right of the screen, y to the top of the screen, z out of the screen towards the player. It never changes when the page rotates. |
| Motion frame | Our axes after calibration: X to the player's right, Y forward towards the TV, Z up. Every gesture is computed in this frame. |
| Grip | The big on-screen button the player holds with their thumb during a swing. |
| Gesture event | What a detector emits: a swing, flick or shake event, or an aim or tilt value. |
| Fallback | The touch control that emits the same gesture event. |
| Trace | A recorded list of samples plus grip and recentre marks, saved as JSON. |
| Room time | The shared clock from platform.md. Every `at` and `peakAt` is room time in milliseconds. |

---

## What phones give us

Research from 16 September 2026, against specs, browser source code and compatibility data. Items marked **unverified** have no source yet and are checked on real phones by the story named next to them.

### Permission

| | iPhone (Safari, and every iOS browser) | Android (Chrome) |
|---|---|---|
| Prompt | `DeviceMotionEvent.requestPermission()`, since iOS 13 ([WebKit](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/)). Still present in iOS 17, 18 and 26 ([caniuse](https://caniuse.com/mdn-api_devicemotionevent_requestpermission_static)). | No prompt today. Chrome shipped `requestPermission()` too (intent to ship in 151, listed from 152), but the default stays "allow". Google plans to switch the default to "ask", and then Chrome behaves like iOS ([chromestatus](https://chromestatus.com/feature/5915984063889408)). |
| Needs a tap | Yes. It needs transient user activation. Without it, the call rejects with `NotAllowedError` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static)). WebKit checks that a user gesture is being processed ([WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/DeviceOrientationAndMotionAccessController.cpp)). A `click` handler is the safe choice. | The same rule applies once the default changes. |
| Needs HTTPS | Yes ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static)) | Yes. Since Chrome 76 the events never fire on insecure pages ([chromestatus](https://chromestatus.com/feature/5688035094036480)). |
| After "Don't allow" | WebKit keeps the decision per site and returns it without asking again ([WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/WebsiteData/WebDeviceOrientationAndMotionAccessController.cpp)). **Unverified:** whether a reload, a new tab or quitting Safari asks again. An older W3C thread says the decision lasts for the page's lifetime ([W3C list](https://lists.w3.org/Archives/Public/public-device-apis-log/2019Feb/0035.html)). CC-5.10 checks on an iPhone. | Players can block motion sensors in site settings. The page then gets no events, which our adapter treats as unsupported. |
| Motion and orientation | One permission covers both ([WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/DeviceOrientationAndMotionAccessController.cpp)) | n/a |
| Permissions-Policy | Cross-origin iframes need `accelerometer` and `gyroscope` ([WebKit commit](https://github.com/WebKit/WebKit/commit/e8fcdbcc2d499879de1d8812003942b8b91d6bb1)) | Enforced since Chrome 66, default `self` ([chromestatus](https://chromestatus.com/feature/5758486868656128), [spec](https://w3c.github.io/deviceorientation/)). The README's header already allows both for our own origin. |

What that means for us: always call `requestPermission()` when it exists, on any browser, inside a tap. That covers iPhones today and Chrome after its default changes, with no code per platform.

### Rates, frames and units

- **About 60 samples a second on both.** WebKit updates motion every 1/60 s ([WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ios/WebCoreMotionManager.h)). Chromium pumps sensor events at 60 Hz and reports `interval` as 16 ms ([Chromium source](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/device_orientation/device_sensor_event_pump.h)). That's enough for a swing peak, which lasts about 100 ms.
- **Only while visible.** Events fire only while the page is visible, so they stop when the screen locks or the player switches apps ([spec](https://w3c.github.io/deviceorientation/)).
- **Low Power Mode.** WebKit halves the animation frame rate to 30 fps in iOS Low Power Mode ([WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/AnimationFrameRate.cpp)). **Unverified:** whether sensor events slow down too. Traces record `interval`, so CC-5.9 will show it.
- **Device frame.** x points right, y to the top of the screen, z out of the screen. The frame stays with the device when the page rotates ([spec](https://w3c.github.io/deviceorientation/)).
- **Units.** `acceleration` and `accelerationIncludingGravity` are in m/s². A phone lying face up reads about +9.8 on z for `accelerationIncludingGravity` ([spec](https://w3c.github.io/deviceorientation/)).
- **Rotation rate** is in degrees per second, right-handed. `alpha` is around x, `beta` around y and `gamma` around z ([spec](https://w3c.github.io/deviceorientation/)). The spec changed to this to match every browser ([W3C list](https://lists.w3.org/Archives/Public/public-geolocation/2017Aug/0000.html)). Older explainers, including [MDN's](https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Orientation_and_motion_data_explained), still say `alpha` is around z. Ignore them.
- **Nulls.** Any field may be null. WebKit sends null `acceleration` and `rotationRate` when the phone only provides raw accelerometer data ([WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ios/WebCoreMotionManager.mm)).
- **iPhone signs.** WebKit builds `accelerationIncludingGravity` from Core Motion's `userAcceleration + gravity` and doesn't flip the sign ([WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ios/WebCoreMotionManager.mm)). If Core Motion's gravity points towards the ground, as it is usually described, an iPhone lying face up reads −9.8 on z, the opposite of the spec and Android. **Unverified** on a current iPhone. Libraries such as gyronorm.js detect the sign at runtime instead of trusting the platform ([gyronorm.js](https://github.com/dorukeker/gyronorm.js/blob/master/lib/gyronorm.js)). We do the same at calibration (see [Sign conventions](#sign-conventions)).

### What we don't use, and why

| Option | Why not |
|---|---|
| Generic Sensor API (`Gyroscope`, `Accelerometer`, `RelativeOrientationSensor`) | Chromium only. Safari and Firefox don't have it, and the spec itself says it won't become a standard without a second engine ([W3C](https://w3c.github.io/sensors/), [MDN data](https://github.com/mdn/browser-compat-data/blob/main/api/Accelerometer.json)). It's also capped at 60 Hz, so nothing is gained. |
| `deviceorientation` angles | Alpha drifts or jumps with the compass, beta and gamma suffer gimbal lock near vertical, and Samsung Internet once returned absolute values where relative ones were expected ([MDN data](https://github.com/mdn/browser-compat-data/blob/main/api/DeviceOrientationEvent.json), [spec](https://w3c.github.io/deviceorientation/)). We integrate the rotation rate ourselves and correct tilt with gravity, like the Wii MotionPlus did. |
| `screen.orientation.lock()` on iPhone | Not supported in Safari for iOS. Chrome for Android supports it, usually only in fullscreen ([caniuse](https://caniuse.com/mdn-api_screenorientation_lock), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock)). See [open decision 4](#open-decisions-for-the-owner). |
| Vibration for motion feedback | Safari for iOS has no Vibration API ([caniuse](https://caniuse.com/vibration)). |
| WebDriver virtual sensors in E2E | The spec defines virtual sensors for automation ([spec](https://w3c.github.io/deviceorientation/#automation)), but we also test WebKit in Playwright. One fake adapter works everywhere. |

### Staying awake

The Screen Wake Lock API works in Safari from iOS 16.4 and in Chrome. The browser releases the lock when the page is hidden, so the page must request it again when it comes back ([caniuse](https://caniuse.com/wake-lock), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)). It was broken for Home Screen web apps until iOS 18.4 ([WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=254545)). That doesn't affect us, because players use a browser tab.

---

## How Wii-style games map to our gestures

Nintendo's motion games settle most design questions. What we take from them:

| Nintendo game | How it plays | Our gesture | Our game |
|---|---|---|---|
| Wii Sports and Switch Sports bowling | Hold B (ZR on Switch), swing back and forward, let go of the button to release. Twist the wrist for spin ([Wikibooks](https://en.wikibooks.org/wiki/Wii_Sports/Bowling), [Nintendo](https://www.nintendo.com/sg/switch/as8s/bowling/)). | Swing, `emitOn: "release"`, with `spin` | Strike Night |
| Wii Sports and Switch Sports golf | Hold A (ZR) and swing. A swing without the button is a practice swing. Swing force is power, and too much overshoots ([Ducksters](https://www.ducksters.com/games/wii-sports-golf.php), [Nintendo](https://www.nintendo.com/sg/switch/as8s/golf/)). | Swing, `emitOn: "peak"`, speed as power | Putt Club |
| Wii Sports baseball | Timing decides contact, and a harder swing hits harder ([Wikibooks](https://en.wikibooks.org/wiki/Wii_Sports/Baseball)). | Swing with `peakAt` and `speed` | Dinger Derby |
| Wii Sports tennis | Players run automatically. The swing picks forehand or backhand, and timing aims the ball ([Giant Bomb](https://giantbomb.com/wiki/Games/Wii_Sports), [Nintendo](https://www.nintendo.com/sg/switch/as8s/tennis/)). The serve toss with the free hand was deliberately ignored ([Iwata Asks](https://www.nintendo.com/en-za/Iwata-Asks/Iwata-Asks-Wii/Iwata-Asks-Wii-Sports/3-Serving-an-Imaginary-Ball-/3-Serving-an-Imaginary-Ball--217876.html)). | Swing with the sign of `angle` and `peakAt` | Bandeja |
| Wii Sports Resort archery | Hold the buttons, pull back, aim the reticle by moving the remote, let go to fire ([Nintendo wiki](https://nintendo.fandom.com/wiki/Archery_(Wii_Sports_Resort))). | Aim, plus a drag-and-release on the screen | Target Range |
| Pub darts, Wii Party style | Point, then flick | Aim and flick | Double Top |
| Duck Hunt, Switch Sports recentring | Point at the screen, press a button to recentre ([Game8](https://game8.co/games/Nintendo-Switch-Sports/archives/376158)) | Aim with `recentre()` | Duck Season |
| Mario Party Bumper Balls | Steer by tilting | Tilt and shake | Bumper Sumo |

Lessons that became decisions:

1. **Hold a button to swing.** Nintendo does it in bowling (B, then ZR) and golf (A, then ZR). It stops accidental swings and gives a natural release. That is decision 9.
2. **Gyroscope for angle, accelerometer for down.** Nintendo said the Wii Remote's accelerometer could detect a straight swing but not the angle of the club face, which is why the MotionPlus gyroscope came ([Iwata Asks](https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-Wii-MotionPlus/Read-more/1-The-Gyro-Sensor-A-New-Sense-Of-Control/1-The-Gyro-Sensor-A-New-Sense-Of-Control-225595.html)). The gyroscope alone drifted, and "the accelerometer proved very useful in correcting it" ([Iwata Asks](https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-Wii-MotionPlus/Read-more/2-Combining-Two-Sensors/2-Combining-Two-Sensors-225646.html)). The accelerometer only fixes pitch and roll, never yaw ([WiiBrew](https://wiibrew.org/wiki/Wiimote/Extension_Controllers/Wii_Motion_Plus)). That is decisions 2 and 3, and why aim has a recentre.
3. **Keep calibration short.** Reviewers disliked Wii Sports Resort asking for recalibration before almost every game ([Nintendo World Report](http://www.nintendoworldreport.com/review/19125/wii-sports-resort-wii)). Ours is one automatic second of holding still, with no pose to learn.
4. **Simple mappings win.** Nintendo ignored motions that didn't add fun, like the serve toss. Each of our games reads at most two gestures.
5. **Straps and space.** Nintendo still shows strap and space warnings ([Wikipedia](https://en.wikipedia.org/wiki/Wii_Remote), [Nintendo tips](https://play.nintendo.com/news-tips/tips-tricks/tips-tricks-nintendo-switch-sports/)). Phones have no strap, so we rely on the grip and a capped power curve. See [Safety](#safety).

Web precedent is thin. Most phone-controller platforms use buttons and only detect shakes. [shake.js](https://github.com/alexgibson/shake.js/blob/master/shake.js) fires when two axes change by more than 15 between samples, with a 1,000 ms timeout. [AirConsole's controls](https://github.com/AirConsole/airconsole-controls) use the same idea with a lower threshold. [joy-con-webhid](https://github.com/tomayac/joy-con-webhid) runs a complementary filter like our pose tracker, and [sensor-zoo](https://github.com/tszheichoi/sensor-zoo) compares filters and replays recorded sensor logs in Node, the pattern our trace tests follow. The swing, flick and tilt rules below are our own designs built on these parts, so their defaults are tuned with recorded traces before the first motion game ships.

---

## Sensor adapter

Built in `packages/motion/src/sensors/` (CC-5.2). It is the only code in the repo that touches `DeviceMotionEvent`.

```ts
export type Vec3 = { x: number; y: number; z: number };

export type MotionSample = {
  t: number;                     // event.timeStamp, ms, same time base as touch events
  interval: number;              // event.interval, ms, for diagnostics only
  acceleration: Vec3 | null;     // m/s², device frame, gravity removed by the platform
  gravityAcceleration: Vec3 | null; // accelerationIncludingGravity, m/s², device frame, as delivered
  rotationRate: { alpha: number; beta: number; gamma: number } | null; // deg/s around x, y and z (current W3C spec and all browsers)
};

export type MotionPermission = "granted" | "denied" | "unsupported";
export type MotionCapability = "full" | "accelerometer" | "none";

export interface MotionAdapter {
  request(): Promise<MotionPermission>;  // call from a tap handler, before any await
  start(listener: (sample: MotionSample) => void): () => void; // returns stop()
  capability(): MotionCapability;        // known after the first samples arrive
}

export function createBrowserAdapter(): MotionAdapter;
export function createFakeAdapter(): MotionAdapter & {
  setPermission(result: MotionPermission): void;
  play(trace: Trace, options?: { speed?: number }): Promise<void>; // pushes samples on their timestamps
  push(sample: MotionSample): void;
};
```

Rules:

1. **Permission.** `request()` calls `DeviceMotionEvent.requestPermission()` when it exists, synchronously inside the tap handler. No `await` may run before that call, or the browser rejects it for lacking a user gesture. Where the function doesn't exist (Chrome before 151, Samsung Internet, Firefox), `request()` returns `granted` after it has checked that `DeviceMotionEvent` exists and the page is a secure context.
2. **Unsupported.** `request()` returns `unsupported` when `DeviceMotionEvent` is missing, the page isn't a secure context, or `requestPermission()` throws. After `granted`, the adapter waits up to 1,000 ms for a sample with non-null data. If none arrives, capability is `none` and the flow treats the phone as unsupported. An event whose fields are all null doesn't count.
3. **Capability.** `full` when `rotationRate` has numbers. `accelerometer` when only the acceleration fields do. `none` otherwise. Swing, aim and flick need `full`. Tilt and shake work with `accelerometer`.
4. **Raw values.** The adapter passes values as the browser delivered them, with `NaN` turned into `null`. Calibration detects and fixes the gravity sign (see [Sign conventions](#sign-conventions)). Nothing after calibration checks the platform.
5. **Visibility.** The adapter removes its listener when `document.visibilityState` becomes `hidden` and doesn't add it back on its own. The controller shows "Tap to resume", and the tap calls `request()` and `start()` again. Resuming inside a tap also covers browsers that want a fresh gesture.
6. **One listener.** However many detectors run, the adapter holds one `devicemotion` listener and fans samples out.
7. **Fake in tests.** Unit tests and E2E tests use `createFakeAdapter()`. The controller picks its adapter from one module, `apps/controller/src/motion/adapter.ts`, which returns the fake only in dev and test builds when Playwright sets `window.__couchcadeMotion` with `addInitScript` (CC-1.17 criterion 2). Production builds never read that global.
8. **No throttling.** The adapter passes every sample on. Detectors need the full rate to find peaks. Rate limits apply to messages, not to samples.
9. **Bundle.** `@couchcade/motion` has no npm dependencies. It is small vector maths, and the phone's 80 KB budget matters more than a library.

---

## Permission, calibration and resume flow

The screens are the approved "Phone: motion" artboards in [platform-screens.md](../design/platform-screens.md#motion). CC-5.10 builds the flow in `apps/controller/src/motion/`.

```mermaid
sequenceDiagram
  autonumber
  participant P as Phone
  participant S as Browser sensors
  participant H as Host
  H->>P: controller:state motion-permission (game needs motion)
  Note over P: "Strike Night uses motion"<br/>Tap to enable motion / Use touch instead
  alt Tap to enable motion
    P->>S: requestPermission() inside the tap, wake lock request
    S-->>P: granted, denied or unsupported
    opt granted
      P->>S: listen, wait up to 1 s for real data
      Note over P: "Hold your phone still"<br/>1 s still, give up after 5 s
    end
  else Use touch instead
    Note over P: status is denied
  end
  P->>H: motion:status { status } (1 request)
  Note over P: denied or unsupported: "Touch controls it is", Ready
  H->>P: game starts; controller uses motion or its fallback
```

1. **When.** The host shows the step when the selected game has `needsMotion`. It runs once per game, not once per night. A phone that already granted permission in this page session still shows the screen, but its tap resolves at once without a prompt and goes straight to "Hold your phone still". Calibration runs before every motion game, because players change grip between games.
2. **Status.** The phone sends one `motion:status` per motion game. "Use touch instead" sends `denied`. `unsupported` covers no sensors, no gyroscope when the game needs one, and a failed secure-context check. That is 1 request per phone per game.
3. **The choice is per phone.** The game controller reads the local result and mounts either the motion detector or the fallback. The host doesn't treat touch players differently. Games may show a small touch icon next to a player on the TV, nothing more.
4. **Waiting.** session-flow.md moves from `motion-check` to `playing` when every phone in the game has answered. This doc adds a limit: after 20 seconds the host starts anyway, and phones that haven't answered play with touch, so one phone left on a table can't hold up the room. See [conflicts](#conflicts-with-stories-and-other-docs): no story owns the host side of this yet.
5. **Wake lock.** session-flow.md decision 9 keeps the screen wake lock on during the menu and every game (CC-5.10 builds it). The motion step's enable tap and every resume tap request it again with `navigator.wakeLock.request("screen")` if the API exists, because the browser drops the lock whenever the page is hidden. Where the API is missing, nothing else is tried. No looping hidden video tricks.
6. **Resume.** When the page comes back from `hidden` during a motion game, the controller covers the screen with the approved "Tap to resume" big action. The tap restarts the adapter and the wake lock. Calibration from before the sleep is kept. Aim recentres at the player's next turn or draw.
7. **Mid-game denial.** If the adapter reports no samples for 2 seconds while the page is visible, the controller switches that player to the fallback for the rest of the game and sends `motion:status { status: "unsupported" }`.
8. **Orientation.** Motion maths uses the device frame, which ignores page rotation, so gestures work whatever the page does. During a motion game the controller doesn't show the "rotate your phone" error screen, and motion controllers are laid out so a single centred grip or pad works in either orientation. See [open decision 4](#open-decisions-for-the-owner) for locking portrait.

---

## Calibration and the motion frame

Built in `packages/motion/src/calibration/` (CC-5.3). It turns device-frame samples into motion-frame values every detector shares.

### Rest calibration

1. **Still.** The phone is still when, for 1,000 ms without a break, every rotation rate magnitude is under 10 deg/s and the gravity-including acceleration magnitude stays within 0.5 m/s² of its running mean. Accelerometer-only phones use the second test only.
2. **Captured.** The mean `gravityAcceleration` over that second becomes `up0`, a unit vector in the device frame. The mean rotation rate becomes the gyroscope bias, subtracted from every later sample. The median `interval` is kept for diagnostics.
3. **Timeout.** After 5 seconds without a still second the phone takes the latest 250 ms average and a zero bias, and carries on. A shaky hand never blocks a game. The approved "Almost there…" hint stays on screen meanwhile.

### The motion frame

- **Up (Z)** is `up0`.
- **Forward (Y)** is the horizontal part of the device vector `y − z`, normalised. A portrait phone held anywhere between flat and upright has its top edge (`+y`) or its back (`−z`) facing away from the player, so this points at the TV when the player faces it. If the horizontal part is shorter than 0.2 (the phone is held on its side), forward falls back to the horizontal part of `+x` rotated by −90°.
- **Right (X)** is `Y × Z`.
- Units stay degrees per second and m/s². Angles are degrees. Output values are rounded as each contract says.

### Pose tracker

Swing, aim, flick and tilt need to know how the phone is turned right now, not only at rest. One tracker runs per controller:

1. Integrate the bias-corrected rotation rate into an orientation quaternion, using each sample's `t` difference, capped at 50 ms so a stalled event doesn't jump.
2. Correct pitch and roll towards the measured gravity direction with a complementary filter: gain 0.02 per sample, applied only while the acceleration magnitude is within 1.5 m/s² of 9.81. During a swing the accelerometer is ignored and the gyroscope carries the pose.
3. Yaw (turning around up) can't be corrected without a compass, so it slowly drifts. Aim fixes this with recentring. Swings and flicks only use yaw over a second or two, where drift doesn't matter.
4. Accelerometer-only phones have no tracker. Tilt reads a low-pass filtered gravity vector instead (time constant 100 ms), and shake uses the raw magnitude.

### Sign conventions

Everything after calibration uses the W3C signs: a phone lying face up reads about +9.8 on z.

1. **Don't trust the platform.** iPhones may report `accelerationIncludingGravity` and `acceleration` with the opposite sign ([What phones give us](#rates-frames-and-units)). That is unverified, and a user-agent check would break the day WebKit changes. So calibration measures it.
2. **The screen faces the player.** During "Hold your phone still" the player is reading the screen. With W3C signs, a portrait phone held anywhere between flat face up and upright reads a gravity vector with `y + z > 0`. If the still-second mean has `y + z < −2` m/s², the browser reports gravity inverted. Calibration then stores `inverted = true` and negates both acceleration fields of every later sample for the rest of the page session.
3. **Unclear pose.** If `|y + z| <= 2` m/s² (the phone is on its side), calibration keeps the last decision from this page session, or W3C signs if there is none.
4. **Rotation rate is never flipped.** Both WebKit and Chrome convert the platform's right-handed rates straight to degrees per second, which matches the spec. CC-5.3 proves it with a test: integrating the rotation rate over a recorded tilt must predict the gravity change the accelerometer saw. The first real iPhone trace from CC-5.9 settles points 1 and 4 for good.
5. **Traces record raw values.** A trace keeps the samples exactly as the browser delivered them and stores the detected sign in `rawSigns`, so tests replay both conventions (CC-5.3 criterion 2).

---

## Gesture contracts

Built in `packages/motion/src/gestures/` and `packages/motion/src/fallbacks/` (CC-5.4 to CC-5.8). These are the shapes games put in their own input schemas. A detector and its fallback emit exactly the same shape, so a game can't tell them apart.

### Rules for every gesture

1. **Detectors are pure.** Each is `createXDetector(config)` returning `{ push(sample), mark(event), reset() }` plus an `on(listener)` for events. No timers, no `Date.now()`, no DOM. Time comes only from sample `t` and mark timestamps. That's what makes traces replay exactly.
2. **Fallbacks are pure too.** Each fallback takes pointer events already reduced to `{ t, x, y, type }` in CSS pixels and emits the same events. The Vue components that feed them live in `@couchcade/ui` or the game controller.
3. **Times.** `at` and `peakAt` are room time: the local event or sample time passed through the same `toHostTime` the send helper uses (platform.md). Integers.
4. **Rounding.** Values from 0 to 1 and −1 to 1 are rounded to 2 decimals. Degrees are rounded to whole numbers. Smaller messages, and no fake precision.
5. **Thresholds are config.** Every number below is a default in the detector's config. Games may override the ones marked "game may tune". Defaults are tuned with traces from CC-5.9 before the first motion game ships.
6. **Directions.** Right and forward are positive: to the player's right, towards the TV, up, clockwise as the player sees it.
7. **Capability.** A detector that needs `full` capability is never created on an `accelerometer` phone. The controller mounts the fallback instead.

### Swing (CC-5.4)

For Strike Night, Putt Club, Dinger Derby and Bandeja.

**Event**

| Field | Type | Meaning |
|---|---|---|
| `speed` | 0 to 1 | How hard the swing was. 0 at the threshold, 1 at full speed. |
| `angle` | degrees, −180 to 180 | Which way the phone was travelling at the peak, in the horizontal plane. 0 is towards the TV, positive is to the player's right. A straight bowl is near 0. A right-hander's forehand crosses the body to the left (negative) and a backhand to the right (positive). |
| `spin` | −1 to 1 | Wrist twist around the phone's long axis near the peak. Positive is clockwise as the player sees it, which curves a bowling ball to the right. |
| `peakAt` | room time, ms | When the swing was fastest. Timing games judge this. |

**Detection**

1. The detector only listens while the grip is held (`mark({ type: "grip-down" | "grip-up", t })`). On grip-down it captures the current pose as the swing's reference, so forward means forward at that moment.
2. A swing starts when the rotation rate magnitude passes 120 deg/s and ends when it stays under 60 deg/s for 100 ms, or at grip-up.
3. The peak is the sample with the highest rotation rate magnitude. A swing whose peak is under `minPeak` (240 deg/s, game may tune) emits nothing.
4. `speed = clamp((peak − minPeak) / (fullPeak − minPeak), 0, 1)`, with `fullPeak` 900 deg/s (game may tune). See [open decision 3](#open-decisions-for-the-owner).
5. `angle`: linear acceleration rotated into the reference frame and summed over the 200 ms before the peak gives a velocity direction. `angle = atan2(v.X, v.Y)` in degrees.
6. `spin`: mean rotation rate around the device `y` axis (`rotationRate.beta`) over the 120 ms up to the peak, divided by 540 deg/s, clamped.
7. **When it emits** (game config `emitOn`):
   - `"release"` (Strike Night): at grip-up, using the last swing that peaked in the 300 ms before it. Grip-up without such a swing emits nothing, so a player can let go and grip again.
   - `"peak"` (Putt Club, Dinger Derby, Bandeja): when each swing ends, with a 400 ms cooldown. Grip-up just stops listening.

**Touch fallback: swipe** (`fallbacks/swing.ts`)

- Touching the swipe pad is the grip. Lifting the finger is grip-up.
- A swipe up the pad of at least 60 CSS px is a swing. Shorter swipes emit nothing.
- `speed` maps the peak finger speed over any 50 ms window from 300 px/s (0) to 2,400 px/s (1).
- `angle` is the direction of the last 80 px of the swipe: `atan2(dx, −dy)` in degrees, so straight up is 0 and right is positive.
- `spin` is how far the path bends: the midpoint's sideways distance from the straight line between start and end, divided by half that line's length, clamped. A path bending right is positive.
- `peakAt` is the time of the fastest window. `emitOn` works the same: `"release"` emits on lift, `"peak"` as soon as the swipe passes 60 px and slows down.

**Touch fallback: tap** (for Dinger Derby and Bandeja, where timing is the whole game)

- A tap on the pad emits `{ speed: 0.7, angle, spin: 0, peakAt }` with `peakAt` the `pointerdown` time. `angle` is −60 for the left half of the pad and 60 for the right half, so Bandeja's forehand and backhand still work. The game spec picks swipe or tap.

### Aim (CC-5.5)

For Target Range, Double Top and Duck Season.

**Value**

| Field | Type | Meaning |
|---|---|---|
| `yaw` | −1 to 1 | Left and right from the recentre point. Positive is right. |
| `pitch` | −1 to 1 | Down and up from the recentre point. Positive is up. |

**Detection**

1. The phone points with its top edge (`+y`), like a remote aimed at the TV.
2. `recentre()` stores the current pose. Games call it when a turn or draw starts, and Duck Season also offers a "Point at the TV and tap" recentre.
3. `yaw` is the rotation around up (motion Z) since recentre. `pitch` is the change in the top edge's elevation, which the tracker keeps honest with gravity, so pitch never drifts.
4. Range: ±25° of yaw and ±15° of pitch map to ±1, clamped (game may tune). About what a TV fills from the couch.
5. Rolling the wrist doesn't move the aim, because yaw and pitch are measured around world axes, not the phone's.

**Sending**

- The phone takes one aim sample every 66 ms (15 per second).
- It sends through the CC-3.6 input stream (`set`, see session-flow.md), which allows at most 4 messages per second. The value is the rolling window of the latest samples, as `aim: [[dtMs, yaw, pitch], …]`, at most 4 of them, newest last. `dtMs` is each sample's offset from the input's `at`, so it is 0 for the newest and negative for older ones. The stream's latest-wins rule means each message carries the samples taken since the last one. Four samples are about 60 bytes.
- A sample that moved less than 0.01 from the last one sent is skipped. A phone held still sends nothing.
- Only the player whose turn it is streams aim in turn-based games (Double Top). Simultaneous games (Target Range, Duck Season) stream for every player who is aiming.
- The TV plays the samples back about 250 ms behind, so the crosshair moves smoothly rather than in 4 jumps a second. See [open decision 2](#open-decisions-for-the-owner) and [conflicts](#conflicts-with-stories-and-other-docs).

**Touch fallback: drag** (`fallbacks/aim.ts`)

- The pad works like a laptop touchpad: dragging moves the aim relative to where it was. 200 CSS px of drag is the full yaw range and 150 px the full pitch range, clamped to ±1.
- A "Centre" button, or the game's recentre moment, sets both back to 0.
- Samples and sending are the same as for motion.

### Flick (CC-5.6)

For Double Top.

**Event**

| Field | Type | Meaning |
|---|---|---|
| `power` | 0 to 1 | How sharp the flick was. |
| `direction` | degrees, −30 to 30 | Sideways pull during the flick, relative to where the phone was aiming. Positive is right. |
| `wobble` | 0 to 1 | How much the wrist twisted or swerved instead of flicking cleanly. The game turns it into scatter with the seeded RNG. |
| `at` | room time, ms | The moment of release (the flick's peak). |

**Detection**

1. The detector runs while aim is active and the player holds the throw grip.
2. A flick is a forward wrist snap: the top edge pitches down faster than `minRate` (300 deg/s, game may tune), with linear acceleration over 6 m/s² within 100 ms of that peak. Lowering the phone calmly never reaches that.
3. `power = clamp((|peak pitch rate| − 300) / (1,200 − 300), 0, 1)`.
4. `direction` is the yaw change over the 150 ms before the peak, clamped to ±30°.
5. `wobble` is the RMS of yaw and roll rates divided by the RMS of pitch rate over the same 150 ms, clamped to 1.
6. One flick per grip, then a 800 ms cooldown.
7. The throw input also carries the aim sample at `at`, so the dart lands where the phone pointed, not where the TV crosshair had got to.

**Touch fallback: swipe** (`fallbacks/flick.ts`)

- A swipe up the pad of at least 60 px throws.
- `power` uses the same finger speed mapping as the swing swipe.
- `direction` is the swipe direction from straight up, clamped to ±30°.
- `wobble` is the RMS sideways distance of the path from its straight line, divided by the swipe length, times 4, clamped.
- `at` is the time of the fastest window. The throw carries the drag aim, like motion.

### Tilt (CC-5.7)

For Bumper Sumo, and Paddle Panic's optional tilt.

**Value**

| Field | Type | Meaning |
|---|---|---|
| `x` | −1 to 1 | Tilt left and right. Positive when the right edge dips. |
| `y` | −1 to 1 | Tilt away and towards. Positive when the top edge dips away from the player. |

**Detection**

1. Tilt is how far the current pose has turned away from the rest pose captured at calibration: `x` is the roll angle around the forward axis (Y) and `y` is the pitch angle around the right axis (X), in degrees, signed so that dipping the right edge and dipping the top edge away are positive. On accelerometer-only phones the angles come from the low-pass gravity vector compared with `up0`.
2. 25° of tilt is full scale (game may tune).
3. **Dead zone.** A radial dead zone of 0.15 around rest. Inside it the value is `{ x: 0, y: 0 }`. Outside it the length is rescaled from 0.15..1 to 0..1, so the stick doesn't jump at the edge.
4. Values are rounded to 0.05. A value is only sent when it changed.
5. While the linear acceleration is over 12 m/s² (a shake or a bump), tilt holds its last value for 200 ms, so a dash doesn't jerk the steering.
6. Paddle Panic uses `x` only.

**Sending.** Through the CC-3.6 input stream with `set`, so only changes go out, at most 4 messages per second.

**Touch fallback: joystick** (`fallbacks/tilt.ts`)

- An adapter turns the nipplejs vector from `@couchcade/ui` (CC-4.5) into `{ x, y }`: right is positive `x`, up the screen is positive `y`, the same dead zone, rescaling and rounding.
- Paddle Panic's drag slider is its own primary control. Tilt is the option there, not the fallback.

### Shake (CC-5.8)

For Bumper Sumo's dash.

**Event**

| Field | Type | Meaning |
|---|---|---|
| `at` | room time, ms | When the shake landed. |

A dash is a dash. Strength isn't part of it, so the button fallback is never weaker or stronger than a real shake.

**Detection**

1. Magnitude is the length of `acceleration` when present, else `gravityAcceleration` minus the filtered gravity vector.
2. A shake is two peaks over 14 m/s² within 400 ms, pointing in roughly opposite directions (their dot product is negative). `at` is the second peak.
3. **Hysteresis.** After emitting, the detector re-arms only once the magnitude has stayed under 4 m/s² for 300 ms. A long shake is one dash.
4. **Cooldown.** At least 700 ms between events. The game has its own dash cooldown on top.
5. Works on accelerometer-only phones.

**Touch fallback: button** (`fallbacks/shake.ts`)

- The dash button emits `{ at }` with the `pointerdown` time. The same 700 ms cooldown applies.

---

## Fitting the input budget

Platform.md caps each phone at 4 input messages per second, at least 250 ms apart, and says every incoming message costs one Durable Object request. Motion adds nothing on top of that cap.

| Gesture | Kind | Messages it causes |
|---|---|---|
| Swing | Event | 1 per swing. A bowling frame is 1 or 2, a baseball at-bat a handful. |
| Flick | Event | 1 per dart |
| Shake | Event | At most 1 per 700 ms, fewer after the game's cooldown |
| Aim | Stream | At most 4 per second while moving, 0 while still. 15 samples per second packed inside. |
| Tilt | Stream | At most 4 per second while changing, 0 while held steady |
| `motion:status` | Once | 1 per phone per motion game |

Rules:

1. **All of a phone's input shares one input stream.** A game never runs two CC-3.6 streams side by side, so a phone can't exceed 4 per second by combining gestures.
2. **Streams use `set`, events use `fire`.** Aim and tilt are continuous values sent with `set` (latest wins per input type). Swing, flick and shake are discrete events sent with `fire`, which session-flow.md sends before any pending `set` value. The event's sample time goes in as `eventTimeStamp`, so the input's `at` is when the player acted, however long it waited for a slot. For Bumper Sumo that means `set({ type: "tilt", payload: { x, y } })` and `fire({ type: "dash", payload: { at } })`.
3. **Fire payloads carry the aim.** A throw or shot puts the aim sample at the moment of firing in its own payload, as session-flow.md rule 6 asks, for example Double Top's `fire({ type: "throw", payload: { flick, aim: { yaw, pitch } } })`. The TV never looks the aim up from the stream.
4. **No raw data.** Samples, filter state and traces never go over the socket. A game input carrying more than 4 aim samples, or any sample array, fails review.
5. **Worst case is the cap.** An 8-player real-time motion game at 4 per second is exactly what platform.md already budgets for real-time play. Turn-based motion games (Strike Night, Putt Club, Double Top) sit far below it.
6. **Size.** The largest motion input, 4 aim samples, or a flick with its aim, is under 150 bytes, well inside the 1 KB cap.

---

## Safety

People will swing phones in a living room. The design keeps that calm:

1. **Grip-hold.** Swings and flicks only count while the thumb holds the grip. The grip is the big action circle from the house style, in the lower half of the screen, at least 56 px. Holding it forces a firm grip. A dropped grip mid-swing is a bowling release, never a thrown phone, because no gesture needs the phone to leave the hand.
2. **Full power at a firm swing.** Speed and power max out at a controlled swing (900 deg/s for swings, 1,200 deg/s for flicks), so swinging wildly gains nothing. See [open decision 3](#open-decisions-for-the-owner).
3. **Copy.** The approved permission screen says "Hold on tight." Game specs add a one-line space reminder on the first motion turn, in the referee voice, for example "Room to swing? Go for it."
4. **Touch is always allowed.** "Use touch instead" is on the permission screen for anyone who'd rather not swing, for any reason.
5. **No vibration dependency.** Haptics stay a bonus (HOUSE_STYLE). iPhones don't vibrate from the browser.
6. **Game night guide.** CC-9.5 tells the host to clear some space and suggests phone cases with a wrist strap.

---

## Testing with recorded traces

Playwright can't emulate motion sensors (TECH_STACK.md), so detectors are tested as pure code with recorded and synthetic traces, and E2E tests use the fake adapter.

### Recording (CC-5.9)

1. `pnpm trace:record` runs the controller's `trace:record` script. It starts a dev-only Vite page at `apps/controller/src/dev/trace-recorder/` and prints the `cloudflared` command for an HTTPS tunnel, because phones only give sensors to secure pages.
2. On the phone: pick a gesture and label, tap "Enable motion", hold still for calibration, press and hold the record button (it doubles as the grip), perform the gesture, release, then Save or Discard.
3. The page shows live rotation rate, acceleration and the measured sample interval, so the owner can check any phone's gyroscope works without starting a game.
4. Save posts the trace to a dev-server-only endpoint that writes `packages/motion/test/traces/<gesture>/<platform>-<label>.json`. The endpoint exists only in the recorder's Vite config, never in the Worker or a production build.
5. Traces contain no personal data: no user agent, no names, only the platform and a free-text phone model the recorder types.

### Trace format (version 1)

Documented in `packages/motion/test/traces/README.md` (CC-5.9).

```json
{
  "v": 1,
  "gesture": "swing",
  "label": "bowling-straight-medium",
  "platform": "ios",
  "device": "iPhone 15",
  "recordedAt": "2026-09-20",
  "rawSigns": "w3c",
  "expect": { "events": 1, "fields": { "speed": [0.4, 0.8], "angle": [-15, 15] } },
  "marks": [[1200, "grip-down"], [2830, "grip-up"]],
  "samples": [
    [0, 16.7, [0.01, -0.03, 0.12], [0.1, 6.2, 7.6], [1.2, -0.4, 0.3]],
    [16.7, 16.7, [0.02, -0.05, 0.10], [0.1, 6.3, 7.5], [1.5, -0.2, 0.1]]
  ]
}
```

| Field | Meaning |
|---|---|
| `v` | Format version. Readers reject other versions. |
| `gesture` | `swing`, `aim`, `flick`, `tilt`, `shake`, or `still` for "nothing should fire" traces. |
| `label` | Kebab-case description, unique per gesture and platform. |
| `platform` | `ios` or `android`. |
| `device` | Free text. |
| `rawSigns` | How the browser reported gravity: `w3c` or `inverted`. The fake adapter applies the adapter's normalisation, so tests cover both. |
| `expect` | What a detector with default config should produce: an event count and allowed ranges per field. Recorded traces get these from the recorder's label and are checked by hand once. |
| `marks` | `[t, type]` for `grip-down`, `grip-up`, `recentre`, in ms from the first sample. |
| `samples` | `[t, interval, acceleration, gravityAcceleration, rotationRate]`. `t` in ms from the first sample. Vectors are `[x, y, z]` in m/s² and rotation rate is `[alpha, beta, gamma]` in deg/s, all as the browser delivered them, rounded to 3 decimals. A missing field is `null`. |

A 3-second swing at 60 Hz is about 15 KB. Keep traces under 10 seconds.

### Test layers

1. **Synthetic traces.** `@couchcade/motion/sensors` exports `synthetic` builders (CC-5.2) that make traces from simple curves (a swing is a half-sine rotation rate pulse with a given peak), in the same format. Every detector's unit tests use these for thresholds, signs and edge cases: below threshold, two swings, grip released early, a stalled sensor.
2. **Recorded traces.** Each gesture keeps at least one real trace per platform once CC-5.9 exists. The optional owner action in CC-5.9 records swings, flicks, tilts and shakes on an iPhone and an Android phone. Tests assert the `expect` ranges.
3. **Fallback tests.** Recorded pointer paths as `{ t, x, y, type }` arrays, asserting the same event shape as the motion detector.
4. **Calibration tests.** The same trace with `rawSigns` `w3c` and `inverted` must give the same motion-frame values (CC-5.3 criterion 2).
5. **E2E.** Playwright injects the fake adapter (CC-1.17), sets `granted` or `denied`, and plays a synthetic trace into the controller. CC-5.10's spec covers both branches. Game bot matches drive the fallback or the fake adapter, whichever is simpler.
6. **Manual check.** Before a motion game's owner playtest, the story records one real trace per gesture it uses on both platforms and confirms the defaults still fit.

---

## Conflicts with stories and other docs

Found while writing this doc. None changes a decision the owner already approved.

| # | Where | Conflict | Resolution in this doc | Action |
|---|---|---|---|---|
| 1 | CC-5.5 criterion 2 | "Aim is sent through the CC-3.6 batching helper at ≤ 15 Hz", but platform.md allows 4 messages per second | 15 Hz is the sampling rate. Samples travel packed, at most 4 messages per second. | Reword the criterion with `backlog-plan` amend mode. |
| 2 | CC-5.10 References | The host side of the motion step (show the step, wait for every `motion:status` or 20 seconds, the touch icon) is in `apps/host`, which no CC-5 story lists | Rule 4 of the [flow](#permission-calibration-and-resume-flow) defines it | Add `apps/host/src/motion/` to CC-5.10, or a new CC-5 story |
| 3 | CC-3.6 | The TV needs a pure helper to play aim samples back 250 ms behind. Host code may not import `@couchcade/motion` (platform.md import rule 7). | The helper belongs in `@couchcade/game-sdk/input`, next to the batching helper | Add a criterion to CC-3.6, or a small new story, before CC-11.4 |
| 4 | Approved motion-denied screen | The hint "Want motion? Allow it when the next game asks." may be wrong on iPhone, where WebKit returns the saved denial without asking again | CC-5.10 checks it on a real iPhone first | If the next game doesn't ask again, CC-5.10 proposes the recovery that works (for example "close this tab and join again") for a one-line owner OK |
| 5 | Dinger Derby and Bandeja epics | They name a "tap fallback", while CC-5.4 names a swipe fallback | `fallbacks/swing.ts` offers both, and the game spec picks one | None. Inside CC-5.4's References. |
| 6 | CC-5.9 References | Starting a dev page from `pnpm trace:record` needs a `trace:record` script in `apps/controller/package.json` and a Vite config for the recorder, both outside the listed folders | The recorder's Vite config and save endpoint live in `apps/controller/src/dev/trace-recorder/`. Only the script line touches `package.json`. | Add `apps/controller/package.json` to CC-5.9's References |
| 7 | Open decision 4 | Adds a hint line to the approved motion screen | Only if the owner approves decision 4 | None |

---

## Which story builds what

| Area | Story |
|---|---|
| This doc | CC-5.1 |
| Sensor adapter, permission request, visibility, fake adapter | CC-5.2 |
| Rest calibration, motion frame, pose tracker, sign normalisation | CC-5.3 |
| Swing detector with swipe and tap fallbacks | CC-5.4 |
| Aim with recentre, 15 Hz samples through the input stream, drag fallback | CC-5.5 |
| Flick detector with swipe fallback | CC-5.6 |
| Tilt with dead zone, input stream, joystick adapter | CC-5.7 |
| Shake detector with button fallback | CC-5.8 |
| Trace recorder page and trace format README | CC-5.9 |
| Permission step, calibration screen, `motion:status`, wake lock, tap to resume, E2E | CC-5.10 |
| Input stream that aim, tilt and events go through | CC-3.6 |
| E2E sensor injection hook | CC-1.17 |
| Joystick component | CC-4.5 |
| Game controllers that combine gestures | CC-11.3, CC-12.3, CC-13.3, CC-14.3, CC-15.3, CC-17.3, CC-21.3, CC-22.3, CC-23.3 |
| Game night advice on space and permissions | CC-9.5 |

---

## Sources

Checked on 16 September 2026. Browser behaviour changes, so check again before relying on a detail marked unverified.

**Specs and browser data**
- DeviceOrientation Event spec (frames, units, rotation rate axes, visibility, Permissions-Policy, automation): https://w3c.github.io/deviceorientation/
- Rotation rate axes changed to match browsers: https://lists.w3.org/Archives/Public/public-geolocation/2017Aug/0000.html
- `DeviceMotionEvent.requestPermission()`: https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static
- `requestPermission()` support: https://caniuse.com/mdn-api_devicemotionevent_requestpermission_static
- Generic Sensor API status: https://w3c.github.io/sensors/
- Generic Sensor API support: https://github.com/mdn/browser-compat-data/blob/main/api/Accelerometer.json
- `DeviceOrientationEvent` support and Samsung Internet note: https://github.com/mdn/browser-compat-data/blob/main/api/DeviceOrientationEvent.json
- Older MDN explainer with the outdated axis mapping: https://developer.mozilla.org/en-US/docs/Web/API/Device_orientation_events/Orientation_and_motion_data_explained
- Screen orientation lock: https://caniuse.com/mdn-api_screenorientation_lock and https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock
- Screen Wake Lock: https://caniuse.com/wake-lock and https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
- Vibration: https://caniuse.com/vibration

**WebKit (iPhone)**
- Safari 13 motion permission: https://webkit.org/blog/9674/new-webkit-features-in-safari-13/
- Permission and user gesture check: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/dom/DeviceOrientationAndMotionAccessController.cpp
- Saved decision per origin: https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/WebsiteData/WebDeviceOrientationAndMotionAccessController.cpp
- Permission lifetime discussion: https://lists.w3.org/Archives/Public/public-device-apis-log/2019Feb/0035.html
- Third-party iframes: https://github.com/WebKit/WebKit/commit/e8fcdbcc2d499879de1d8812003942b8b91d6bb1
- 60 Hz update interval: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ios/WebCoreMotionManager.h
- Core Motion to `devicemotion` conversion: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ios/WebCoreMotionManager.mm
- Low Power Mode frame rate: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/AnimationFrameRate.cpp
- Wake lock in Home Screen apps: https://bugs.webkit.org/show_bug.cgi?id=254545

**Chromium (Android)**
- Secure context requirement: https://chromestatus.com/feature/5688035094036480
- Permissions-Policy for sensor events: https://chromestatus.com/feature/5758486868656128
- `requestPermission()` in Chrome: https://chromestatus.com/feature/5915984063889408
- 60 Hz event pump: https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/device_orientation/device_sensor_event_pump.h

**Nintendo and motion games**
- Wii Sports bowling: https://en.wikibooks.org/wiki/Wii_Sports/Bowling
- Switch Sports bowling, golf and tennis: https://www.nintendo.com/sg/switch/as8s/bowling/, https://www.nintendo.com/sg/switch/as8s/golf/, https://www.nintendo.com/sg/switch/as8s/tennis/
- Switch Sports tips, straps and space: https://play.nintendo.com/news-tips/tips-tricks/tips-tricks-nintendo-switch-sports/
- Wii Sports baseball: https://en.wikibooks.org/wiki/Wii_Sports/Baseball
- Wii Sports golf: https://www.ducksters.com/games/wii-sports-golf.php
- Wii Sports tennis: https://giantbomb.com/wiki/Games/Wii_Sports
- Iwata Asks, serving an imaginary ball: https://www.nintendo.com/en-za/Iwata-Asks/Iwata-Asks-Wii/Iwata-Asks-Wii-Sports/3-Serving-an-Imaginary-Ball-/3-Serving-an-Imaginary-Ball--217876.html
- Iwata Asks, the gyro sensor: https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-Wii-MotionPlus/Read-more/1-The-Gyro-Sensor-A-New-Sense-Of-Control/1-The-Gyro-Sensor-A-New-Sense-Of-Control-225595.html
- Iwata Asks, combining two sensors: https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-Wii-MotionPlus/Read-more/2-Combining-Two-Sensors/2-Combining-Two-Sensors-225646.html
- Wii MotionPlus hardware and drift: https://wiibrew.org/wiki/Wiimote/Extension_Controllers/Wii_Motion_Plus
- Wii Remote hardware and strap history: https://wiibrew.org/wiki/Wiimote and https://en.wikipedia.org/wiki/Wii_Remote
- Wii Sports Resort archery: https://nintendo.fandom.com/wiki/Archery_(Wii_Sports_Resort)
- Wii Sports Resort recalibration complaint: http://www.nintendoworldreport.com/review/19125/wii-sports-resort-wii
- Switch Sports recentring: https://game8.co/games/Nintendo-Switch-Sports/archives/376158

**Web implementations and techniques**
- shake.js: https://github.com/alexgibson/shake.js/blob/master/shake.js
- AirConsole controls: https://github.com/AirConsole/airconsole-controls
- gyronorm.js, runtime gravity sign: https://github.com/dorukeker/gyronorm.js/blob/master/lib/gyronorm.js
- joy-con-webhid complementary filter: https://github.com/tomayac/joy-con-webhid
- sensor-zoo filters and log replay: https://github.com/tszheichoi/sensor-zoo
- Android motion sensors, gravity low-pass and gyroscope bias: https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion
- Android game rotation vector without magnetometer: https://source.android.com/docs/core/interaction/sensors/sensor-types
- 1€ filter for pointer smoothing: https://gery.casiez.net/1euro/
