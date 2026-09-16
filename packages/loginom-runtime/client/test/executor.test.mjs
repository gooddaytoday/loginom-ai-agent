import test from 'node:test';
import assert from 'node:assert/strict';
import { validateActionParameters } from '../lib/action-catalog.mjs';
import { actions, build, Page, nodeParameters, linkPage, linkParameters, run, runtime } from './support/executor-fixture.mjs';

test('node capability creates, types the rename and verifies actual snapped geometry with a workflow-bound ref', async () => {
  const page = new Page();
  const outcome = await run(page, 'node.add', nodeParameters);
  assert.equal(outcome.status, 'SUCCEEDED');
  assert.deepEqual(outcome.output.node_ref, page.ref('Источник'));
  validateActionParameters(actions.get('node.add').output_schema, outcome.output);
  assert.equal(page.drops, 1); assert.ok(page.events.includes('keyboard_type'));
  assert.equal(page.nodes.length, 1); assert.equal(page.editor, null);
});

test('drag failure releases mouse and preserves an ambiguous effect outcome', async () => {
  const page = new Page(); page.failDrag = true;
  const outcome = await run(page, 'node.add', nodeParameters);
  assert.equal(outcome.status, 'AMBIGUOUS'); assert.equal(page.down, false); assert.equal(page.upCalls, 1);
});

test('misplaced node is ambiguous instead of reporting a verified position', async () => {
  const page = new Page(); page.onDrop = item => item.addNode('Источник', 180, 104);
  const outcome = await run(page, 'node.add', nodeParameters);
  assert.equal(outcome.status, 'AMBIGUOUS'); assert.match(outcome.error.message, /position differs/);
});

test('Input_Add creates exactly the requested link, returns a valid output and restores viewport', async () => {
  const page = linkPage();
  const targetBox = page.elements().find(item => item.node === 'Приёмник' && item.port === 'Input_Add').box;
  const outcome = await run(page, 'link.create', linkParameters(page));
  assert.equal(outcome.status, 'SUCCEEDED');
  assert.equal(outcome.output.target_port_tid, page.prefix + ';Graph;Приёмник;Input_Data-1');
  assert.equal(outcome.output.link_ref.tid, page.prefix + ';Graph;Источник|Output_Data-0|Приёмник|Input_Data-1');
  validateActionParameters(actions.get('link.create').output_schema, outcome.output);
  assert.deepEqual(page.graph, { scrollLeft: 12, scrollTop: 15 }); assert.equal(page.drops, 1);
  assert.deepEqual(page.point, { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 });
  assert.deepEqual(outcome.trace.find(item => item.event === 'port_drag_attempt').correction, { x: 0, y: 0 });
});

test('one partially created Input_Add port prevents every subsequent drag attempt', async () => {
  const page = linkPage(); page.onDrop = item => item.nodes[1].ports.push('Input_Data-1');
  const outcome = await run(page, 'link.create', linkParameters(page));
  assert.equal(outcome.status, 'AMBIGUOUS'); assert.equal(page.drops, 1);
  const snapshots = outcome.trace.filter(item => item.event === 'link_observation');
  assert.deepEqual(snapshots.map(item => [item.stage, item.attempt]), [['initial', 0], ['before_drag', 1], ['after_drag', 1]]);
  const before = snapshots[1], after = snapshots[2];
  const newPort = page.prefix + ';Graph;Приёмник;Input_Data-1';
  assert.deepEqual(before.current, before.baseline);
  assert.deepEqual(after.baseline, before.current);
  assert.deepEqual(after.current.ports, [...before.current.ports, newPort].sort());
  assert.deepEqual(after.current.links, []);
  assert.deepEqual(after.delta, { added_ports: [newPort], removed_ports: [], added_links: [], removed_links: [] });
  assert.equal(outcome.trace.filter(item => item.event === 'port_drag_attempt').length, 1);
});

