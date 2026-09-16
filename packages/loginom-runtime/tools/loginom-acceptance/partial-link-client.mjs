#!/usr/bin/env node
// Private fault: after a real Input_Add drag, delete only its exact new link
// through Loginom UI. The unchanged product reconciliation observes the real diff.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCapabilityResult } from '../../client/lib/executor.mjs';
import { readTask } from './rename-client.mjs';

process.umask(0o077);
export const LINK_NEEDLE = "      const observed = await reconcileLink(before, { stage: 'after_drag', attempt: attempt + 1 });";
const INJECTION = `      // PRIVATE ACCEPTANCE FAULT; this code is never part of the client runtime.
      {
        const faultLinks = await graphLinks(workflow.prefix);
        const faultPorts = await ports(workflow.prefix, targetNode.node_label);
        const faultAddedLinks = faultLinks.filter(value => !before.links.includes(value));
        const faultAddedPorts = faultPorts.filter(value => !before.ports.includes(value));
        const faultExact = faultAddedPorts.length === 1
          ? workflow.prefix + ';Graph;' + sourceNode.node_label + '|' + before.source_tid.split(';').at(-1)
            + '|' + targetNode.node_label + '|' + faultAddedPorts[0].split(';').at(-1) : null;
        if (faultAddedLinks.length === 1 && faultAddedPorts.length === 1 && faultAddedLinks[0] === faultExact
            && before.links.every(value => faultLinks.includes(value)) && before.ports.every(value => faultPorts.includes(value))) {
          const faultNodes = await graphNodes(workflow.prefix);
          record('operator_fault_before', { fault: 'remove_only_new_link_keep_added_port',
            nodes: faultNodes, ports: faultPorts, links: faultLinks, removed_link_tid: faultExact,
            baseline: { ports: before.ports, links: before.links } });
          const faultLink = tid('', faultExact);
          if (await faultLink.count() !== 1 || !(await faultLink.isVisible())) throw new Error('OPERATOR_FAULT_EXACT_LINK_NOT_VISIBLE');
          await interact(timeout => faultLink.click({ timeout }), true);
          await poll(async () => {
            const bend = tid('', faultExact + ';TargetBend');
            return await bend.count() === 1 && await bend.isVisible();
          });
          const faultSelectedBends = await visible(page.locator('[data-tid^=' + cssString(workflow.prefix + ';Graph;') + '][data-tid$=";TargetBend"]'));
          if (faultSelectedBends.length !== 1 || await faultSelectedBends[0].getAttribute('data-tid') !== faultExact + ';TargetBend') {
            throw new Error('OPERATOR_FAULT_SELECTION_NOT_EXACT');
          }
          await interact(() => page.keyboard.press('Delete'), true);
          transientDialog = true;
          const faultDialog = await poll(async () => {
            const matches = await visible(page.locator('[data-tid^="msgbox"][data-tid$="cnt;cnt;cmp"]'));
            return matches.length ? matches : null;
          });
          if (faultDialog.length !== 1 || (await faultDialog[0].innerText()).trim() !== 'Удалить выделенную связь?') {
            throw new Error('OPERATOR_FAULT_DELETE_CONFIRMATION_NOT_EXACT');
          }
          const faultDialogTid = await faultDialog[0].getAttribute('data-tid');
          const faultYes = tid('', faultDialogTid.replace(/cnt;cnt;cmp$/, 'tlb;yes'));
          if (await faultYes.count() !== 1 || !(await faultYes.isVisible()) || !(await faultYes.isEnabled())) {
            throw new Error('OPERATOR_FAULT_DELETE_BUTTON_NOT_EXACT');
          }
          await interact(timeout => faultYes.click({ timeout }), true);
          await poll(async () => !(await tid('', faultExact).count()));
          await waitForNoMask();
          transientDialog = false;
          const faultAfterLinks = await graphLinks(workflow.prefix);
          const faultAfterPorts = await ports(workflow.prefix, targetNode.node_label);
          const faultAfterNodes = await graphNodes(workflow.prefix);
          if (!same(faultAfterLinks, before.links) || !same(faultAfterPorts, faultPorts) || !same(faultAfterNodes, faultNodes)) {
            throw new Error('OPERATOR_FAULT_POSTCONDITION_NOT_EXACT');
          }
          record('operator_fault_injected', { fault: 'remove_only_new_link_keep_added_port',
            nodes: faultAfterNodes, ports: faultAfterPorts, links: faultAfterLinks,
            removed_link_tid: faultExact, retained_added_port_tid: faultAddedPorts[0],
            delta: { added_ports: faultAddedPorts, added_links: [] } });
        }
      }
`;

export function injectPartialLink(request) {
  const code = request.arguments.code;
  if (code.split(LINK_NEEDLE).length !== 2) throw new Error('Fault injection source needle is not unique');
  return { ...request, arguments: { ...request.arguments, code: code.replace(LINK_NEEDLE, INJECTION + LINK_NEEDLE) } };
}

export function partialLinkFaultCall(original, saveReceipt) {
  let selected = false;
  return async function(request, ...args) {
    const task = readTask(request);
    if (selected || task?.mode !== 'apply' || task?.action?.action_key !== 'link.create'
      || task.parameters?.target_port?.kind !== 'add'
      || task.parameters?.source_node?.node_label !== 'Источник'
      || task.parameters?.target_node?.node_label !== 'Объединение') return original.call(this, request, ...args);
    selected = true;
    const patched = injectPartialLink(request);
    const response = await original.call(this, patched, ...args);
    const actual = parseCapabilityResult(response);
    await saveReceipt({ fault: 'remove_only_new_link_keep_added_port',
      boundary: 'inside_browser_after_genuine_Input_Add_drag_before_product_reconciliation',
      injection_reached: actual.trace.some(item => item.event === 'operator_fault_injected'),
      source_code_sha256: createHash('sha256').update(request.arguments.code).digest('hex'),
      injected_code_sha256: createHash('sha256').update(patched.arguments.code).digest('hex'),
      action_key: actual.action_key, operation_id: actual.operation_id, status: actual.status,
      error: actual.error, output: actual.output, trace: actual.trace, actual_browser_reply: actual,
      ui_mutations: 'Original drag; select exact just-created link; Delete; confirm only exact one-link dialog. No DOM or RPC mutations.',
      receipt_fabricated: false });
    return response;
  };
}


import { launchFault } from './fault-launcher.mjs';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await launchFault('partial_link', partialLinkFaultCall);
