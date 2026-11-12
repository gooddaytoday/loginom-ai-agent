import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { stemmer as stemRussian } from '@orama/stemmers/russian';
import { stemmer as stemEnglish } from '@orama/stemmers/english';

// Loginom Help ships with the product; the seven read-only tools keep the names
// and URIs the remote knowledge service used, so skills and node cards stay valid.
export const HELP_URI = 'viking://resources/loginom-dock/sources/loginom-help';
const RETIRED = ['viking://resources/loginom-dock/sources/e2e-tests', 'viking://resources/loginom-dock/sources/ai-skills'];
// Agent tool output is truncated at 50 KiB; keep every reply below it with room for the envelope.
const REPLY_BYTES = 44000;
const FRAGMENT_CHARS = 1500;

const uri = { type: 'string', description: `viking:// URI inside ${HELP_URI}; a path relative to it is accepted too.` };
const query = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Words to look for: Russian or English, node names, Calculator function names, or names from Excel, SQL, Delphi and similar systems.' },
    target_uri: { ...uri, description: `Optional directory or page URI that limits the search; default ${HELP_URI}.` },
    limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Number of fragments, default 5.' },
    read_content: { type: 'boolean', description: 'Return full fragment text instead of an excerpt.' },
  },
  required: ['query'],
};
const TOOLS = [
  { name: 'find', description: 'Search Loginom Help offline. Returns ranked fragments with their page URI, section breadcrumb and an excerpt; read the page with the read tool.', inputSchema: query },
  { name: 'search', description: 'Same as find: offline keyword search over Loginom Help with synonyms for Calculator functions.', inputSchema: query },
  { name: 'read', description: 'Read one or more Loginom Help pages by URI (.html links are mapped to the shipped .md pages). A directory URI returns its README page.', inputSchema: {
    type: 'object', properties: { uris: { anyOf: [uri, { type: 'array', items: uri, minItems: 1, maxItems: 10 }] } }, required: ['uris'] } },
  { name: 'list', description: 'List pages and subdirectories under a Loginom Help directory URI, with page titles.', inputSchema: {
    type: 'object', properties: { uri, recursive: { type: 'boolean' } }, required: ['uri'] } },
  { name: 'tree', description: 'Show the Loginom Help directory tree with page titles, indented by depth.', inputSchema: {
    type: 'object', properties: { uri, level_limit: { type: 'integer', minimum: 1 }, node_limit: { type: 'integer', minimum: 1 } } } },
  { name: 'glob', description: 'Find Loginom Help pages whose path matches a glob pattern (for example **/rest-request*).', inputSchema: {
    type: 'object', properties: { pattern: { type: 'string' }, uri, node_limit: { type: 'integer', minimum: 1 } }, required: ['pattern'] } },
  { name: 'grep', description: 'Search Loginom Help page text with JavaScript regular expressions; returns URI, line number and line.', inputSchema: {
    type: 'object', properties: { uri, pattern: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 }] },
      case_insensitive: { type: 'boolean' }, node_limit: { type: 'integer', minimum: 1 } }, required: ['uri', 'pattern'] } },
];
const NAMES = new Set(TOOLS.map(tool => tool.name));

export async function createKnowledgeClient({ helpRoot }, signal) {
  signal?.throwIfAborted();
  if (typeof helpRoot !== 'string' || !isAbsolute(helpRoot)) throw Error('LOGINOM_CONFIG_REQUIRED');
  const help = await loadHelp(helpRoot).catch(error => { throw Error('LOGINOM_KNOWLEDGE_UNAVAILABLE', { cause: error }); });
  signal?.throwIfAborted();
  const state = { closed: false };
  return {
    tools: structuredClone(TOOLS),
    catalogSha256: createHash('sha256').update(JSON.stringify(TOOLS)).digest('hex'),
    async call(input, signal) {
      if (state.closed) throw Error('LOGINOM_KNOWLEDGE_CLOSED');
      knowledgeRequestKey(input);
      if (!NAMES.has(input.name)) throw Error('LOGINOM_KNOWLEDGE_TOOL_DENIED');
      signal?.throwIfAborted();
      return answer(help, input.name, input.arguments ?? {});
    },
    // Calls finish synchronously, so there is nothing in flight to interrupt.
    interrupt(input) { validateKnowledgeInterrupt(input); },
    async close() { state.closed = true; },
  };
}

