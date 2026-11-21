import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";

const good = {
  JWT_ACCESS_SECRET: "j".repeat(32),
  REALTIME_SECRET: "s".repeat(32),
  CLIENT_ORIGIN: "https://commune-mu.vercel.app/",
  API_URL: "https://commune-8im5.vercel.app",
};

describe("loadConfig", () => {
  it("normalises origins", () => {
    const c = loadConfig({ ...good, PORT: "5000" });
    expect(c.clientOrigin).toBe("https://commune-mu.vercel.app");
    expect(c.port).toBe(5000);
  });

  it("uses the separate realtime port when the API port is also set", () => {
    expect(loadConfig({ ...good, PORT: "4000", REALTIME_PORT: "4100" }).port).toBe(4100);
  });

  it("lists every problem at once", () => {
    expect(() => loadConfig({ JWT_ACCESS_SECRET: "short" })).toThrow(
      /JWT_ACCESS_SECRET[\s\S]*REALTIME_SECRET[\s\S]*CLIENT_ORIGIN[\s\S]*API_URL/,
    );
  });
});
