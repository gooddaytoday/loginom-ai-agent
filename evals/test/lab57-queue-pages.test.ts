import {test,expect} from "bun:test"
test("queue parser recognizes the actual CLI cursor and refuses malformed, ambiguous or incomplete pages",async()=>{
  const script=`import importlib.util,json,sys
s=importlib.util.spec_from_file_location('queues',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
rows=[{'id':'a','status':'running'}]; cursor='2026-10-10T08:19:23.229165Z|01a124e5-33da-760e-99b8-ede89284188f'
r,c=m.parse_page(json.dumps(rows),'More runs available; use --before "'+cursor+'" to fetch the next page.\\n');assert c==cursor and r==rows
assert m.parse_page('[]','')==([],None)
for out,err in [('{}',''),('[{}]',''),('[{"id":"a","status":"running"},{"id":"a","status":"failed"}]',''),('[]','More runs available; missing cursor'),('[]','More runs available; use --before "unsafe" to fetch the next page.')]:
 try:m.parse_page(out,err)
 except Exception:continue
 raise Exception('Unsafe queue page accepted')
print('PASS')`
  const p=Bun.spawn(["/usr/bin/python3","-c",script,new URL("../script/lab57-queue-pages.py",import.meta.url).pathname],{stdout:"pipe",stderr:"pipe"})
  const [code,out,err]=await Promise.all([p.exited,new Response(p.stdout).text(),new Response(p.stderr).text()])
  expect(code).toBe(0);expect(err).toBe("");expect(out.trim()).toBe("PASS")
})
