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
  assert.equal(run("9443", "6 LISTEN 0 128 [::1]:9443 [::]:*").status, 1)
  assert.equal(run("9443", "6 LISTEN 0 128 *:9443 *:*").status, 1)
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
