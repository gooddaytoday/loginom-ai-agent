import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const script = fileURLToPath(new URL("../../deploy/containers.sh", import.meta.url))
const master = fileURLToPath(new URL("../../deploy/dev-master.sh", import.meta.url))

async function installFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-install-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const state = join(directory, "state")
  const site = join(directory, "apache/dashboard.site.conf")
  const image = "dashboard:test\n"
  await mkdir(join(directory, "apache"))
  await mkdir(join(directory, "workdir/storage"), { recursive: true })
  // Redirect the fixed Docker state path while exercising the public install command.
  const source = await readFile(script, "utf8")
  const isolated = source.replace(/^state=\/var\/opt\/loginom-dashboard$/m, "state=$DASHBOARD_TEST_ROOT/state")
  assert.notEqual(isolated, source)
  await writeFile(join(directory, "containers.sh"), isolated)
  await copyFile(new URL("../../deploy/check-release.mjs", import.meta.url), join(directory, "check-release.mjs"))
  await copyFile(new URL("../../deploy/compose-release.yaml", import.meta.url), join(directory, "compose-release.yaml"))
  await writeFile(join(directory, "image.ref"), image)
  await writeFile(join(directory, "SHA256SUMS"), `${createHash("sha256").update(image).digest("hex")}  image.ref\n`)
  // Emulate engine discovery and the two Apache calls. Validate with the shipped helper.
  await writeFile(join(directory, "docker"), `#!/bin/bash
case "$1" in
  load|compose) exit 0;;
  image) printf 'sha256:%064d\n' 1;;
  container) exit 1;;
  ps) case "$*" in *service=loginom-http*) echo studio;; *service=loginom-server*) echo server;; esac;;
  inspect) case "$3" in
    *Labels*) echo loginom;;
    *apache2/conf*) echo "$DASHBOARD_TEST_ROOT/apache";;
    *'json .Mounts'*) printf '[{"Type":"bind","Source":"%s/workdir","Destination":"/workdir"}]\n' "$DASHBOARD_TEST_ROOT";;
    */workdir*) echo "$DASHBOARD_TEST_ROOT/workdir";;
    *Networks*) echo loginom-network;;
    '{{.Name}}') echo /studio;;
    *) exit 2;;
  esac;;
  port) [[ $3 == 80/tcp ]] && echo 0.0.0.0:80;;
  exec) case "$2/$3" in
    server/cat) echo '<Settings><Directories UserStorage="storage"/></Settings>';;
    server/stat) echo 1234:1234;;
    studio/httpd) [[ $4 != -t || $DASHBOARD_TEST_APACHE_REJECT != 1 ]];;
    *) exit 2;;
  esac;;
  run) while [[ $# -gt 0 && $1 != /check.mjs ]]; do shift; done
    if [[ $# -gt 0 ]]; then shift; exec "$DASHBOARD_TEST_NODE" "$DASHBOARD_TEST_ROOT/check-release.mjs" "$@"; fi
    echo sha384-synthetic;;
  *) exit 2;;
esac
`, { mode: 0o700 })
  for (const [command, status] of [["curl", 0], ["ss", 0], ["selinuxenabled", 1]])
    await writeFile(join(directory, command), `#!/bin/bash\nexit ${status}\n`, { mode: 0o700 })
  await writeFile(join(directory, "mkdir"), `#!/bin/bash
[[ $DASHBOARD_TEST_MOUNT_REJECT != 1 || $3 != "$DASHBOARD_TEST_ROOT/state/jobs-in" ]] || exit 1
exec /bin/mkdir "$@"
`, { mode: 0o700 })
  const install = ({ apacheReject = false, mountReject = false } = {}) => spawnSync("/bin/bash", [join(directory, "containers.sh"), "install", "--engine", "docker", "--public-host", "studio.example"], {
    env: {
      DASHBOARD_TEST_ROOT: directory, DASHBOARD_TEST_NODE: process.execPath,
      DASHBOARD_TEST_APACHE_REJECT: apacheReject ? "1" : "0", DASHBOARD_TEST_MOUNT_REJECT: mountReject ? "1" : "0",
      TMPDIR: directory, PATH: `${directory}:/usr/bin:/bin`,
    },
    encoding: "utf8",
  })
  return { state, site, install }
}

