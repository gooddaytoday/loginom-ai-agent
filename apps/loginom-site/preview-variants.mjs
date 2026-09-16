// Source-only local previews. Run: node landing/preview-variants.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installation } from './instructions.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const variants = [
  { key: 'cycle', name: 'Лендинг с последовательной сменой потоков', port: 4173 },
  { key: 'clouds', number: '01', name: 'Скопления данных', port: 4174 },
  { key: 'glyphs', number: '02', name: 'Знаки из частиц', port: 4175 },
  { key: 'ribbons', number: '03', name: 'Световые русла', port: 4176 },
  { key: 'voids', number: '04', name: 'Пустоты в потоке', port: 4177 },
];
// An optional key starts one preview without restarting the others.
const selectedKey = process.argv[2];
if (process.argv.length > 3 || (selectedKey && !variants.some(variant => variant.key === selectedKey))) {
  throw new Error('Использование: node landing/preview-variants.mjs [cycle|clouds|glyphs|ribbons|voids]');
}
const previews = selectedKey ? variants.filter(variant => variant.key === selectedKey) : variants;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.csv': 'text/csv' };
const csp = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

async function metadata() {
  const release = JSON.parse(await readFile(resolve(root, 'release.json'), 'utf8'));
  release.url = `${release.repository}/releases/tag/${encodeURIComponent(release.tag)}`;
  release.downloadBase = `${release.repository}/releases/download/${encodeURIComponent(release.tag)}`;
  for (const [platform, entry] of Object.entries(release.platforms)) {
    entry.filename = `loginom-dock-${release.version}-${platform}.${platform === 'win32-x64' ? 'zip' : 'tar.gz'}`;
    entry.url = `${release.downloadBase}/${entry.filename}`;
  }
  return release;
}
function tokens(release) {
  const mac = release.platforms['darwin-arm64'];
  return { VERSION: release.version, RELEASE_URL: release.url, MAC_URL: mac.url,
    LINUX_URL: release.platforms['linux-x64'].url, ENDPOINT: release.endpoint,
    SUMS_URL: `${release.downloadBase}/SHA256SUMS`, INSTALL_URL: `${release.downloadBase}/INSTALL.md`,
    MAC_FILE: mac.filename, MAC_HASH: mac.sha256, MAC_SIZE: installation(release, 'codex', 'darwin-arm64').size };
}
const escape = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

async function page(variant, release, artOnly, staticOnly) {
  let html = await readFile(resolve(root, 'index.html'), 'utf8');
  if (variant.key !== 'cycle') {
    html = html.replace('<title>Loginom Dock — установка и работа с Codex и Hermes</title>',
      `<title>${variant.number} · ${variant.name} — Loginom Dock</title>`);
    html = html.replace('<body>', `<body data-variant="${variant.key}">`);
    html = html.replace('src="/variants/clouds-poster.jpg"', `src="/variants/${variant.key}-poster.jpg"`);
    html = html.replace('ДАННЫЕ → СЦЕНАРИЙ → РЕЗУЛЬТАТ', `${variant.number} / ${variant.name.toUpperCase()}`);
  }
  if (artOnly) {
    html = html.replace(/<body([^>]*)>/, '<body$1 class="variant-art">');
    const stage = html.slice(html.indexOf('    <div class="data-flow"'), html.indexOf('    <div class="hero-foot'));
    html = `${html.slice(0, html.indexOf('<a class="skip-link"'))}${stage}</body></html>`;
    html = html.replace('<script type="module" src="/app.js"></script>', '');
  }
  if (staticOnly) html = html.replace('<script type="module" src="/hero-cycle.mjs"></script>', '');
  const values = tokens(release);
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown template token: ${key}`);
    return escape(values[key]);
  });
}

for (const variant of previews) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const file = resolve(root, `.${path}`);
      if (path !== '/' && path !== '/art-only' && !file.startsWith(`${root}/`)) {
        res.writeHead(403).end(); return;
      }
      let body, type;
      if (path === '/' || path === '/index.html' || path === '/art-only') {
        body = await page(variant, await metadata(), path === '/art-only', url.searchParams.has('static'));
        type = mime['.html'];
      } else if (path === '/release.js') {
        body = `export default ${JSON.stringify(await metadata())};`;
        type = mime['.js'];
      } else if (path === '/hero-cycle.mjs' && variant.key !== 'cycle') {
        body = `import {mountVariant} from '/variants/engine.mjs'; import {createScene} from '/variants/${variant.key}.mjs'; mountVariant(createScene);`;
        type = mime['.mjs'];
      } else {
        body = await readFile(file);
        type = mime[extname(file)] || 'application/octet-stream';
      }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': csp });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });
  server.on('error', error => { console.error(`${variant.port}: ${error.message}`); process.exitCode = 1; });
  server.listen(variant.port, '0.0.0.0', () => console.log(`${variant.number ? `${variant.number} ` : ''}${variant.name}: http://127.0.0.1:${variant.port}/`));
}