export function knowledgeRequestKey(input) {
  if (!input || typeof input.run !== 'string' || !input.run || typeof input.id !== 'string' || !input.id)
    throw Error('LOGINOM_KNOWLEDGE_REQUEST_INVALID');
  return JSON.stringify([input.run, input.id]);
}

export function validateKnowledgeInterrupt(input) {
  const all = input?.all === true && Object.keys(input).length === 1;
  if (!input || (input.all !== undefined && !all) || (!all && (typeof input.run !== 'string' || !input.run
    || (input.id !== undefined && (typeof input.id !== 'string' || !input.id)))))
    throw Error('LOGINOM_KNOWLEDGE_REQUEST_INVALID');
  return all;
}

function answer(help, name, args) {
  const reply = name === 'find' || name === 'search' ? search(help, args) : name === 'read' ? read(help, args)
    : name === 'list' ? list(help, args) : name === 'tree' ? tree(help, args) : name === 'glob' ? glob(help, args) : grep(help, args);
  // Echoed input can be arbitrarily long; no reply may exceed the agent output limit.
  for (const item of reply.content)
    if (Buffer.byteLength(item.text) > REPLY_BYTES) item.text = Buffer.from(item.text).subarray(0, REPLY_BYTES - 100).toString().replace(/\uFFFD$/, '') + '\n[truncated]';
  return reply;
}

