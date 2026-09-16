#!/usr/bin/env node
// Private operator harness: hide one genuine completed browser response.
// The product's page-local ledger retains the actual successful cleanup receipt.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCapabilityResult } from '../../client/lib/executor.mjs';
import { readTask } from './rename-client.mjs';
process.umask(0o077);

export function lostReceiptCall(original, saveReceipt) {
  let selected = false;
  return async function(request, ...args) {
    const task = readTask(request);
    if (selected || task?.mode !== 'apply' || task?.action?.action_key !== 'node.add'
        || task.parameters?.component_key !== 'imports.text') return original.call(this, request, ...args);
    if (!task.receipt_namespace || !task.receipt_signature) throw new Error('Lost receipt acceptance requires product page ledger');
    const response = await original.call(this, request, ...args);
    const actual = parseCapabilityResult(response);
    if (actual.status !== 'SUCCEEDED' || actual.cleanup_complete !== true) return response;
    selected = true;
    const sourceSha = createHash('sha256').update(request.arguments.code).digest('hex');
    await saveReceipt({ fault: 'lost_response_after_completed_browser_receipt',
      boundary: 'after_real_browser_call_and_page_receipt_completed_before_executor_receives_response',
      injection_reached: true, original_browser_response_withheld: true,
      source_code_sha256: sourceSha, injected_code_sha256: sourceSha, generated_code_modified: false,
      action_key: actual.action_key, operation_id: actual.operation_id, status: actual.status,
      error: actual.error, output: actual.output, trace: actual.trace, actual_browser_reply: actual,
      receipt_namespace: task.receipt_namespace, receipt_signature: task.receipt_signature,
      ui_mutations: 'Only unchanged product browser capability performed real node creation and rename.',
      receipt_fabricated: false });
    throw new Error('OPERATOR_SIMULATED_LOST_COMPLETED_BROWSER_RESPONSE');
  };
}


import { launchFault } from './fault-launcher.mjs';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await launchFault('lost_receipt', lostReceiptCall);
