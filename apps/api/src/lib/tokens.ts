import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

export interface TokenPayload {
  userId: string;
  tenantId: string | null;
  role: 'ADMIN' | 'CLIENT_OWNER' | 'CLIENT_VIEWER';
}

export interface AccessTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload as object, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function generateRefreshToken(): string {
  return uuidv4();
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}

export function getRefreshTokenExpiry(): Date {
  const duration = parseDuration(env.JWT_REFRESH_EXPIRES_IN);
  return new Date(Date.now() + duration);
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000; // Default 7 days
  }
  
  const value = parseInt(match[1], 10);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

export function generateTokenPair(payload: TokenPayload): AccessTokenPair {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken();
  
  return {
    accessToken,
    refreshToken,
    expiresIn: env.JWT_EXPIRES_IN,
  };
}
