import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const script = fileURLToPath(new URL("../../deploy/containers.sh", import.meta.url))

for (const [name, args, error] of [
  ["remove-image on install", ["--remove-image"], /Usage:/],
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

function inspectPublisher(overrides = {}, engine = "docker") {
  const imageID = "sha256:" + "1".repeat(64)
  const mounts = {
    web: [["builds", "/builds", false]],
    publisher: [["builds", "/builds", true], ["jobs-in", "/jobs-in", true], ["jobs-out", "/jobs-out", true]],
    builder: [["jobs-in", "/jobs-in", false], ["jobs-out", "/jobs-out", true]],
  }
  const roles = Object.entries(mounts).map(([role, volumes]) => ({
    Name: (engine === "docker" ? "/" : "") + "loginom-dashboard-" + role,
    Image: engine === "docker" ? imageID : imageID.slice(7),
    Config: { Image: "dashboard:test", User: role === "publisher" ? "1234:1234" : "65534:65534", Labels: { "loginom.dashboard.owner": "release" } },
    State: { Running: true },
    HostConfig: {
      ReadonlyRootfs: true, CapDrop: engine === "docker" ? ["ALL"] : ["CAP_CHOWN", "CAP_DAC_OVERRIDE"], CapAdd: null, Privileged: false,
      SecurityOpt: ["no-new-privileges"], Memory: 128 * 1024 * 1024, PidsLimit: 64,
      Tmpfs: { "/tmp": "rw,noexec,nosuid,size=16m" }, NetworkMode: role === "web" ? "synthetic-network" : "none", PortBindings: {},
      ...(role === "publisher" ? overrides : {}),
    },
    NetworkSettings: { Networks: { "synthetic-network": {} } },
    Mounts: [
      ...volumes.map(([name, Destination, RW]) => ({ Source: "/synthetic/state/" + name, Destination, RW })),
      ...(role === "publisher" ? [{ Source: "/synthetic/storage", Destination: "/storage", RW: false }] : []),
    ],
  }))
  return spawnSync(process.execPath, [fileURLToPath(new URL("../../deploy/check-release.mjs", import.meta.url)), "roles",
    "dashboard:test", "/synthetic/storage", "/synthetic/state", "1234:1234", "synthetic-network", imageID, engine], {
    input: JSON.stringify(roles), encoding: "utf8",
  })
}

test("role helper accepts Podman inspect names and image digest representation", () => {
  assert.equal(inspectPublisher({}, "podman").status, 0)
})

test("role helper rejects privileged publisher despite cap_drop ALL", () => {
  assert.equal(inspectPublisher().status, 0)
  assert.equal(inspectPublisher({ Privileged: true }).status, 1)
})

test("role helper rejects added publisher capabilities despite cap_drop ALL", () => {
  assert.equal(inspectPublisher({ CapAdd: [] }).status, 0)
  assert.equal(inspectPublisher({ CapAdd: ["SYS_ADMIN"] }).status, 1)
})

test("ownership accepts only the exact reserved compose container and state mount", () => {
  const inspect = [{ Name: "/loginom-dashboard-web", Config: { Labels: {
    "loginom.dashboard.owner": "release", "com.docker.compose.project": "loginom-dashboard",
    "com.docker.compose.service": "web", "com.docker.compose.project.working_dir": "/synthetic/state",
  } }, Mounts: [{ Source: "/synthetic/state/builds", Destination: "/builds" }] }]
  const run = () => spawnSync(process.execPath, [fileURLToPath(new URL("../../deploy/check-release.mjs", import.meta.url)), "owned", "/synthetic/state", "web"], { input: JSON.stringify(inspect), encoding: "utf8" })
  assert.equal(run().status, 0)
  inspect[0].Name = "loginom-dashboard-web"
  assert.equal(run().status, 0)
  inspect[0].Config.Labels["com.docker.compose.project"] = "foreign"
  assert.equal(run().status, 1)
  inspect[0].Config.Labels["com.docker.compose.project"] = "loginom-dashboard"
  inspect[0].Mounts[0].Source = "/synthetic/foreign/builds"
  assert.equal(run().status, 1)
})

test("release builder rejects unknown arguments before preparation", () => {
  const result = spawnSync("bun", [fileURLToPath(new URL("../../script/build-release.ts", import.meta.url)), "--unknown"], { encoding: "utf8" })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Usage:.*--out/)
})
