#!/usr/bin/env node
/**
 * Secret check for CI and before a release (`npm run check-secrets`).
 * 1. Tracked files: no private keys, cloud/API tokens, and no JWT whose payload says role=service_role.
 * 2. No .env file other than .env.example is tracked.
 * 3. If a production build exists, the browser bundle (.next/static) never contains "service_role".
 * Exits 1 with a list of findings. Docs that *warn* about service_role are fine: only real keys fail.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS key', /AKIA[0-9A-Z]{16}/],
  ['GitHub token', /\b(ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Stripe key', /\b[sr]k_(live|test)_[A-Za-z0-9]{16,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
];
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

const findings = [];
const files = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(Boolean);

for (const f of files) {
  if (/^\.env(\..*)?$/.test(f.split('/').pop()) && !f.endsWith('.env.example'))
    findings.push(`${f}: an env file is tracked by git`);
  if (/\.(png|jpe?g|webp|gif|ico|glb|woff2?|zip|pdf|dxf)$/i.test(f) || !existsSync(f)) continue;
  if (statSync(f).size > 5_000_000) continue; // large data files (geojson): no secrets, slow to scan
  const text = readFileSync(f, 'utf8');
  for (const [name, re] of PATTERNS) if (re.test(text)) findings.push(`${f}: looks like a ${name}`);
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') findings.push(`${f}: Supabase service_role key`);
    } catch {
      /* not a JWT */
    }
  }
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|css|html|json)$/.test(e.name)) out.push(p);
  }
  return out;
}
if (existsSync('.next/static')) {
  for (const f of walk('.next/static'))
    if (readFileSync(f, 'utf8').includes('service_role'))
      findings.push(`${f}: "service_role" in the browser bundle`);
}

if (findings.length) {
  console.error(`Secret check failed:\n  ${findings.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `Secret check passed (${files.length} tracked files${existsSync('.next/static') ? ', browser bundle' : ''}).`,
);
