import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext, createContext, runInContext } from 'node:vm';
import { makeWorkspacePrepareCode, makeWorkspaceBootstrapCode, parseWorkspacePreparation, prepareWorkspaceSession, requirePreparedWorkspace } from '../lib/workspace.mjs';
import {prepareTool} from '../lib/skill.mjs';
import {validateActionParameters} from '../lib/action-catalog.mjs';
import { createSerialGate } from '../lib/clipboard.mjs';
import { loginomAddress, loginPage } from '../../src/connection-check.mjs';

const build = '7.5.0-alpha+build.49202';

async function bootstrap({ url='https://loginom.test/app', actualBuild=build, tids=[], dialog=false, mask=false, size=0 }={}) {
  let scanned=0, evaluations=0;
  const elements=[...tids.map(tid=>({tid})), ...(dialog?[{dialog:true}]:[]), ...(mask?[{mask:true}]:[]), ...Array.from({length:size},()=>({}))].map(item=>({
    getAttribute(name) { assert.equal(name,'data-tid');return item.tid??null; },
    hasAttribute() { return false; },
    getBoundingClientRect() { return {width:10,height:10}; },
    matches(selector) { return selector.includes('role="dialog"') ? !!item.dialog : !!item.mask; },
    get value() { throw new Error('Credential values must never be read'); },
    get textContent() { throw new Error('Bootstrap must not read arbitrary text'); },
  }));
  const page={url:()=>url, async evaluate(fn,args) {
    evaluations++;
    return runInNewContext(`(${fn.toString()})(args)`,{args,location:{origin:'https://loginom.test'},bg:{app:{Version:actualBuild}},
      Date:{now:()=>0},getComputedStyle:()=>({}),document:{documentElement:{},createTreeWalker:()=>({nextNode:()=>elements[scanned++]??null})}});
  }};
  const result=await runInNewContext(makeWorkspaceBootstrapCode({origin:'https://loginom.test',build}),{URL})(page);
  return {result:JSON.parse(JSON.stringify(result)),evaluations,scanned};
}

test('bootstrap does not inspect another origin or require preparation',async()=>{
  const {result,evaluations}=await bootstrap({url:'about:blank'});
  assert.equal(evaluations,0);assert.equal(result.output.target_state,'not_open');
  assert.equal(result.effect_possible,false);assert.equal(result.output.observation_only,true);
});

test('bootstrap reports login, ready, incompatible build and blockers without reading values',async()=>{
  for (const [options,state] of [
    [{tids:['LoginForm;Login;edtUsername']},'login_required'],
    [{tids:['MF;cntMain;tlbMainToolbar;btnAvatar']},'ready_for_prepare'],
    [{actualBuild:'different'},'incompatible_or_loading'],
    [{dialog:true,mask:true},'blocked'],
  ]) {
    const {result}=await bootstrap(options);assert.equal(result.output.target_state,state);
    assert.equal(result.output.scan.complete,true);assert.equal(result.output.ui,undefined);
  }
});

