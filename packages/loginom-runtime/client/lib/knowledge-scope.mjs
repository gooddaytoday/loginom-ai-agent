const root = 'viking://resources/loginom-dock';
const uriPattern = '^viking://resources/loginom-dock(?:/(?!\\.{1,2}(?:/|$))[^/%\\\\?#\\x00-\\x20\\x7f]+)*/?$';
const globPattern = '^(?!/)(?!.*[:%\\\\\\x00-\\x1f\\x7f])(?!.*//)(?!.*(?:^|/)\\.{1,2}(?:/|$)).+$';

export function scopeKnowledgeTool(tool) {
  const schema = tool.inputSchema;
  const properties = { ...schema.properties };
  if (tool.name === 'read') properties.uris = { ...properties.uris, minItems: 1,
    items: { ...properties.uris?.items, type: 'string', pattern: uriPattern } };
  if (['find', 'search'].includes(tool.name))
    properties.target_uri = { ...properties.target_uri, type: 'string', pattern: uriPattern, default: root };
  if (['list', 'tree', 'grep', 'glob'].includes(tool.name))
    properties.uri = { ...properties.uri, type: 'string', pattern: uriPattern,
      ...(['tree', 'glob'].includes(tool.name) ? { default: root } : {}) };
  if (tool.name === 'search') properties.mode = { type: 'string', enum: ['list'], default: 'list' };
  if (tool.name === 'glob') properties.pattern = { ...properties.pattern, type: 'string', pattern: globPattern };
  return { ...tool, description: `${tool.description ?? ''} Only the official knowledge base ${root} and its descendants are accessible.`,
    inputSchema: { ...schema, properties } };
}

export function scopeKnowledgeArguments(name, args) {
  if (!['find', 'search', 'read', 'list', 'tree', 'grep', 'glob'].includes(name)
    || !args || typeof args !== 'object' || Array.isArray(args))
    throw Error('LOGINOM_KNOWLEDGE_SCOPE_DENIED');
  if (name === 'glob' && (typeof args.pattern !== 'string' || !args.pattern || args.pattern.startsWith('/')
    || /[:%\\\x00-\x1f\x7f]/.test(args.pattern) || args.pattern.includes('//')
    || args.pattern.split('/').some(part => part === '.' || part === '..')))
    throw Error('LOGINOM_KNOWLEDGE_SCOPE_DENIED');
  if (name === 'read') {
    const uris = Array.isArray(args.uris) ? args.uris : [args.uris];
    if (!uris.length) throw Error('LOGINOM_KNOWLEDGE_SCOPE_DENIED');
    uris.forEach(requireKnowledgeUri);
    return { ...args };
  }
  if (['list', 'tree', 'grep', 'glob'].includes(name))
    return { ...args, uri: requireKnowledgeUri(args.uri === undefined && ['tree', 'glob'].includes(name) ? root : args.uri) };
  if (name === 'search' && args.mode !== undefined && args.mode !== 'list')
    throw Error('LOGINOM_KNOWLEDGE_SCOPE_DENIED');
  return { ...args, ...(name === 'search' ? { mode: 'list' } : {}),
    target_uri: requireKnowledgeUri(args.target_uri === undefined ? root : args.target_uri) };
}

function requireKnowledgeUri(value) {
  if (typeof value !== 'string' || (value !== root && !value.startsWith(`${root}/`))
    || /[%\\?#\x00-\x20\x7f]/.test(value) || value.slice('viking://'.length).includes('//')
    || value.split('/').some(part => part === '.' || part === '..'))
    throw Error('LOGINOM_KNOWLEDGE_SCOPE_DENIED');
  return value;
}
