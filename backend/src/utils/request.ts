import type { Request } from 'express';

export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function userAgent(req: Request): string {
  return (req.get('user-agent') ?? '').slice(0, 256);
}

export function requestMeta(req: Request) {
  return { ip: clientIp(req), userAgent: userAgent(req) };
}