test('bootstrap stops the DOM walk at its budget and cannot claim readiness',async()=>{
  const {result,scanned}=await bootstrap({tids:['MF;cntMain;tlbMainToolbar;btnAvatar'],size:5000});
  assert.equal(scanned,4000);assert.equal(result.output.scan.complete,false);
  assert.equal(result.output.target_state,'indeterminate');
});
function pageFixture({ authenticated = false, workflow = false, actualBuild = build, loseReply = false, blocked = false, entryDelay = 0, busyTicks = 0 } = {}) {
  const events = [], tabs = [], packages = new Map();
  let url = 'about:blank', active = null, openedPath = null;
  const element = (tid, text = '') => ({tid,textContent:text,innerHTML:'',isConnected:true,
    getAttribute: () => tid,getBoundingClientRect:()=>({width:100,height:100}),
    classList:{contains:()=>false},matches:()=>false});
  const add = path => {
    const n=tabs.length+2,prefix='MF;TF-'+n;
    const tab=element('MF;cntMain;cntWorkspace;Workspace;t.br;tb-'+n);
    tab.classList.contains=()=>active===tab;
    tab.graph=element(prefix+';ModelForm;cmpDiagram');tab.area=element(prefix+';ModelForm;pnlWorkarea');
    tab.crumbs=['Server','Packages','Package'+n,'Module','Workflow'].map((text,i)=>element(prefix+';cnrNaviMode;b.s_'+i,text));
    tabs.push(tab);active=tab;packages.set(tab,new PackageNode(path));
  };
  class PackageNode { constructor(path) {this.PackageFileName=path;this.PackageName='Draft';} }
  if (workflow) add(null);
  else {add(null);tabs[0].home=element('MF;TF-2;HomePage;btnCreateUnsavedPackage');tabs[0].graph=null;tabs[0].area=null;packages.delete(tabs[0]);}
  const context=createContext({Date,Math,Map,Set,JSON,screen:{availWidth:1000,availHeight:900},
    innerWidth:1000,innerHeight:800,outerWidth:1000,outerHeight:900,getComputedStyle:()=>({visibility:'visible'}),
    location:{origin:'http://loginom.example',pathname:'/app'},
    document:{querySelectorAll(selector) {
      if(selector.startsWith('[data-tid^="MF;cntMain;cntWorkspace'))return tabs;
      if(selector.startsWith('[role=')) {if(blocked)return [element('blocker')];if(busyTicks>0)return [{...element('busy'),matches:()=>true}];return [];}
      const prefix=selector.match(/^\[data-tid\^=(".*")\]$/);
      if(prefix)return tabs.flatMap(t=>t.crumbs).filter(e=>e.tid.startsWith(JSON.parse(prefix[1])));
      const exact=selector.match(/^\[data-tid=(".*")\]$/);
      if(exact && JSON.parse(exact[1]).endsWith(';HomePage;btnCreateUnsavedPackage') && entryDelay>0)return [];
      return exact?tabs.flatMap(t=>[t.graph,t.area,t.home]).filter(e=>e && e.tid===JSON.parse(exact[1])):[];
    }},bg:{app:{Version:actualBuild,PackageTreeNode:PackageNode,Application:{FInstance:{FMainForm:{Items:{Workspace:{
      getActiveTab:()=>({Controller:{Node:{data:{node:packages.get(active)}}}}),
    }},FMapTree:{FServerConnection:{UserName:'test-account'}}}}}}}});
  const locator = selector => ({
    or() { return this; }, first() { return this; }, async waitFor() {}, async inputValue() { return ''; },
    async isVisible() {
      if (selector.includes('btnAvatar')) return authenticated;
      if (selector.includes('edtUsername')) return !authenticated;
      return true;
    },
    async count() { return selector.includes('x-form-invalid')?0:1; },
    async click() {
      if(selector.includes('btnLogin')) {events.push('login');authenticated=true;}
      else if(selector.includes('btnCreateUnsavedPackage')) {
        events.push('create_draft');if(active?.home)tabs.splice(tabs.indexOf(active),1);add(null);
        if(loseReply){loseReply=false;throw new Error('lost response');}
      } else if(selector.includes('btnOpen"')){events.push('open_package');add(openedPath);}
      else if(selector.includes('t.br;tb'))active=tabs.find(t=>selector.includes(t.tid));
      else {assert.equal(entryDelay,0,'menu must wait for homepage readiness');events.push('menu');}
    },
    async fill(value) { events.push({ fill: value });if(selector.includes('edtFileName'))openedPath=value; },
    locator(child) { return locator(selector + ' ' + child); },
  });
  return { events, tabs, context, openFiles() {add(null);const tab=tabs.at(-1);tab.graph=null;tab.area=null;packages.delete(tab);}, page: {
    url: () => url,
    async goto(value) { url = value;context.location={origin:new URL(value).origin,pathname:new URL(value).pathname};events.push('navigate'); },
    async evaluate(fn,args) {context.args=args;return runInContext(`(${fn.toString()})(args)`,context);},
    locator, async waitForTimeout() {entryDelay=Math.max(0,entryDelay-1);busyTicks=Math.max(0,busyTicks-1);},
  } };
}
const execute = async (fixture, options = {}) => runInNewContext(makeWorkspacePrepareCode({
  loginomUrl: 'http://loginom.example/app?testable=true',
  compatibility: { profile_id: 'tested-ui', loginom_build: build, platform: 'macos', browser: 'chromium' }, platform: 'darwin', ...options,
}))(fixture.page);

