import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { observeMcpTransport } from '../lib/mcp-origin.mjs';
import { makeBrowserGeometryCode, parseBrowserGeometry } from '../lib/browser-geometry.mjs';

test('official transport records ordered origin before dispatch and never persists arguments', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-origin-'));
  try {
    const transport = { async start() {}, async send() {}, async close() { this.onclose?.(); } };
    const wrapper = observeMcpTransport(transport, { directory, metadata: { sessionId:'own',clientRevision:'runtime',actionManifestDigest:'catalog' } });
    const dispatched=[];
    wrapper.onmessage = message => dispatched.push(message.method);
    await wrapper.start();
    for (const method of ['initialize','notifications/initialized','tools/list','tools/call'])
      transport.onmessage({ method, params: { clientInfo:{name:'loginom-acceptance-tool-precheck',version:'1'},password:'DO_NOT_STORE',arguments:{prompt:'DO_NOT_STORE'} } });
    await wrapper.close();
    const text=await readFile(join(directory,'mcp-origin.json'),'utf8'),receipt=JSON.parse(text);
    assert.deepEqual(receipt.methods,dispatched);
    assert.equal(receipt.source,'official_stdio_transport');
    assert.equal(receipt.initialized_client,'loginom-acceptance-tool-precheck/1');
    assert.equal(receipt.session_id,'own');assert.equal(receipt.pid,process.pid);
    assert.equal(receipt.closed,true);assert.equal(receipt.overflow,false);
    assert.ok(receipt.methods.includes('tools/call'));
    assert.equal(text.includes('DO_NOT_STORE'),false);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('native router origin is distinct from direct stdio evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-router-origin-'));
  try {
    const transport = { async start() {}, async send() {}, async close() {} };
    const session = { directory, metadata: { sessionId:'routed',clientRevision:'runtime' } };
    const wrapper = observeMcpTransport(transport, session, { source:'native_hermes_router' });
    await wrapper.start();
    transport.onmessage({ method:'initialize', params:{clientInfo:{name:'loginom-dock-native-hermes-router',version:'test'}} });
    await wrapper.close();
    const receipt = JSON.parse(await readFile(join(directory,'mcp-origin.json'),'utf8'));
    assert.equal(receipt.source,'native_hermes_router');
    assert.equal(receipt.initialized_client,'other');
    assert.equal(receipt.closed,true);
    assert.throws(() => observeMcpTransport(transport, session, {source:'unknown'}), /Unknown MCP/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('geometry reads actual page and viewport with binding, without mutating a window', async () => {
  const globals={__loginomDockPreparationV1:{id:'doc'},location:{origin:'https://loginom.test',pathname:'/app/'},
    document:{visibilityState:'visible'},innerWidth:1508,innerHeight:862,outerWidth:1508,outerHeight:949,
    screenX:2,screenY:33,devicePixelRatio:1.25,screen:{width:1536,height:864,availLeft:0,availTop:33,availWidth:1512,availHeight:949},
    visualViewport:{width:1508,height:862,scale:1,offsetLeft:0,offsetTop:0}};
  const page={viewportSize:()=>null,evaluate:async fn=>runInNewContext(`(${fn.toString()})()`,globals)};
  const value=await runInNewContext(makeBrowserGeometryCode({session_id:'own',document_id:'doc'}))(page);
  assert.equal(value.viewport,null);assert.equal(value.observed.outer_width,1508);
  assert.equal(value.observed.document_id,'doc');assert.equal(value.session_id,'own');
  assert.equal(value.observed.device_pixel_ratio,1.25);
  assert.equal(value.observed.screen_width,1536);
  assert.equal(value.observed.screen_height,864);
  assert.equal(value.observed.visual_viewport.scale,1);
  delete globals.visualViewport;
  assert.equal((await runInNewContext(makeBrowserGeometryCode({session_id:'own',document_id:'doc'}))(page)).observed.visual_viewport,null);
  assert.deepEqual(parseBrowserGeometry({content:[{type:'text',text:'### Result\n'+JSON.stringify(value)}]}),JSON.parse(JSON.stringify(value)));
  assert.throws(()=>parseBrowserGeometry({isError:true,content:[]}),/missing/);
  assert.throws(()=>parseBrowserGeometry({content:[{type:'text',text:'{"browserWindowMode":"maximized"}'}]}),/missing/);
});
