// Publishes the lightweight static web build into the repository root so
// GitHub Pages (main branch, "/" root) serves Bharat GST Free Billing live at
// https://<owner>.github.io/<repo>/ without needing a Node server.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DOCS_OUT = path.join(ROOT, 'docs-site', 'out', 'docs');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

// Clean previous root static artifacts before copying fresh hashed chunks
for (const dir of ['assets', 'icons', 'user-guide']) {
  fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
}
for (const entry of fs.readdirSync(ROOT)) {
  if (/^workbox-[\w-]+\.js$/.test(entry)) {
    fs.rmSync(path.join(ROOT, entry), { force: true });
  }
}

// Copy top-level files from dist/ (skipping the 41MB tesseract/ folder;
// BillOCR falls back to CDN automatically when local /tesseract/ isn't present).
for (const entry of fs.readdirSync(DIST, { withFileTypes: true })) {
  if (entry.name === 'tesseract') continue;
  const src = path.join(DIST, entry.name);
  const dst = path.join(ROOT, entry.name);
  if (entry.isDirectory()) {
    fs.cpSync(src, dst, {
      recursive: true,
      filter: (s) => !s.endsWith('.woff'), // modern browsers load .woff2
    });
  } else {
    fs.copyFileSync(src, dst);
  }
}

// SPA fallback for GitHub Pages deep links + disable Jekyll processing
fs.copyFileSync(path.join(DIST, 'index.html'), path.join(ROOT, '404.html'));
fs.writeFileSync(path.join(ROOT, '.nojekyll'), '');

// Copy self-hosted user guide to /user-guide/
if (fs.existsSync(DOCS_OUT)) {
  fs.cpSync(DOCS_OUT, path.join(ROOT, 'user-guide'), { recursive: true });
}

console.log('✓ Published static web build to repository root (index.html, 404.html, .nojekyll, assets/, icons/, user-guide/).');
