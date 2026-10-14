import {test,expect} from "bun:test"
import {Database} from "bun:sqlite"
import {mkdtemp,mkdir,readFile} from "node:fs/promises"
import {createHash} from "node:crypto"

test("normal SQLite audit reads coherent private WAL/SHM, preserves bytes and rejects model/row loss",async()=>{
  const root=await mkdtemp("/tmp/lab57-wal-audit-");await mkdir(root+"/copies")
  const db=new Database(root+"/copies/loginom-ai-agent.db",{create:true});db.exec("PRAGMA journal_mode=WAL; CREATE TABLE message(id TEXT,session_id TEXT,time_created INTEGER,data TEXT)")
  const insert=db.query("INSERT INTO message VALUES(?,?,?,?)")
  for(let i=0;i<77;i++)insert.run("row"+i,"session"+(i%6),i,JSON.stringify({role:"assistant",providerID:"openai",modelID:"gpt-6-luna",variant:"high",content:"body"+i}))
  const summary=root+"/summary.json";await Bun.write(summary,JSON.stringify({tasks:[{attempts:Array.from({length:6},(_,i)=>({session_id:"session"+i}))}]}))
  const bytes=async()=>Promise.all(["","-wal","-shm"].map(async s=>createHash("sha256").update(await readFile(root+"/copies/loginom-ai-agent.db"+s)).digest("hex")))
  const before=await bytes()
  const audit=async()=>{const p=Bun.spawn(["/usr/bin/python3",new URL("../script/lab57-history-rows.py",import.meta.url).pathname,root+"/copies",summary],{env:{PATH:"/usr/bin:/bin",EVAL_CLI_MODE:"fake"},stdout:"pipe",stderr:"pipe"})
    return {code:await p.exited,out:await new Response(p.stdout).text(),err:await new Response(p.stderr).text()}}
  const positive=await audit();expect(positive.code).toBe(0);expect(positive.err).toBe("");expect(JSON.parse(positive.out).assistantRows).toBe(77)
  expect(JSON.parse(positive.out).normalWalShm).toBe(true);expect(JSON.parse(positive.out).originalSqlOpened).toBe(false);expect(await bytes()).toEqual(before)
  db.query("UPDATE message SET data=? WHERE id='row0'").run(JSON.stringify({role:"assistant",providerID:"openai",modelID:"gpt-6-luna",variant:"low"}))
  expect((await audit()).code).not.toBe(0)
  db.query("DELETE FROM message WHERE id='row0'").run();expect((await audit()).code).not.toBe(0)
  db.close()
})
