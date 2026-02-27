import { Request, Response, NextFunction } from 'express';
import { logInfo, logError } from '../utils/loggerHelpers';

/**
 * Content-Security-Policy and security headers middleware.
 *
 * Strict policy for a REST API that returns JSON — no resources should load.
 * CSP violations are reported to POST /api/_csp-report for monitoring.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  const directives = [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'none'",
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    'report-uri /api/_csp-report',
  ];

  res.setHeader('Content-Security-Policy', directives.join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  next();
}

/**
 * Handler for CSP violation reports sent by the browser.
 * Logs the violation for monitoring — does not block anything.
 */
export function cspReportHandler(req: Request, res: Response): void {
  const report = req.body?.['csp-report'] || req.body;

  if (report) {
    logInfo('CSP violation report', {
      documentUri: report['document-uri'],
      violatedDirective: report['violated-directive'],
      blockedUri: report['blocked-uri'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
    });
  } else {
    logError('CSP report received with empty body', {});
  }

  res.status(204).end();
}
