import type { PhoneToRelayMessage, PipProfile } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { playerRecordKey, type PlayerStorageLike } from "../../src/pips/pip-record.ts";
import { reconcileOnEntry } from "../../src/pips/reconcile.ts";

function fakeStorage(initial: Record<string, string> = {}): PlayerStorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const seated: PipProfile = { skin: 0, hair: 0, hairColour: 0 };
const remembered: PipProfile = { skin: 3, hair: 5, hairColour: 2 };

describe("reconcileOnEntry", () => {
  it("sends the remembered Pip once when it differs from the room's seated look", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "Noor", profile: remembered }),
    });
    const sent: PhoneToRelayMessage[] = [];
    reconcileOnEntry({ name: "Noor", profile: seated }, (m) => sent.push(m), storage);

    expect(sent).toEqual([{ t: "player:profile", d: { profile: remembered } }]);
  });

  it("sends nothing when the remembered Pip already matches the seated one", () => {
    const storage = fakeStorage({
      [playerRecordKey]: JSON.stringify({ v: 1, name: "Noor", profile: seated }),
    });
    const sent: PhoneToRelayMessage[] = [];
    reconcileOnEntry({ name: "Noor", profile: seated }, (m) => sent.push(m), storage);

    expect(sent).toEqual([]);
  });

  it("runs independent of the customiser: a first visit still stores a fresh random Pip", () => {
    const storage = fakeStorage();
    const sent: PhoneToRelayMessage[] = [];
    reconcileOnEntry({ name: "Noor", profile: seated }, (m) => sent.push(m), storage);

    const saved = JSON.parse(storage.getItem(playerRecordKey) as string);
    expect(saved.v).toBe(1);
    expect(saved.name).toBe("Noor");
    // The "differs"/"matches" cases above already cover whether a reconcile send follows; a
    // freshly-drawn random Pip's send outcome depends on real crypto, so it isn't asserted here.
  });
});