test('normal preparation opens Loginom and asks for login without assuming test credentials', async () => {
  const fixture = pageFixture();
  const state = await execute(fixture);
  assert.equal(state.status, 'LOGIN_REQUIRED');
  assert.deepEqual(fixture.events, ['navigate']);
});

for (const address of ['https://app.loginom.ai', 'https://app.loginom.ai/app/', 'https://app.loginom.ai/?lang=ru&testable=false', 'https://private.example/custom/?lang=ru']) {
  test('private login and preparation share the canonical address: '+address, async () => {
    const fixture=pageFixture();
    await loginPage(fixture.page,{url:address,username:'test-account',password:''});
    const state=await execute(fixture,{loginomUrl:loginomAddress(address)});
    assert.equal(state.status,'READY');
    assert.equal(state.authenticated,true);
    assert.equal(fixture.events.filter(event=>event==='navigate').length,1);
    assert.equal(fixture.events.filter(event=>event==='login').length,1);
    assert.equal(fixture.events.filter(event=>event==='create_draft').length,1);
    assert.equal(new URL(fixture.page.url()).searchParams.get('testable'),'true');
  });
}

test('prepared login rejects a foreign path or origin before creating a draft', async () => {
  for (const address of ['https://app.loginom.ai/foreign/', 'https://other.example/app/']) {
    const fixture=pageFixture();
    await loginPage(fixture.page,{url:'https://app.loginom.ai',username:'test-account',password:''});
    await fixture.page.goto(address);
    const state=await execute(fixture,{loginomUrl:loginomAddress('https://app.loginom.ai')});
    assert.equal(state.reason,'FOREIGN_PAGE');
    assert.equal(state.effect_possible,false);
    assert.ok(!fixture.events.includes('create_draft'));
  }
});

test('operator test login and authenticated normal preparation reach the same workspace contract', async () => {
  const replay = pageFixture();
  const normal = pageFixture({ authenticated: true });
  const replayState = await execute(replay, { allowTestLogin: true, testLoginUser: 'test-account' });
  const normalState = await execute(normal);
  assert.equal(replayState.status, 'READY');
  assert.equal(normalState.status, 'READY');
  assert.equal(replayState.workflow_ref.prefix, normalState.workflow_ref.prefix);
  assert.notEqual(replayState.workflow_ref.workflow_id, normalState.workflow_ref.workflow_id);
  assert.equal(replayState.workflow_ref.prefix, 'MF;TF-2');
  assert.equal(normalState.target.loginom_build, build);
  assert.ok(replay.events.includes('login'));
  assert.ok(replay.events.some(event=>event.fill==='test-account'));
  assert.ok(!replay.events.some(event=>event.fill==='user'));
  assert.ok(!normal.events.includes('login'));
});

test('an incompatible UI is rejected before login or draft creation', async () => {
  const fixture = pageFixture({ actualBuild: '8.0.0' });
  const state = await execute(fixture, { allowTestLogin: true, testLoginUser: 'test-account' });
  assert.equal(state.status, 'INCOMPATIBLE');
  assert.deepEqual(fixture.events, ['navigate']);
});

test('an incompatible operating system is rejected before any browser call', async () => {
  const fixture = pageFixture({ authenticated: true });
  await assert.rejects(execute(fixture, { platform: 'linux' }), /platform\/browser/);
  assert.deepEqual(fixture.events, []);
});

test('new preparation creates its own draft and preserves the existing workflow', async () => {
  const fixture = pageFixture({ authenticated: true, workflow: true });
  const state = await execute(fixture);
  assert.equal(state.created_draft, true);
  assert.equal(fixture.tabs.length, 2);
  assert.equal(state.preserved_workflows[0].graph_unchanged, true);
});

test('only a fully prepared workspace can admit action mutations', () => {
  for (const metadata of [{}, { skillRevision: 'skill' }, { workspaceReady: true },
    { skillRevision: 'skill', workspaceReady: true }]) assert.throws(() => requirePreparedWorkspace(metadata), /NOT_READY/);
  requirePreparedWorkspace({ skillRevision: 'skill', workspaceReady: true, targetIdentity: { loginom_build: build } });
  assert.throws(() => parseWorkspacePreparation({ content: [{ type: 'text', text: '{"status":"READY"}' }] }), /no verified/);
  assert.throws(() => makeWorkspacePrepareCode({ loginomUrl: 'http://loginom.example/?token=secret' }), /credential-free/);
});

