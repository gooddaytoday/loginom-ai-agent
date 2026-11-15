import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const script = fileURLToPath(new URL("../../deploy/containers.sh", import.meta.url))

for (const [name, args, error] of [
  ["invalid host", ["--public-host", "https://invalid.example"], /Usage:/],
  ["invalid port", ["--public-host", "studio.example", "--app-host-port", "65536"], /Invalid app host port/],
  ["incomplete strict configuration", ["--public-host", "studio.example", "--strict"], /Usage:/],
]) test(`${name} fails before looking for an engine or changing files`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-invalid-"))
  try {
    const result = spawnSync("/bin/bash", [script, "install", "--engine", "docker", ...args], {
      cwd: directory, env: { PATH: "/nonexistent", TMPDIR: directory }, encoding: "utf8",
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, error)
    assert.deepEqual(await readdir(directory), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
