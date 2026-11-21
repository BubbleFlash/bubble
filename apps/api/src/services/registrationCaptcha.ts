import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Schema, model } from "mongoose";
import { env } from "../config/env.js";

export const CAPTCHA_COOKIE = "bubble_captcha";
export const captchaLifetimeMs = 5 * 60_000;
const tokenPattern = /^[a-f0-9]{48}$/;

const captcha = model("RegistrationCaptcha", new Schema({
  _id: String,
  browserHash: String,
  answerHash: String,
  revision: String,
  expiresAt: { type: Date, expires: 0 },
}));

const digits = [
  "01110 11011 11011 11011 01110", "01100 11100 01100 01100 11110",
  "01110 11011 00110 01100 11111", "11110 00011 01110 00011 11110",
  "11011 11011 11111 00011 00011", "11111 11000 11110 00011 11110",
  "01110 11000 11110 11011 01110", "11111 00011 00110 01100 01100",
  "01110 11011 01110 11011 01110", "01110 11011 01111 00011 01110",
];

function imageFor(answer: string) {
  const paths = Array.from(answer, (digit, index) => {
    const pixels = digits[Number(digit)]!.split(" ").flatMap((row, y) => {
      const shift = randomInt(-2, 3);
      return Array.from(row, (dot, x) => dot === "1" ? `M${x * 4 + shift} ${y * 6}h4v6h-4Z` : "");
    }).join("");
    return `<path d="${pixels}" transform="translate(${15 + index * 30} ${randomInt(14, 22)}) rotate(${randomInt(-13, 14)} 10 15)"/>`;
  }).join("");
  const lines = Array.from({ length: 5 }, () => {
    const y = randomInt(4, 60);
    return `<path d="M0 ${y} Q100 ${randomInt(4, 60)} 200 ${randomInt(4, 60)}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="64" viewBox="0 0 200 64"><rect width="200" height="64" fill="#ecf6ff"/><g fill="#183b61">${paths}</g><g fill="none" stroke="#4277a1" stroke-opacity=".35">${lines}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function digest(value: string) {
  return createHmac("sha256", env.JWT_ACCESS_SECRET).update(`registration-captcha:${value}`).digest("hex");
}

export function browserToken(value: unknown) {
  return typeof value === "string" && tokenPattern.test(value) ? value : randomBytes(24).toString("hex");
}

export async function issueCaptcha(browser: string, revision: string) {
  const id = randomBytes(24).toString("hex");
  const answer = Array.from({ length: 6 }, () => randomInt(10)).join("");
  await captcha.create({
    _id: id,
    browserHash: digest(`browser:${browser}`),
    answerHash: digest(`answer:${id}:${answer}`),
    revision,
    expiresAt: new Date(Date.now() + captchaLifetimeMs),
  });
  return { required: true, id, image: imageFor(answer) } as const;
}

export async function consumeCaptcha(id: string, answer: string, browser: unknown, revision: string) {
  if (typeof browser !== "string" || !tokenPattern.test(browser)) return false;
  const challenge = await captcha.findOneAndDelete({
    _id: id,
    browserHash: digest(`browser:${browser}`),
    revision,
    expiresAt: { $gt: new Date() },
  }).setOptions({ timeoutMS: 2_000 }).lean();
  if (!challenge?.answerHash) return false;
  return timingSafeEqual(Buffer.from(challenge.answerHash, "hex"), Buffer.from(digest(`answer:${id}:${answer}`), "hex"));
}
