import { join, isAbsolute } from "node:path"
const root = process.env.LOGINOM_AI_AGENT_UPDATE_TEST_ROOT
if (!root || !isAbsolute(root)) throw Error("ABSOLUTE_UPDATE_TEST_ROOT_REQUIRED")
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const mode = await Bun.file(join(root, "mode"))
      .text()
      .catch(() => "upstream")
    const url = new URL(request.url)
    await Bun.write(join(root, "last-request.json"), JSON.stringify({ path: url.pathname, mode }))
    if (url.pathname.endsWith("latest-linux.yml")) {
      const meta = await Bun.file(join(root, "payload.json")).json()
      const sha512 = mode === "corrupt" ? Buffer.alloc(64).toString("base64") : meta.sha512
      return Response.json({
        version: mode === "channel" ? "0.1.1-beta.1" : "0.1.1",
        files: [
          { url: mode === "upstream" ? "https://opencode.ai/opencode.AppImage" : meta.name, sha512, size: meta.size },
        ],
        path: meta.name,
        sha512,
        releaseDate: "2026-09-16T00:00:00Z",
      })
    }
    if (url.pathname === "/" + "loginom-ai-agent-linux-x86_64.AppImage")
      return new Response(Bun.file(join(root, "payload", url.pathname.slice(1))))
    return new Response("Not found", { status: 404 })
  },
})
await Bun.write(join(root, "feed.json"), JSON.stringify({ url: `http://127.0.0.1:${server.port}/` }))
console.log("Local test feed ready")
