import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { resolveSystemProxy } from "../../../loginom-host/src/system-proxy/index.ts"

const gnomeDefaults = `org.gnome.system.proxy autoconfig-url ''
org.gnome.system.proxy ignore-hosts ['localhost', '127.0.0.0/8', '::1']
org.gnome.system.proxy mode 'none'
org.gnome.system.proxy use-same-proxy true
org.gnome.system.proxy.http host ''
org.gnome.system.proxy.http port 8080
org.gnome.system.proxy.https host ''
org.gnome.system.proxy.https port 0
org.gnome.system.proxy.socks host ''
org.gnome.system.proxy.socks port 0
`
const staleGnome = `org.gnome.system.proxy mode 'none'
org.gnome.system.proxy.http host '127.0.0.1'
org.gnome.system.proxy.http port 10808
org.gnome.system.proxy.https host '127.0.0.1'
org.gnome.system.proxy.https port 10808
`
const v2ray = `org.gnome.system.proxy mode 'manual'
org.gnome.system.proxy.http host '127.0.0.1'
org.gnome.system.proxy.http port 10808
org.gnome.system.proxy.https host '127.0.0.1'
org.gnome.system.proxy.https port 10808
`
const incidentBypass =
  "localhost;*.local;*.loginom.ru;*vk.com;192.168.*;10.200.*;10.1.3.*;*qwen.ai;*deepseek.com;*yandex.net;*github.com;google.com;*loginom.dev;*.ru;*yastatic.net;*altlinux.org;<local>"
const kdeBody = `httpProxy=http://127.0.0.1 8080
httpsProxy=proxy.internal 3128
Proxy Config Script=http://127.0.0.1/proxy.pac
`

const fixtures = [
  ["gnome-defaults", { platform: "linux", gnome: gnomeDefaults }],
  ["gnome-v2ray", { platform: "linux", gnome: v2ray }],
  ["gnome-stale-none", { platform: "linux", gnome: staleGnome }],
  ...[0, 1, 2, 3, 4].map((type) => [
    `kde-${type}`,
    {
      platform: "linux",
      environment: { XDG_CURRENT_DESKTOP: "KDE" },
      kde: `[Proxy Settings]\nProxyType=${type}\n${kdeBody}`,
    },
  ]),
  [
    "windows-incident",
    {
      platform: "win32",
      environment: { COMPUTERNAME: "WORKSTATION" },
      windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:9697", bypass: incidentBypass },
    },
  ],
  [
    "windows-empty-host",
    {
      platform: "win32",
      windows: { autoDetect: false, autoConfigUrl: "", proxy: ":8080", bypass: "" },
    },
  ],
  [
    "macos-manual",
    {
      platform: "darwin",
      macos: "<dictionary> {\n  HTTPEnable : 1\n  HTTPProxy : proxy.test\n  HTTPPort : 8080\n  HTTPSEnable : 1\n  HTTPSProxy : proxy.test\n  HTTPSPort : 8080\n}\n",
    },
  ],
]

const require = createRequire(import.meta.url)
const electronDir = dirname(require.resolve("electron/package.json"))
const electron = join(electronDir, "dist", "electron")
const probe = join(mkdtempSync(join(tmpdir(), "loginom-sidecar-proxy-")), "probe.mjs")
writeFileSync(
  probe,
  `import http from "node:http"
try {
  if (typeof http.setGlobalProxyFromEnv === "function") http.setGlobalProxyFromEnv()
} catch (error) {
  console.error(error)
  process.exit(1)
}
process.exit(0)
`,
)

const failures = []
for (const [name, input] of fixtures) {
  const result = await resolveSystemProxy(input)
  for (const url of [result.environment?.HTTP_PROXY, result.environment?.HTTPS_PROXY]) {
    if (!url) continue
    if (!URL.canParse(url)) failures.push(`${name} unparsable ${url}`)
  }
  const child = spawnSync(electron, [probe], {
    env: {
      PATH: process.env.PATH ?? "",
      ELECTRON_RUN_AS_NODE: "1",
      ...(result.environment ?? {}),
    },
    encoding: "utf8",
  })
  if (child.status !== 0) failures.push(`${name} status=${child.status} stderr=${child.stderr}`)
}
if (failures.length) throw new Error(failures.join("\n"))
console.log(JSON.stringify({ status: "PASS", fixtures: fixtures.length }))
