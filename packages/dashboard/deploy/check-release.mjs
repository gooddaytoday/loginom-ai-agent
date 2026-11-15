// Runs with the release image's Node, without network; curl owns HTTP and OS TLS trust.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash, X509Certificate } from "node:crypto"

const [action, ...args] = process.argv.slice(2)
const input = () => readFileSync(0, "utf8")
const binding = () => ({ packagePath: "/" + args[0], nodeGuid: args[1], workflowGuid: args[2] })
if (action === "config") {
  for (const value of [args[0], ...args[1].split(",")]) {
    const url = new URL(value)
    assert.equal(url.origin, value)
    assert(["http:", "https:"].includes(url.protocol))
  }
  assert(args[2].startsWith("/") && !/[\r\n]/.test(args[2]))
} else if (action === "publication") {
  console.log(JSON.stringify({ format: 1, template: 1, binding: binding(), title: "Release check", parameters: [], files: [
    { path: "src/main.tsx", encoding: "utf8", content: 'import {createRoot} from "react-dom/client"; createRoot(document.getElementById("root")!).render(<p>Release check</p>)' },
  ] }))
} else if (action === "request") {
  console.log(JSON.stringify({ ...binding(), ...(args[3] ? { publication: args[3] } : {}) }))
} else if (action === "ready") {
  const result = JSON.parse(input())
  assert.equal(result.appOrigin, args[2])
  assert.equal(result.mode, args[3] || "normal")
  if (result.publication?.status === "failed") {
    console.error("Probe build failed")
    process.exit(2)
  }
  if (result.publication?.name !== args[0] || result.publication?.sourceHash !== args[1] || result.publication?.status !== "ready") process.exit(1)
  assert.equal(result.currentVersion.name, args[0])
  assert.equal(result.currentVersion.sourceHash, args[1])
  assert.match(result.key, /^[a-f0-9]{64}$/)
  assert.match(result.hash, /^[a-f0-9]{64}$/)
  console.log(`${result.appOrigin}/apps/${result.key}/${result.hash}/`)
} else if (action === "removed") {
  const result = JSON.parse(input())
  if (result.exists !== false || result.latest !== null || result.currentVersion !== null) process.exit(1)
} else if (action === "assets") {
  const assets = [...input().matchAll(/(?:src|href)="\.\/(assets\/[\w.-]+)"/g)].map(match => match[1])
  assert(assets.length, "No built assets")
  console.log(assets.join("\n"))
} else if (action === "response") {
  const raw = input()
  const split = raw.indexOf("\r\n\r\n")
  assert(split > 0, "Invalid HTTP response headers")
  const headers = Object.fromEntries(raw.slice(0, split).split("\r\n").slice(1).map(line => {
    const at = line.indexOf(":")
    return [line.slice(0, at).toLowerCase(), line.slice(at + 1).trim()]
  }))
  assert(!headers.location, "Redirect is forbidden")
  assert(!headers["content-security-policy-report-only"], "Report-only CSP")
  const csp = headers["content-security-policy"]
  assert(csp, "Missing enforced CSP")
  if (args[0] === "api" || args[0] === "shell") {
    assert.equal(csp, "sandbox; default-src 'none'")
    assert.equal(headers["x-content-type-options"], "nosniff")
    if (args[0] === "shell") assert.equal("sha384-" + createHash("sha384").update(raw.slice(split + 4)).digest("base64"), args[3])
  } else if (args[0].startsWith("studio")) {
    assert(csp.includes(`frame-src ${args[1]};`))
    if (args[0] === "studio-error") process.exit(0)
    assert(raw.slice(0, split).toLowerCase().includes("cache-control: no-store"))
    const scripts = [...raw.slice(split + 4).matchAll(/<script[^>]+src="\/dashboard\/shell\.js"[^>]*>/g)]
    assert.equal(scripts.length, 1, "Exactly one installed shell required")
    if (["gzip", "br"].includes(args[4])) assert.equal(headers["content-encoding"], args[4])
    assert(scripts[0][0].includes(`integrity="${args[3]}"`), "Installed shell SRI differs")
  } else {
    const { appHeaders } = await import("/opt/dashboard/server.mjs")
    for (const [name, value] of Object.entries(appHeaders(args[1], args[2].split(",")))) assert.equal(headers[name], value, "App header " + name)
  }
} else if (action === "certificate-path") {
  const match = input().match(/^Define SSL_CERT "([^"\r\n]+)"/m)
  assert(match, "Apache SSL_CERT not found")
  assert(/^(?:\/|conf\/)[\w./-]+$/.test(match[1]), "Invalid public certificate path")
  console.log(match[1].startsWith("/") ? match[1] : "/usr/local/apache2/" + match[1])
} else if (action === "certificate") {
  const cert = new X509Certificate(input())
  // Installer v7.4.2: src/ssl/default-cert.crt. Identity warning only; curl still verifies TLS.
  if (cert.fingerprint256.replaceAll(":", "").toLowerCase() === "e87a7dc099cb92d08014858d509af4e497c64d5a7d032330a0a5a95fe06912d5")
    console.log("WARNING: Loginom distribution certificate; replace it because its private key is publicly known")
} else if (action === "owned") {
  const containers = JSON.parse(input())
  assert.equal(containers.length, 1)
  const container = containers[0]
  assert.equal(container.Name.replace(/^\//, ""), "loginom-dashboard-" + args[1])
  for (const [name, value] of Object.entries({
    "loginom.dashboard.owner": "release", "com.docker.compose.project": "loginom-dashboard",
    "com.docker.compose.service": args[1], "com.docker.compose.project.working_dir": args[0],
  })) assert.equal(container.Config.Labels[name], value, "Foreign dashboard container")
  const directory = args[1] === "builder" ? "jobs-in" : "builds"
  assert(container.Mounts.some(mount => mount.Source === args[0] + "/" + directory && mount.Destination === "/" + directory))
} else if (action === "roles") {
  const roles = JSON.parse(input())
  assert.equal(roles.length, 3)
  for (const container of roles) {
    const role = container.Name.replace(/^\//, "").replace("loginom-dashboard-", "")
    assert.equal(container.Image.replace(/^sha256:/, ""), args[5].replace(/^sha256:/, ""))
    assert.equal(container.State.Running, true)
    assert.equal(container.Config.Labels["loginom.dashboard.owner"], "release")
    assert.equal(container.HostConfig.ReadonlyRootfs, true)
    // Podman expands ALL; the caller also verifies every live process capability set is zero.
    if (args[6] !== "podman") assert(container.HostConfig.CapDrop.includes("ALL"))
    assert.notEqual(container.HostConfig.Privileged, true)
    assert.deepEqual(container.HostConfig.CapAdd ?? [], [])
    assert(container.HostConfig.SecurityOpt.some(value => value.startsWith("no-new-privileges")))
    assert(container.HostConfig.Memory > 0 && container.HostConfig.PidsLimit > 0)
    for (const option of ["noexec", "nosuid", "size="]) assert(container.HostConfig.Tmpfs["/tmp"].includes(option))
    assert.equal(container.Config.User, role === "publisher" ? args[3] : "65534:65534")
    const expected = role === "web" ? [["builds", "/builds", false]] : role === "publisher" ? [["builds", "/builds", true], ["jobs-in", "/jobs-in", true], ["jobs-out", "/jobs-out", true]] : [["jobs-in", "/jobs-in", false], ["jobs-out", "/jobs-out", true]]
    assert.equal(container.Mounts.length, expected.length + (role === "publisher" ? 1 : 0))
    for (const [name, destination, writable] of expected) assert(container.Mounts.some(mount => mount.Source === args[2] + "/" + name && mount.Destination === destination && mount.RW === writable))
    if (role === "publisher") assert(container.Mounts.some(mount => mount.Source === args[1] && mount.Destination === "/storage" && !mount.RW))
    if (role !== "web") assert.equal(container.HostConfig.NetworkMode, "none")
    if (role === "web") {
      assert.deepEqual(Object.keys(container.NetworkSettings.Networks), [args[4]])
      assert(!container.HostConfig.PortBindings["8100/tcp"] && !container.HostConfig.PortBindings["8102/tcp"])
    }
  }
} else throw Error("Unknown check operation")