async function loadHelp(root) {
  const manifest = JSON.parse(await readFile(join(root, 'help-manifest.json'), 'utf8'));
  if (manifest?.protocol !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('LOGINOM_HELP_MANIFEST_INVALID');
  const pages = new Map();
  for (const file of manifest.files) {
    if (typeof file?.path !== 'string' || !/^data\/(?:[^/]+\/)*[^/]+\.md$/.test(file.path) || file.path.split('/').includes('..'))
      throw Error('LOGINOM_HELP_MANIFEST_INVALID');
    const bytes = await readFile(join(root, 'loginom-help', file.path));
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw Error('LOGINOM_HELP_INTEGRITY');
    const text = bytes.toString('utf8');
    pages.set(file.path, { path: file.path, text, title: text.match(/^#{1,6}\s+(.+)$/m)?.[1].trim() ?? file.path });
  }
  const aliases = await readFile(join(root, 'aliases.jsonl'), 'utf8').then(
    text => text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line)),
    error => { if (error.code === 'ENOENT') return []; throw error; });
  return { pages, dirs: directories(pages), index: buildIndex(pages, aliases) };
}

function directories(pages) {
  const dirs = new Map([['', new Set()]]);
  for (const path of pages.keys()) {
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('/');
      if (!dirs.has(parent)) dirs.set(parent, new Set());
      dirs.get(parent).add(i === parts.length - 1 ? parts[i] : parts[i] + '/');
    }
  }
  return dirs;
}

function buildIndex(pages, aliases) {
  const fragments = [];
  for (const page of pages.values()) {
    const lines = page.text.split('\n');
    let heading = page.title, start = 0, body = [];
    const flush = () => {
      const text = body.join('\n').trim();
      for (let i = 0; i < text.length; i += FRAGMENT_CHARS)
        fragments.push({ path: page.path, heading, line: start + 1, text: text.slice(i, i + FRAGMENT_CHARS + 100), extra: '' });
    };
    lines.forEach((line, n) => {
      const match = line.match(/^#{1,6}\s+(.+)$/);
      if (!match) return void body.push(line);
      flush();
      heading = match[1].trim(); start = n; body = [line];
    });
    flush();
  }
  // Build-time synonyms let keyword search find functions by their names in other systems.
  for (const alias of aliases) {
    const text = (alias.aliases ?? []).join(' ; ');
    const owner = alias.fn && fragments.find(item => item.path === alias.path && new RegExp(`^${escape(alias.fn)}\\b`).test(item.heading));
    if (owner) owner.extra += ` ${alias.fn} ${text}`;
    else if (pages.has(alias.path)) fragments.push({ path: alias.path, heading: pages.get(alias.path).title, line: 1, text: '', extra: text, synonyms: true });
  }
  const documents = fragments.map(item => {
    const tf = new Map();
    const words = tokens(`${pages.get(item.path).title} > ${item.heading}\n${item.text} ${item.extra}`);
    for (const word of words) tf.set(word, (tf.get(word) ?? 0) + 1);
    return { tf, length: words.length };
  });
  const df = new Map();
  for (const document of documents) for (const word of document.tf.keys()) df.set(word, (df.get(word) ?? 0) + 1);
  return { fragments, documents, df, average: documents.reduce((sum, item) => sum + item.length, 0) / documents.length };
}

function tokens(text) {
  const split = text.replace(/[A-Za-z][A-Za-z0-9]*/g, word => {
    const parts = word.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
    return parts === word ? word : `${word} ${parts}`;
  });
  return (split.toLowerCase().match(/[a-zа-яё0-9_]+/g) ?? []).filter(word => word.length > 1)
    .map(word => /[а-яё]/.test(word) ? stemRussian(word) : stemEnglish(word));
}

function search(help, args) {
  if (typeof args.query !== 'string' || !args.query.trim()) return failure('find: query is required.');
  const scope = args.target_uri ? resolve(help, args.target_uri) : { dir: '' };
  if (scope.error) return failure(scope.error);
  if (scope.missing) return failure(`Not found: ${quote(uriOf(scope.missing))}.`);
  const prefix = scope.file ?? (scope.dir ? scope.dir + '/' : '');
  const limit = Number.isSafeInteger(args.limit) ? Math.min(10, Math.max(1, args.limit)) : 5;
  const words = [...new Set(tokens(args.query))];
  // A query word equal to a function heading (Decode, Data) ranks that function first.
  const exact = new Set(args.query.toLowerCase().match(/[a-z][a-z0-9]+/g));
  const { fragments, documents, df, average } = help.index;
  const scored = [];
  fragments.forEach((item, i) => {
    if (!item.path.startsWith(prefix)) return;
    let score = !item.synonyms && /^[A-Za-z][A-Za-z0-9]+$/.test(item.heading) && exact.has(item.heading.toLowerCase()) ? 10 : 0;
    for (const word of words) {
      const f = documents[i].tf.get(word);
      if (!f) continue;
      const n = df.get(word);
      score += Math.log(1 + (fragments.length - n + 0.5) / (n + 0.5)) * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * documents[i].length / average));
    }
    if (score > 0) scored.push([score, item]);
  });
  scored.sort((a, b) => b[0] - a[0]);
  const perPage = new Map();
  const hits = [];
  for (const [score, item] of scored) {
    const shown = item.synonyms ? fragments.find(other => other.path === item.path && !other.synonyms) ?? item : item;
    if ((perPage.get(item.path) ?? 0) >= 2 || hits.some(hit => hit.item === shown)) continue;
    perPage.set(item.path, (perPage.get(item.path) ?? 0) + 1);
    hits.push({ score, item: shown });
    if (hits.length === limit) break;
  }
  if (!hits.length) return text(`Nothing found in Loginom Help for «${quote(args.query)}». Try other words, a function name, or browse with tree.`);
  const blocks = hits.map(({ score, item }, i) => {
    const page = help.pages.get(item.path);
    const body = args.read_content === true ? item.text.slice(0, 6000) : excerpt(item.text, words);
    return `${i + 1}. ${uriOf(item.path)}  — ${page.title}${item.heading === page.title ? '' : ` > ${item.heading}`} (line ${item.line}, score ${score.toFixed(2)})\n${body}`;
  });
  return text(fit(blocks, `\n\nRead a whole page with the read tool, for example uris: "${uriOf(hits[0].item.path)}".`));
}

function excerpt(body, words) {
  const lines = body.split('\n');
  const at = lines.findIndex((line, i) => i > 0 && tokens(line).some(word => words.includes(word)));
  const from = Math.max(0, at - 1);
  const shown = (at < 0 ? lines : [lines[0], ...lines.slice(Math.max(1, from))]).join('\n').trim();
  return shown.length > 600 ? shown.slice(0, 600).trimEnd() + ' …' : shown;
}

