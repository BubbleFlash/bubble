import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import http from "node:http";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { URLSearchParams } from "node:url";
/* global fetch */

test("gate rejects invalid credentials and tampered sessions", async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  let enabled = false;
  let version = "first";
  const api = http.createServer((req, res) => {
    if (req.headers["x-test-gate-secret"] !== "example-secret-32-characters-or-longer") return res.writeHead(403).end();
    if (req.url.endsWith("/status")) return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ enabled, version }));
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const credentials = JSON.parse(body);
      if (!enabled || credentials.username !== "tester" || credentials.password !== "example-password") return res.writeHead(401).end();
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ version }));
    });
  });
  await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
  const apiPort = api.address().port;
  const child = spawn(process.execPath, ["tools/test-gate/server.mjs"], {
    env: { ...process.env, TEST_GATE_PORT: String(port), TEST_GATE_API_URL: `http://127.0.0.1:${apiPort}`, TEST_GATE_SECRET: "example-secret-32-characters-or-longer", TEST_GATE_SECURE: "false" },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      try { await fetch(`${base}/check`); ready = true; } catch { await delay(100); }
    }
    assert.ok(ready, "gate did not start");
    assert.equal((await fetch(`${base}/check`)).status, 204);
    enabled = true;
    assert.equal((await fetch(`${base}/check`)).status, 401);
    const login = (password) => fetch(`${base}/login`, { method: "POST", redirect: "manual", body: new URLSearchParams({ username: "tester", password }) });
    assert.equal((await login("wrong")).status, 401);
    const response = await login("example-password");
    assert.equal(response.status, 303);
    const cookie = response.headers.get("set-cookie").split(";")[0];
    assert.equal((await fetch(`${base}/check`, { headers: { cookie } })).status, 204);
    assert.equal((await fetch(`${base}/check`, { headers: { cookie: `${cookie}x` } })).status, 401);
    version = "second";
    assert.equal((await fetch(`${base}/check`, { headers: { cookie } })).status, 401);
    enabled = false;
    assert.equal((await fetch(`${base}/check`)).status, 204);
    await new Promise((resolve) => api.close(resolve));
    assert.equal((await fetch(`${base}/check`)).status, 503);
  } finally {
    child.kill();
    if (api.listening) await new Promise((resolve) => api.close(resolve));
  }
});
