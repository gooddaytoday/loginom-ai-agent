import {parse, version} from 'acorn';
import {javascriptSourceIdentity} from './javascript-source-read.mjs';

export const JAVASCRIPT_MODULE_POLICY = 'javascript-module-v1';
const parser = Object.freeze({name: 'acorn', version: '8.15.0', ecma_version: 2025, source_type: 'module'});
const refusal = (reason, location = null) => Object.freeze({status: 'REFUSED', policy: JAVASCRIPT_MODULE_POLICY, parser, reason, location});
function locationOf(node) {
  const point = node?.loc?.start ?? node?.loc;
  const offset = node?.start ?? node?.pos;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 32768 || !Number.isSafeInteger(point?.line)
    || point.line < 1 || point.line > 32768 || !Number.isSafeInteger(point.column) || point.column < 0 || point.column > 32768) return null;
  return Object.freeze({offset_utf16: offset, line: point.line, column_utf16: point.column});
}

// Pure syntactic filter, not a ChakraCore profile or an execution sandbox.
// Neither parser diagnostics nor source/AST escape this function.
export function inspectJavascriptModulePolicy(source) {
  let identity;
  try { identity = javascriptSourceIdentity(source); }
  catch { return refusal('source_bounds'); }
  if (version !== parser.version) return refusal('parser_version');
  let tree;
  try { tree = parse(source, {ecmaVersion: 2025, sourceType: 'module', locations: true}); }
  catch (error) { return refusal(error instanceof SyntaxError ? 'syntax' : 'unclassifiable', locationOf(error)); }
  const pending = [tree]; let count = 0;
  while (pending.length) {
    if (++count > 65536 || pending.length > 65536) return refusal('ast_bound');
    const node = pending.pop();
    if (node.type === 'ImportExpression') return refusal('dynamic_import', locationOf(node));
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require')
      return refusal('direct_require', locationOf(node));
    if (['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) && node.source
      && node.source.value !== 'builtIn/Data') return refusal('module_specifier', locationOf(node.source));
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') pending.push(child);
      } else if (value && typeof value === 'object' && typeof value.type === 'string') pending.push(value);
    }
  }
  return Object.freeze({status: 'ADMITTED', policy: JAVASCRIPT_MODULE_POLICY, parser, ...identity});
}