test('retry starts only after two unchanged snapshots and uses a bounded offset after the exact center', async () => {
  const page = linkPage();
  const targetBox = page.elements().find(item => item.node === 'Приёмник' && item.port === 'Input_Add').box;
  let firstPoint;
  page.onDrop = item => { firstPoint = { ...item.point }; item.onDrop = null; };
  const outcome = await run(page, 'link.create', linkParameters(page));
  assert.equal(outcome.status, 'SUCCEEDED'); assert.equal(page.drops, 2);
  assert.deepEqual(firstPoint, { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 });
  const attempts = outcome.trace.filter(item => item.event === 'port_drag_attempt');
  assert.deepEqual(attempts.map(item => item.correction), [{ x: 0, y: 0 }, { x: -1, y: 0 }]);
  const observations = outcome.trace.filter(item => item.event === 'link_observation');
  assert.deepEqual(observations.map(item => [item.stage, item.attempt]), [
    ['initial', 0], ['before_drag', 1], ['after_drag', 1], ['settled_after_drag', 1], ['before_drag', 2], ['after_drag', 2],
  ]);
  for (const observation of observations.slice(0, -1)) {
    assert.deepEqual(observation.current, observation.baseline);
    assert.deepEqual(observation.delta, { added_ports: [], removed_ports: [], added_links: [], removed_links: [] });
  }
  const settled = observations.find(item => item.stage === 'settled_after_drag');
  const afterFirst = observations.find(item => item.stage === 'after_drag');
  assert.ok(settled.at_ms - afterFirst.at_ms >= 150);
  assert.ok(outcome.trace.indexOf(settled) < outcome.trace.indexOf(attempts[1]));
  assert.equal(observations.at(-1).delta.added_ports.length, 1);
  assert.equal(observations.at(-1).delta.added_links.length, 1);
});

test('Input_Add never accepts a link from an unexpected source or an additional link', async () => {
  for (const wrongSource of [true, false]) {
    const page = linkPage();
    page.onDrop = item => {
      item.nodes[1].ports.push('Input_Data-1');
      item.edges.push(`Источник|Output_Data-${wrongSource ? 1 : 0}|Приёмник|Input_Data-1`);
      if (!wrongSource) item.edges.push('Источник|Output_Data-0|Приёмник|Input_Data-0');
    };
    assert.equal((await run(page, 'link.create', linkParameters(page))).status, 'AMBIGUOUS');
    assert.equal(page.drops, 1);
  }
});

test('existing standard link reconciles with zero drag and a schema-valid output', async () => {
  const page = linkPage(); page.edges.push('Источник|Output_Data-0|Приёмник|Input_Data-0');
  const outcome = await run(page, 'link.create', linkParameters(page, 'data'));
  assert.equal(outcome.status, 'SUCCEEDED'); assert.equal(outcome.output.reconciled, true); assert.equal(page.drops, 0);
  validateActionParameters(actions.get('link.create').output_schema, outcome.output);
});

test('node reference from another selected workflow is rejected before mouse interaction', async () => {
  const page = linkPage(), parameters = linkParameters(page);
  parameters.source_node.workflow_ref.prefix = 'MF;TF-9';
  const outcome = await run(page, 'link.create', parameters);
  assert.equal(outcome.status, 'FAILED'); assert.equal(page.drops, 0); assert.equal(page.upCalls, 0);
});

test('save succeeds after close/reopen with exact cached package path and the same graph, regardless of workflow caption', async () => {
  const page = linkPage();
  const outcome = await run(page, 'package.save_as', { path: '/user/data/packages/proof.lgp', conflict_policy: 'fail' });
  assert.equal(outcome.status, 'SUCCEEDED');
  assert.equal(outcome.output.package_ref.active_identity, '/user/data/packages/proof.lgp');
  assert.deepEqual(page.events.filter(value => value.startsWith('package_')), ['package_closed', 'package_reopened']);
  validateActionParameters(actions.get('package.save_as').output_schema, outcome.output);
});

test('save rejects a reopened graph mismatch and a different directory with the same basename', async () => {
  for (const change of [page => page.nodes.pop(), page => page.nodes[0].ports.push('Output_Data-2'), page => { page.packagePath = '/user/other/proof.lgp'; }]) {
    const page = linkPage(); page.onReopen = change;
    const outcome = await run(page, 'package.save_as', { path: '/user/data/packages/proof.lgp', conflict_policy: 'fail' });
    assert.equal(outcome.status, 'AMBIGUOUS'); assert.match(outcome.output.reason, /path or graph differs/);
  }
});

test('conflict fail leaves existing file untouched and closes the transient dialog', async () => {
  const page = linkPage(), path = '/user/data/packages/proof.lgp';
  page.storage.set(path, { nodes: [], edges: [] });
  const outcome = await run(page, 'package.save_as', { path, conflict_policy: 'fail' });
  assert.equal(outcome.status, 'NOT_APPLIED'); assert.deepEqual(page.storage.get(path).nodes, []);
  assert.equal(page.dialog, null); assert.equal(page.conflict, false);
});

