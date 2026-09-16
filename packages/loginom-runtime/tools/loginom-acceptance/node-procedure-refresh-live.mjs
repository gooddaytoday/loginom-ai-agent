// Operator-only source-runtime QA. Exercises the legacy settings procedure and
// its local pre-gesture recovery; does not attest upload, output or persistence.
import fs from 'node:fs/promises';
import {Client} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport,getDefaultEnvironment} from '../../client/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {createSession} from '../../client/lib/session.mjs';
import {makeWorkspacePrepareCode} from '../../client/lib/workspace.mjs';
import {makeWorkspaceUiCode} from '../../client/lib/workspace-ui.mjs';
import {createActionRuntime,withBrowserReceipt} from '../../client/lib/executor.mjs';
import {createNodeProcedure} from '../../client/lib/node-procedure.mjs';
import {configureTextImportDraft,validateTextImportRequest} from '../../client/lib/text-import-procedure.mjs';
import {createExecutionJournal} from '../../client/lib/execution-journal.mjs';
process.umask(0o077);
const option=name=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw Error('Required '+name);return process.argv[i+1]};
const loginomUrl=option('--loginom-url'),user=option('--loginom-user'),settings=JSON.parse(await fs.readFile(option('--settings'),'utf8'));
validateTextImportRequest(settings);
const url=new URL(loginomUrl);if(url.username||url.password)throw Error('Do not put credentials in URL');
const dir=process.cwd()+'/.dock/text-import-v3/refresh-'+Date.now();await fs.mkdir(dir+'/runtime',{recursive:true});await fs.symlink(process.env.HOME+'/.loginom-dock/runtime/browsers',dir+'/runtime/browsers');
const session=await createSession({stateDir:dir,agent:'codex',adapterRevision:'text-import-refresh-qa-v1',mode:'executor-replay'});
session.metadata.targetIdentity={origin:url.origin,loginom_build:'7.4.2'};
await fs.writeFile(dir+'/session.json',JSON.stringify(session.metadata,null,2));await fs.writeFile(dir+'/expected.json',JSON.stringify(settings,null,2));
const client=new Client({name:'node-procedure-refresh-qa',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[session.browserCli,'--config',session.browserConfig],env:{...getDefaultEnvironment(),PLAYWRIGHT_BROWSERS_PATH:session.browserRoot},stderr:'pipe'});transport.stderr?.on('data',()=>{});
let sequence=0;const record=createExecutionJournal({directory:dir,metadata:session.metadata});
const execute=async code=>{
 const reply=await client.callTool({name:'browser_run_code_unsafe',arguments:{code}},undefined,{timeout:60000});
 await fs.writeFile(dir+'/browser-'+(++sequence)+'.json',JSON.stringify(reply));
 const text=reply.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');const raw=text.match(/^### Result\n([\s\S]*?)(?:\n### |$)/)?.[1];if(!raw)throw Error(text);return JSON.parse(raw);
};
console.log(JSON.stringify({dir,stage:'starting',runtime:session.metadata.clientRevision}));
try {
 await client.connect(transport);await client.callTool({name:'browser_navigate',arguments:{url:loginomUrl}});
 await execute(`async page=>{await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').fill(${JSON.stringify(user)});await page.locator('[data-tid="LoginForm;Login;btnLogin"]').click();await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').waitFor();return true}`);
 const prep=await execute(makeWorkspacePrepareCode({loginomUrl,compatibility:{profile_id:'loginom-7.4.2-macos-chromium',loginom_build:'7.4.2',platform:'macos',browser:'chromium'},sessionId:session.metadata.sessionId,operationId:'prepare',timeoutMs:15000}));
 if(prep.status!=='READY')throw Error('Workspace preparation failed');await fs.writeFile(dir+'/preparation.json',JSON.stringify(prep,null,2));
 const actions=JSON.parse(await fs.readFile('executor/catalog/actions.json')).actions,selectors=JSON.parse(await fs.readFile('executor/catalog/selectors.json')).selectors;
 const runtime=createActionRuntime({pinned:{actions:new Map(actions.map(a=>[a.action_key,a])),selectors:new Map(selectors.map(s=>[s.symbol,s])),pins:{}},execute,onRecord:record,targetOrigin:url.origin,targetBuild:'7.4.2'});
 const target=await runtime.runNodeTarget({document_id:prep.document_id,workflow_ref:prep.workflow_ref,target:{kind:'new',type:'imports.text',label:'Import03QA',position:{x:96,y:80}},inputs:[]},{operationId:'target'});
 if(target.status!=='SUCCEEDED')throw Error('Node target failed');
 const prefix=prep.workflow_ref.prefix;
 await execute(`async page=>{const prefix=${JSON.stringify(prefix)};await page.locator('[data-tid='+JSON.stringify(prefix+';Graph;Import03QA')+']').click();await page.locator('[data-tid='+JSON.stringify(prefix+';Graph;Import03QA;Setting')+']').click();return true}`);
 let initial;const until=Date.now()+15000;
 while(Date.now()<until){initial=await execute(makeWorkspaceUiCode({mode:'observe',operation_id:'initial',expected_origin:url.origin,expected_build:'7.4.2'}));if(initial.output?.wizard?.owner_context?.status==='observed'&&initial.output.wizard.stage==='text_import_file')break;}
 if(initial.output?.wizard?.owner_context?.status!=='observed')throw Error('Wizard owner unavailable');
 const operation={id:'settings-recovery',action:{action_key:'node.configure_text_import',revision:'1'},deadline:Date.now()+240000,
   checkpoint:{document_id:initial.output.dom_epoch.document,workflow_ref:initial.output.workflow_ref}};
 let injectNext=false,injected=false;
 const channel=createNodeProcedure({operation,targetOrigin:url.origin,targetBuild:'7.4.2',
 record:async e=>{if(e.phase==='node_step_prepared'&&e.action.verb==='click'&&!injected)injectNext=true;return record(e)},
 wrapMutation:(code,ref)=>withBrowserReceipt('('+code+')(page)',{receipt_namespace:session.metadata.sessionId,receipt_id:ref.id,receipt_signature:ref.signature,operation_id:ref.id}),
 execute:async code=>{if(injectNext&&!injected){injectNext=false;injected=true;await execute(`async page=>{await page.evaluate(()=>document.body.setAttribute('data-dock-qa-epoch','1'));return true}`);}return execute(code)}});
 const configured=await configureTextImportDraft(channel,settings,initial.output.wizard.owner_context);
 const summary={status:'PASS',scope:'legacy_settings_roundtrip_and_strict_epoch_recovery',operation_id:operation.id,injected,steps:channel.steps,
   settings_readback_verified:configured.settings_readback_verified,upload_verified:false,execution_verified:false,package_saved:false,hermes_acceptance:false};
 if(!injected)throw Error('No picker click was exercised');await fs.writeFile(dir+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify({dir,...summary}));
} catch(error){await fs.writeFile(dir+'/failure.json',JSON.stringify({message:String(error.message)}));throw error;}
finally {await client.close();}
