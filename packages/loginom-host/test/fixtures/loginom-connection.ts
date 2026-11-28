import { once } from "node:events"
import { constants } from "node:fs"
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { createServer, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { text } from "node:stream/consumers"
import release from "../../../product/loginom-release.json"
import { writeHelp } from "../../../loginom-runtime/client/test/support/help-fixture.mjs"

const browser =
  process.env.LOGINOM_DOCK_TEST_BROWSER ||
  (process.env.PLAYWRIGHT_BROWSERS_PATH &&
    join(process.env.PLAYWRIGHT_BROWSERS_PATH, `chromium-${release.chromiumRevision}`, "chrome-linux64", "chrome"))
export const hasConnectionFixture = process.platform === "linux" && process.arch === "x64" && Boolean(browser)

export async function loginomConnectionFixture() {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node || !browser) throw Error("Set the pinned Loginom test Node and Chromium paths")
  const directory = await mkdtemp(join(tmpdir(), "con-gate-"))
  const resources = join(directory, "resources")
  const browserFile = join("browsers", basename(browser))
  const requests: { method: string | undefined; path: string; cookie: string }[] = []
  const logins: {
    username: string
    cookie: string
    previousLocalOwner: string | null
    previousSessionOwner: string | null
  }[] = []
  const sessions = new Map<string, ServerResponse>()
  const server = createServer((request, response) => {
    const { pathname: path, searchParams } = new URL(request.url ?? "/", "http://localhost")
    const cookie = request.headers.cookie ?? ""
    response.setHeader("Cache-Control", "no-store")
    if (path === "/favicon.ico") return response.writeHead(204).end()
    requests.push({ method: request.method, path, cookie })
    if (request.method === "GET" && path === "/app/") {
      return response.writeHead(200, { "Content-Type": "text/html" }).end(loginPage)
    }
    if (request.method === "POST" && path === "/login") {
      void text(request).then(
        (body) => {
          const fields = new URLSearchParams(body)
          const username = fields.get("username")
          if (
            (username !== "first-user" && username !== "second-user") ||
            fields.get("password") !== "fixture-password"
          )
            return response.writeHead(403).end()
          logins.push({
            username,
            cookie: `fixture-auth=${logins.length + 1}`,
            previousLocalOwner: fields.get("localOwner"),
            previousSessionOwner: fields.get("sessionOwner"),
          })
          return response.writeHead(204, { "Set-Cookie": `fixture-auth=${logins.length}; Path=/; Max-Age=3600` }).end()
        },
        () => response.writeHead(400).end(),
      )
      return
    }
    if (request.method === "GET" && path === "/live") {
      const owner = logins.find((login) => login.cookie === cookie)?.username
      if (!owner || searchParams.get("localOwner") !== owner || searchParams.get("sessionOwner") !== owner)
        return response.writeHead(403).end()
      // This stream is held by the authenticated page for its entire lifetime.
      sessions.set(cookie, response)
      response.writeHead(200, { "Content-Type": "text/event-stream" })
      response.write("data: ready\n\n")
      return
    }
    if (request.method === "POST" && path === "/logout") {
      return response.writeHead(204, { "Set-Cookie": "fixture-auth=; Path=/; Max-Age=0" }).end()
    }
    // The fixture has working authentication and no available file service.
    return response.writeHead(503).end()
  })
  async function close() {
    if (server.listening) {
      const closed = once(server, "close")
      server.close()
      server.closeAllConnections()
      await closed
    }
    await rm(directory, { recursive: true, force: true })
  }
  try {
    await mkdir(join(resources, "bin"), { recursive: true })
    const copy = { mode: constants.COPYFILE_FICLONE }
    await cp(node, join(resources, "bin/node"), { ...copy, dereference: true })
    await cp(dirname(browser), join(resources, "browsers"), { ...copy, recursive: true })
    await symlink(resolve(import.meta.dir, "../../../loginom-runtime"), join(resources, "runtime"))
    await writeHelp(join(resources, "help"))
    await writeFile(
      join(resources, "resource-manifest.json"),
      JSON.stringify({
        protocol: 1,
        nodeVersion: release.nodeVersion,
        node: "bin/node",
        browser: browserFile,
        actionManifestUri: release.actionManifestUri,
        actionManifestSha256: release.actionManifestSha256,
        files: [
          { path: "bin/node", sha256: release.nodeSha256 },
          { path: browserFile, sha256: release.browserSha256 },
        ],
      }),
    )
    server.listen(0, "127.0.0.1")
    await once(server, "listening")
    const address = server.address()
    if (!address || typeof address === "string") throw Error("Missing fixture server address")
    return {
      directory,
      root: join(directory, "profile"),
      resources,
      node,
      url: `http://127.0.0.1:${address.port}/app/`,
      requests,
      logins,
      sessions,
      close,
    }
  } catch (error) {
    await close()
    throw error
  }
}

const loginPage = `<!doctype html>
<form id="login">
  <label data-tid="LoginForm;Login;edtUsername">Username <input name="username"></label>
  <label data-tid="LoginForm;Login;edtPassword">Password <input name="password" type="password"></label>
  <button data-tid="LoginForm;Login;btnLogin">Login</button>
</form>
<div id="workspace" hidden>
  <button data-tid="MF;cntMain;tlbMainToolbar;btnAvatar" onclick="logoutButton.hidden=false">Account</button>
  <button id="logoutButton" data-tid="MF;AppMenuForm;btnLogOut" hidden>Log out</button>
</div>
<script>
  const ownerKey = "fixture-owner";
  let live;
  login.onsubmit = async (event) => {
    event.preventDefault();
    const fields = new FormData(login);
    fields.set("localOwner", localStorage.getItem(ownerKey) ?? "");
    fields.set("sessionOwner", sessionStorage.getItem(ownerKey) ?? "");
    const response = await fetch("/login", { method: "POST", body: new URLSearchParams(fields) });
    if (!response.ok) return;
    const username = fields.get("username");
    localStorage.setItem(ownerKey, username);
    sessionStorage.setItem(ownerKey, username);
    const stored = new URLSearchParams({
      localOwner: localStorage.getItem(ownerKey),
      sessionOwner: sessionStorage.getItem(ownerKey),
    });
    live = new EventSource("/live?" + stored);
    live.onopen = () => {
      window.bg = { app: { Application: { FInstance: { FMainForm: { FMapTree: {
        FServerConnection: { UserName: username }
      } } } } } };
      login.hidden = true;
      workspace.hidden = false;
    };
  };
  logoutButton.onclick = async () => {
    const response = await fetch("/logout", { method: "POST" });
    if (!response.ok) return;
    live.close();
    workspace.hidden = true;
    logoutButton.hidden = true;
    login.hidden = false;
  };
</script>`
