import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, lstat, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { privatePath, protectWindowsDirectory } from './platform.mjs';

export const skillUri = 'viking://agent/skills/loginom-automation';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const limits = { entries: 512, file: 16 * 1024 * 1024, total: 64 * 1024 * 1024 };
const asciiJson = value => JSON.stringify(value).replace(/[\u007f-\uffff]/g,
  char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));

// Match the existing Skills API's Python json.dumps(sort_keys=True) revision.
export function manifestRevision(files) {
  return hash(asciiJson([...files].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)))
    .map(file => ({ is_dir: file.is_dir, path: file.path,
      sha256: file.sha256 ?? null, size: file.size ?? null }))));
}

export function validateManifest(detail) {
  if (!sha(detail?.revision) || !Array.isArray(detail.files) || !detail.files.length
      || detail.files.length > limits.entries) throw new Error('Invalid Dock skill manifest');
  const paths = new Map();
  let total = 0;
  for (const file of detail.files) {
    const path = file.path;
    if (typeof path !== 'string' || path.length > 1024 || path !== path.normalize('NFC')
        || /[\\\u0000-\u001f\u007f:%]/.test(path) || !path.isWellFormed()
        || path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))
        || typeof file.is_dir !== 'boolean' || file.uri !== `${skillUri}/${path}`) {
      throw new Error('Unsafe Dock skill path');
    }
    const key = path.toLowerCase();
    if (paths.has(key)) throw new Error('Duplicate Dock skill path');
    paths.set(key, file);
    if (!file.is_dir) {
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limits.file || !sha(file.sha256)) {
        throw new Error('Invalid Dock skill file integrity');
      }
      total += file.size;
    } else if (file.size != null || file.sha256 != null) throw new Error('Invalid Dock skill directory');
  }
  if (total > limits.total) throw new Error('Dock skill package is too large');
  for (const file of detail.files) {
    const parts = file.path.split('/');
    for (let n = 1; n < parts.length; n++) {
      const parent = parts.slice(0, n).join('/');
      const directory = paths.get(parent.toLowerCase());
      if (!directory?.is_dir || directory.path !== parent) throw new Error('Invalid Dock skill parent directory');
    }
  }
  const main = paths.get('skill.md');
  if (!main || main.path !== 'SKILL.md' || main.is_dir || main.sha256 !== detail.content_sha256
      || typeof detail.content !== 'string' || hash(Buffer.from(detail.content)) !== main.sha256
      || manifestRevision(detail.files) !== detail.revision) throw new Error('Dock skill integrity mismatch');
  return detail;
}

