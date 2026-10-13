import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"

test("inputs-only delivery reproduces seven ZIPs without exposing oracles or references", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "import-delivery-"))
  try {
    const outputs = await Promise.all(["a", "b"].map(async name => {
      const out = path.join(root, name)
      const child = Bun.spawn(["python3", path.join(evalsRoot, "script/bundle-text-import.py"), "--out", out], { stdout: "pipe", stderr: "pipe" })
      const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()])
      expect(error).toBe(""); expect(code).toBe(0)
      return await Bun.file(path.join(out, "manifest.json")).json()
    }))
    expect(outputs[0]).toEqual(outputs[1])
    expect(outputs[0].groups).toHaveLength(7)
    expect(outputs[0].groups.flatMap((group: { ids: string[] }) => group.ids)).toHaveLength(58)
    const check = Bun.spawn(["python3", "-c", `import pathlib,zipfile,sys,json,hashlib
root=pathlib.Path(sys.argv[1]);count=0
for archive in root.glob('*.zip'):
 with zipfile.ZipFile(archive) as z:
  for name in z.namelist():
   assert name=='manifest.json' or name.endswith('/TASK.md') or '/data/' in name,name
   assert 'transactions' not in name
  manifest=json.loads(z.read('manifest.json'))
  for item in manifest['files']:
   data=z.read(item['path']);assert len(data)==item['bytes'] and hashlib.sha256(data).hexdigest()==item['sha256']
  count+=len([n for n in z.namelist() if '/data/' in n])
assert count==59,count`, path.join(root, "a")], { stdout: "pipe", stderr: "pipe" })
    const [code, error] = await Promise.all([check.exited, new Response(check.stderr).text()])
    expect(error).toBe(""); expect(code).toBe(0)
  } finally { await rm(root, { recursive: true, force: true }) }
})