test('preparation failure cannot admit a queued action before durable readiness', async () => {
  for (const failure of ['record', 'save']) {
    const metadata = { skillRevision: 'skill' };
    const gate = createSerialGate();
    const events = [];
    const preparing = gate(() => prepareWorkspaceSession({ metadata,
      assertAllowed() {}, assertTarget() {},
      async prepare() { return { status: 'READY', target: { loginom_build: build }, workflow_ref: { prefix: 'MF;TF-1' } }; },
      async record() { events.push('record'); if (failure === 'record') throw new Error('disk failure'); },
      async save() { events.push('save'); throw new Error('disk failure'); },
    }));
    const action = gate(() => requirePreparedWorkspace(metadata));
    await assert.rejects(preparing, /disk failure/);
    await assert.rejects(action, /NOT_READY/);
    assert.equal(metadata.workspaceReady, false);
    assert.deepEqual(events, failure === 'record' ? ['record'] : ['record', 'save']);
  }
});

test('pending-operation guard prevents preparation from mutating a workspace', async () => {
  const metadata = { skillRevision: 'skill', workspaceReady: true, targetIdentity: { loginom_build: build } };
  let calls = 0;
  await assert.rejects(prepareWorkspaceSession({ metadata,
    assertAllowed() { throw new Error('pending operation'); },
    prepare() { calls++; }, record() { calls++; }, save() { calls++; },
  }), /pending operation/);
  assert.equal(calls, 0);
  assert.equal(metadata.workspaceReady, true);
});

test('automatic test login requires an explicit account', async () => {
  const fixture=pageFixture();
  await assert.rejects(()=>execute(fixture,{allowTestLogin:true}),/explicit Loginom account/);
  assert.deepEqual(fixture.events,[]);
});


test('repeat preparation preserves an existing workspace and never navigates or clears readiness', async () => {
  const metadata={skillRevision:'skill',workspaceReady:true,targetIdentity:{loginom_build:build},workflowRef:{prefix:'MF;TF-1'}};
  const before=structuredClone(metadata);let effects=0;
  await assert.rejects(prepareWorkspaceSession({metadata,assertAllowed(){},
    prepare(){effects++;},assertTarget(){effects++;},record(){effects++;},save(){effects++;}}),/already prepared/);
  assert.equal(effects,0);assert.deepEqual(metadata,before);
  requirePreparedWorkspace(metadata);
});

test('lost creation response and repeated ID reconcile one exact draft', async () => {
  const fixture=pageFixture({authenticated:true,workflow:true,loseReply:true});
  const first=await execute(fixture);
  assert.equal(first.status,'NOT_READY');assert.equal(first.effect_possible,true);
  const recovered=await execute(fixture,{recoverOnly:true});
  assert.equal(recovered.status,'READY');assert.equal(recovered.replayed,true);
  const again=await execute(fixture);
  assert.equal(again.workflow_ref.tab_tid,recovered.workflow_ref.tab_tid);
  assert.equal(fixture.events.filter(e=>e==='create_draft').length,1);
  assert.equal(fixture.tabs.length,2);
});

test('operation identity cannot be reused for a different task or package', async () => {
  const fixture=pageFixture({authenticated:true});await execute(fixture);
  const state=await execute(fixture,{sessionId:'other'});
  assert.equal(state.reason,'OPERATION_CONFLICT');assert.equal(fixture.tabs.length,1);
});

test('lost browser receipt cannot recreate a nonpersistent draft', async () => {
  const fixture=pageFixture({authenticated:true});await execute(fixture);
  runInContext('globalThis.__loginomDockPreparationV1 = undefined',fixture.context);
  const state=await execute(fixture,{recoverOnly:true});
  assert.equal(state.reason,'RECEIPT_LOST');assert.equal(fixture.tabs.length,1);
});

test('foreign graph changes and closed draft invalidate readiness', async () => {
  const fixture=pageFixture({authenticated:true,workflow:true});await execute(fixture);
  fixture.tabs[0].graph.innerHTML='changed';
  assert.equal((await execute(fixture)).reason,'FOREIGN_WORKFLOW_CHANGED');
  fixture.tabs.pop();assert.equal((await execute(fixture)).reason,'WORKFLOW_LOST');
});