test('runtime records a checkpoint before mutation and deduplicates the same operation id', async () => {
  const page = new Page(), records = [];
  const engine = runtime(page, { onRecord: async record => { records.push(record); if (record.phase === 'prepared') assert.equal(page.drops, 0); } });
  const first = await engine.run('node.add', nodeParameters, { operationId: 'create-source' });
  assert.equal(first.status, 'SUCCEEDED'); assert.equal(first.operation_id, 'create-source');
  const again = await engine.run('node.add', nodeParameters, { operationId: 'create-source' });
  assert.deepEqual(again, first); assert.equal(page.drops, 1);
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
  assert.deepEqual(records.map(value => value.phase), ['prepared', 'completed']);
  await assert.rejects(engine.run('node.add', { ...nodeParameters, expected_label: 'Другой' }, { operationId: 'create-source' }), /different parameters/);
});

test('missing pre-mutation evidence persistence prevents browser mutation', async () => {
  const page = new Page();
  const engine = runtime(page, { onRecord: async () => { throw new Error('Evidence disk full'); } });
  await assert.rejects(engine.run('node.add', nodeParameters), /Evidence disk full/);
  assert.equal(page.drops, 0);
});

test('partial Input_Add outcome remains guarded across repeated model calls', async () => {
  const page = linkPage(); page.onDrop = item => item.nodes[1].ports.push('Input_Data-1');
  const engine = runtime(page), parameters = linkParameters(page);
  assert.equal((await engine.run('link.create', parameters)).status, 'AMBIGUOUS');
  assert.equal((await engine.run('link.create', parameters)).status, 'AMBIGUOUS');
  assert.equal(page.drops, 1);
});

test('lost mutation response retains operation identity and retrieves the completed receipt before permitting another action', async () => {
  const page = new Page(); let calls = 0;
  const engine = runtime(page, { execute: async code => {
    const result = await page.execute(code);
    if (++calls === 2) throw new Error('Connection lost after the node was added');
    return result;
  } });
  const outcome = await engine.run('node.add', nodeParameters, { operationId: 'lost-node' });
  assert.equal(outcome.status, 'AMBIGUOUS'); assert.equal(page.nodes.length, 1);
  assert.throws(() => engine.assertPreparationAllowed(), /preparation cannot run/);
  const reconciled = await engine.run('node.add', nodeParameters, { operationId: 'lost-node' });
  assert.equal(reconciled.operation_id, 'lost-node');
  assert.equal(reconciled.status, 'SUCCEEDED'); assert.equal(reconciled.cleanup_complete, true);
  assert.equal(page.drops, 1);
  assert.doesNotThrow(() => engine.assertPreparationAllowed());
  const observed = await engine.observe();
  assert.equal(observed.status, 'SUCCEEDED'); assert.equal(observed.output.nodes.length, 1); assert.equal(observed.output.loginom_build, build);
  assert.equal(observed.output.package_identity.path, null);
});

test('caller cancellation after mutation starts does not release a still-running browser call', async () => {
  const page = new Page(), controller = new AbortController(); let calls = 0;
  const engine = runtime(page, { execute: async (code, options) => {
    if (++calls === 2) { controller.abort(); assert.equal(options.signal, undefined); }
    return page.execute(code);
  } });
  const outcome = await engine.run('node.add', nodeParameters, { signal: controller.signal });
  assert.equal(outcome.status, 'SUCCEEDED'); assert.equal(page.down, false);
});

test('invalid parameters and incompatible Loginom build make zero mutations', async () => {
  const page = new Page(); let calls = 0;
  const engine = runtime(page, { execute: code => { calls++; return page.execute(code); } });
  await assert.rejects(engine.run('node.add', { ...nodeParameters, extra: true }), /unknown field/); assert.equal(calls, 0);
  const wrongBuild = runtime(page, { targetBuild: 'other-build' });
  const outcome = await wrongBuild.run('node.add', nodeParameters);
  assert.equal(outcome.status, 'FAILED'); assert.match(outcome.error.message, /build differs/); assert.equal(page.drops, 0);
});


test('post-mutation evidence write failure returns a typed ambiguous outcome and keeps the guard', async () => {
  const page = new Page(); let records = 0;
  const engine = runtime(page, { onRecord: async () => { if (++records > 1) throw new Error('Evidence disk full'); } });
  const outcome = await engine.run('node.add', nodeParameters);
  assert.equal(outcome.status, 'AMBIGUOUS'); assert.equal(outcome.error.code, 'EVIDENCE_WRITE_FAILED');
  assert.equal((await engine.run('node.add', nodeParameters)).status, 'AMBIGUOUS'); assert.equal(page.drops, 1);
});


