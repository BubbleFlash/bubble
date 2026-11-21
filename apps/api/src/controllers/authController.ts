import type { NextFunction, Request, Response } from "express";
import type { RegisterInput, RegistrationCaptcha } from "@commune/shared";
import { env } from "../config/env.js";
import { allowRegistrationRequest } from "../middleware/rateLimit.js";
import * as authService from "../services/authService.js";
import { REFRESH_COOKIE } from "../services/authService.js";
import { readRateLimitSettings } from "../services/rateLimitSettings.js";
import { browserToken, CAPTCHA_COOKIE, captchaLifetimeMs, consumeCaptcha, issueCaptcha } from "../services/registrationCaptcha.js";
import { badRequest } from "../utils/errors.js";

export async function register(req: Request, res: Response) {
  const input = req.body as RegisterInput;
  const { captchaRevision } = await readRateLimitSettings();
  if (captchaRevision) {
    if (!input.captcha) throw badRequest("Captcha required");
    if (!await consumeCaptcha(input.captcha.id, input.captcha.answer, req.cookies[CAPTCHA_COOKIE], captchaRevision)) {
      throw badRequest("Invalid or expired captcha");
    }
  }
  res.status(201).json(await authService.register(input));
}

export async function registrationCaptcha(req: Request, res: Response<RegistrationCaptcha>) {
  const { captchaRevision } = await readRateLimitSettings();
  if (!captchaRevision) {
    res.json({ required: false });
    return;
  }
  if (!await allowRegistrationRequest(req, res, "registration-captcha")) return;
  const browser = browserToken(req.cookies[CAPTCHA_COOKIE]);
  const challenge = await issueCaptcha(browser, captchaRevision);
  res.cookie(CAPTCHA_COOKIE, browser, {
    path: "/api/auth/register",
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    maxAge: captchaLifetimeMs,
  });
  res.json(challenge);
}

export async function login(req: Request, res: Response) {
  res.json(await authService.login(req.body, res));
}

export async function prepareRefresh(req: Request, res: Response, next: NextFunction) {
  const presented = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  res.locals.refreshSession = await authService.findRefreshSession(presented);
  next();
}

export async function refresh(_req: Request, res: Response) {
  res.json(await authService.refresh(res.locals.refreshSession ?? null, res));
}

export async function logout(req: Request, res: Response) {
  const presented = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  await authService.logout(presented, res);
  res.status(204).end();
}

export async function google(req: Request, res: Response) {
  res.json(await authService.loginWithGoogle(req.body.credential, res));
}
