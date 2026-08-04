import { createHash, randomBytes } from 'crypto';
import type { Request } from 'express';

export const GUEST_TOKEN_HEADER = 'x-guest-token';
export const GUEST_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SurveyActor =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; guestToken: string };

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateGuestToken(): string {
  return randomBytes(32).toString('hex');
}

export function getGuestToken(req: Request): string | null {
  const header = req.headers[GUEST_TOKEN_HEADER];
  if (typeof header === 'string' && header.trim()) {
    return header.trim();
  }
  if (Array.isArray(header) && header[0]?.trim()) {
    return header[0].trim();
  }
  return null;
}

export function guestExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + GUEST_TOKEN_TTL_MS);
}
