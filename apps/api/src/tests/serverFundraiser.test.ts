import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { clearServerFundraiserCache, getServerFundraiser } from "../services/serverFundraiser.js";
import { FundraiserSettings } from "../models/FundraiserSettings.js";

const app = createApp();
const url = "https://bubbleflash.github.io/fundraiser-worker/fundraiser.json";
const goal = { title: "На оплату серверов", currency: "RUB", current: 3237, target: 2700, updatedAt: "2026-11-16T05:45:29Z" };

beforeEach(() => {
  clearServerFundraiserCache();
  vi.spyOn(FundraiserSettings, "findById").mockImplementation((() => ({ lean: async () => null })) as never);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("server fundraiser", () => {
  it("reads the worker's document and shares an in-flight fetch", async () => {
    const fetchMock = vi.fn(async () => Response.json(goal));
    vi.stubGlobal("fetch", fetchMock);
    const [first, second] = await Promise.all([getServerFundraiser(), getServerFundraiser()]);
    expect(first).toEqual({ title: goal.title, current: goal.current, target: goal.target, updatedAt: goal.updatedAt });
    expect(second).toEqual(first);
    expect((await request(app).get("/api/server-fundraiser")).body).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(url, { signal: expect.any(AbortSignal), redirect: "error" });
  });

  it("refreshes 15 minutes after fetch, independently of the upstream timestamp", async () => {
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi.fn(async () => Response.json(goal));
    vi.stubGlobal("fetch", fetchMock);
    const response = await request(app).get("/api/server-fundraiser");
    expect(response.headers["cache-control"]).toBe("no-store");
    clock.mockReturnValue(now + 899_999);
    await getServerFundraiser();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 900_000);
    await getServerFundraiser();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed and invalid amounts instead of inventing results", async () => {
    for (const invalid of [[], { ...goal, target: 0 }, { ...goal, current: -1 }, { ...goal, currency: "USD" }, { ...goal, updatedAt: "invalid" }]) {
      clearServerFundraiserCache();
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(invalid)));
      await expect(getServerFundraiser()).rejects.toThrow();
    }
  });

  it("selects a saved goal from the worker's array", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ ...goal, id: 1 }, { ...goal, id: 2, title: "Другая цель" }])));
    vi.mocked(FundraiserSettings.findById).mockImplementation((() => ({ lean: async () => ({ goalId: 2 }) })) as never);
    expect((await getServerFundraiser()).title).toBe("Другая цель");
  });

  it("reports unavailable and timed-out sources and limits retry frequency", async () => {
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockImplementation(async () => Response.json(goal));
    vi.stubGlobal("fetch", fetchMock);
    expect((await request(app).get("/api/server-fundraiser")).status).toBe(503);
    expect((await request(app).get("/api/server-fundraiser")).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(now + 30_000);
    expect((await request(app).get("/api/server-fundraiser")).status).toBe(503);
    clock.mockReturnValue(now + 60_000);
    expect((await request(app).get("/api/server-fundraiser")).status).toBe(200);
  });
});
