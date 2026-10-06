import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { createLoginomHost } from "../../src/host"

// Controlled external IPC for journal/serialization tests; real MCP/entry tests live in knowledge.test.ts.
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
