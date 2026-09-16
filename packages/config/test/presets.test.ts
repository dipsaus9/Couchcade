import { describe, expect, it } from "vitest";
import {
  defineAppConfig,
  defineLibConfig,
  defineTestConfig,
  defineWorkerConfig,
  devPorts,
  testDefaults,
} from "../vite/index.ts";

describe("defineTestConfig", () => {
  it("applies the shared Vitest defaults", () => {
    expect(defineTestConfig().test).toEqual(testDefaults);
  });

  it("lets a package override a default", () => {
    expect(defineTestConfig({ test: { environment: "happy-dom" } }).test?.environment).toBe(
      "happy-dom",
    );
  });
});

describe("defineLibConfig", () => {
  it("is test-only: internal packages have no build step", () => {
    const config = defineLibConfig();
    expect(config.test).toEqual(testDefaults);
    expect(config.build).toBeUndefined();
  });
});

describe("defineAppConfig", () => {
  it("sets the base path and pins the dev server and HMR socket to the app's own port", () => {
    const config = defineAppConfig({ base: "/host/", port: devPorts.host });
    expect(config.base).toBe("/host/");
    expect(config.server).toEqual({
      port: 5174,
      strictPort: true,
      hmr: { clientPort: 5174 },
    });
    expect(config.test).toEqual(testDefaults);
  });

  it("merges overrides on top of the preset", () => {
    const config = defineAppConfig(
      { base: "/", port: devPorts.controller },
      { server: { host: true } },
    );
    expect(config.server).toMatchObject({ port: 5175, strictPort: true, host: true });
  });
});

describe("defineWorkerConfig", () => {
  it("serves the Worker on the one origin browsers use", () => {
    expect(defineWorkerConfig().server).toEqual({ port: 5173, strictPort: true });
  });
});
