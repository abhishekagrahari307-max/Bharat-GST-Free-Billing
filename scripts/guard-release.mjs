#!/usr/bin/env node
// Release Gate (`scripts/guard-release.mjs`)
// Verifies build integrity, asset hashes, required legal/SEO/update static files,
// and ensures zero legacy DiceCodes / Free GST Billing links remain in built output.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function step(label, fn) {
  process.stdout.write(`• ${label}... `);
  fn();
  console.log('OK');
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\n✗ RELEASE GATE FAILED: ${msg}`);
    process.exit(1);
  }
}

step('Checking ESLint', () => {
  execSync('npm run lint', { cwd: ROOT, stdio: 'pipe' });
});

step('Building production bundle & static pages', () => {
  execSync('npm run build:pages', { cwd: ROOT, stdio: 'pipe' });
});

step('Verifying dist/index.html & root index.html asset references', () => {
  for (const baseDir of [path.join(ROOT, 'dist'), ROOT]) {
    const htmlPath = path.join(baseDir, 'index.html');
    assert(fs.existsSync(htmlPath), `Missing ${htmlPath}`);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((m) => m[1]);
    assert(refs.length > 0, `No ./assets/* references found in ${htmlPath}`);
    for (const rel of refs) {
      assert(fs.existsSync(path.join(baseDir, rel)), `Referenced asset missing: ${path.join(baseDir, rel)}`);
    }
  }
});

step('Verifying required legal, security, SEO & update files', () => {
  const required = [
    'privacy.html',
    'terms.html',
    '.well-known/security.txt',
    'robots.txt',
    'sitemap.xml',
    'version.json',
    'boot-guard.js',
    'user-guide/index.html',
    'user-guide/privacy.html',
    'icons/og-card.png',
  ];
  for (const rel of required) {
    assert(fs.existsSync(path.join(ROOT, rel)), `Missing published root file: ${rel}`);
  }
  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert(ver.version === pkg.version, `version.json (${ver.version}) != package.json (${pkg.version})`);
});

step('Verifying zero legacy DiceCodes / Free GST Billing links in Complete Guide & root HTML', () => {
  const guideDir = path.join(ROOT, 'user-guide');
  for (const f of fs.readdirSync(guideDir).filter((x) => x.endsWith('.html'))) {
    const body = fs.readFileSync(path.join(guideDir, f), 'utf8');
    assert(!/dicecodes|princeramgarhiaa|IamRamgarhia|Free GST Billing/i.test(body), `Legacy branding found in user-guide/${f}`);
  }
  const rootHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(!/dicecodes|Free GST Billing/i.test(rootHtml), 'Legacy branding found in index.html');
});

console.log('\n✅ Release Gate passed — bundle, assets, legal/SEO files, version.json, and Complete Guide verified.');