async function limitedBody(response, max) {
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Dock skill request failed (${response.status})`); }
  if (!response.body) throw new Error('Dock skill response has no body');
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error('Dock skill response exceeds its size limit');
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel(); }
}

export function skillTransport(config, fetcher = fetch) {
  const base = new URL(config.endpoint).origin;
  async function request(path, params, max) {
    const url = new URL(path, base);
    url.search = new URLSearchParams(params).toString();
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetcher(url, { headers: { Authorization: `Bearer ${config.apiKey}` },
          redirect: 'error', signal: AbortSignal.timeout(30000) });
        if (attempt === 0 && [502, 503, 504].includes(response.status)) {
          await response.body?.cancel();
        } else break;
      } catch {
        if (attempt === 1) throw new Error('Dock skill server is unavailable; check the Dock connection');
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return limitedBody(response, max);
  }
  return {
    async manifest() {
      const bytes = await request('/api/v1/skills/loginom-automation', {
        target_uri: skillUri, include_content: 'true', include_files: 'true',
        include_integrity: 'true', include_source: 'true',
      }, limits.file + 1024 * 1024);
      return JSON.parse(bytes.toString('utf8')).result;
    },
    download(file) { return request('/api/v1/content/download', { uri: file.uri }, file.size); },
  };
}

async function verifyCache(directory, detail) {
  const root = await lstat(directory);
  if (!root.isDirectory() || !privatePath(root)) throw new Error('Unsafe Dock skill cache');
  const actual = [];
  async function walk(path, prefix = '') {
    for (const name of await readdir(path)) {
      const relative = prefix + name;
      const entry = await lstat(join(path, name));
      actual.push(relative);
      if (entry.isDirectory()) await walk(join(path, name), relative + '/');
      else if (!entry.isFile()) throw new Error('Unsafe Dock skill cache entry');
    }
  }
  await walk(directory);
  if (actual.sort().join('\0') !== detail.files.map(file => file.path).sort().join('\0')) {
    throw new Error('Dock skill cache contents changed');
  }
  for (const file of detail.files) {
    const path = join(directory, file.path);
    const entry = await lstat(path);
    if (!privatePath(entry) || (file.is_dir ? !entry.isDirectory() : !entry.isFile())) {
      throw new Error('Unsafe Dock skill cache entry');
    }
    if (!file.is_dir && (entry.size !== file.size || hash(await readFile(path)) !== file.sha256)) {
      throw new Error('Dock skill cache integrity mismatch');
    }
  }
}

export function createSkillLoader({ directory, transport }) {
  let pinned;
  let pending;
  async function load() {
    if (pinned) { await verifyCache(pinned.directory, pinned.detail); return pinned; }
    const detail = validateManifest(await transport.manifest());
    const staging = join(directory, `.skill-${randomUUID()}`);
    await mkdir(staging, { mode: 0o700 });
    protectWindowsDirectory(staging);
    try {
      for (const file of detail.files) {
        if (file.is_dir) await mkdir(join(staging, file.path), { recursive: true, mode: 0o700 });
      }
      for (const file of detail.files.filter(file => !file.is_dir)) {
        const bytes = await transport.download(file);
        if (bytes.length !== file.size || hash(bytes) !== file.sha256) throw new Error('Downloaded Dock skill integrity mismatch');
        await writeFile(join(staging, file.path), bytes, { mode: 0o600, flag: 'wx' });
      }
      const confirmation = validateManifest(await transport.manifest());
      if (confirmation.revision !== detail.revision) throw new Error('Dock skill changed during download; run dock_prepare again');
      await verifyCache(staging, detail);
      const target = join(directory, `skill-${detail.revision}`);
      await rename(staging, target);
      pinned = { directory: target, detail, main: join(target, 'SKILL.md') };
      return pinned;
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  return { prepare() {
    pending ??= load().finally(() => { pending = undefined; });
    return pending;
  } };
}

export const prepareTool = {
  name: 'dock_prepare',
  description: 'Prepare Loginom work: authenticate to Dock, download and verify the complete loginom-automation skill into this session cache, pin its revision, and return its main instructions now. Repeated calls keep the same revision. Successful preparation enables the installed native adapter to archive this Loginom task in the shared Dock account after secret redaction. Diagnostics reports actual activation.',
  inputSchema: { type: 'object', properties: {
    host_context_token: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Reserved opaque input ticket supplied by the native host. Do not invent this value.' },
    operation_id: {type:'string',pattern:'^[a-zA-Z0-9_.:-]{1,128}$'},
    intent: {type:'string',enum:['new_draft','open_package','existing_workflow']},
    package_path: {type:'string',minLength:1,maxLength:2048},
    workflow_ref: {type:'object',properties:{workflow_id:{type:'string'},document_id:{type:'string'},tab_tid:{type:'string'},prefix:{type:'string'},navigation_path:{type:'array',items:{type:'object',properties:{tid:{type:'string'},label:{type:'string'}},required:['tid','label'],additionalProperties:false}}},required:['workflow_id','document_id','tab_tid','prefix','navigation_path'],additionalProperties:false},
    timeout_ms: {type:'integer',minimum:1,maximum:120000},
  }, additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
};
