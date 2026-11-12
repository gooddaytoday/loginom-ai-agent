import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { createLoginomHost } from "../../src/host"

// Controlled external IPC for journal/serialization tests; real entry tests live in knowledge.test.ts.
export async function stageKnowledgeFixture(resources: string) {
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await writeFile(
    join(resources, "runtime/src/knowledge-entry.mjs"),
    `
    const tools = ['find','search','read','grep','glob','list','tree'].map(name => ({name,
      description: 'Controlled Help fixture', inputSchema: {type:'object',properties:{uri:{type:'string'}}}}));
    process.on('disconnect', () => process.exit(0));
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,started:true}});
      if (m.operation === 'list') process.send({id:m.id,result:{tools}});
      if (m.operation === 'call') process.send({id:m.id,result:{name:m.input.name}});
      if (m.operation === 'interrupt') process.send({id:m.id,result:{interrupted:true}});
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });
  `,
  )
}

export async function waitForKnowledge(host: Awaited<ReturnType<typeof createLoginomHost>>) {
  await host.settled()
  const status = await host.api.status()
  if (status.generation) await host.catalog(status.generation)
}

// Shipped Help loads without a cancellable wait, so tests of Host behaviour while
// the catalog is still pending hold `list` in this stub. The first list claims
// `gate` and is answered when it is released (or fails like changed Help when
// released with `fail`); close rejects it like the real entry.
export async function stageHeldKnowledge(entry: string, gate: string) {
  await mkdir(dirname(entry), { recursive: true })
  await writeFile(gate, "")
  await writeFile(
    entry,
    `
    import { appendFileSync, existsSync, renameSync } from 'node:fs';
    const gate = ${JSON.stringify(gate)};
    const tools = ['find','search','read','grep','glob','list','tree'].map(name => ({name,
      description: 'Held Help fixture', inputSchema: {type:'object',properties:{uri:{type:'string'}},required:['uri']}}));
    const held = [];
    const unavailable = {phase:'knowledge.catalog',retry:false,error:{name:'Error',code:'',message:'LOGINOM_KNOWLEDGE_UNAVAILABLE',
      cause:{name:'Error',code:'',message:'LOGINOM_HELP_INTEGRITY'}}};
    setInterval(() => {
      if (!held.length || existsSync(gate + '.held')) return;
      for (const m of held.splice(0)) process.send(existsSync(gate + '.fail')
        ? {id:m.id,error:'LOGINOM_KNOWLEDGE_UNAVAILABLE',startupDiagnostics:[unavailable]} : {id:m.id,result:{tools}});
    }, 10).unref();
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,started:true}});
      if (m.operation === 'list') {
        appendFileSync(gate + '.lists', '.');
        try { renameSync(gate, gate + '.held'); held.push(m); } catch { process.send({id:m.id,result:{tools}}); }
      }
      if (m.operation === 'call') process.send({id:m.id,result:{content:[{type:'text',
        text:JSON.stringify({name:m.input.name,arguments:m.input.arguments})}]}});
      if (m.operation === 'interrupt') process.send({id:m.id,result:{interrupted:true}});
      if (m.operation === 'close') {
        for (const h of held.splice(0)) process.send({id:h.id,error:'LOGINOM_KNOWLEDGE_CLOSED'});
        process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
      }
    });
  `,
  )
  return {
    async entered() {
      while (!(await access(gate + ".held").then(() => true, () => false))) await Bun.sleep(10)
    },
    async release(outcome?: "fail") {
      if (outcome === "fail") await writeFile(gate + ".fail", "")
      await Promise.all([rm(gate, { force: true }), rm(gate + ".held", { force: true })])
    },
    async lists() {
      return (await readFile(gate + ".lists", "utf8").catch(() => "")).length
    },
  }
}
