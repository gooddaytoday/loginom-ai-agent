// Runs with the installed Node: its standard library and the installed runtime only. Desktop v2 (B4.14c) has no
// sidecar in the main process; the window's own service is a separate process (`service-desktop.json`, B4.9). This is
// the part of windows-installed-smoke.ps1 that Windows PowerShell 5.1 does poorly. Each command writes its result as
// JSON to the last argument; the service password never leaves this process.
//   resources <resources> <output>                                   every manifest hash, the bundled Chromium
//   service <registration> <resources> <workspace> <seconds> <output> the service answers; its catalog has the bundled skills
//   renderer <port> <seconds> <output>                               the renderer loaded the application, not a wizard
//   close <port> <output>                                            the renderer closes its window, as the user does
import assert from "node:assert/strict"
import { once } from "node:events"
import { readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { pathToFileURL } from "node:url"

// What the renderer shows once the application has loaded: never the 0.4 wizard form.
const rendererState = `(() => {
  const root = document.querySelector("#root")
  if (!root || !root.childElementCount || document.readyState !== "complete") return undefined
  return {
    url: location.href.split("?")[0],
    title: document.title,
    wizard: !!document.querySelector('[data-component="settings-loginom"]'),
    text: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 120),
  }
})()`

async function main([command, ...args]) {
  const output = args.at(-1)

  try {
    await writeFile(output, JSON.stringify(await commands[command](...args.slice(0, -1)), null, 2) + "\n")
  } catch (error) {
    await writeFile(output, JSON.stringify({ failure: error.message }) + "\n")
    process.exitCode = 1
  }
}

const commands = {
  async resources(resources) {
    const { verifyResources } = await import(pathToFileURL(join(resources, "runtime/src/resources.mjs")).href)
    const verified = await verifyResources(resources)
    const { chromium } = createRequire(join(resources, "runtime/client/package.json"))("playwright-core")

    const browser = await chromium.launch({
      executablePath: verified.browserPath,
      headless: true,
      chromiumSandbox: true,
    })

    try {
      const page = await browser.newPage()
      await page.setContent("<title>Bundled Chromium</title><p>Offline runtime</p>")

      return {
        manifestHash: verified.manifestHash,
        files: verified.verification.hashedFiles,
        browser: { path: verified.browserPath, version: browser.version(), title: await page.title() },
      }
    } finally {
      await browser.close()
    }
  },

  async service(registration, resources, workspace, seconds) {
    const service = JSON.parse(await readFile(registration, "utf8"))
    const auth = { authorization: "Basic " + Buffer.from("loginom-ai-agent:" + service.password).toString("base64") }
    const deadline = Date.now() + Number(seconds) * 1000

    const info = await until("SERVICE_NOT_ANSWERING", deadline, async () => {
      const response = await fetch(new URL("/api/info", service.url), {
        headers: auth,
        signal: AbortSignal.timeout(5000),
      })

      return response.ok && response.json()
    })

    if (info.pid !== service.pid) throw Error("SERVICE_PID_MISMATCH")
    const manifest = JSON.parse(await readFile(join(resources, "resource-manifest.json"), "utf8"))
    // The product plugin loads with the Location, so the bundled skills appear a few seconds after the first request.

    const skills = await until("BUNDLED_SKILLS_MISSING", deadline, async () => {
      const response = await fetch(new URL(`/api/skill?directory=${encodeURIComponent(workspace)}`, service.url), {
        headers: auth,
        signal: AbortSignal.timeout(10_000),
      })

      return response.ok && checkBundledSkills(manifest, await response.json(), resources)
    })

    return { pid: service.pid, port: Number(new URL(service.url).port), version: info.version, skills }
  },

  async renderer(port, seconds) {
    return until("RENDERER_NOT_LOADED", Date.now() + Number(seconds) * 1000, () => evaluate(port, rendererState))
  },

  async close(port) {
    await evaluate(port, "setTimeout(() => window.close(), 50), true")

    return { closed: true }
  },
}

// The service's catalog lists exactly the skills of the installed manifest from the installed skills directory; a
// user's skill of the same name elsewhere does not stand in for one.
export function checkBundledSkills(manifest, catalog, resources) {
  const expected = manifest.files
    .flatMap((file) => /^skills\/([^/]+)\/SKILL\.md$/.exec(file.path)?.slice(1) ?? [])
    .sort()

  assert.ok(expected.includes("loginom-automation"), "Manifest must include loginom-automation")
  assert.equal(new Set(expected).size, expected.length, "Duplicate manifest skill")
  const key = (path) => path.replaceAll("\\", "/").toLowerCase()
  const root = key(resources).replace(/\/+$/, "") + "/skills/"
  const bundled = catalog.filter((skill) => key(skill.path).startsWith(root))
  const actual = bundled.map((skill) => skill.name).sort()

  assert.deepEqual(actual, expected, "Service bundled skill names/count differ from the installed manifest")
  assert.ok(
    bundled.every(
      (skill) => key(skill.path) === `${root}${skill.name.toLowerCase()}/skill.md` && skill.content?.trim(),
    ),
    "A bundled skill must come from its own installed SKILL.md and have content",
  )

  return { expected, actual }
}

async function evaluate(port, expression) {
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) })
  ).json()

  const target = targets.find((item) => item.type === "page" && !item.url.startsWith("devtools://"))

  if (!target) return undefined
  const socket = new WebSocket(target.webSocketDebuggerUrl)

  try {
    await once(socket, "open")
    socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }))
    const [message] = await Promise.race([once(socket, "message"), sleep(5000, [undefined], { ref: false })])

    return message && JSON.parse(message.data).result?.result?.value
  } finally {
    socket.close()
  }
}

async function until(code, deadline, probe) {
  let last = ""

  while (Date.now() < deadline) {
    const value = await probe().catch((error) => {
      last = error.message
    })

    if (value) return value
    await sleep(500)
  }

  throw Error(last ? `${code}: ${last}` : code)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main(process.argv.slice(2))
