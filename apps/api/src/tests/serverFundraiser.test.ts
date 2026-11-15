import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { clearServerFundraiserCache, getServerFundraiser } from "../services/serverFundraiser.js";

const app = createApp();
const goal = { id: 842291, type: "money", description: "На оплату серверов на год", bloggerCurrency: "RUB", currentSum: 750, targetSum: 2000 };

beforeEach(() => clearServerFundraiserCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("server fundraiser", () => {
  it("selects the requested goal and shares one cached fetch", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [{ ...goal, id: 1 }, goal] }));
    vi.stubGlobal("fetch", fetchMock);
    const [first, second] = await Promise.all([getServerFundraiser(), getServerFundraiser()]);
    expect(first).toMatchObject({ title: goal.description, current: 750, target: 2000 });
    expect(second).toEqual(first);
    expect((await request(app).get("/api/server-fundraiser")).body).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes after 15 seconds and prevents browser caches from extending that interval", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const fetchMock = vi.fn(async () => Response.json({ data: [goal] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await request(app).get("/api/server-fundraiser");
    expect(response.headers["cache-control"]).toBe("no-store");
    const fetchedAt = Date.parse(response.body.updatedAt);
    clock.mockReturnValue(fetchedAt + 14_999);
    await getServerFundraiser();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(fetchedAt + 15_000);
    await getServerFundraiser();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports an unavailable goal instead of inventing an amount", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ ...goal, id: 1 }] })));
    const response = await request(app).get("/api/server-fundraiser");
    expect(response.status).toBe(503);
    expect(response.body).not.toHaveProperty("current");
  });

  it("rejects invalid amounts and wrong currency", async () => {
    for (const invalid of [{ ...goal, targetSum: 0 }, { ...goal, currentSum: -1 }, { ...goal, bloggerCurrency: "USD" }]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [invalid] })));
      await expect(getServerFundraiser()).rejects.toThrow();
    }
  });
});
