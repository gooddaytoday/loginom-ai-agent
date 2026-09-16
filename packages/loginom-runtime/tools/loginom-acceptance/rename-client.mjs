#!/usr/bin/env node
// Private operator fault injection. Never shipped or registered as a product tool.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCapabilityResult } from '../../client/lib/executor.mjs';

process.umask(0o077);
export const RENAME_NEEDLE = "        await interact(timeout => resolve('workflow.node_label', { node_label: label }, { stable: false }).then(item => item.dblclick({ timeout })), true);";
const INJECTION = "        record('operator_fault_injected', { fault: 'rename_interrupted_after_real_node_drag', added_label: label });\n        throw new Error('OPERATOR_RENAME_EDITOR_INTERRUPTED');\n";

export function readTask(request) {
  const code = request?.arguments?.code;
  if (request?.name !== 'browser_run_code_unsafe' || typeof code !== 'string') return null;
  const start = code.lastIndexOf(')(page, ');
  if (!code.startsWith('async (page) => (') || start < 0 || !code.endsWith(')')) return null;
  // Read the final JSON argument by its grammar boundary. A page-receipt wrapper
  // adds one closing parenthesis; braces and parentheses inside JSON strings
  // must never influence the boundary. No eval or executable parsing is used.
  const jsonStart = start + 8;
  if (code[jsonStart] !== '{') return null;
  let depth = 0, quoted = false, escaped = false;
  for (let index = jsonStart; index < code.length; index++) {
    const char = code[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        if (!/^\){1,2}$/.test(code.slice(index + 1))) return null;
        try { return JSON.parse(code.slice(jsonStart, index + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export function injectRename(request) {
  const code = request.arguments.code;
  if (code.split(RENAME_NEEDLE).length !== 2) throw new Error('Fault injection source needle is not unique');
  return { ...request, arguments: { ...request.arguments, code: code.replace(RENAME_NEEDLE, INJECTION + RENAME_NEEDLE) } };
}

export function renameFaultCall(original, saveReceipt) {
  let selected = false;
  return async function(request, ...args) {
    const task = readTask(request);
    if (selected || task?.mode !== 'apply' || task?.action?.action_key !== 'node.add'
      || task.parameters?.component_key !== 'imports.text' || task.parameters?.expected_label !== 'Источник') {
      return original.call(this, request, ...args);
    }
    selected = true;
    const patched = injectRename(request);
    const response = await original.call(this, patched, ...args);
    const actual = parseCapabilityResult(response);
    await saveReceipt({ fault: 'rename_interrupted_after_real_node_drag',
      boundary: 'inside_browser_after_real_drag_and_graph_diff_before_opening_rename_editor',
      injection_reached: actual.trace.some(item => item.event === 'operator_fault_injected'),
      source_code_sha256: createHash('sha256').update(request.arguments.code).digest('hex'),
      injected_code_sha256: createHash('sha256').update(patched.arguments.code).digest('hex'),
      action_key: actual.action_key, operation_id: actual.operation_id, status: actual.status,
      error: actual.error, output: actual.output, trace: actual.trace,
      actual_browser_reply: actual,
      ui_mutations: 'Only original real mouse drag occurred; no DOM or RPC mutations were injected.',
      receipt_fabricated: false });
    return response;
  };
}


import { launchFault } from './fault-launcher.mjs';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await launchFault('rename', renameFaultCall);
