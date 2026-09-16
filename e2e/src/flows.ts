import { expect, type Page } from "@playwright/test";
import { hostPasscode } from "./dev-vars.ts";

// Steps that most specs share, driven through the real screens the way a person would.

/** Types the host passcode into the TV's form and returns the room code the lobby shows. */
export async function openRoom(host: Page, passcode = hostPasscode()): Promise<string> {
  await host.getByLabel("Host passcode").fill(passcode);
  await host.getByRole("button", { name: "Open room" }).click();
  // The code tiles carry an aria-label like "Room code A B C D".
  const code = host.getByLabel(/^Room code \S( \S)+$/);
  await expect(code).toBeVisible();
  const label = (await code.getAttribute("aria-label")) ?? "";
  return label.replace("Room code", "").replaceAll(" ", "");
}

/** Joins a room on a phone by typing the code and a name, and waits for the lobby. */
export async function joinRoom(phone: Page, code: string, name: string): Promise<void> {
  await phone.getByLabel("Room code").fill(code);
  await phone.getByLabel("Your name").fill(name);
  await phone.getByRole("button", { name: "Join" }).click();
  await expect(phone.getByRole("heading", { name: `You're in, ${name}` })).toBeVisible();
}

/** Counts a page's open relay sockets (`/ws/<code>`). Start it before the page connects. */
export function trackRelaySockets(page: Page): { open(): number } {
  let open = 0;
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).pathname.startsWith("/ws/")) return;
    open++;
    socket.on("close", () => open--);
  });
  return { open: () => open };
}
