import { once } from "node:events"
import { constants } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { createServer, type ServerResponse } from "node:http"
import { tmpdir } from "node:os"
import { basename, dirname, join, posix, resolve } from "node:path"
import { text } from "node:stream/consumers"
import release from "../../../product/loginom-release.json"
import { writeHelp } from "../../../loginom-runtime/client/test/support/help-fixture.mjs"

const browser =
  process.env.LOGINOM_DOCK_TEST_BROWSER ||
  (process.env.PLAYWRIGHT_BROWSERS_PATH &&
    join(process.env.PLAYWRIGHT_BROWSERS_PATH, `chromium-${release.chromiumRevision}`, "chrome-linux64", "chrome"))
export const hasConnectionFixture = process.platform === "linux" && process.arch === "x64" && Boolean(browser)

export async function loginomConnectionFixture(
  options: {
    packages?: Readonly<Record<string, { file: string; name: string }>>
    onOpen?: (path: string) => void
  } = {},
) {
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
      return response
        .writeHead(200, { "Content-Type": "text/html" })
        .end(loginPage.replace("/* package support */", options.packages ? packagesScript : ""))
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
    if (request.method === "GET" && path === "/package-list" && options.packages) {
      const owner = logins.find((login) => login.cookie === cookie)?.username
      if (!owner) return response.writeHead(403).end()
      const folder = searchParams.get("folder") === "/user/" ? `/${owner}` : "/common"
      const files = Object.entries(options.packages).filter(([file]) => posix.dirname(file) === folder)
      void Promise.all(
        files.map(async ([file, pkg]) => {
          const { size } = await stat(pkg.file)
          return { FileName: posix.basename(file), Size: size, Time: "2026-01-01T00:00:00.000Z" }
        }),
      ).then(
        (rows) => response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(rows)),
        () => response.writeHead(500).end(),
      )
      return
    }
    if (request.method === "GET" && path === "/package" && options.packages) {
      const file = searchParams.get("path") ?? ""
      const owner = logins.find((login) => login.cookie === cookie)?.username
      const pkg = Object.hasOwn(options.packages, file) ? options.packages[file] : undefined
      if (!owner || !file.startsWith(`/${owner}/`) || !pkg) return response.writeHead(404).end()
      void readFile(pkg.file).then(
        (contents) => {
          if (searchParams.get("download") === "1") {
            return response.writeHead(200, { "Content-Type": "application/octet-stream" }).end(contents)
          }
          options.onOpen?.(file)
          return response
            .writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({ path: file, name: pkg.name }))
        },
        () => response.writeHead(500).end(),
      )
      return
    }
    // The fixture has working authentication and no available file service by default.
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
      if (typeof addPackageControls === "function") addPackageControls();
    };
  };
  /* package support */
  logoutButton.onclick = async () => {
    const response = await fetch("/logout", { method: "POST" });
    if (!response.ok) return;
    live.close();
    workspace.hidden = true;
    logoutButton.hidden = true;
    login.hidden = false;
  };
</script>`

// A Loginom workspace and its native Open dialog. The browser sees the
// package only after the authenticated server returns its metadata.
const packagesScript = `
  function addPackageControls() {
    const control = (parent, tid, label, tag = "button") => {
      const element = document.createElement(tag);
      element.dataset.tid = tid;
      element.textContent = label;
      parent.append(element);
      return element;
    };
    const prefix = "MF;TF";
    const tab = control(workspace, "MF;cntMain;cntWorkspace;Workspace;t.br;tb", "Workspace");
    tab.className = "x-tab-active";
    const home = control(workspace, prefix + ";HomePage;btnCreateUnsavedPackage", "Create package");
    const menu = control(workspace, "MF;cntMain;tlbMainToolbar;btnPackagesMenu", "Packages");
    const open = control(workspace, "MF;MainMenuForm;btnOpenPackage", "Open package");
    open.hidden = true;
    menu.onclick = () => { open.hidden = false; };
    const picker = control(workspace, "OpenDialogForm", "", "div");
    const field = control(picker, "OpenDialogForm;edtFileName", "", "label");
    const input = field.appendChild(document.createElement("input"));
    const submit = control(picker, "OpenDialogForm;btnOpen", "Open");
    picker.id = "package-picker";
    picker.hidden = true;
    const dialog = { $className: "bg.filedialog.view.OpenDialogForm", el: { dom: picker }, hidden: true };
    window.Ext = { getCmp: (id) => id === picker.id ? dialog : undefined };
    open.onclick = () => { picker.hidden = dialog.hidden = false; };
    class PackageTreeNode {}
    const active = { Controller: { Node: { data: {} } } };
    const main = window.bg.app.Application.FInstance.FMainForm;
    Object.assign(window.bg.app, { Version: "7.4.2", PackageTreeNode });
    const fileInfoList = {
      GetDirectoryItems: () => [],
      async GetFileInfoItemsEx(folder) {
        const response = await fetch("/package-list?" + new URLSearchParams({ folder }));
        if (!response.ok) throw Error("Could not list packages");
        return response.json();
      },
    };
    Object.assign(window.bg, {
      selectAllAsync: async (rows) => (receive) => receive(rows),
      forEach: (rows, receive) => rows.forEach(receive),
    });
    window.ReleaseObject = () => {};
    Object.assign(main.FMapTree.FServerConnection, {
      Connected: true,
      Session: { get_FileStorage: () => ({ FileInfoList: fileInfoList }) },
      FSession: {},
      FRemoteSession: {},
    });
    const nodes = [];
    main.FMapTree.PackageNodes = { get Count() { return nodes.length; }, Items: (index) => nodes[index] };
    main.FReconnecting = false;
    main.Items = { Workspace: { getActiveTab: () => active } };
    submit.onclick = async () => {
      const response = await fetch("/package?" + new URLSearchParams({ path: input.value }));
      if (!response.ok) return;
      const pkg = await response.json();
      picker.hidden = dialog.hidden = true;
      home.hidden = open.hidden = true;
      control(workspace, prefix + ";ModelForm;cmpDiagram", "Diagram", "div");
      control(workspace, prefix + ";ModelForm;pnlWorkarea", "Work area", "div");
      ["Packages", pkg.name, "Scenario"].forEach((label, i) => control(workspace, prefix + ";cnrNaviMode;b.s_" + i, label, "span"));
      const node = Object.assign(new PackageTreeNode(), { PackageFileName: pkg.path, PackageName: pkg.name });
      active.Controller.Node.data.node = node;
      nodes.push(node);
    };
  }
`
