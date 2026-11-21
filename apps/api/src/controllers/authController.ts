import type { NextFunction, Request, Response } from "express";
import * as authService from "../services/authService.js";
import { REFRESH_COOKIE } from "../services/authService.js";

export async function register(req: Request, res: Response) {
  res.status(201).json(await authService.register(req.body, res));
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