function read(help, args) {
  const list = Array.isArray(args.uris) ? args.uris : [args.uris];
  if (!list.length || list.length > 10 || list.some(item => typeof item !== 'string')) return failure('read: uris must be a URI or a list of up to 10 URIs.');
  const blocks = [];
  let found = 0;
  for (const item of list) {
    const target = resolve(help, item);
    const path = target.file ?? (target.dir !== undefined && help.pages.has(`${target.dir}/README.md`) ? `${target.dir}/README.md` : undefined);
    if (path) {
      found++;
      blocks.push(`=== ${uriOf(path)} ===\n${help.pages.get(path).text}`);
      continue;
    }
    if (target.error) blocks.push(`=== ${quote(item)} ===\n${target.error}`);
    else if (target.dir !== undefined) blocks.push(`=== ${quote(item)} ===\nThis is a directory without README.md; use list.`);
    else blocks.push(`=== ${quote(item)} ===\nFile not found.${suggest(help, target.missing)}`);
  }
  return { ...text(fit(blocks, '')), ...(found ? {} : { isError: true }) };
}

function suggest(help, path) {
  const words = [...new Set(tokens((path ?? '').replace(/[/._-]+/g, ' ').replace(/\b(data|md|html|readme)\b/gi, ' ')))];
  const hits = [...help.pages.values()]
    .map(page => [tokens(`${page.path.replace(/[/._-]+/g, ' ')} ${page.title}`).filter(word => words.includes(word)).length, page])
    .filter(([score]) => score > 0).sort((a, b) => b[0] - a[0]).slice(0, 3);
  return hits.length ? ` Similar pages:\n${hits.map(([, page]) => `- ${uriOf(page.path)} — ${page.title}`).join('\n')}` : '';
}

function list(help, args) {
  const target = resolve(help, args.uri ?? HELP_URI);
  if (target.dir === undefined) return failure(target.error ?? `Not a directory: ${quote(String(args.uri))}`);
  const entries = args.recursive === true
    ? [...help.pages.keys()].filter(path => path.startsWith(target.dir ? target.dir + '/' : '')).sort()
    : [...help.dirs.get(target.dir)].sort().map(name => target.dir ? `${target.dir}/${name}` : name);
  return text(fit(entries.slice(0, 1000).map(path => help.pages.has(path) ? `${uriOf(path)} — ${help.pages.get(path).title}` : uriOf(path)), '', '\n'));
}

function tree(help, args) {
  const target = resolve(help, args.uri ?? HELP_URI);
  if (target.dir === undefined) return failure(target.error ?? `Not a directory: ${quote(String(args.uri))}`);
  const depth = Number.isSafeInteger(args.level_limit) && args.level_limit > 0 ? args.level_limit : 3;
  const limit = Number.isSafeInteger(args.node_limit) && args.node_limit > 0 ? args.node_limit : 1000;
  const lines = [uriOf(target.dir)];
  const walk = (dir, level) => {
    for (const name of [...help.dirs.get(dir)].sort()) {
      if (lines.length > limit) return;
      const path = dir ? `${dir}/${name.replace(/\/$/, '')}` : name.replace(/\/$/, '');
      lines.push(`${'  '.repeat(level)}${name}${help.pages.has(path) ? ` — ${help.pages.get(path).title}` : ''}`);
      if (name.endsWith('/') && level < depth) walk(path, level + 1);
    }
  };
  walk(target.dir, 1);
  return text(fit(lines, lines.length > limit ? '\n[node_limit reached]' : '', '\n'));
}

function glob(help, args) {
  if (typeof args.pattern !== 'string' || !args.pattern) return failure('glob: pattern is required.');
  const target = resolve(help, args.uri ?? HELP_URI);
  if (target.dir === undefined) return failure(target.error ?? `Not a directory: ${quote(String(args.uri))}`);
  const base = target.dir ? target.dir + '/' : '';
  const source = args.pattern.replace(/\.html\b/g, '.md').replace(/\*{3,}/g, '**').split(/(\*\*\/|\*\*|\*|\?)/).map(part =>
    part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : part === '*' ? '[^/]*' : part === '?' ? '[^/]' : escape(part)).join('');
  const limit = Number.isSafeInteger(args.node_limit) && args.node_limit > 0 ? args.node_limit : 100;
  const found = bounded('const pattern = new RegExp(source); paths.filter(path => pattern.test(path))',
    { source: `^${source}$`, paths: [...help.pages.keys()].filter(path => path.startsWith(base)).map(path => path.slice(base.length)) });
  if (found.error) return failure(`glob: ${found.error}`);
  const matches = [...found].map(path => base + path).sort();
  if (!matches.length) return text(`No pages match ${quote(args.pattern)} under ${uriOf(target.dir)}.`);
  return text(fit(matches.slice(0, limit).map(path => `${uriOf(path)} — ${help.pages.get(path).title}`),
    matches.length > limit ? `\n[${matches.length - limit} more]` : '', '\n'));
}

