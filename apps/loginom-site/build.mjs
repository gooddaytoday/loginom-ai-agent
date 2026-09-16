import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { installation } from './instructions.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist');
const release = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
if (!/^[0-9A-Za-z.+-]+$/.test(release.version)
  || release.tag !== `loginom-dock@${release.version}`
  || release.repository !== 'https://github.com/kartamyshev-dev/loginom-dock'
  || !/^[a-f0-9]{40}$/.test(release.sourceCommit)) throw new Error('Invalid public release metadata');
release.url = `${release.repository}/releases/tag/${encodeURIComponent(release.tag)}`;
release.downloadBase = `${release.repository}/releases/download/${encodeURIComponent(release.tag)}`;
for (const [platform, entry] of Object.entries(release.platforms)) {
  if (!['darwin-arm64', 'linux-x64', 'win32-x64'].includes(platform) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid platform metadata');
  entry.filename = `loginom-dock-${release.version}-${platform}.${platform === 'win32-x64' ? 'zip' : 'tar.gz'}`;
  entry.url = `${release.downloadBase}/${entry.filename}`;
}
const tokens = {
  VERSION: release.version, RELEASE_URL: release.url, MAC_URL: release.platforms['darwin-arm64'].url,
  LINUX_URL: release.platforms['linux-x64'].url, ENDPOINT: release.endpoint,
  SUMS_URL: `${release.downloadBase}/SHA256SUMS`, INSTALL_URL: `${release.downloadBase}/INSTALL.md`,
  MAC_FILE: release.platforms['darwin-arm64'].filename, MAC_HASH: release.platforms['darwin-arm64'].sha256,
  MAC_SIZE: installation(release, 'codex', 'darwin-arm64').size,
};
const template = await readFile(join(root, 'index.html'), 'utf8');
const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => {
  if (!(name in tokens)) throw new Error(`Unknown template token: ${name}`);
  return tokens[name].replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
});
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(root, 'assets'), join(out, 'assets'), { recursive: true });
await cp(join(root, 'variants'), join(out, 'variants'), { recursive: true });
for (const file of ['styles.css', 'hero.css', 'hero.mjs', 'hero-cycle.mjs', 'hero-selection.mjs', 'flow-interaction.mjs', 'app.js', 'instructions.mjs', 'robots.txt', 'sitemap.xml']) await cp(join(root, file), join(out, file));
await writeFile(join(out, 'index.html'), html);
await writeFile(join(out, 'release.js'), `export default ${JSON.stringify(release)};\n`);
await writeFile(join(out, '404.html'), '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Страница не найдена · Loginom Dock</title><link rel="stylesheet" href="/styles.css"><main class="container section"><p class="eyebrow">404</p><h1>Страница не найдена</h1><p>Начните со страницы установки Loginom Dock.</p><a class="button" href="/">На главную →</a></main></html>');
console.log(JSON.stringify({ version: release.version, indexSha256: createHash('sha256').update(html).digest('hex'), output: out }));
