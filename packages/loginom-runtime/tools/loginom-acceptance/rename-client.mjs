#!/usr/bin/env node
// Private operator fault injection. Never shipped or registered as a product tool.
import { createHash } from 'node:crypto';
import {parse} from '../../client/node_modules/acorn/dist/acorn.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCapabilityResult } from '../../client/lib/executor.mjs';

process.umask(0o077);
export const RENAME_NEEDLE = "        await interact(timeout => resolve('workflow.node_label', { node_label: label }, { stable: false }).then(item => item.dblclick({ timeout })), true);";
const INJECTION = "        record('operator_fault_injected', { fault: 'rename_interrupted_after_real_node_drag', added_label: label });\n        throw new Error('OPERATOR_RENAME_EDITOR_INTERRUPTED');\n";

export function readTask(request) {
  const code=request?.arguments?.code;
  if(request?.name!=='browser_run_code_unsafe'||typeof code!=='string'
    ||!code.startsWith('async (page) => (')||Buffer.byteLength(code)>2097152)return null;
  // Parse only syntax. Native reader functions follow the JSON task in the
  // current generator; strings and nested functions cannot define its boundary.
  const wrapped='('+code+')';
  try{
    const tree=parse(wrapped,{ecmaVersion:2025}),arrow=tree.body[0]?.expression,call=arrow?.body;
    if(tree.body.length!==1||arrow?.type!=='ArrowFunctionExpression'||arrow.async!==true
      ||arrow.params.length!==1||arrow.params[0].name!=='page'||call?.type!=='CallExpression'
      ||call.callee.type!=='FunctionExpression'||call.arguments[0]?.type!=='Identifier'
      ||call.arguments[0].name!=='page'||call.arguments[1]?.type!=='ObjectExpression')return null;
    const task=JSON.parse(wrapped.slice(call.arguments[1].start,call.arguments[1].end));
    if(call.callee.id?.name==='browserCapability'&&call.arguments.length===5)return task;
    if(call.callee.id?.name!=='browserReceipt'||call.arguments.length!==3)return null;
    const perform=call.arguments[2],inner=perform?.body;
    if(perform?.type!=='ArrowFunctionExpression'||perform.async||perform.params.length!==0
      ||inner?.type!=='CallExpression'||inner.callee.type!=='FunctionExpression'
      ||inner.callee.id?.name!=='browserCapability'||inner.arguments.length!==5
      ||inner.arguments[0]?.type!=='Identifier'||inner.arguments[0].name!=='page'
      ||inner.arguments[1]?.type!=='ObjectExpression')return null;
    const underlying=JSON.parse(wrapped.slice(inner.arguments[1].start,inner.arguments[1].end));
    return JSON.stringify(task)===JSON.stringify(underlying)?task:null;
  }catch{return null;}
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
