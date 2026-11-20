// Security headers for the public site (NFR-4). The server sends them; the build also writes them
// to dist/_headers so Netlify, Cloudflare Pages and similar hosts apply the same rules.
import { createHash } from 'node:crypto';
import { BOOT_SNIPPET } from '../templates/boot.mjs';

export const bootHash = () => `'sha256-${createHash('sha256').update(BOOT_SNIPPET).digest('base64')}'`;

const origin = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
};

export function securityHeaders({ https = true, analyticsSrc = '' } = {}) {
  const extra = analyticsSrc ? ` ${origin(analyticsSrc)}` : '';
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' ${bootHash()}${extra}`,
      "style-src 'self'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self'${extra}`,
      "form-action 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self)',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...(https ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
  };
}

export function headersFile(opts) {
  const h = Object.entries(securityHeaders(opts)).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  return `/*\n${h}\n  Cache-Control: no-cache\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`;
}