test('node geometry uses cntDiagram origin before grid snapping, including the live 220 to 216/208 case', async () => {
  const page = new Page(); page.diagramOffset = { x: 1, y: 9 };
  const parameters = { ...nodeParameters, target_position: { x: 220, y: 220 } };
  const outcome = await run(page, 'node.add', parameters);
  assert.equal(outcome.status, 'SUCCEEDED');
  assert.equal(page.nodes[0].x, 216); assert.equal(page.nodes[0].y, 208);
  const postcondition = outcome.trace.find(item => item.event === 'postcondition_verified');
  assert.deepEqual(postcondition.position.expected_svg, { x: 216, y: 208 });
});

test('node geometry compares SVG coordinates after applying graph scroll and zoom', async () => {
  const page = new Page(); page.diagramOffset = { x: 1, y: 9 }; page.viewScale = 2;
  page.graph = { scrollLeft: 24, scrollTop: 40 };
  const parameters = { ...nodeParameters, target_position: { x: 220, y: 220 } };
  const outcome = await run(page, 'node.add', parameters);
  assert.equal(outcome.status, 'SUCCEEDED');
  const postcondition = outcome.trace.find(item => item.event === 'postcondition_verified');
  assert.deepEqual(postcondition.position.logical, { x: 120, y: 128 });
  assert.deepEqual(postcondition.position.expected_svg, { x: 240, y: 256 });
});

test('geometry shifted by a whole grid cell is rejected despite otherwise valid node creation', async () => {
  const page = new Page(); page.onDrop = item => item.addNode('Источник', 112, 104);
  const outcome = await run(page, 'node.add', nodeParameters);
  assert.equal(outcome.status, 'AMBIGUOUS'); assert.match(outcome.error.message, /expected SVG grid position/);
});


function renumberingPage() {
  const page = linkPage();
  page.nodes[1].ports = ['Input_Add', 'Input_Data-0', 'Input_Data-2', 'Input_Data-10'];
  page.edges = ['Источник|Output_Data-0|Приёмник|Input_Data-10'];
  page.onReopen = item => {
    item.nodes[1].ports = ['Input_Add', 'Input_Data-0', 'Input_Data-1', 'Input_Data-2'];
    item.edges = ['Источник|Output_Data-0|Приёмник|Input_Data-2'];
  };
  return page;
}

test('save graph fingerprint preserves port ordinal across numeric reindex, with numeric sorting', async () => {
  const page = renumberingPage();
  const result = await run(page, 'package.save_as', { path: '/user/data/packages/reindexed.lgp', conflict_policy: 'fail' });
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.output.package_ref.active_identity, '/user/data/packages/reindexed.lgp');
  const observed = await runtime(page).observe();
  assert.equal(observed.output.package_identity.path, '/user/data/packages/reindexed.lgp');
});

test('save fingerprint rejects changed port ordinal, direction, missing port and extra port', async () => {
  for (const mutate of [
    page => { page.edges[0] = 'Источник|Output_Data-0|Приёмник|Input_Data-0'; },
    page => { page.nodes[1].ports[2] = 'Input_Var-1'; },
    page => { page.nodes[1].ports.splice(2, 1); },
    page => { page.nodes[1].ports.push('Input_Data-9'); },
  ]) {
    const page = renumberingPage(), rename = page.onReopen;
    page.onReopen = item => { rename(item); mutate(item); };
    const result = await run(page, 'package.save_as', { path: '/user/data/packages/reindexed.lgp', conflict_policy: 'fail' });
    assert.equal(result.status, 'AMBIGUOUS');
    assert.equal(result.output.actual_path, '/user/data/packages/reindexed.lgp');
    assert.equal(result.output.path_matches, true); assert.equal(result.output.graph_matches, false);
    assert.ok(result.output.expected_graph); assert.ok(result.output.actual_graph);
  }
});