test("a rejected Apache candidate allows a fresh install to be repeated", async t => {
  const { state, site, install } = await installFixture(t)
  const rejected = install({ apacheReject: true })
  assert.equal(rejected.status, 1, rejected.stderr)
  assert.match(rejected.stderr, /Apache configuration rejected/)
  await assert.rejects(readFile(site), { code: "ENOENT" })
  const retried = install()
  assert.equal(retried.status, 0, retried.stderr)
  assert.match(await readFile(join(state, ".env"), "utf8"), /DASHBOARD_PUBLISHER_USER=1234:1234/)
  assert.match(await readFile(site, "utf8"), /Managed by loginom-dashboard release installer/)
})

test("a mount creation failure rolls back the fresh Apache site and empty state", async t => {
  const { state, site, install } = await installFixture(t)
  const rejected = install({ mountReject: true })
  assert.equal(rejected.status, 1, rejected.stderr)
  assert.match(rejected.stderr, /Dashboard apply failed/)
  await assert.rejects(readFile(site), { code: "ENOENT" })
  await assert.rejects(readdir(state), { code: "ENOENT" })
  const retried = install()
  assert.equal(retried.status, 0, retried.stderr)
})

test("install keeps container mounts accessible under an owner-only host directory", async t => {
  const { state, install } = await installFixture(t)
  const fresh = install()
  assert.equal(fresh.status, 0, fresh.stderr)
  assert.equal((await stat(state)).mode & 0o777, 0o700)
  const stateFile = join(state, "builds/state.json")
  await writeFile(stateFile, "{}\n")
  await chmod(state, 0o755) // Existing releases used a public state directory.
  const repeated = install()
  assert.equal(repeated.status, 0, repeated.stderr)
  assert.equal((await stat(state)).mode & 0o777, 0o700)
  assert.equal(await readFile(stateFile, "utf8"), "{}\n")
  for (const mount of ["builds", "jobs-in", "jobs-out"])
    assert.equal((await stat(join(state, mount))).mode & 0o777, 0o777)
})

