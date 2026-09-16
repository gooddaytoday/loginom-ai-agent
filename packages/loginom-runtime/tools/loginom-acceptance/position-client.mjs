#!/usr/bin/env node
// Private fault: shift one real drop 24px right. Keep request/checkpoint intact.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCapabilityResult } from '../../client/lib/executor.mjs';
import { readTask } from './rename-client.mjs';
process.umask(0o077);
export const DROP_NEEDLE='    await drag(component, before.geometry.point);';
const END_NEEDLE='    return reconcileNode(before);\n  };\n  const portSymbol';
const DROP_REPLACEMENT=`    const operatorDropPoint = { x: before.geometry.point.x + 24, y: before.geometry.point.y };
    const operatorWorkarea = await (await resolve('workflow.workarea')).boundingBox();
    if (!operatorWorkarea || operatorDropPoint.x > operatorWorkarea.x + operatorWorkarea.width - 8) {
      throw new Error('OPERATOR_POSITION_FAULT_UNSAFE_BOUNDARY');
    }
    record('operator_fault_before', { fault: 'shifted_node_drop_position', expected_point: before.geometry.point,
      expected_geometry: before.geometry, actual_drop_point: operatorDropPoint, graph: await rawGraph(prefix) });
    await drag(component, operatorDropPoint);`;
const END_REPLACEMENT=`    const operatorNode = await resolve('workflow.node', { node_label: label }, { stable: false });
    const operatorRect = operatorNode.locator('rect').first();
    record('operator_fault_injected', { fault: 'shifted_node_drop_position', delta_screen_x: 24,
      graph: await rawGraph(prefix), node_label: label, expected_geometry: before.geometry,
      actual_svg: { x: Number(await operatorRect.getAttribute('x')), y: Number(await operatorRect.getAttribute('y')) } });
    return reconcileNode(before);
  };
  const portSymbol`;
export function injectPosition(request) {
  const code=request.arguments.code;
  if (code.split(DROP_NEEDLE).length!==2 || code.split(END_NEEDLE).length!==2) throw new Error('Position fault source needles must be unique');
  return {...request,arguments:{...request.arguments,code:code.replace(DROP_NEEDLE,DROP_REPLACEMENT).replace(END_NEEDLE,END_REPLACEMENT)}};
}
export function positionFaultCall(original, saveReceipt) {
  let selected=false;
  return async function(request,...args) {
    const task=readTask(request);
    if(selected || task?.mode!=='apply' || task?.action?.action_key!=='node.add' || task.parameters?.component_key!=='imports.text'
       || task.parameters?.expected_label!=='Источник') return original.call(this,request,...args);
    selected=true;const patched=injectPosition(request);
    const response=await original.call(this,patched,...args);const actual=parseCapabilityResult(response);
    await saveReceipt({fault:'shifted_node_drop_position',boundary:'real mouse drop shifted24px right; original checkpoint and requested coordinates retained',
      injection_reached:actual.trace.some(event=>event.event==='operator_fault_injected'),
      source_code_sha256:createHash('sha256').update(request.arguments.code).digest('hex'),
      injected_code_sha256:createHash('sha256').update(patched.arguments.code).digest('hex'),
      action_key:actual.action_key,operation_id:actual.operation_id,status:actual.status,error:actual.error,output:actual.output,
      trace:actual.trace,actual_browser_reply:actual,receipt_fabricated:false,
      ui_mutations:'Only original mouse drag with +24px destination correction and original rename; no DOM/RPC mutation or outcome fabrication.'});
    return response;
  };
}

import { launchFault } from './fault-launcher.mjs';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await launchFault('position', positionFaultCall);
