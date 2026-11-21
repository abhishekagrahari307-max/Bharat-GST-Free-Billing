// Publishes the lightweight static web build into the repository root so
// GitHub Pages (main branch, "/" root) serves Bharat GST Free Billing live at
// https://<owner>.github.io/<repo>/ without needing a Node server.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DOCS_OUT = path.join(ROOT, 'docs-site', 'out', 'docs');
const PUBLIC_GUIDE = path.join(ROOT, 'public', 'user-guide');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const SITE_ORIGIN = 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing';
const TODAY = new Date().toISOString().slice(0, 10);

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

// Clean previous root static artifacts before copying fresh hashed chunks
for (const dir of ['assets', 'icons', 'user-guide', '.well-known']) {
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

// Generate fresh version.json (in both public/ and published root)
const versionPayload = JSON.stringify({
  version: pkg.version,
  channel: 'daily',
  autoUpdate: true,
  releaseDate: TODAY,
  buildTime: new Date().toISOString(),
  minSupportedSchema: 1,
}, null, 2) + '\n';
fs.writeFileSync(path.join(ROOT, 'public', 'version.json'), versionPayload);
fs.writeFileSync(path.join(ROOT, 'version.json'), versionPayload);

// Ensure robots.txt & sitemap.xml at site root
const guideSource = fs.existsSync(DOCS_OUT) ? DOCS_OUT : PUBLIC_GUIDE;
const guidePages = fs.existsSync(guideSource)
  ? fs.readdirSync(guideSource).filter((f) => f.endsWith('.html') && f !== '404.html')
  : [];

const sitemapUrls = [
  `  <url><loc>${SITE_ORIGIN}/</loc><lastmod>${TODAY}</lastmod><priority>1.0</priority></url>`,
  `  <url><loc>${SITE_ORIGIN}/privacy.html</loc><lastmod>${TODAY}</lastmod><priority>0.7</priority></url>`,
  `  <url><loc>${SITE_ORIGIN}/terms.html</loc><lastmod>${TODAY}</lastmod><priority>0.7</priority></url>`,
  ...guidePages.map((file) => {
    const loc = file === 'index.html' ? `${SITE_ORIGIN}/user-guide/` : `${SITE_ORIGIN}/user-guide/${file}`;
    const prio = ['index.html', 'install.html', 'first-invoice.html', 'invoices.html', 'gst-returns.html'].includes(file) ? '0.9' : '0.7';
    return `  <url><loc>${loc}</loc><lastmod>${TODAY}</lastmod><priority>${prio}</priority></url>`;
  }),
];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.join('\n')}\n</urlset>\n`;
const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
fs.writeFileSync(path.join(ROOT, 'public', 'sitemap.xml'), sitemapXml);
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemapXml);
fs.writeFileSync(path.join(ROOT, 'public', 'robots.txt'), robotsTxt);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robotsTxt);

// SPA fallback for GitHub Pages deep links + disable Jekyll processing
fs.copyFileSync(path.join(DIST, 'index.html'), path.join(ROOT, '404.html'));
fs.writeFileSync(path.join(ROOT, '.nojekyll'), '');

// Copy self-hosted user guide to /user-guide/
if (fs.existsSync(guideSource)) {
  fs.cpSync(guideSource, path.join(ROOT, 'user-guide'), { recursive: true });
}

console.log('✓ Published static web build to repository root (index.html, 404.html, privacy.html, terms.html, .well-known/security.txt, robots.txt, sitemap.xml, version.json, .nojekyll, assets/, icons/, user-guide/).');
