import { expect, test } from "bun:test"
import { createServer } from "node:http"
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { once } from "node:events"

const agent = resolve(import.meta.dir, "../..")

test.skipIf(process.platform !== "linux")(
  "loginom status does not read the system proxy before the bundle check",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-cli-proxy-"))
    try {
      const bin = join(directory, "bin")
      await mkdir(bin)
      await writeFile(join(bin, "gsettings"), "#!/bin/sh\nprintf called > \"$LOGINOM_PROXY_PROBE\"\nexit 1\n", {
        mode: 0o755,
      })
      const child = Bun.spawn([process.execPath, "run", "src/standalone.ts", "loginom", "status", "--format", "json"], {
        cwd: agent,
        env: {
          ...process.env,
          PATH: bin,
          LOGINOM_PROXY_PROBE: join(directory, "proxy-probe"),
          LOGINOM_AI_AGENT_CLI_PROFILE: join(directory, "profile"),
          LOGINOM_AI_AGENT_CLI_BUNDLE: join(directory, "missing-bundle"),
          XDG_CURRENT_DESKTOP: "GNOME",
        },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      })
      const output = await new Response(child.stdout).text()
      const errors = await new Response(child.stderr).text()
      expect(await child.exited).toBe(1)
      expect(errors).toBe("LOGINOM_BUNDLE_INCOMPLETE\n")
      expect(JSON.parse(output)).toEqual({ ok: false, code: "LOGINOM_BUNDLE_INCOMPLETE" })
      expect(await readdir(directory)).not.toContain("proxy-probe")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000,
)

test.skipIf(process.platform !== "linux")(
  "a manual system proxy is used by later fetches and a broken reader stays on stderr",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-cli-proxy-"))
    const seen: string[] = []
    const proxy = createServer((request, response) => {
      seen.push(request.url ?? "")
      response.end("proxied")
    })
    proxy.listen(0, "127.0.0.1")
    await once(proxy, "listening")
    const address = proxy.address()
    if (!address || typeof address === "string") throw new Error("proxy port")
    try {
      const bin = join(directory, "bin")
      await mkdir(bin)
      await writeFile(
        join(bin, "gsettings"),
        `#!/bin/sh
printf "%s\\n" "org.gnome.system.proxy mode 'manual'" "org.gnome.system.proxy.http host '127.0.0.1'" "org.gnome.system.proxy.http port ${address.port}"
`,
        { mode: 0o755 },
      )
      const applied = Bun.spawn(
        [
          process.execPath,
          "-e",
          `import { applyCliSystemProxy } from "./src/cli/standalone-proxy.ts"
await applyCliSystemProxy()
const response = await fetch("http://example.test/model")
console.log(await response.text())`,
        ],
        {
          cwd: agent,
          env: {
            ...cleanProxy(process.env),
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            XDG_CURRENT_DESKTOP: "GNOME",
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      const output = await new Response(applied.stdout).text()
      expect(await applied.exited).toBe(0)
      expect(output.trim()).toBe("proxied")
      expect(seen.some((url) => url.includes("/model"))).toBe(true)

      await writeFile(join(bin, "gsettings"), "#!/bin/sh\nexit 1\n", { mode: 0o755 })
      const child = Bun.spawn([process.execPath, "run", "src/standalone.ts", "models", "--format", "json"], {
        cwd: agent,
        env: {
          ...cleanProxy(process.env),
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          XDG_CURRENT_DESKTOP: "GNOME",
          LOGINOM_AI_AGENT_CLI_PROFILE: join(directory, "profile"),
        },
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      })
      const stdout = await new Response(child.stdout).text()
      const stderr = await new Response(child.stderr).text()
      const code = await child.exited
      expect(code === 0 || code === 1 || code === 2).toBe(true)
      expect(stderr).toContain("SYSTEM_PROXY_NOT_APPLIED: read-failed")
      expect(stdout).not.toContain("SYSTEM_PROXY_NOT_APPLIED")
    } finally {
      proxy.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
  20000,
)

test.skipIf(process.platform !== "linux")(
  "a GNOME autoconfig PAC selects the proxy used by the next fetch",
  async () => {
    const seen: string[] = []
    const proxy = createServer((request, response) => {
      seen.push(request.url ?? "")
      response.end("proxied")
    })
    const pac = createServer((_request, response) => {
      response.end(`function FindProxyForURL(){ return 'PROXY 127.0.0.1:${portOf(proxy)}'; }`)
    })
    proxy.listen(0, "127.0.0.1")
    pac.listen(0, "127.0.0.1")
    await once(proxy, "listening")
    await once(pac, "listening")
    const directory = await mkdtemp(join(tmpdir(), "loginom-cli-pac-"))
    try {
      const bin = join(directory, "bin")
      await mkdir(bin)
      await writeFile(
        join(bin, "gsettings"),
        `#!/bin/sh
printf "%s\\n" "org.gnome.system.proxy mode 'auto'" "org.gnome.system.proxy autoconfig-url 'http://127.0.0.1:${portOf(pac)}/proxy.pac'"
`,
        { mode: 0o755 },
      )
      const child = Bun.spawn(
        [
          process.execPath,
          "-e",
          `import { applyCliSystemProxy } from "./src/cli/standalone-proxy.ts"
await applyCliSystemProxy()
const response = await fetch("http://example.test/model")
console.log(await response.text())`,
        ],
        {
          cwd: agent,
          env: {
            ...cleanProxy(process.env),
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            XDG_CURRENT_DESKTOP: "GNOME",
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      const output = await new Response(child.stdout).text()
      const errors = await new Response(child.stderr).text()
      expect(await child.exited).toBe(0)
      expect(errors).toBe("")
      expect(output.trim()).toBe("proxied")
      expect(seen.some((url) => url.includes("/model"))).toBe(true)
    } finally {
      proxy.close()
      pac.close()
      await rm(directory, { recursive: true, force: true })
    }
  },
  20000,
)

test.skipIf(process.platform !== "linux")(
  "a closed proxy port is reported as unreachable on stderr",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-cli-closed-"))
    try {
      const bin = join(directory, "bin")
      await mkdir(bin)
      await writeFile(
        join(bin, "gsettings"),
        "#!/bin/sh\nprintf \"%s\\n\" \"org.gnome.system.proxy mode 'manual'\" \"org.gnome.system.proxy.http host '127.0.0.1'\" \"org.gnome.system.proxy.http port 1\"\n",
        { mode: 0o755 },
      )
      const child = Bun.spawn(
        [process.execPath, "-e", `import { applyCliSystemProxy } from "./src/cli/standalone-proxy.ts"\nawait applyCliSystemProxy()`],
        {
          cwd: agent,
          env: { ...cleanProxy(process.env), PATH: `${bin}:${process.env.PATH ?? ""}`, XDG_CURRENT_DESKTOP: "GNOME" },
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      const errors = await new Response(child.stderr).text()
      expect(await child.exited).toBe(0)
      expect(errors).toContain("SYSTEM_PROXY_NOT_APPLIED: unreachable")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  20000,
)

function portOf(server: ReturnType<typeof createServer>) {
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("port")
  return address.port
}

function cleanProxy(environment: NodeJS.ProcessEnv) {
  const next = { ...environment }
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy", "NO_PROXY", "no_proxy"])
    delete next[key]
  return next
}
