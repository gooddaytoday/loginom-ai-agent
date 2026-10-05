import { expect, test } from "bun:test"

test("actual adapter waits for bounded source/context replies beyond the ordinary transport limit", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const built = await Bun.build({ entrypoints: [new URL("../src/adapter.ts", import.meta.url).pathname], target: "node" })
  if (!built.success) throw Error("Adapter test bundle failed")
  const module = "data:text/javascript;base64," + Buffer.from(await built.outputs[0].text()).toString("base64")
  const child = Bun.spawn([node, "--input-type=module"], { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  child.stdin.write(`
    import assert from 'node:assert/strict';
    import { mock } from 'node:test';
    import { EventEmitter } from 'node:events';
    import { setImmediate } from 'node:timers/promises';
    const adapter = await import(${JSON.stringify(module)});
    mock.timers.enable({apis:['setTimeout']});
    const replies = new EventEmitter();
    let duration = 0, dispatches = 0;
    adapter.connect({on:replies.on.bind(replies),start(){},postMessage(message){
      if(message.method==='call'){
        dispatches++;
        setTimeout(()=>replies.emit('message',{data:{id:message.id,result:{kind:message.input.args.kind}}}),duration);
        return;
      }
      queueMicrotask(()=>replies.emit('message',{data:{id:message.id,
        result:message.method==='acquire'?{generation:1}:true}}));
    }});
    const run = await adapter.acquire('chat');
    for(const [args,delay] of [[{kind:'source'},310000],[{kind:'context'},610000],
      [{kind:'source',budget_ms:1800000},1810000],[{kind:'context',cursor:'owned-cursor'},1810000]]){
      duration=delay;
      const call=run.call('dock_node_read',args,'original');
      await setImmediate();
      mock.timers.tick(delay);
      assert.deepEqual(await call,{kind:args.kind});
    }
    assert.equal(dispatches,4);
    duration=181000;
    const expired=run.call('dock_node_read',{kind:'status'},'original').catch(error=>error.message);
    await setImmediate();
    mock.timers.tick(180001);
    assert.equal(await expired,'LOGINOM_HOST_TIMEOUT');
    assert.equal(dispatches,5);
    await run.release();adapter.disconnect();mock.timers.reset();
  `)
  child.stdin.end()
  const [exit, output, errors] = await Promise.all([child.exited, new Response(child.stdout).text(),
    new Response(child.stderr).text()])
  expect(exit, output + errors).toBe(0)
}, 15_000)
