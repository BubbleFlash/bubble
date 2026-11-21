declare global {
  namespace Express {
    interface Request {
      userId?: string;
      emailVerified?: boolean;
      publishingRestriction?: { reason: string; until?: Date | null };
      userRole?: import("@commune/shared").Role;
    }
    interface Locals {
      refreshSession?: import("../services/authService.js").RefreshSession | null;
    }
  }
}

export {};
