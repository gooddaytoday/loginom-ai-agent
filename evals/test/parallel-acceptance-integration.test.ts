import { expect, test } from "bun:test"
import path from "node:path"
import { evalsRoot } from "../src/config"

test.skipIf(!Bun.which("bwrap"))("host sampler marks unavailable proc measurements in its private mount namespace", async () => {
  const child = Bun.spawn([Bun.which("bwrap")!, "--unshare-pid", "--unshare-net", "--ro-bind", "/", "/", "--proc", "/proc",
    "--dev", "/dev", "--ro-bind", "/dev/null", "/proc/stat", "--ro-bind", "/dev/null", "/proc/meminfo",
    "--chdir", evalsRoot, process.execPath, "-e", `
import { sampleHostResources } from ${JSON.stringify(path.join(evalsRoot, "src/parallel-resources.ts"))}
console.log(JSON.stringify(await sampleHostResources([${JSON.stringify(evalsRoot)}])))
`], { env: { PATH: process.env.PATH! }, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  const sample = JSON.parse(stdout)
  expect(sample.cpu).toBeNull()
  expect(sample.memory).toBeNull()
  expect(sample.errors).toEqual(["HOST_CPU_UNAVAILABLE", "HOST_MEMORY_UNAVAILABLE"])
  expect(sample.filesystems[0].capacity.available_bytes).toBeGreaterThan(0)
}, 10_000)