function grep(help, args) {
  const patterns = Array.isArray(args.pattern) ? args.pattern : [args.pattern];
  if (!patterns.length || patterns.length > 5 || patterns.some(item => typeof item !== 'string' || !item)) return failure('grep: pattern must be a string or up to 5 strings.');
  const target = resolve(help, args.uri ?? HELP_URI);
  if (target.error) return failure(target.error);
  if (target.missing) return failure(`Not found: ${quote(uriOf(target.missing))}.`);
  const paths = target.file ? [target.file] : [...help.pages.keys()].filter(path => path.startsWith(target.dir ? target.dir + '/' : '')).sort();
  const limit = Number.isSafeInteger(args.node_limit) && args.node_limit > 0 ? Math.min(args.node_limit, 200) : 20;
  const found = bounded(`const expressions = patterns.map(item => new RegExp(item, flags));
    const lines = [];
    let total = 0;
    for (const [uri, text] of files)
      text.split('\\n').forEach((line, i) => {
        if (!expressions.some(expression => expression.test(line))) return;
        if (++total <= limit) lines.push(uri + ':' + (i + 1) + ': ' + (line.length > 300 ? line.slice(0, 300) + ' …' : line));
      });
    ({ lines, total })`, { patterns, flags: args.case_insensitive === true ? 'iu' : 'u', limit,
    files: paths.map(path => [uriOf(path), help.pages.get(path).text]) });
  if (found.error) return failure(`grep: ${found.error}`);
  if (!found.total) return text(`No matches for ${quote(patterns.join(' | '))}.`);
  return text(fit([...found.lines], found.total > limit ? `\n[${found.total - limit} more matches; narrow uri or pattern]` : '', '\n'));
}

// Model-supplied patterns run with a time limit, so one catastrophic expression cannot stall Help for every chat.
function bounded(code, context) {
  try { return runInNewContext(code, context, { timeout: 3000 }); }
  catch (error) {
    return { error: error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT'
      ? 'the pattern takes too long on Loginom Help; simplify it'
      : `invalid pattern: ${quote(String(error?.message ?? error))}` };
  }
}

function resolve(help, value) {
  if (typeof value !== 'string' || !value.trim()) return { error: 'A URI is required.' };
  let path = value.trim();
  if (RETIRED.some(root => path.startsWith(root)))
    return { error: `${path.split('/').slice(0, 6).join('/')} is no longer shipped. Only Loginom Help is available: ${HELP_URI}.` };
  if (path.startsWith('viking://')) {
    if (path !== HELP_URI && !path.startsWith(HELP_URI + '/')) return { error: `Only Loginom Help is available: ${HELP_URI}.` };
    path = path.slice(HELP_URI.length);
  }
  path = path.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '').replace(/(^|\/)index\.html$/, '$1README.md').replace(/\.html$/, '.md');
  // The Help root itself opens the data tree, whose README.md is the main page.
  path = !path || path === 'data' || path.startsWith('data/') ? path || 'data' : `data/${path}`;
  if (path.split('/').includes('..')) return { error: 'Parent directory references are not allowed.' };
  if (help.pages.has(path)) return { file: path };
  if (help.dirs.has(path)) return { dir: path };
  if (help.pages.has(`${path}.md`)) return { file: `${path}.md` };
  return { missing: path };
}

function fit(blocks, footer, separator = '\n\n') {
  const out = [];
  let size = Buffer.byteLength(footer);
  for (const block of blocks) {
    const bytes = Buffer.byteLength(block) + separator.length;
    if (size + bytes > REPLY_BYTES) {
      if (!out.length) out.push(Buffer.from(block).subarray(0, REPLY_BYTES - size - 200).toString().replace(/�$/, '') + '\n[truncated; use grep for the rest of this page]');
      out.push(`[reply limit reached: ${blocks.length - out.length} more item(s) not shown; request them separately]`);
      break;
    }
    out.push(block);
    size += bytes;
  }
  return out.join(separator) + footer;
}

const uriOf = path => path ? `${HELP_URI}/${path}` : HELP_URI;
const text = value => ({ content: [{ type: 'text', text: value }] });
const failure = value => ({ ...text(value), isError: true });
const quote = value => value.length > 200 ? `${value.slice(0, 200)}…` : value;
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