test('blockers refuse preparation before any package creation', async () => {
  const fixture=pageFixture({authenticated:true,blocked:true});
  const state=await execute(fixture);assert.equal(state.reason,'UI_BLOCKED');
  assert.equal(state.effect_possible,false);assert.equal(fixture.tabs.filter(t=>t.graph).length,0);
});

test('opening an exact package verifies its cached path without executing or saving', async () => {
  const fixture=pageFixture({authenticated:true,workflow:true});
  const state=await execute(fixture,{intent:'open_package',packagePath:'/operator/example.lgp'});
  assert.equal(state.status,'READY');assert.equal(state.package_ref.path,'/operator/example.lgp');
  assert.equal(state.ownership_verified,false);assert.equal(state.created_draft,false);
  assert.equal(fixture.events.filter(e=>e==='open_package').length,1);
  assert.equal(state.preserved_workflows[0].graph_unchanged,true);
});

test('preparation deadline returns the last named phase with no mutation', async () => {
  const fixture=pageFixture({actualBuild:null});
  const state=await execute(fixture,{timeoutMs:2});
  assert.equal(state.reason,'DEADLINE');assert.equal(state.phase,'ui_build');
  assert.equal(state.effect_possible,false);assert.equal(fixture.tabs.filter(t=>t.graph).length,0);
});

test('durable attempt prevents duplicate creation after save or transport failure', async () => {
  const metadata={skillRevision:'skill'},request={operation_id:'op',intent:'new_draft',package_path:null};
  let calls=0;
  const args={metadata,request,assertAllowed(){},assertTarget(){},record:async()=>{},save:async()=>{},
    prepare:async({recoverOnly})=>{calls++;assert.equal(recoverOnly,calls>1);throw new Error('transport lost');}};
  await assert.rejects(prepareWorkspaceSession(args),/transport lost/);
  await assert.rejects(prepareWorkspaceSession(args),/transport lost/);
  assert.equal(metadata.workspaceReady,false);
  await assert.rejects(prepareWorkspaceSession({...args,request:{...request,operation_id:'another'}}),/conflict/);
  assert.equal(calls,2);
});

test('cancellation after creation preserves the receipt and never publishes READY', async () => {
  const controller=new AbortController(),metadata={skillRevision:'skill'};
  const state=await prepareWorkspaceSession({metadata,request:{operation_id:'cancel'},signal:controller.signal,
    assertAllowed(){},assertTarget(){},record:async()=>{},save:async()=>{},
    prepare:async()=>{controller.abort();return {status:'READY',effect_possible:true,created_draft:true};}});
  assert.equal(state.reason,'CANCELLED');assert.equal(state.created_draft,true);
  assert.equal(metadata.workspaceReady,false);assert.equal(metadata.workspacePreparation.effect_possible,true);
});


test('authenticated avatar alone does not authorize the package menu before homepage initialization',async()=>{
  const fixture=pageFixture({authenticated:true,entryDelay:3});
  const result=await execute(fixture);
  assert.equal(result.status,'READY');
  assert.ok(result.trace.some(t=>t.condition==='workspace_entry_ready' && t.satisfied));
  assert.equal(fixture.events.filter(e=>e==='create_draft').length,1);
});


test('transient loading mask waits locally instead of asking the agent to retry',async()=>{
  const fixture=pageFixture({authenticated:true,busyTicks:3});
  const state=await execute(fixture);
  assert.equal(state.status,'READY');assert.equal(fixture.events.filter(e=>e==='create_draft').length,1);
});