test("Podman conmon rotates only bounded Dashboard role logs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-conmon-"))
  try {
    // Record the host process invocation without using a container.
    await writeFile(join(directory, "conmon"), '#!/bin/bash\nprintf "%s\\n" "$@"\n', { mode: 0o700 })
    const launcher = fileURLToPath(new URL("../../deploy/conmon-rotate.sh", import.meta.url))
    const run = args => {
      const result = spawnSync("/bin/bash", [launcher, ...args], { env: { PATH: directory }, encoding: "utf8" })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout.trimEnd().split("\n")
    }
    const log = ["-l", "k8s-file:/synthetic/log", "--log-size-max", "10485760"]
    for (const role of ["web", "publisher", "builder"]) {
      const args = ["-n", "loginom-dashboard-" + role, ...log]
      assert.deepEqual(run(args), [...args, "--log-rotate", "--log-max-files", "2"])
    }
    for (const args of [
      ["--version"],
      ["-n", "loginom-dashboard-web-probe", ...log],
      ["-n", "loginom-dashboard-web", "-l", "journald:", "--log-size-max", "10485760"],
      ["-n", "loginom-dashboard-web", ...log.slice(0, 3), "0"],
    ]) assert.deepEqual(run(args), args)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Podman stop preserves an unowned launcher and stops the saved release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-stop-"))
  try {
    const state = join(directory, "loginom-dashboard")
    const launcher = join(state, "conmon-rotate.sh")
    const image = "dashboard:test\n"
    await mkdir(state)
    await copyFile(script, join(directory, "containers.sh"))
    await writeFile(join(directory, "image.ref"), image)
    await writeFile(join(directory, "SHA256SUMS"), `${createHash("sha256").update(image).digest("hex")}  image.ref\n`)
    await writeFile(join(state, ".env"), `DASHBOARD_STATE=${state}\nDASHBOARD_IMAGE=${image}`)
    await writeFile(join(state, "compose-release.yaml"), "services: {}\n")
    await writeFile(launcher, "unowned launcher\n")
    await writeFile(join(directory, "podman"), '#!/bin/bash\ncase "$1" in container) exit 1;; ps) exit 0;; *) exit 2;; esac\n', { mode: 0o700 })
    await writeFile(join(directory, "podman-compose"), '#!/bin/bash\nprintf "%s\\n" "$PWD" "$*"\n', { mode: 0o700 })
    const run = action => spawnSync("/bin/bash", [join(directory, "containers.sh"), action, "--engine", "podman"], {
      env: { HOME: directory, TMPDIR: directory, PATH: `${directory}:/usr/bin:/bin` }, encoding: "utf8",
    })
    const stopped = run("stop")
    assert.equal(stopped.status, 0, stopped.stderr)
    assert.ok(stopped.stdout.includes(`${state}\n-p loginom-dashboard -f compose-release.yaml down\n`), stopped.stdout)
    assert.equal(await readFile(launcher, "utf8"), "unowned launcher\n")
    for (const action of ["start", "uninstall"]) {
      const refused = run(action)
      assert.equal(refused.status, 1, refused.stderr)
      assert.match(refused.stderr, /Dashboard conmon launcher is occupied/)
    }
    await writeFile(join(state, ".env"), `DASHBOARD_STATE=${state}\nDASHBOARD_IMAGE=dashboard:other\n`)
    assert.match(run("stop").stderr, /Saved release differs/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("master stop validates the specified configuration before reaching Docker", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-invalid-"))
  try {
    const result = spawnSync("/bin/bash", [master, "stop", "--config", join(directory, "missing.json")], {
      env: { ...process.env, TMPDIR: directory }, encoding: "utf8",
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /ENOENT.*missing\.json/)
    assert.deepEqual(await readdir(directory), [])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

for (const [name, args] of [
  ["stop with an install-only strict flag", ["stop", "--config", "unused.json", "--strict"]],
  ["start with an install-only CLI button flag", ["start", "--config", "unused.json", "--cli-button"]],
  ["start without a configuration", ["start"]],
]) test(`master ${name} fails before looking for Docker`, () => {
  const result = spawnSync("/bin/bash", [master, ...args], { env: { PATH: "/nonexistent" }, encoding: "utf8" })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /^Usage:.*\n$/)
})

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

function inspectPublisher(overrides = {}, engine = "docker", identity = {}) {
  const imageID = "sha256:" + "1".repeat(64)
  const publisherImage = Object.hasOwn(identity, "publisherImage") ? identity.publisherImage : imageID
  const builderImage = Object.hasOwn(identity, "builderImage") ? identity.builderImage : engine === "docker" ? imageID : imageID.slice(7)
  const mounts = {
    web: [["builds", "/builds", false]],
    publisher: [["builds", "/builds", true], ["jobs-in", "/jobs-in", true], ["jobs-out", "/jobs-out", true]],
    builder: [["jobs-in", "/jobs-in", false], ["jobs-out", "/jobs-out", true]],
  }
  const roles = Object.entries(mounts).map(([role, volumes]) => ({
    Name: (engine === "docker" ? "/" : "") + "loginom-dashboard-" + role,
    Image: role === "builder" ? builderImage : engine === "docker" ? imageID : imageID.slice(7),
    Config: {
      Image: "dashboard:test", User: role === "publisher" ? "1234:1234" : "65534:65534", Labels: { "loginom.dashboard.owner": "release" },
      Env: role === "publisher" && publisherImage ? [`DASHBOARD_BUILDER_IMAGE=${publisherImage}`] : [],
    },
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
    "dashboard:test", "/synthetic/storage", "/synthetic/state", "1234:1234", "synthetic-network", identity.expectedImage ?? imageID, engine], {
    input: JSON.stringify(roles), encoding: "utf8",
  })
}

test("role helper accepts Podman inspect names and image digest representation", () => {
  assert.equal(inspectPublisher({}, "podman").status, 0)
})

test("role helper verifies builder provenance in publisher environment on both engines", () => {
  const other = "sha256:" + "2".repeat(64)
  for (const engine of ["docker", "podman"]) {
    assert.equal(inspectPublisher({}, engine).status, 0)
    for (const identity of [
      { publisherImage: undefined }, { publisherImage: other }, { builderImage: undefined }, { builderImage: other }, { expectedImage: other },
    ]) {
      const result = inspectPublisher({}, engine, identity)
      assert.equal(result.status, 1)
      assert.match(result.stderr, /builder image/i)
    }
  }
})

test("role helper rejects privileged publisher despite cap_drop ALL", () => {
  assert.equal(inspectPublisher().status, 0)
  assert.equal(inspectPublisher({ Privileged: true }).status, 1)
})

test("role helper rejects added publisher capabilities despite cap_drop ALL", () => {
  assert.equal(inspectPublisher({ CapAdd: [] }).status, 0)
  assert.equal(inspectPublisher({ CapAdd: ["SYS_ADMIN"] }).status, 1)
})

test("role helper accepts enabled NNP and rejects explicitly disabled NNP", () => {
  for (const value of ["no-new-privileges", "no-new-privileges:true", "no-new-privileges=true"])
    assert.equal(inspectPublisher({ SecurityOpt: [value] }).status, 0)
  for (const value of ["no-new-privileges:false", "no-new-privileges=false"])
    assert.equal(inspectPublisher({ SecurityOpt: [value] }).status, 1)
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

const helper = fileURLToPath(new URL("../../deploy/check-release.mjs", import.meta.url))
function check(action, input, ...args) {
  return spawnSync(process.execPath, [helper, action, ...args], { input, encoding: "utf8" })
}

function labelRoles() {
  return ["web", "publisher", "builder"].map(role => ({
    Name: "loginom-dashboard-" + role,
    ProcessLabel: "system_u:system_r:container_t:s0:c123,c456",
    HostConfig: { SecurityOpt: ["no-new-privileges"] },
    Mounts: role === "publisher" ? [{ Destination: "/storage", RW: false }] : [],
  }))
}

test("check derives the canonical app origin while saved public host spelling is preserved", () => {
  const origin = "https://Studio.Example:8101"
  const clients = "http://Studio.Example:8080,https://Studio.Example:8443,https://Second.Example:8443"
  const config = check("config", "", origin, clients, "/synthetic/storage")
  assert.equal(config.status, 0, config.stderr)
  assert.equal(config.stdout.trim(), "https://studio.example:8101")
  const result = check("ready", JSON.stringify({
    appOrigin: "https://studio.example:8101", mode: "normal", key: "a".repeat(64), hash: "b".repeat(64),
    publication: { name: "probe.json", sourceHash: "c".repeat(64), status: "ready" },
    currentVersion: { name: "probe.json", sourceHash: "c".repeat(64) },
  }), "probe.json", "c".repeat(64), config.stdout.trim(), "normal")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim().slice(config.stdout.trim().length), `/apps/${"a".repeat(64)}/${"b".repeat(64)}/`)
})

test("strict check uses the canonical separate app domain and still refuses a different ready origin", () => {
  const config = check("config", "", "https://Apps.Example:9443", "https://Studio.Example:8443,https://Second.Example:8443", "/synthetic/storage")
  assert.equal(config.status, 0, config.stderr)
  assert.equal(config.stdout.trim(), "https://apps.example:9443")
  const ready = {
    appOrigin: config.stdout.trim(), mode: "strict", key: "a".repeat(64), hash: "b".repeat(64),
    publication: { name: "probe.json", sourceHash: "c".repeat(64), status: "ready" },
    currentVersion: { name: "probe.json", sourceHash: "c".repeat(64) },
  }
  assert.equal(check("ready", JSON.stringify(ready), "probe.json", "c".repeat(64), config.stdout.trim(), "strict").status, 0)
  ready.appOrigin = "https://foreign.example:9443"
  assert.equal(check("ready", JSON.stringify(ready), "probe.json", "c".repeat(64), config.stdout.trim(), "strict").status, 1)
})

test("discovery maps configured relative UserStorage instead of an existing old default directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dashboard-storage-"))
  try {
    await mkdir(join(directory, "UserStorage"))
    await mkdir(join(directory, "ActualStorage"))
    const result = check("storage", '<?xml version="1.0"?><Settings><Directories UserStorage="ActualStorage"/></Settings>',
      JSON.stringify([{ Type: "bind", Source: directory, Destination: "/workdir" }]))
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), join(directory, "ActualStorage"))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("discovery refuses unsupported XML rather than inventing a UserStorage value", () => {
  const result = check("storage", '<Settings><Directories UserStorage="Ac<!--ignored-->tualStorage"/></Settings>',
    JSON.stringify([{ Type: "bind", Source: "/synthetic/server", Destination: "/workdir" }]))
  assert.equal(result.status, 1)
})

test("discovery maps an absolute configured UserStorage and refuses missing or ambiguous settings and mounts", () => {
  const mounts = JSON.stringify([{ Type: "bind", Source: "/synthetic/server", Destination: "/workdir" }])
  const xml = '<Settings><Directories UserStorage="/workdir/ActualStorage"/></Settings>'
  assert.equal(check("storage", xml, mounts).stdout.trim(), "/synthetic/server/ActualStorage")
  for (const invalid of [
    '<Settings><Directories/></Settings>', '<Settings><Bindings/></Settings>',
    xml.replace('/></Settings>', '/><Directories UserStorage="UserStorage"/></Settings>'),
    xml.replace('UserStorage=', 'UserStorage="UserStorage" UserStorage='),
    xml.replace('/workdir/ActualStorage', '/elsewhere'),
    xml.replace('/workdir/ActualStorage', '/workdir'),
    xml.replace('/workdir/ActualStorage', 'Actual&UNKNOWN;Storage'),
  ]) assert.equal(check("storage", invalid, mounts).status, 1, invalid)
  assert.equal(check("storage", xml, '[]').status, 1)
  assert.equal(check("storage", xml, JSON.stringify([
    { Type: "bind", Source: "/synthetic/server", Destination: "/workdir" },
    { Type: "bind", Source: "/synthetic/other", Destination: "/workdir" },
  ])).status, 1)
  assert.equal(check("storage", xml, mounts.replace('"bind"', '"volume"')).status, 1)
})

test("discovery refuses an absolute alias that would expose the whole native server directory", () => {
  const mounts = [
    { Type: "bind", Source: "/synthetic/server", Destination: "/workdir" },
    { Type: "bind", Source: "/synthetic/server", Destination: "/external-storage" },
  ]
  const result = check("storage", '<Settings><Directories UserStorage="/external-storage"/></Settings>', JSON.stringify(mounts))
  assert.equal(result.status, 1)
})

test("SELinux diagnostics accepts observed shared volume labels and a read-only publisher", () => {
  const shared = "system_u:object_r:container_file_t:s0"
  const result = check("selinux", JSON.stringify(labelRoles()), "Enforcing", shared, shared, shared, shared)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /SELinux Enforcing PASS/)
})

test("SELinux diagnostics accepts private native MCS only with publisher label disable", () => {
  const roles = labelRoles()
  roles[1].HostConfig.SecurityOpt.push("label=disable")
  roles[1].ProcessLabel = ""
  const shared = "system_u:object_r:container_file_t:s0"
  const result = check("selinux", JSON.stringify(roles), "Enforcing", shared + ":c123,c456", shared, shared, shared)
  assert.equal(result.status, 0, result.stderr)
})

test("SELinux diagnostics refuses an unavailable role label instead of declaring success", () => {
  const roles = labelRoles()
  roles[0].ProcessLabel = ""
  const shared = "system_u:object_r:container_file_t:s0"
  assert.equal(check("selinux", JSON.stringify(roles), "Enforcing", shared, shared, shared, shared).status, 1)
})

test("SELinux diagnostics reports Disabled and accepts the same valid labels in Permissive", () => {
  assert.equal(check("selinux", "", "Disabled").status, 0)
  const shared = "system_u:object_r:container_file_t:s0"
  assert.equal(check("selinux", JSON.stringify(labelRoles()), "Permissive", shared, shared, shared, shared).status, 0)
})

test("SELinux diagnostics refuses unknown labels, missing observations and other label-disable roles", () => {
  const shared = "system_u:object_r:container_file_t:s0"
  const roles = labelRoles()
  const run = (labels = [shared, shared, shared, shared]) => check("selinux", JSON.stringify(roles), "Enforcing", ...labels)
  assert.equal(run(["?", shared, shared, shared]).status, 1)
  assert.equal(run([shared, shared, shared]).status, 1)
  assert.equal(run([shared, shared, "?", shared]).status, 1)
  assert.equal(run([shared + ":c123,c456", shared, shared, shared]).status, 1)
  roles[1].HostConfig.SecurityOpt.push("label=disable")
  assert.equal(run().status, 1)
  roles[0].HostConfig.SecurityOpt.push("label=disable")
  assert.equal(run([shared + ":c123,c456", shared, shared, shared]).status, 1)
  roles[0].HostConfig.SecurityOpt.pop()
  roles[1].Mounts[0].RW = true
  assert.equal(run([shared + ":c123,c456", shared, shared, shared]).status, 1)
  assert.equal(check("selinux", "", "Unknown").status, 1)
})

test("saved settings recover ordered hosts, mode, CLI button and nondefault app port", () => {
  const saved = "DASHBOARD_APP_HOST_PORT=9443\nDASHBOARD_MODE=strict\nDASHBOARD_CLI_BUTTON=1\nDASHBOARD_APP_ORIGIN=https://apps.example:9443\nDASHBOARD_CLIENT_ORIGINS=http://one.example,https://one.example,http://two.example:8080\n"
  const result = check("settings", saved)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, "9443\nstrict\n1\napps.example\none.example\ntwo.example\n")
  const normal = saved.replace("=9443", "=8101").replace("=strict", "=normal").replace("=1\n", "=0\n")
  assert.equal(check("settings", normal).stdout, "8101\nnormal\n0\n\none.example\ntwo.example\n")
  assert.equal(check("settings", saved.replace("=strict", "=unknown")).status, 1)
})

test("strict recovery reads only one managed TLS section and refuses ambiguous or substituted paths", () => {
  const site = '# Managed by loginom-dashboard release installer\nListen 8444\n<VirtualHost *:8444>\n  RewriteOptions IgnoreInherit\n  SetEnv DASHBOARD_APP_HOST 1\n  ProxyPreserveHost On\n  Include conf/snippets/ssl.conf\n  SSLCertificateFile "/synthetic/cert.pem"\n  SSLCertificateKeyFile "/synthetic/key.pem"\n  ProxyPass / http://loginom-dashboard-web:8102/\n  ProxyPassReverse / http://loginom-dashboard-web:8102/\n</VirtualHost>\n'
  const result = check("site", site, "strict")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, "/synthetic/cert.pem\n/synthetic/key.pem\n")
  for (const invalid of [site.replace("# Managed", "# Unmanaged"), site + site, site.replace("  ProxyPass /", "  Include conf/foreign.conf\n  ProxyPass /"),
    site.replace('"/synthetic/key.pem"', '"${SSL_KEY}"'), site.replace("  ProxyPass", "  SSLCertificateKeyFile conf/foreign.key\n  ProxyPass"), site.replace("  ProxyPass", '  SSLCertificateFile "/another.pem"\n  ProxyPass')]) {
    const rejected = check("site", invalid, "strict")
    assert.equal(rejected.status, 1)
    assert.match(rejected.stderr, /repeat original.*--app-host-cert.*--app-host-key/)
  }
})

test("occupied app port is accepted only as the owned web published TLS binding", () => {
  const container = { Name: "/loginom-dashboard-web", Config: { Labels: {
    "loginom.dashboard.owner": "release", "com.docker.compose.project": "loginom-dashboard",
    "com.docker.compose.service": "web", "com.docker.compose.project.working_dir": "/synthetic/state",
  } }, Mounts: [{ Source: "/synthetic/state/builds", Destination: "/builds" }],
  NetworkSettings: { Ports: { "8101/tcp": [{ HostIp: "0.0.0.0", HostPort: "9443" }] } } }
  const run = (port, listeners = "") => check("owned", JSON.stringify([container]), "/synthetic/state", "web", port, listeners)
  assert.equal(run("9443").status, 0)
  assert.equal(run("9444").status, 1)
  assert.equal(run("9443", "4 LISTEN 0 128 0.0.0.0:9443 0.0.0.0:*").status, 0)
  const dualStack = run("9443", "6 LISTEN 0 128 *:9443 *:* uid:1234 ino:12345 sk:1 cgroup:/synthetic v6only:0 <->")
  assert.equal(dualStack.status, 0, dualStack.stderr)
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:* v6only:1").status, 1)
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:* v6only:01").status, 1)
  assert.equal(run("9443", "6 LISTEN 0 128 [::1]:9443 [::]:* v6only:0").status, 1)
  assert.equal(run("9443", "6 LISTEN 0 128 [2001:db8::1]:9443 [::]:* v6only:0").status, 1)
  assert.equal(run("9443", "6 LISTEN 0 128 *:9444 *:* v6only:0").status, 1)
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:* v6only:0\n6 LISTEN 0 128 *:9443 *:* v6only:1").status, 1)
  assert.equal(run("9443", "6 LISTEN 0 128 [::1]:9443 [::]:*").status, 1)
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:*").status, 1)
  container.Config.Labels["loginom.dashboard.owner"] = "foreign"
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:* v6only:0").status, 1)
  container.Config.Labels["loginom.dashboard.owner"] = "release"
  container.Mounts[0].Source = "/synthetic/foreign/builds"
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:* v6only:0").status, 1)
  container.Mounts[0].Source = "/synthetic/state/builds"
  container.NetworkSettings.Ports["8102/tcp"] = [{ HostIp: "0.0.0.0", HostPort: "9443" }]
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:* v6only:0").status, 1)
  delete container.NetworkSettings.Ports["8102/tcp"]
  container.NetworkSettings.Ports["8101/tcp"][0].HostIp = "127.0.0.1"
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:* v6only:0").status, 1)
  container.NetworkSettings.Ports["8101/tcp"][0].HostIp = "::"
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:*").status, 0)
  container.NetworkSettings.Ports = { "8102/tcp": [{ HostPort: "9443" }] }
  assert.equal(run("9443").status, 1)
})

test("check refuses stale discovered ports, mounts, network and publisher identity", () => {
  const values = ["https://studio.example:4433", "studio:8444", "/synthetic/storage", "synthetic-network", "1234:1234"]
  const keys = ["CLIENT_ORIGINS", "TLS_UPSTREAM", "USERSTORAGE", "NETWORK", "PUBLISHER_USER"]
  const saved = values.map((value, index) => `DASHBOARD_${keys[index]}=${value}`).join("\n")
  assert.equal(check("discovery", saved, ...values).status, 0)
  for (let index = 0; index < values.length; index++) {
    const changed = [...values]
    changed[index] += "changed"
    const result = check("discovery", saved, ...changed)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /repeat install required/)
  }
})

test("Apache reuse requires its PID1 sockets and only the managed 8444 virtual host", () => {
  const observation = 'httpd\nsocket:[12345]\nTCP\n  0: 00000000:20FC 00000000:0000 0A 0 0 0 0 0 12345\nVHOSTS\n*:8444 apps.example (/usr/local/apache2/conf/dashboard.site.conf:42)\n'
  assert.equal(check("apache", observation).status, 0)
  for (const invalid of [observation.replace("socket:[12345]", "socket:[54321]"),
    observation.replace("httpd", "foreign"), observation.replace("dashboard.site.conf", "foreign.conf"),
    observation.replace("*:8444 apps.example", "*:8444 is a NameVirtualHost\n default server foreign (/other.conf:1)\n port 8444 namevhost apps.example")])
    assert.equal(check("apache", invalid).status, 1)
})

test("repeat settings retain uppercase public hosts and their order through discovery and config", () => {
  const clients = "http://Studio.Example:8080,https://Studio.Example:8443,http://Second.Example:8080"
  const saved = `DASHBOARD_APP_HOST_PORT=8101\nDASHBOARD_MODE=normal\nDASHBOARD_CLI_BUTTON=0\nDASHBOARD_APP_ORIGIN=https://Studio.Example:8101\nDASHBOARD_CLIENT_ORIGINS=${clients}\nDASHBOARD_TLS_UPSTREAM=studio:8444\nDASHBOARD_USERSTORAGE=/synthetic/storage\nDASHBOARD_NETWORK=synthetic-network\nDASHBOARD_PUBLISHER_USER=1234:1234\n`
  const result = check("settings", saved)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, "8101\nnormal\n0\n\nStudio.Example\nSecond.Example\n")
  assert.equal(check("discovery", saved, clients, "studio:8444", "/synthetic/storage", "synthetic-network", "1234:1234").status, 0)
  const config = check("config", "", "https://Studio.Example:8101", clients, "/synthetic/storage")
  assert.equal(config.status, 0, config.stderr)
})

test("repeat strict settings preserve uppercase administrator domain", () => {
  const origin = "https://Apps.Example:9443"
  const clients = "https://studio.example:8443"
  const saved = `DASHBOARD_APP_HOST_PORT=9443\nDASHBOARD_MODE=strict\nDASHBOARD_CLI_BUTTON=1\nDASHBOARD_APP_ORIGIN=${origin}\nDASHBOARD_CLIENT_ORIGINS=${clients}\n`
  const result = check("settings", saved)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, "9443\nstrict\n1\nApps.Example\nstudio.example\n")
  const config = check("config", "", origin, clients, "/synthetic/storage")
  assert.equal(config.status, 0, config.stderr)
})
