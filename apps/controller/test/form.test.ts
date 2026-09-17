import { EN_NAME_BLOCKLIST } from "@couchcade/utils/names";
import { describe, expect, it } from "vitest";
import { nameHint } from "../src/join/copy.ts";
import {
  checkJoinForm,
  checkName,
  cleanRoomCodeInput,
  nameLength,
  normaliseName,
  roomCodeFromSearch,
  type NameProblem,
} from "../src/join/form.ts";

describe("roomCodeFromSearch", () => {
  it("pre-fills the code from /?room=CODE", () => {
    expect(roomCodeFromSearch("?room=BEAN")).toBe("BEAN");
  });

  it("accepts a lower case or padded code from a retyped link", () => {
    expect(roomCodeFromSearch("?room=bean")).toBe("BEAN");
    expect(roomCodeFromSearch("?room=%20BEAN%20")).toBe("BEAN");
  });

  it("ignores anything that isn't a room code", () => {
    for (const search of [
      "",
      "?room=",
      "?room=BEA",
      "?room=BEANS",
      "?room=B1AN",
      "?room=BIOS",
      "?code=BEAN",
      "?room=<b>X</b>",
    ]) {
      expect({ search, code: roomCodeFromSearch(search) }).toEqual({ search, code: null });
    }
  });
});

describe("cleanRoomCodeInput", () => {
  it("keeps up to 4 letters, upper case", () => {
    expect(cleanRoomCodeInput("be an!")).toBe("BEAN");
    expect(cleanRoomCodeInput("beans")).toBe("BEAN");
    expect(cleanRoomCodeInput("b3")).toBe("B");
  });
});

describe("name rules", () => {
  it("normalises spaces before counting", () => {
    expect(normaliseName("  Sam   the  Man ")).toBe("Sam the Man");
    expect(nameLength("  Sam  ")).toBe(3);
  });

  it("counts characters, not UTF-16 units", () => {
    expect(nameLength("Zoë")).toBe(3);
    expect(nameLength("🙂🙂")).toBe(2);
  });

  it("requires 1 to 12 characters", () => {
    expect(checkName("")).toBe("empty");
    expect(checkName("    ")).toBe("empty");
    expect(checkName("S")).toBeNull();
    expect(checkName("Twelve chars")).toBeNull();
    expect(checkName("Thirteen char")).toBe("too-long");
  });

  it("runs the same allowlist and blocklist as the Worker", () => {
    expect(checkName("Zoë")).toBeNull();
    expect(checkName("Sam 🙂")).toBe("character");
    expect(checkName("- _ -")).toBe("no-letter");
    expect(checkName(EN_NAME_BLOCKLIST.anywhere[0] ?? "")).toBe("blocked");
  });

  it("has a referee-voice hint for every problem, short enough for the phone", () => {
    const problems: NameProblem[] = ["empty", "too-long", "character", "no-letter", "blocked"];
    for (const problem of problems) {
      expect(nameHint[problem].length).toBeGreaterThan(0);
      expect(nameHint[problem].length).toBeLessThan(40);
    }
    expect(nameHint.blocked).toBe("That name's a foul. Pick another one.");
  });
});

describe("checkJoinForm", () => {
  it("is ready with a room code and a name of 1 to 12 characters", () => {
    expect(checkJoinForm({ code: "BEAN", name: "Sam" })).toEqual({
      code: null,
      name: null,
      ready: true,
    });
  });

  it("isn't ready without a name, even with the code from the QR link", () => {
    expect(checkJoinForm({ code: "BEAN", name: " " })).toEqual({
      code: null,
      name: "empty",
      ready: false,
    });
  });

  it("isn't ready with a name over 12 characters", () => {
    expect(checkJoinForm({ code: "BEAN", name: "Samantha Jones" }).ready).toBe(false);
  });

  it("isn't ready with a partial or impossible code", () => {
    expect(checkJoinForm({ code: "BEA", name: "Sam" })).toMatchObject({
      code: "incomplete",
      ready: false,
    });
    expect(checkJoinForm({ code: "BION", name: "Sam" })).toMatchObject({
      code: "incomplete",
      ready: false,
    });
  });
});