test('explicit existing workflow requires matching document, tab and navigation identity',async()=>{
  const fixture=pageFixture({authenticated:true});const first=await execute(fixture);
  const workflowRef={...first.workflow_ref,document_id:first.document_id};
  validateActionParameters(prepareTool.inputSchema,{operation_id:'resume',intent:'existing_workflow',workflow_ref:workflowRef});
  const returned=await execute(fixture,{operationId:'resume',intent:'existing_workflow',workflowRef});
  assert.equal(returned.status,'READY');assert.equal(returned.created_draft,false);
  assert.equal(returned.workflow_ref.tab_tid,first.workflow_ref.tab_tid);
  assert.equal(fixture.events.filter(e=>e==='create_draft').length,1);
  const reordered={...workflowRef,navigation_path:workflowRef.navigation_path.map(c=>({label:c.label,tid:c.tid}))};
  const reorderedResult=await execute(fixture,{operationId:'reordered-ref',intent:'existing_workflow',workflowRef:reordered});
  assert.equal(reorderedResult.status,'READY','JSON object key order must not change workflow identity');
  const damaged=structuredClone(reordered);damaged.navigation_path[1].tid+='-wrong';
  assert.equal((await execute(fixture,{operationId:'damaged-ref',intent:'existing_workflow',workflowRef:damaged})).reason,'WORKFLOW_CHANGED');
  const lost=await execute(fixture,{operationId:'bad-ref',intent:'existing_workflow',workflowRef:{...workflowRef,document_id:'foreign'}});
  assert.equal(lost.reason,'WORKFLOW_LOST');assert.equal(lost.effect_possible,false);
});

test('existing workflow returns from Files without requiring a graph on the active tab',async()=>{
  const fixture=pageFixture({authenticated:true}),first=await execute(fixture);
  const workflowRef={...first.workflow_ref,document_id:first.document_id};
  fixture.openFiles();
  const result=await execute(fixture,{operationId:'return-from-files',intent:'existing_workflow',workflowRef,timeoutMs:1000});
  assert.equal(result.status,'READY');assert.equal(result.created_draft,false);
  assert.equal(result.workflow_ref.tab_tid,first.workflow_ref.tab_tid);
  assert.equal(fixture.events.filter(e=>e==='create_draft').length,1);
  fixture.openFiles();
  const foreign=await execute(fixture,{operationId:'foreign-from-files',intent:'existing_workflow',workflowRef:{...workflowRef,document_id:'foreign'},timeoutMs:1000});
  assert.equal(foreign.reason,'WORKFLOW_LOST');assert.equal(foreign.effect_possible,false);
});

test('a new attempt after a no-effect refusal is uncertain until its own reply arrives',async()=>{
  const metadata={skillRevision:'skill'},request={operation_id:'retry'};let attempt=0;
  const args={metadata,request,assertAllowed(){},assertTarget(){},record:async()=>{},save:async()=>{},
    prepare:async({recoverOnly})=>{
      attempt++;
      assert.equal(metadata.workspacePreparation.effect_possible,true);
      if(attempt===1)return {status:'NOT_READY',effect_possible:false,created_draft:false};
      if(attempt===2){assert.equal(recoverOnly,false);throw new Error('reply lost');}
      assert.equal(recoverOnly,true);throw new Error('receipt missing');
    }};
  await prepareWorkspaceSession(args);
  await assert.rejects(prepareWorkspaceSession(args),/reply lost/);
  await assert.rejects(prepareWorkspaceSession(args),/receipt missing/);
});

for(const variant of ['lost','effect','created','unauthenticated','cancelled','same-id'])
 test('new explicit preparation after missing workflow: '+variant,async()=>{
  const metadata={skillRevision:'skill'},request={operation_id:'old',intent:'existing_workflow'};
  const state={status:'NOT_READY',reason:variant==='cancelled'?'CANCELLED':'WORKFLOW_LOST',
   effect_possible:variant==='effect',created_draft:variant==='created',authenticated:variant!=='unauthenticated'};
  let calls=0;
  const args={metadata,request,assertAllowed(){},assertTarget(){},record:async()=>{},save:async()=>{},
   prepare:async()=>{calls++;return state;}};
  await prepareWorkspaceSession(args);
  const next={...args,request:{operation_id:variant==='same-id'?'old':'new',intent:'new_draft'},
   prepare:async({recoverOnly})=>{calls++;assert.equal(recoverOnly,false);return {status:'READY',effect_possible:true,created_draft:true,target:{},workflow_ref:{}};}};
  if(variant==='lost'){
   assert.equal((await prepareWorkspaceSession(next)).status,'READY');assert.equal(calls,2);
  }else{
   await assert.rejects(prepareWorkspaceSession(next),/conflict/);assert.equal(calls,1);
  }
 });