test('node and link capabilities preserve active workflow while binding relocated native graph',async()=>{
  const nodePage=new Page();nodePage.prefix='MF;TF-4';nodePage.tabTid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-4';nodePage.graphPrefix='MF;TF-1';
  const created=await run(nodePage,'node.add',nodeParameters);
  assert.equal(created.status,'SUCCEEDED',JSON.stringify(created.error));assert.equal(created.output.node_ref.workflow_ref.prefix,'MF;TF-4');
  const page=linkPage();page.prefix='MF;TF-4';page.tabTid='MF;cntMain;cntWorkspace;Workspace;t.br;tb-4';page.graphPrefix='MF;TF-1';
  const linked=await run(page,'link.create',linkParameters(page));
  assert.equal(linked.status,'SUCCEEDED',JSON.stringify(linked.error));
  assert.ok(linked.output.link_ref.tid.startsWith('MF;TF-1;Graph;'));
  const prepared=await run(page,'link.create',linkParameters(page),{mode:'prepare'});
  assert.equal(prepared.checkpoint.workflow_ref.prefix,'MF;TF-4');
  assert.deepEqual(prepared.checkpoint.graph_binding,{container_tid:'MF;TF-4;ModelForm;cmpDiagram',native_prefix:'MF;TF-1;Graph;'});
});

test('ready graph binding excludes foreign namespace outside diagram and rejects multiple owned namespaces',async()=>{
  for(const mode of ['foreign','multiple','duplicate_container','hidden_container','namespace_change']) {
    const page=linkPage(),elements=page.elements.bind(page);
    page.elements=()=>{
      const all=elements(),graph=all.find(e=>e.symbol==='workflow.graph');
      const foreign=page.element('MF;TF-9;Graph;Foreign;Label;Label',{label:'Foreign'});
      if(mode==='foreign')all.push(foreign);
      if(mode==='multiple'){graph.children.push(foreign);foreign.parentElement=graph;}
      if(mode==='duplicate_container')all.push(page.element(graph.tid,{symbol:'duplicate'}));
      if(mode==='hidden_container')graph.visible=false;
      return all;
    };
    if(mode==='namespace_change')page.onDrop=item=>{item.graphPrefix='MF;TF-9';};
    const result=await run(page,'link.create',linkParameters(page));
    assert.equal(result.status,mode==='foreign'?'SUCCEEDED':mode==='namespace_change'?'AMBIGUOUS':'FAILED',mode+JSON.stringify(result.error));
    assert.equal(page.drops,['foreign','namespace_change'].includes(mode)?1:0,mode);
  }
});

test('native graph accepts decorative duplicate vertices but stops bounded scan before effects',async()=>{
  for(const mode of ['vertices','duplicate_port','oversized']) {
    const page=linkPage(),elements=page.elements.bind(page);
    let visits=0;const createWalker=page.dom.createTreeWalker;
    page.dom.createTreeWalker=root=>{const walker=createWalker(root);return {nextNode:()=>{visits++;return walker.nextNode();}};};
    page.elements=()=>{
      const all=elements(),graph=all.find(e=>e.symbol==='workflow.graph');
      const count=mode==='oversized'?6500:2;
      for(let i=0;i<count;i++){
        const item=page.element(mode==='duplicate_port'?page.prefix+';Graph;Источник;Output_Data-0':page.prefix+';Graph;Vertex');
        item.parentElement=graph;graph.children.push(item);
      }
      return all;
    };
    const result=await run(page,'link.create',linkParameters(page));
    assert.equal(result.status,mode==='vertices'?'SUCCEEDED':'FAILED',mode+JSON.stringify(result.error));
    assert.equal(page.drops,mode==='vertices'?1:0);
    if(mode==='oversized'){assert.match(result.error.message,/scan element budget/);assert.ok(visits<=6001);}
  }
});

test('save waits for the closing menu and delayed Open command without repeating save or menu clicks',async()=>{
 const page=linkPage(),click=page.click.bind(page),elements=page.elements.bind(page);let closingUntil=null,openAfter=null;const clicked=[];
 page.click=async item=>{clicked.push(item.symbol);await click(item);
  if(item.symbol==='packages.close'){page.menu=true;closingUntil=page.clock+250;}
  if(item.symbol==='packages.menu'&&page.events.includes('package_closed'))openAfter=page.clock+250;
 };
 page.elements=()=>{
  if(closingUntil!==null&&page.clock>=closingUntil){page.menu=false;closingUntil=null;}
  const result=elements();return openAfter!==null&&page.clock<openAfter?result.filter(e=>e.symbol!=='packages.open'):result;
 };
 const result=await run(page,'package.save_as',{path:'/user/data/packages/slow-menu.lgp',conflict_policy:'fail'});
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result.error));
 assert.equal(clicked.filter(s=>s==='packages.menu').length,3);assert.equal(clicked.filter(s=>s==='packages.save_as').length,1);
 assert.equal(clicked.filter(s=>s==='packages.open').length,1);assert.equal(clicked.filter(s=>s==='packages.close').length,1);
 assert.ok(result.trace.some(e=>e.event==='package_open_command_ready'));
});

