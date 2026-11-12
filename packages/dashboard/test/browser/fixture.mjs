import { execFileSync } from "node:child_process"
import { once } from "node:events"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { appHost } from "../../dist/server.mjs"
import { chromium } from "../../../loginom-runtime/client/node_modules/playwright-core/index.mjs"

const sdk = execFileSync("bun", ["build", resolve(import.meta.dirname, "../../src/sdk/loginom.ts"), "--target=browser", "--format=esm"])

export async function fixture(
  t,
  {
    published = false,
    popupBlocking = false,
    app = "recorder",
    mode = "normal",
    lookupMode = mode,
    connectionAllowlist = true,
    table = { schema: [{ name: "count", type: 1 }], rows: [[42]] },
    status = "active",
    variableStatus = "active",
    variables = [{ name: "MinBudget", type: 1, value: 0 }],
    lateForm = false,
    missingAPI,
    malformed,
  } = {},
) {
  const browser = await chromium.launch({
    channel: "chromium", headless: true, chromiumSandbox: true,
    ...(popupBlocking && { ignoreDefaultArgs: ["--disable-popup-blocking"] }),
  })
  t.after(() => browser.close())
  const context = await browser.newContext()
  await context.addInitScript(() => {
    window.channels = 0
    const Channel = window.MessageChannel
    window.MessageChannel = class extends Channel {
      constructor() { super(); window.channels++ }
    }
    window.violations = []
    addEventListener("securitypolicyviolation", event => window.violations.push({ directive: event.violatedDirective, blockedURI: event.blockedURI }))
    window.blockedDesktopLinks = 0
    window.desktopOpens = []
    const open = window.open.bind(window)
    window.open = (url, target, features) => {
      if (String(url).startsWith("loginom-ai-agent:")) {
        window.desktopOpens.push({ url, target, features })
        return open("/desktop-link", target, features)
      }
      return open(url, target, features)
    }
    document.addEventListener(
      "click",
      (event) => {
        const link = event.target.closest?.("a")
        if (!link?.href.startsWith("loginom-ai-agent:")) return
        event.preventDefault()
        window.blockedDesktopLinks++
      },
      true,
    )
  })
  const root = await mkdtemp(join(tmpdir(), "dashboard-browser-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const dir = join(root, "a".repeat(64), "b".repeat(64))
  await mkdir(join(root, "a".repeat(64)))
  await cp(isAbsolute(app) ? app : resolve(import.meta.dirname, "apps", app), dir, { recursive: true })
  if (app === "recorder") await writeFile(join(dir, "assets/loginom.js"), sdk)
  const reservation = createServer().listen(0, "127.0.0.1")
  await once(reservation, "listening")
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const appOrigin = `http://dashboards.localhost:${port}`
  const csp = (await readFile(new URL("../../deploy/studio.csp", import.meta.url), "utf8")).trim().replace("<DASH>", appOrigin)
  const html = `<!doctype html><meta charset="utf-8">
      <title>Loginom fixture</title><main id="model" style="position:relative;height:200px"></main><a href="/ordinary">Ordinary link</a><button onclick="window.fixture.native = true">Native action</button>
      <script>
        addEventListener('beforeunload', event => {event.preventDefault(); event.returnValue = ''});
        window.fixture = {status: ${JSON.stringify(status)}, calls: 0, columns: ${JSON.stringify(table.schema)}, rows: ${JSON.stringify(table.rows)}, wait: false};
        const node = {
          get_Guid: async () => 'node-guid',
          get_DisplayName: async () => 'Fixture node',
          get_Status: async () => window.fixture.status,
          ActivateCancellable: async () => {
            window.fixture.calls++;
            if (window.fixture.wait) await new Promise(resolve => {window.fixture.finish = resolve});
            if (window.fixture.executeError) throw window.fixture.executeError;
            window.fixture.status = 'active';
          },
          get_OutputPorts: async () => ({getItem: async () => ({
            get_Socket: async () => ({QueryInterface: async () => ({
              get_Output: async () => ({QueryInterface: async () => ({
                get_Columns: async () => ({get_Count: async () => window.fixture.columns.length, getItem: async index => ({get_Name: async () => window.fixture.columns[index].name, get_DataType: async () => window.fixture.columns[index].type})}),
                get_RowCount: async () => window.fixture.rows.length,
                AsVariant: async (row, column) => window.fixture.rows[row][column]
              })})
            })})
          })})
        };
        const visual = {GetData: () => node, GetOutputPorts: () => [{SubType: window.fixture.subtype ?? 1}]};
        const owner = {View: {el: {dom: document.getElementById('model')}}};
        const form = {
          GetOneSelectedNode: () => visual,
          FGenericNode: {get_Guid: async () => 'workflow-guid'},
          FDiagram: {GetMxGraph: () => ({getSelectionModel: () => ({addListener() {}, removeListener() {}})})},
          Items: {tlbModel: {
            getComponent() {},
            insert(index, options) {
              const button = document.createElement('button');
              button.textContent = options.text;
              button.onclick = options.handler;
              document.getElementById('model').append(button);
              return {setVisible: value => {button.hidden = !value}, setText: value => {button.textContent = value}};
            }
          }}
        };
        const view = {Controller: form, rendered: true, on() {}};
        window.Out = class {};
        window.ReleaseObject = () => {};
        window.bg = {
          IBGModelPackage: 'model-package',
          IBGModelOutputSocket: 'model-output-socket',
          IBGDataSource: 'data-source',
          AsyncInvoker: (node, method) => (...args) => method.apply(node, args),
          TBGDataType: {dtInteger: 1},
          TBGProcessingMode: {pmExecute: 'execute'},
          TBGNodeActivateMode: {namAsynchronous: 'asynchronous'},
          selectAsyncValue: async (node, selector, callback) => callback(node),
          ScopeFindObject: () => ({FileName: 'user/fixture/campaign.lgp'}),
          ScopeFindObjectSelector() {},
          TBGModelNodeStatus: {mnsActive: 'active'},
          app: {Application: {Instance: {FMainForm: {GetActiveTab: () => owner}}}}
        };
        window.mxEvent = {CHANGE: 'change'};
        window.fixture.variables = ${JSON.stringify(variables)};
        window.fixture.variableStatus = ${JSON.stringify(variableStatus)};
        window.fixture.operations = [];
        window.fixture.writes = [];
        const assist = { BeginOperationEx: async cookie => {
          cookie.id = 'operation-cookie';
          window.fixture.operations.push({method: 'begin', cookie: cookie.id});
        }};
        bg.TBGDataType.dtFloat = 3;
        bg.TBGDataType.dtBoolean = 4;
        bg.IBGEditableVariablesOutputSocket = 'editable-variables';
        bg.EndOperationEx = async (actual, cookie, cancel) => {
          if (actual !== assist) throw Error('Wrong configure assist');
          window.fixture.operations.push({method: 'end', cookie: cookie.id, cancel});
        };
        form.FDiagram.VariablesNode = {GetData: () => ({
          get_Status: async () => window.fixture.variableStatus,
          GetConfigureAssist: async () => assist,
          get_Component: async () => {
            if (window.fixture.rpcError) throw Error('Fixture RPC failed after begin');
            return {get_OutputSockets: async () => ({ItemByName: async name => {
              if (name !== 'UserVariables') throw Error('Wrong variables socket');
              return {get_Socket: async () => ({QueryInterface: async type => {
                if (type !== bg.IBGEditableVariablesOutputSocket) throw Error('Wrong interface');
                return {get_Variables: async () => ({get_Elements: async () => ({
                  get_Count: async () => window.fixture.variables.length,
                  getItem: async index => ({
                    get_DataType: async () => window.fixture.variables[index].type,
                    get_Name: async () => window.fixture.variables[index].name,
                    get_Value: async () => ({
                      get_AsVariant: async () => window.fixture.variables[index].value,
                      set_AsVariant: async value => {
                        window.fixture.variables[index].value = value;
                        window.fixture.writes.push(value);
                        window.fixture.status = 'inactive';
                      }
                    })
                  })
                })})};
              }})};
            }})};
          }
        })};
        window.Ext = {
          onReady: callback => callback(),
          create: name => {
            if (name !== 'Ext.app.Controller') throw Error('Wrong controller class: ' + name);
            return {control() {}};
          },
          ComponentQuery: {query: () => [view]}
        };
        const missing = ${JSON.stringify(missingAPI)};
        if (missing === 'EndOperationEx') delete bg.EndOperationEx;
        if (missing === 'GetData' || missing === 'GetOutputPorts') delete visual[missing];
        if (missing === 'dtInteger') delete bg.TBGDataType.dtInteger;
        if (missing === 'IBGModelOutputSocket') delete bg.IBGModelOutputSocket;
        if (${lateForm}) {
          const mainForm = bg.app.Application.Instance.FMainForm;
          bg.app.Application.Instance.FMainForm = null;
          let listeners;
          Ext.create = () => ({control: (selector, events) => {listeners = events}});
          Ext.ComponentQuery.query = () => [];
          window.fixture.showScenario = () => {
            bg.app.Application.Instance.FMainForm = mainForm;
            listeners?.afterrender(view);
          };
        }
      </script><script src="/shell.js"></script>`
  const studio = createServer((request, response) => {
    if (["/desktop-link", "/ordinary"].includes(request.url)) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
      return response.end("<!doctype html><title>Safe destination</title>")
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": csp })
    response.end(html)
  })
  studio.listen(0, "127.0.0.1")
  await once(studio, "listening")
  t.after(() => new Promise(resolve => studio.close(resolve)))
  const origin = `http://127.0.0.1:${studio.address().port}`
  const reports = []
  const host = appHost({ buildsRoot: root, appOrigin, clientOrigins: [origin], mode, connectionAllowlist, log: line => reports.push(line) })
  host.listen(port, "127.0.0.1")
  await once(host, "listening")
  t.after(() => new Promise(resolve => host.close(resolve)))
  let clientHits = 0
  const shell = await readFile(new URL("../../dist/shell.js", import.meta.url), "utf8")
  const snapshots = []
  const page = await context.newPage()
  await page.route(origin + "/**", async (route) => {
    if (route.request().frame().parentFrame()) clientHits++
    const url = new URL(route.request().url())
    if (url.pathname === "/dashboard/lookup")
      return route.fulfill({
        json:
          malformed === "lookup"
            ? { exists: "yes", key: 17 }
            : {
                exists: published,
                key: "a".repeat(64),
                hash: published ? "b".repeat(64) : null,
                appOrigin,
                mode: lookupMode,
              },
      })
    if (url.pathname === "/dashboard/targets") {
      snapshots.push(route.request().postDataJSON())
      return route.fulfill({
        json:
          malformed === "snapshot"
            ? { id: 17, nodeName: null }
            : {
                id: "00000000-0000-4000-8000-" + String(snapshots.length).padStart(12, "0"),
                key: "a".repeat(64),
                nodeName: snapshots.at(-1).nodeName,
                sourceDir: "/fixture",
                binding: snapshots.at(-1).binding,
                schema: [{ name: "count", type: 1 }],
                rows: [[42]],
                tableSource: "live",
                parameters: snapshots.at(-1).parameters,
                adapter: "window.frameElement.dashboard",
                commands: { init: "init", typecheck: "typecheck", build: "build", publish: "publish" },
              },
      })
    }
    if (url.pathname === "/shell.js")
      return route.fulfill({ contentType: "text/javascript", body: shell })
    if (["/desktop-link", "/ordinary"].includes(url.pathname))
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Safe destination</title>" })
    if (url.pathname !== "/app/") return route.abort()
    return route.continue()
  })
  page.setDefaultTimeout(5_000)
  const dialogs = []
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type())
    void dialog.dismiss()
  })
  await page.goto(origin + "/app/")
  const frame = () => page.frames().find(frame => frame.url().startsWith(appOrigin + "/apps/"))
  const states = async () => {
    await page.locator('iframe[title="Dashboard"]').waitFor()
    const current = frame() ?? await page.waitForEvent("framenavigated", { predicate: frame => frame.url().startsWith(appOrigin + "/apps/") })
    await current.waitForFunction(() => window.states?.length)
    return current.evaluate(() => window.states)
  }
  const settled = async (count = 0) => {
    await page.locator('iframe[title="Dashboard"]').waitFor()
    const current = frame() ?? await page.waitForEvent("framenavigated", { predicate: frame => frame.url().startsWith(appOrigin + "/apps/") })
    await current.waitForFunction(count => window.states?.length > count && window.states.at(-1).busy === false, count)
    return current.evaluate(() => window.states.at(-1))
  }
  return {
    page,
    frame,
    states,
    settled,
    appOrigin,
    reports,
    clientHits: () => clientHits,
    errors,
    dialogs,
    origin,
    snapshots,
    publish: () => {
      published = true
    },
  }
}
