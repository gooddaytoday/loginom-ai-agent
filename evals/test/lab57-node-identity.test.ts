import { test, expect } from "bun:test"
import { mkdtemp, copyFile, lstat, realpath, symlink, unlink, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { verifyNodeIdentity } from "../src/lab57-node-identity"

test("actual executable cannot be admitted by matching version or equal-byte copy", async () => {
  const root=await mkdtemp("/tmp/lab57-node-")
  const executable=await realpath(process.execPath), info=await lstat(executable)
  const raw=await Bun.file(executable).arrayBuffer()
  const original={path:executable,device:info.dev,inode:info.ino,bytes:info.size,sha256:createHash("sha256").update(new Uint8Array(raw)).digest("hex")}
  expect((await verifyNodeIdentity(original)).path).toBe(executable)
  await copyFile(executable,root+"/same-version")
  const copy=await lstat(root+"/same-version")
  await expect(verifyNodeIdentity({...original,path:root+"/same-version",inode:copy.ino})).rejects.toThrow("EXECUTABLE_IDENTITY")
})
