import { pipParts } from "@couchcade/utils/pips";
import type { PhoneToRelayMessage, PipProfile } from "@couchcade/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playerRecordKey, type PlayerStorageLike } from "../../src/pips/pip-record.ts";
import { createPipCustomiser } from "../../src/pips/use-pip-customiser.ts";

function fakeStorage(initial: Record<string, string> = {}): PlayerStorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const seated: PipProfile = { skin: 0, hair: 0, hairColour: 0 };
const stored: PipProfile = { skin: 3, hair: 5, hairColour: 2 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createPipCustomiser", () => {
  it("reconciles once on creation when the stored Pip differs from the seated one", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "Noor", profile: stored }),
    });
    const sent: PhoneToRelayMessage[] = [];
    createPipCustomiser({
      you: { name: "Noor", profile: seated },
      send: (m) => sent.push(m),
      storage,
    });

    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([{ t: "player:profile", d: { profile: stored } }]);
  });

  it("sends nothing on creation when the stored Pip already matches the seated one", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "Noor", profile: seated }),
    });
    const sent: PhoneToRelayMessage[] = [];
    createPipCustomiser({
      you: { name: "Noor", profile: seated },
      send: (m) => sent.push(m),
      storage,
    });

    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([]);
  });

  it("setPart updates the profile, persists it and sends the change (AC 1, 2)", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "Noor", profile: seated }),
    });
    const sent: PhoneToRelayMessage[] = [];
    const customiser = createPipCustomiser({
      you: { name: "Noor", profile: seated },
      send: (m) => sent.push(m),
      storage,
    });

    customiser.setPart("hair", 4);
    expect(customiser.profile.value).toEqual({ ...seated, hair: 4 });
    // Persisted straight away, before the network send (pips.md "Writing").
    expect(JSON.parse(storage.getItem(playerRecordKey) as string).profile).toEqual({
      ...seated,
      hair: 4,
    });

    vi.advanceTimersByTime(400);
    expect(sent).toEqual([{ t: "player:profile", d: { profile: { ...seated, hair: 4 } } }]);
  });

  it("shuffle draws a different look, persists it and sends it", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "Noor", profile: seated }),
    });
    const sent: PhoneToRelayMessage[] = [];
    const customiser = createPipCustomiser({
      you: { name: "Noor", profile: seated },
      send: (m) => sent.push(m),
      storage,
    });

    customiser.shuffle();
    const shuffled = customiser.profile.value;
    expect(shuffled).not.toEqual(seated);
    expect(shuffled.skin).toBeGreaterThanOrEqual(0);
    expect(shuffled.skin).toBeLessThan(pipParts.skin);

    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([{ t: "player:profile", d: { profile: shuffled } }]);
  });

  it("creates and stores a fresh random Pip on a phone's first visit (no stored record)", () => {
    const storage = fakeStorage();
    const customiser = createPipCustomiser({
      you: { name: "Noor", profile: seated },
      send: () => {},
      storage,
    });

    const saved = JSON.parse(storage.getItem(playerRecordKey) as string);
    expect(saved).toEqual({ v: 1, name: "Noor", profile: customiser.profile.value });
  });

  it("dispose cancels a pending send", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "Noor", profile: seated }),
    });
    const sent: PhoneToRelayMessage[] = [];
    const customiser = createPipCustomiser({
      you: { name: "Noor", profile: seated },
      send: (m) => sent.push(m),
      storage,
    });

    customiser.setPart("skin", 2);
    customiser.dispose();
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([]);
  });
});
