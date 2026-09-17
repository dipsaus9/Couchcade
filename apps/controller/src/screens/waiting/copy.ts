import { choosingName } from "../menu/menu-view.ts";
import type { PhoneState } from "../../session/state.ts";

export interface WaitingCopy {
  title: string;
  body: string;
  hint?: string;
}

/** What the waiting screen says while connecting, while the TV is away and between screens. */
export function waitingCopy(state: Exclude<PhoneState, { status: "join" }>): WaitingCopy {
  if (state.status === "connecting") {
    return {
      title: `Joining room ${state.session.code}`,
      body: "Finding your spot.",
      hint: "Keep this page open.",
    };
  }
  if (!state.online) {
    return {
      title: "Connection lost",
      body: `Reconnecting you as ${state.you.name}. Keep this page open.`,
    };
  }
  if (!state.hostConnected) {
    return { title: "Waiting for the TV", body: "The TV is reconnecting. Keep this page open." };
  }
  // A late joiner or promoted audience member while a game runs or its results show.
  if (state.view?.screen === "next-game") {
    return {
      title: "Next game soon",
      body: "You're in. You play from the next game.",
      hint: "Watch the TV until then.",
    };
  }
  if (state.gameId === null && state.view?.screen === "vip-choosing") {
    const name = choosingName(state.view);
    return {
      title: "Watch the TV",
      body: name === null ? "The VIP is choosing a game." : `${name} is choosing a game.`,
      hint: "Your controller shows up here when it starts.",
    };
  }
  return {
    title: "Watch the TV",
    body: "Your controller shows up here when it starts.",
  };
}
