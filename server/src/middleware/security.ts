import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
});

export function privacyHeaders(req: Request, res: Response, next: NextFunction): void {
  // Prevent any browser or intermediary caching of dynamic API data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Strict privacy policies
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

  // Strip headers that could aid fingerprinting
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  next();
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  // Never expose internal stack traces or database errors to client
  const statusCode = err.status || err.statusCode || 500;
  const safeMessage = statusCode < 500 ? err.message : 'An internal processing error occurred';

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[Error] ${req.method} ${req.path}:`, err.message || err);
  }

  res.status(statusCode).json({
    error: err.name || 'Error',
    message: safeMessage,
  });
}
