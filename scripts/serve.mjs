#!/usr/bin/env node
/**
 * serve.mjs — serve public/ locally, WITH the headers Cloudflare will send.
 *
 * The point of parsing public/_headers rather than hardcoding a policy here is
 * that the accessibility gate then runs against the REAL Content-Security-Policy.
 * A gate that runs without the CSP passes happily on a page the CSP would break
 * — which is the "a gate measures the surface, not the thing the surface makes"
 * failure, one layer down.
 *
 *   node scripts/serve.mjs [--port 8788]
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Parse Cloudflare's _headers format: a path pattern, then indented headers. */
export async function loadHeaderRules(file = path.join(ROOT, '_headers')) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  const rules = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    const idx = raw.indexOf(':');
    if (idx > 0 && current) current.headers.push([raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()]);
  }
  return rules;
}

const matches = (pattern, pathname) => {
  if (pattern === '/*') return true;
  if (pattern.endsWith('/*')) return pathname.startsWith(pattern.slice(0, -1));
  return pattern === pathname;
};

/**
 * `extraRoutes` maps a path to a file OUTSIDE public/. The accessibility gate
 * uses it to serve axe-core from node_modules as a SAME-ORIGIN script, because
 * the real Content-Security-Policy (`script-src 'self'`) correctly refuses an
 * injected inline one. Making the gate work around the CSP by weakening it
 * would be testing a policy the deploy does not have.
 */
export async function createStaticServer({ root = ROOT, extraRoutes = {} } = {}) {
  const rules = await loadHeaderRules(path.join(root, '_headers'));

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);

    const headers = {};
    for (const rule of rules) if (matches(rule.pattern, pathname)) for (const [k, v] of rule.headers) headers[k] = v;

    if (extraRoutes[pathname]) {
      try {
        const body = await readFile(extraRoutes[pathname]);
        res.writeHead(200, { ...headers, 'content-type': TYPES[path.extname(extraRoutes[pathname])] ?? 'application/octet-stream' });
        res.end(body);
      } catch (err) {
        res.writeHead(500, headers);
        res.end(String(err.message));
      }
      return;
    }

    // The API endpoints are Pages Functions and are not served here. They
    // answer 503 rather than 404 so a client can tell "not deployed locally"
    // from "this route does not exist".
    if (pathname.startsWith('/api/')) {
      res.writeHead(503, { ...headers, 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, reason: 'Pages Functions are not served by the local static server' }));
      return;
    }

    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.join(root, pathname);
    if (!file.startsWith(root)) {
      res.writeHead(403, headers);
      res.end('forbidden');
      return;
    }

    try {
      const info = await stat(file);
      if (info.isDirectory()) throw new Error('directory');
      const body = await readFile(file);
      res.writeHead(200, { ...headers, 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { ...headers, 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '8788' } } });
  const server = await createStaticServer();
  server.listen(Number(values.port), () => {
    process.stdout.write(`serving ${ROOT} on http://localhost:${values.port}\n`);
  });
}