test('intermediate save preserves the exact open workflow and graph without close or reopen', async () => {
  const page=linkPage(),before={prefix:page.prefix,tabTid:page.tabTid,nodes:structuredClone(page.nodes),edges:[...page.edges]};
  const outcome=await run(page,'package.save_checkpoint',{path:'/user/data/packages/checkpoint.lgp',conflict_policy:'fail'});
  assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome));
  assert.deepEqual({prefix:page.prefix,tabTid:page.tabTid,nodes:page.nodes,edges:page.edges},before);
  assert.equal(page.events.includes('package_closed'),false);assert.equal(page.events.includes('package_reopened'),false);
  assert.equal(outcome.output.reopened,false);assert.equal(outcome.output.save_completed,true);
  assert.equal(outcome.output.persisted_content_verified,false);
  validateActionParameters(actions.get('package.save_checkpoint').output_schema,outcome.output);
});

test('intermediate save waits for completion of the native awaited Save As menu',async()=>{
  const page=linkPage(),click=page.click.bind(page),wait=page.waitForTimeout.bind(page);let hiddenAt=null,saveClicks=0;
  page.click=async item=>{await click(item);if(item.symbol==='packages.save_as'){page.menu=true;saveClicks++;}
    if(item.symbol==='file_dialog.confirm')hiddenAt=page.clock+400;};
  page.waitForTimeout=async ms=>{await wait(ms);if(hiddenAt!==null&&page.clock>=hiddenAt)page.menu=false;};
  const outcome=await run(page,'package.save_checkpoint',{path:'/user/data/packages/delayed.lgp',conflict_policy:'fail'});
  assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome));assert.equal(saveClicks,1);
  assert.ok(page.clock>=hiddenAt);assert.equal(page.events.includes('package_closed'),false);
});

test('intermediate save refuses path or graph drift after a possible write',async()=>{
  for(const drift of ['path','graph']){
    const page=linkPage(),save=page.save.bind(page);page.save=()=>{save();if(drift==='path')page.packagePath='/other.lgp';else page.nodes.pop();};
    const result=await run(page,'package.save_checkpoint',{path:'/user/data/packages/drift.lgp',conflict_policy:'fail'});
    assert.equal(result.status,'AMBIGUOUS');assert.equal(result.effect_possible,true);
    assert.equal(page.events.includes('package_closed'),false);
  }
});

test('intermediate save handles an explicit conflict without closing the package',async()=>{
  for(const policy of ['fail','replace']){
    const page=linkPage(),path='/user/data/packages/existing.lgp';page.storage.set(path,{nodes:[],edges:[]});
    const outcome=await run(page,'package.save_checkpoint',{path,conflict_policy:policy});
    assert.equal(outcome.status,policy==='fail'?'NOT_APPLIED':'SUCCEEDED',JSON.stringify(outcome));
    assert.equal(page.storage.get(path).nodes.length,policy==='fail'?0:page.nodes.length);
    assert.equal(page.active,true);assert.equal(page.events.includes('package_closed'),false);
  }
});

test('save never confirms replacement for a different path or another question',async()=>{
 for(const text of ['"/other.lgp" уже существует. Вы хотите заменить его?','Файл существует. Удалить пакет?']){
  const page=linkPage(),path='/user/data/packages/conflict.lgp';page.storage.set(path,{nodes:[],edges:[]});page.conflictText=text;
  let confirmations=0;const click=page.click.bind(page);page.click=async item=>{if(item.symbol==='message.yes')confirmations++;return click(item);};
  const outcome=await run(page,'package.save_checkpoint',{path,conflict_policy:'replace'});
  assert.equal(outcome.status,'AMBIGUOUS');assert.equal(confirmations,0);assert.deepEqual(page.storage.get(path),{nodes:[],edges:[]});
 }
});

test('save conflict cleanup is not complete while its native dialog remains open',async()=>{
 const page=linkPage(),path='/user/data/packages/conflict.lgp';page.storage.set(path,{nodes:[],edges:[]});
 page.keyboard.press=async()=>{};
 const outcome=await run(page,'package.save_checkpoint',{path,conflict_policy:'fail'});
 assert.equal(outcome.status,'AMBIGUOUS');assert.equal(outcome.cleanup_complete,false);assert.equal(outcome.error.code,'CLEANUP_FAILED');
 assert.deepEqual(page.storage.get(path),{nodes:[],edges:[]});
});

