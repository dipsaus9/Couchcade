/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// Timers keep a Durable Object awake and stop it hibernating. The room uses one alarm instead
// (docs/architecture/platform.md, "Hibernation rules", rule 2).
const sources = import.meta.glob<string>("../src/room/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("room sources", () => {
  it("are found", () => {
    expect(Object.keys(sources)).toContain("../src/room/room.ts");
  });

  it.each(Object.entries(sources))("%s uses no setTimeout or setInterval", (_path, source) => {
    expect(source).not.toMatch(/\bset(Timeout|Interval)\b/);
  });
});
