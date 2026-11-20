import http from "node:http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import process from "node:process";
import { URLSearchParams } from "node:url";

const secret = process.env.TEST_GATE_SECRET;
const api = (process.env.TEST_GATE_API_URL ?? "http://api:4000").replace(/\/$/, "");
if (!secret || secret.length < 32) throw new Error("TEST_GATE_SECRET (at least 32 characters) is required");
const cookieName = "bubble_test_access";
const duration = 12 * 60 * 60;
const secure = process.env.TEST_GATE_SECURE !== "false";
const hash = (value) => createHash("sha256").update(value).digest();
const equal = (a, b) => timingSafeEqual(hash(a), hash(b));
const signature = (value) => createHmac("sha256", secret).update(value).digest("hex");
const valid = (cookie, version) => {
  const value = cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  const [expiry, nonce, tokenVersion, mac] = (value ?? "").split(".");
  if (!expiry || !nonce || !tokenVersion || tokenVersion !== version || !mac || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now() / 1000) return false;
  return equal(mac, signature(`${expiry}.${nonce}.${tokenVersion}`));
};
async function apiRequest(path, body) {
  const response = await fetch(`${api}/api/internal/test-gate/${path}`, {
    method: body ? "POST" : "GET",
    headers: { "x-test-gate-secret": secret, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 401 && path === "verify") return null;
  if (!response.ok) throw new Error("Test gate API unavailable");
  const result = await response.json();
  if (path === "status" && (typeof result?.enabled !== "boolean" || typeof result?.version !== "string" || (result.enabled && !result.version))) throw new Error("Invalid test gate status");
  if (path === "verify" && (typeof result?.version !== "string" || !result.version)) throw new Error("Invalid test gate verification");
  return result;
}
const page = (error = false) => `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Тестовый Bubble</title><style>body{font:16px system-ui;background:#dff1ff;color:#123;display:grid;place-items:center;min-height:100vh;margin:0}form{display:grid;gap:12px;background:white;padding:24px;border-radius:12px;width:min(320px,80vw)}input,button{font:inherit;padding:10px}label{display:grid;gap:4px}.error{color:#a21}</style><form method="post" action="/__test_gate/login"><h1>Тестовый Bubble</h1><label>Логин<input name="username" autocomplete="username" required></label><label>Пароль<input name="password" type="password" autocomplete="current-password" required></label>${error ? '<p class="error">Неверный логин или пароль.</p>' : ""}<button>Войти</button></form></html>`;
/* global fetch, AbortSignal */
http.createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.url === "/check") {
    void apiRequest("status").then((settings) => res.writeHead(!settings.enabled || valid(req.headers.cookie, settings.version) ? 204 : 401).end()).catch(() => res.writeHead(503).end());
    return;
  }
  if (req.url !== "/login") return res.writeHead(404).end();
  if (req.method === "GET") return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(page());
  if (req.method !== "POST") return res.writeHead(405).end();
  let body = "";
  req.on("data", (chunk) => { body += chunk; if (body.length > 4096) req.destroy(); });
  req.on("end", () => {
    const fields = new URLSearchParams(body);
    void apiRequest("verify", { username: fields.get("username") ?? "", password: fields.get("password") ?? "" }).then((result) => {
      if (!result) return res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" }).end(page(true));
      const token = `${Math.floor(Date.now() / 1000) + duration}.${randomBytes(16).toString("hex")}.${result.version}`;
      res.writeHead(303, { Location: "/", "Set-Cookie": `${cookieName}=${token}.${signature(token)}; Path=/; Max-Age=${duration}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}` }).end();
    }).catch(() => res.writeHead(503).end());
  });
}).listen(Number(process.env.TEST_GATE_PORT ?? 4200), "0.0.0.0");