async function continuationPage() {
 const page=linkPage();await page.execute('async page=>true');
 class WorkFlowTreeNode{};page.app.WorkFlowTreeNode=WorkFlowTreeNode;
 const pkg=new page.app.PackageTreeNode(),flow=new WorkFlowTreeNode();flow.ParentNode=pkg;
 const tab={classList:{contains:name=>name==='x-tab-active'}};
 const card={Controller:{FController:page.model,Node:{data:{node:flow}}}};
 page.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab=()=>card;
 let parentActive=false;
 const crumbs=()=>{
  const labels=['Server','Packages',page.packagePath?'Saved':'Draft','Module','Workflow'];
  return labels.slice(0,parentActive?4:5).map((label,i)=>page.element(page.prefix+';cnrNaviMode;b.s_'+labels.slice(0,i+1).join('>'),{text:label,textContent:label,kind:i===3?'save_nav_parent':'save_crumb'}));
 };
 const elements=page.elements.bind(page),click=page.click.bind(page);
 page.elements=()=>[...elements(),...crumbs(),...(parentActive?[page.element(page.prefix+';ListViewForm;MapTreeForm;colNavigation_Server>Packages>Saved>Module>Workflow;TreeText',{text:'Workflow',textContent:'Workflow',kind:'save_tree'})]:[])];
 page.click=async item=>{if(item.kind==='save_nav_parent'){parentActive=true;return;}return click(item);};
 page.afterDoubleClick=async()=>{parentActive=false;page.editor=null;};
 const document={querySelectorAll:selector=>{
   if(selector.includes('cnrNaviMode'))return crumbs();
   if(selector.includes('cmpDiagram'))return [page.model.FDiagram.FmxGraph.container];
   if(selector.includes('tb-1'))return [tab];return [];
 }};
 page.context.document=document;
 page.context.__loginomDockPreparationV1={document,id:'doc',receipts:new Map([['prepared',{phase:'verified',workflowId:'workflow',tab,packageNode:pkg,nodeTargetWorkflowNode:flow}]])};
 return {page,flow,card};
}

test('saved continuation returns current navigation with the same native workflow and original binding',async()=>{
 const {page}=await continuationPage();
 const result=await run(page,'package.save_checkpoint',{path:'/user/data/packages/continued.lgp',conflict_policy:'fail'});
 assert.equal(result.status,'SUCCEEDED',JSON.stringify(result));
 validateActionParameters(actions.get('package.save_checkpoint').output_schema,result.output);
 const [continuation]=result.output.workflow_continuations;assert.equal(continuation.document_id,'doc');
 assert.equal(continuation.workflow_ref.workflow_id,'workflow');assert.equal(continuation.previous_workflow_ref.workflow_id,'workflow');
 assert.equal(continuation.previous_workflow_ref.navigation_path[2].label,'Draft');assert.equal(continuation.workflow_ref.navigation_path[2].label,'Saved');
 assert.equal(continuation.workflow_ref.tab_tid,continuation.previous_workflow_ref.tab_tid);
});

test('saved continuation refuses a different native package even at the same path',async()=>{
 const {page,flow}=await continuationPage(),save=page.save.bind(page);
 page.save=()=>{save();flow.ParentNode=new page.app.PackageTreeNode();};
 const result=await run(page,'package.save_checkpoint',{path:'/user/data/packages/continued.lgp',conflict_policy:'fail'});
 assert.equal(result.status,'AMBIGUOUS');assert.match(result.error.message,/native identity changed/);
});

test('save waits for requested reopened tab while another package remains visible',async()=>{
 const page=linkPage(),click=page.click.bind(page),other={prefix:'MF;TF-9',tabTid:'MF;cntMain;cntWorkspace;Workspace;t.br;tb-9',packagePath:'/user/data/other.lgp'};
 page.click=async item=>{await click(item);if(item.symbol==='packages.close')Object.assign(page,other,{active:true});};
 let pending,waits=0;
 page.onReopen=()=>{pending={prefix:page.prefix,tabTid:page.tabTid,packagePath:page.packagePath};Object.assign(page,other);};
 const wait=page.waitForTimeout.bind(page);page.waitForTimeout=async ms=>{await wait(ms);if(pending&&++waits===2){Object.assign(page,pending);pending=null;}};
 const outcome=await run(page,'package.save_as',{path:'/user/data/packages/multiple.lgp',conflict_policy:'fail'});
 assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome.error));assert.equal(waits,2);
 assert.equal(page.events.filter(e=>e==='package_reopened').length,1);
});

