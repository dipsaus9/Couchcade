# Running a game night 🎮

You're the host. This is everything you need, start to finish. Ten minutes, tops.

---

## 1. Open the host screen

Couchcade lives at your deployed site, something like `https://couchcade.<your-account>.workers.dev` (a custom domain works too, if you set one up). The host screen is the same address with `/host/` on the end.

- **Laptop plugged into the TV over HDMI?** Open that address in **Chrome**, on `/host/`, full screen. Done.
- **Casting instead?** Open the same page in **Chrome** on your laptop, then use Chrome's Cast button (or "Cast..." in the menu) to send that tab to your Chromecast. Couchcade doesn't have its own Chromecast app — you're casting the browser tab itself, so keep that tab in front and awake. Don't switch to another tab while a game's running; a cast tab in the background can lag.

Either way, everyone else joins on their own phone — nobody else needs a laptop or the TV.

## 2. The passcode

Opening a room needs the **host passcode** — one shared word or phrase, picked when Couchcade was set up. Type it into the "Open a room" field. It's a password field (dots, not letters) because the laptop screen is often the TV, and it's only used for this one request — it's not stored anywhere. Get it wrong and you'll see "That passcode doesn't match. Try again."

You only need it once: after the room opens, refreshing the host tab doesn't ask again for as long as that room is alive. Players never need the passcode — it only gates *you* opening a room.

Lost it, or want a new one? Whoever set Couchcade up can rotate it (`npx wrangler secret put HOST_PASSCODE`). Rotating it doesn't kick anyone out of a room that's already open — it only changes what's needed to open the *next* one.

## 3. Check the TV lag (once)

Some TVs and Chromecasts show the picture a beat late, which matters for games where timing counts. At the top of the lobby there's a **Check TV lag** button (it lights up once the room's connected).

Tap it, and every player's phone shows a flash to tap along with — a few practice beats, then the real ones. Each player's last tap time shows in the lobby in milliseconds. You can **Skip** it any time, or **Try again** if a round of taps looked off.

You only need to do this once per laptop-and-TV setup — Couchcade remembers it in that browser for next time. Re-run it if you swap TVs, swap laptops, or a game feels unfair on timing.

## 4. Everyone joins by QR

The lobby's join panel has a QR code and, below it, the room's 4-letter code in big tiles.

- **With a camera:** point any phone's camera at the QR code. It opens Couchcade with the room already filled in — no app to install.
- **No camera, or it won't scan:** players go to the address shown under the QR code and type the 4-letter room code by hand.

Either way they pick a name and they're in. Up to 8 players get a seat; anyone joining after that watches as audience and gets pulled in automatically once a seat opens. Someone joining mid-game gets seated right away and plays from the next game, so latecomers are never left out.

## 5. Motion permission

Games that use motion (swing, aim, tilt) ask each phone for it separately, right before that game starts. The player sees "*\<Game\>* uses motion" with a big **Tap to enable motion** button (and a **Use touch instead** button if they'd rather not).

Tapping it triggers their phone's own permission prompt — that's the browser asking, not Couchcade, so tell players to tap **Allow**. After that the phone asks them to hold it still for a second ("so we can find down"), then says "Motion is on" and they're ready. iPhone players also get a hint to turn on Portrait Orientation Lock, since Couchcade can't lock the screen for them.

Say no, or motion isn't supported on that phone? It falls back to touch automatically — the game still works, the TV knows, and nobody's stuck. If a phone's screen sleeps mid-game, it shows "Tap to resume" when they pick it back up; their turn is still waiting for them, nobody gets skipped.

## 6. If you hit the daily free limit

Couchcade runs entirely on Cloudflare's free tier, so it's €0 — but "free" comes with a daily request budget that resets at 00:00 UTC (02:00 in the Netherlands in summer). One normal two-hour night comfortably fits; a *second* long night of real-time games on the same day might not.

**Right now**, hitting that limit doesn't show a message that says "you've hit the free limit" — the apps don't have a dedicated screen for it yet. What you'll actually see is one of the ordinary retry messages:

- On the host, trying to open a room: "**Couldn't open a room. Try again in a minute.**"
- On a phone, trying to join or reconnect: "**The room didn't answer. Try again in a moment.**"

If that happens near the end of a long session, it's very likely the daily budget, not a bug. There's nothing to fix on your end — just wait for the reset at 00:00 UTC and open a new room then. (A clearer, dedicated "quota reached" screen is on the way — see backlog story CC-9.4 — and once that ships, this section can point at it directly instead.)

---

That's the whole night. Open the host, enter the passcode, check the TV lag once, let everyone scan in, let motion games ask for permission, and if things go quiet very late at night, it's probably just Cloudflare's clock, not a crash.
