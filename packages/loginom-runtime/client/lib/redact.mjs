const sensitiveKey = /(?:^|[_-])(?:api[_-]?key|access[_-]?key|secret|password|passwd|token|cookie|authorization|private[_-]?key)(?:$|[_-])/i;
const forbiddenKey = /^(?:reasoning|reasoning_content|reasoning_details|codex_reasoning_items|system_prompt|systemPrompt|developer_prompt|browser_profile|binary|base64)$/i;
const marker = '[redacted]';
const usageCounters = new Set(['input_tokens', 'output_tokens', 'prompt_tokens', 'completion_tokens', 'total_tokens',
  'cache_read_tokens', 'cache_write_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'cached_tokens', 'reasoning_tokens']);
const secretField = key => sensitiveKey.test(key.replace(/([a-z])([A-Z])/g, '$1_$2'));

export function createRedactor(knownValues = []) {
  const known = new Set(knownValues.filter(value => typeof value === 'string' && value.length >= 4));
  function text(raw) {
    let value = raw;
    for (const secret of [...known].sort((a, b) => b.length - a.length)) {
      for (const variant of new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)])) {
        value = value.replaceAll(variant, marker);
      }
    }
    value = value.replace(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g, marker)
      .replace(/\b(?:sk-(?:or-v1-|proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{12,})\b/g, marker)
      .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, marker)
      .replace(/(?:пароль|токен|секретный ключ)\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}&]+)/gi,
        match => match.replace(/([:=])\s*[\s\S]*$/, '$1 ' + marker))
      .replace(/\b(?:Cookie|Set-Cookie|Authorization)\s*:\s*[^\r\n]+/gi, match => match.split(':', 1)[0] + ': ' + marker)
      .replace(/\b(?:[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)|api[_-]?key|password|passwd|access[_-]?token|refresh[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}&]+)/gi,
        match => match.replace(/([:=])\s*[\s\S]*$/, '$1 ' + marker))
      .replace(/https?:\/\/[^\s<>"'`]+/gi, rawUrl => {
        try {
          const url = new URL(rawUrl);
          if (url.username || url.password) { url.username = ''; url.password = ''; }
          for (const key of [...url.searchParams.keys()]) {
            if (secretField(key) || /^(?:key|sig|signature|auth|credential)$/i.test(key)) url.searchParams.set(key, marker);
          }
          if (url.hash && /token|password|secret|key|auth/i.test(url.hash)) url.hash = marker;
          return url.href;
        } catch { return '[URL omitted: invalid]'; }
      })
      .replace(/data:(?:image|audio|video|application)\/[^\s"']+/gi, '[binary omitted]');
    return value;
  }
  function collect(value, depth = 0) {
    if (depth > 40) throw new Error('Redaction nesting limit');
    if (typeof value === 'string' && /^[\s]*[\[{]/.test(value)) {
      try { collect(JSON.parse(value), depth + 1); } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (/password|secret|token|api.key|пароль/i.test(String(value.element || value.name || ''))) {
      for (const item of [value.text, value.value]) if (typeof item === 'string' && item.length >= 4) known.add(item);
    }
    for (const [key, item] of Object.entries(value)) {
      if ((secretField(key) || usageCounters.has(key)) && typeof item === 'string' && item.length >= 4) known.add(item);
      else if (!forbiddenKey.test(key)) collect(item, depth + 1);
    }
  }
  function clean(value, seen = new Set(), depth = 0) {
    if (depth > 40) throw new Error('Redaction nesting limit');
    if (typeof value === 'string') {
      if (/^[\s]*[\[{]/.test(value)) {
        try { return JSON.stringify(clean(JSON.parse(value), seen, depth + 1)); }
        catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      }
      return text(value);
    }
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value !== 'object' || seen.has(value)) throw new Error('Unsupported redaction input');
    seen.add(value);
    try {
      if (Buffer.isBuffer(value) || value instanceof Uint8Array) return '[binary omitted]';
      if (['system', 'developer'].includes(value.role) || ['analysis', 'summary'].includes(value.channel)) return { omitted: 'non-visible instructions or reasoning' };
      if (Array.isArray(value)) return value.map(item => clean(item, seen, depth + 1));
      if (['image', 'audio', 'video', 'image_url', 'input_image', 'resource'].includes(value.type)) return { type: 'text', text: '[binary artifact omitted]' };
      if ((/password|secret|token|api.key|пароль/i.test(String(value.element || value.name || '')))
          && ('text' in value || 'value' in value)) return { redacted: 'credential input' };
      const result = Object.create(null);
      for (const [key, item] of Object.entries(value)) {
        if (forbiddenKey.test(key)) continue;
        if (usageCounters.has(key)) result[key] = item === null || (Number.isSafeInteger(item) && item >= 0) ? item : marker;
        else if (secretField(key)) result[key] = marker;
        else if (['code', 'command', 'cmd'].includes(key) && typeof item === 'string'
            && /password|passwd|cookie|authorization|private.?key/i.test(item)) result[key] = '[credential operation omitted]';
        else result[key] = clean(item, seen, depth + 1);
      }
      return result;
    } finally { seen.delete(value); }
  }
  return { redact(value) {
    try { collect(value); return clean(value); }
    catch { return { type: 'redaction_failure', omitted: true, reason: 'Content omitted because redaction could not complete' }; }
  }, prime(value) { collect(value); }, text };
}
