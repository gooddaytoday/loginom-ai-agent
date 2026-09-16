#!/usr/bin/env node
// Operator-only read-only geometry observation on the exact prepared Hermes page.
// No fault injection, generated product code changes, extra model-visible tools,
// browser resizing or duplicate preparation. Precheck cannot create this receipt.
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {parseWorkspacePreparation} from '../../client/lib/workspace.mjs';
const run=process.env.DOCK_ACCEPTANCE_RUN_DIR;
const request=JSON.parse(await readFile(join(run,'request.json'),'utf8'));
if(request.goal_id!=='missing-values-complete'||request.fault_injection!==false||request.provider!=='openai-codex'||request.model!=='gpt-5.6-sol'||request.reasoning_effort!=='low'||request.storage_directory!=='/test-4'||resolve(run).split('/').at(-1)!==request.run_id)throw Error('Invalid Node14 launch');
const original=Client.prototype.callTool;let captured=false;
Client.prototype.callTool=async function(call,...rest){
 const answer=await original.call(this,call,...rest);
 if(captured||call.name!=='browser_run_code_unsafe')return answer;
 let prepared;try{prepared=parseWorkspacePreparation(answer);}catch{return answer;}
 if(prepared.status!=='READY')return answer;
 const response=await original.call(this,{name:call.name,arguments:{code:'async page=>({viewport:page.viewportSize(),url:page.url(),window:await page.evaluate(()=>({width:innerWidth,height:innerHeight,outerWidth,outerHeight,availableWidth:screen.availWidth,availableHeight:screen.availHeight}))})'}});
 let geometry;for(const b of response.content??[]){if(b.type!=='text')continue;try{geometry=JSON.parse(b.text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1]??b.text);}catch{}}
 const w=geometry?.window;
 if(geometry?.viewport!==null||new URL(geometry.url).origin!==new URL(request.loginom_url).origin||!w||w.width!==w.outerWidth||w.width<w.availableWidth*.9||w.outerHeight<w.availableHeight*.9)throw Error('Actual Hermes window geometry differs');
 await writeFile(join(run,'geometry-'+prepared.session_id+'.json'),JSON.stringify({run_id:request.run_id,session_id:prepared.session_id,document_id:prepared.document_id,operation_id:prepared.operation_id,runtime_revision:request.runtime_source_pin.client_revision,source:'read_only_same_mcp_page_after_prepare',geometry},null,2)+'\n',{mode:0o600,flag:'wx'});captured=true;return answer;
};
await import('../../client/bin/loginom-dock.mjs');