test('save/reopen graph proof retains links with semicolons in automatic node labels',async()=>{
  const page=linkPage();page.nodes[1].label='Дубликаты;_in:_Key';
  page.edges=['Источник|Output_Data-0|Дубликаты;_in:_Key|Input_Data-0'];
  const saved=await run(page,'package.save_as',{path:'/user/data/packages/semicolon.lgp',conflict_policy:'fail'});
  assert.equal(saved.status,'SUCCEEDED',JSON.stringify(saved.error));
  const proof=saved.trace.find(e=>e.event==='postcondition_verified');
  assert.equal(proof.graph.links.length,1);
  const changed=linkPage();changed.nodes[1].label='Дубликаты;_in:_Key';changed.edges=[...page.edges];changed.onReopen=p=>{p.edges=[];};
  const lost=await run(changed,'package.save_as',{path:'/user/data/packages/lost-link.lgp',conflict_policy:'fail'});
  assert.equal(lost.status,'AMBIGUOUS');
});


test('overwrite waits for native Save As menu dismissal before reopening its Close command', async()=>{
 const page=linkPage(),path='/user/data/packages/overwrite-race.lgp';
 page.storage.set(path,{nodes:[],edges:[]});
 const click=page.click.bind(page),wait=page.waitForTimeout.bind(page);let hiddenAt=null;const clicks=[];
 page.click=async item=>{
  const wasOpen=page.menu;clicks.push(item.symbol);await click(item);
  if(item.symbol==='packages.menu')page.menu=!wasOpen;
  if(item.symbol==='packages.save_as')page.menu=true;
  if(item.symbol==='message.yes'){page.menu=true;hiddenAt=page.clock+400;}
 };
 page.waitForTimeout=async ms=>{await wait(ms);if(hiddenAt!==null&&page.clock>=hiddenAt){page.menu=false;hiddenAt=null;}};
 const outcome=await run(page,'package.save_as',{path,conflict_policy:'replace'});
 assert.equal(outcome.status,'SUCCEEDED',JSON.stringify(outcome.error));
 assert.equal(clicks.filter(s=>s==='message.yes').length,1);
 assert.equal(clicks.filter(s=>s==='packages.close').length,1);
 assert.equal(clicks.filter(s=>s==='packages.open').length,1);
 assert.ok(outcome.trace.findIndex(e=>e.event==='save_flow_completed')>outcome.trace.findIndex(e=>e.event==='overwrite_confirmed'));
 assert.equal(outcome.output.reopened,true);
});

test('save/reopen waits for Save As completion before toggling the menu and for its Close command',async()=>{
 for(const delayed of ['save-menu','close-command']){
  const page=linkPage(),click=page.click.bind(page),wait=page.waitForTimeout.bind(page),elements=page.elements.bind(page);
  let hideAt=null,closeAt=null,saved=false,saveClicks=0,closeClicks=0;
  page.click=async item=>{const wasMenu=page.menu;await click(item);
   if(item.symbol==='packages.menu'){
    if(wasMenu)page.menu=false;
    if(saved&&delayed==='close-command'&&!page.events.includes('package_closed'))closeAt=page.clock+300;
   }
   if(item.symbol==='packages.save_as'){saveClicks++;if(delayed==='save-menu')page.menu=true;}
   if(item.symbol==='file_dialog.confirm'&&!saved){saved=true;if(delayed==='save-menu')hideAt=page.clock+400;}
   if(item.symbol==='packages.close')closeClicks++;
  };
  page.waitForTimeout=async ms=>{await wait(ms);if(hideAt!==null&&page.clock>=hideAt){page.menu=false;hideAt=null;}};
  page.elements=()=>{const all=elements();return closeAt!==null&&page.clock<closeAt?all.filter(e=>e.symbol!=='packages.close'):all;};
  const out=await run(page,'package.save_as',{path:'/user/data/packages/awaited-reopen.lgp',conflict_policy:'fail'});
  assert.equal(out.status,'SUCCEEDED',delayed+': '+JSON.stringify(out.error));assert.equal(out.output.reopened,true);
  assert.equal(saveClicks,1);assert.equal(closeClicks,1);assert.deepEqual(page.events.filter(e=>e.startsWith('package_')),['package_closed','package_reopened']);
 }
});
