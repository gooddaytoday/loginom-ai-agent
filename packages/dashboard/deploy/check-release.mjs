// Runs with the release image's Node, without network; curl owns HTTP and OS TLS trust.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash, X509Certificate } from "node:crypto"

const [action, ...args] = process.argv.slice(2)
const input = () => readFileSync(0, "utf8")
const binding = () => ({ packagePath: "/" + args[0], nodeGuid: args[1], workflowGuid: args[2] })
if (action === "settings") {
  const settings = Object.fromEntries(input().trim().split("\n").map(line => line.split("=")))
  assert(/^[1-9][0-9]{0,4}$/.test(settings.DASHBOARD_APP_HOST_PORT) && Number(settings.DASHBOARD_APP_HOST_PORT) <= 65535)
  assert(["normal", "strict"].includes(settings.DASHBOARD_MODE))
  assert(["0", "1"].includes(settings.DASHBOARD_CLI_BUTTON))
  const hosts = [...new Set(settings.DASHBOARD_CLIENT_ORIGINS.split(",").map(value => {
    const url = new URL(value)
    assert.equal(url.origin, value)
    assert(["http:", "https:"].includes(url.protocol))
    assert(/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(url.hostname))
    return url.hostname
  }))]
  const app = new URL(settings.DASHBOARD_APP_ORIGIN)
  assert.equal(app.origin, settings.DASHBOARD_APP_ORIGIN)
  console.log([settings.DASHBOARD_APP_HOST_PORT, settings.DASHBOARD_MODE, settings.DASHBOARD_CLI_BUTTON,
    settings.DASHBOARD_MODE === "strict" ? app.hostname : "", ...hosts].join("\n"))
} else if (action === "discovery") {
  const settings = Object.fromEntries(input().trim().split("\n").map(line => line.split("=")))
  for (const [index, name] of ["CLIENT_ORIGINS", "TLS_UPSTREAM", "USERSTORAGE", "NETWORK", "PUBLISHER_USER"].entries())
    assert.equal(settings["DASHBOARD_" + name], args[index], "Loginom changed; repeat install required: " + name)
} else if (action === "apache") {
  const [fds, rest] = input().split("\nTCP\n")
  assert(["httpd", "apache2"].includes(fds.split("\n")[0]), "Port 8444 is not owned by Apache PID1")
  const [tcp, dump] = rest.split("\nVHOSTS\n")
  const sockets = tcp.trim().split("\n").map(line => line.trim().split(/\s+/))
    .filter(fields => fields[1]?.endsWith(":20FC") && fields[3] === "0A")
  assert(sockets.length, "No Apache 8444 listener proof")
  for (const fields of sockets) assert(fds.split("\n").includes("socket:[" + fields[9] + "]"), "Foreign 8444 socket")
  let selected = false
  let own = false
  for (const line of dump.split("\n")) {
    if (/^\S/.test(line)) selected = /^\S+:8444\s/.test(line)
    if (!selected) continue
    const path = line.match(/\(([^()]+):[0-9]+\)/)
    if (!path) continue
    assert.equal(path[1], "/usr/local/apache2/conf/dashboard.site.conf", "Foreign 8444 virtual host")
    own = true
  }
  assert(own, "Managed 8444 virtual host not active")
} else if (action === "site") {
  const site = input()
  const recovery = "Unrecoverable managed Apache configuration; repeat original --strict --app-host-domain --app-host-cert --app-host-key flags"
  assert(site.startsWith("# Managed by loginom-dashboard release installer\n"), recovery)
  const sections = [...site.matchAll(/^<VirtualHost \*:8444>\n([\s\S]*?)^<\/VirtualHost>$/gm)]
  assert.equal((site.match(/^\s*<VirtualHost\b/gm) || []).length, sections.length, recovery)
  assert(sections.length <= 1, recovery)
  if (args[0] === "strict" || sections.length) {
    assert.equal(sections.length, 1, recovery)
    assert.equal((site.match(/^Listen 8444$/gm) || []).length, 1, recovery)
    assert(sections[0][1].includes("  ProxyPass / http://loginom-dashboard-web:8102/\n"), recovery)
    const paths = ["SSLCertificateFile", "SSLCertificateKeyFile"].map(name => {
      const matches = [...site.matchAll(new RegExp('^\\s*' + name + ' "([^"\\r\\n]+)"$', "gm"))]
      assert.equal((site.match(new RegExp("^\\s*" + name + "\\b", "gmi")) || []).length, 1, recovery)
      assert.equal(matches.length, 1, recovery)
      assert(sections[0][1].includes(matches[0][0].trimStart()), recovery)
      if (args[0] === "strict") assert(/^\/[a-zA-Z0-9/_.-]+$/.test(matches[0][1]), recovery)
      return matches[0][1]
    })
    assert.equal(sections[0][1], [
      "  RewriteOptions IgnoreInherit", "  SetEnv DASHBOARD_APP_HOST 1", "  ProxyPreserveHost On",
      "  Include conf/snippets/ssl.conf", `  SSLCertificateFile "${paths[0]}"`, `  SSLCertificateKeyFile "${paths[1]}"`,
      "  ProxyPass / http://loginom-dashboard-web:8102/", "  ProxyPassReverse / http://loginom-dashboard-web:8102/", "",
    ].join("\n"), recovery)
    if (args[0] === "strict") console.log(paths.join("\n"))
  }
} else if (action === "config") {
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
  if (args[2]) {
    assert.equal(args[1], "web")
    const ports = Object.entries(container.NetworkSettings.Ports).filter(([, bindings]) => bindings?.length)
    assert.equal(ports.length, 1, "Foreign published binding")
    assert.equal(ports[0][0], "8101/tcp")
    assert(ports[0][1].every(binding => binding.HostPort === args[2]), "App host port is occupied")
    for (const line of (args[3] || "").trim().split("\n").filter(Boolean)) {
      const fields = line.trim().split(/\s+/)
      assert(["4", "6"].includes(fields[0]), "Unknown listener address family")
      const address = fields[4].replace(/^\*:/, fields[0] === "4" ? "0.0.0.0:" : "[::]:")
      assert(ports[0][1].some(binding => {
        const host = binding.HostIp.includes(":") ? "[" + binding.HostIp + "]" : binding.HostIp
        return address === host + ":" + args[2]
      }), "Foreign app listener address")
    }
  }
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
    assert(container.HostConfig.SecurityOpt.some(value => ["no-new-privileges", "no-new-privileges:true", "no-new-privileges=true"].includes(value)))
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
