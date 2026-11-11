import { readFile } from "node:fs/promises"
import { chromium } from "../../../loginom-runtime/client/node_modules/playwright-core/index.mjs"

export async function fixture(
  t,
  {
    published = false,
    status = "active",
    variableStatus = "active",
    variables = [{ name: "MinBudget", type: 1, value: 0 }],
    missingAPI,
    malformed,
  } = {},
) {
  const browser = await chromium.launch({ channel: "chromium", headless: true, chromiumSandbox: true })
  t.after(() => browser.close())
  const context = await browser.newContext()
  await context.addInitScript(() => {
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
  const origin = "http://127.0.0.1:39999"
  const shell = await readFile(new URL("../../dist/shell.js", import.meta.url), "utf8")
  const snapshots = []
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === "/dashboard/lookup")
      return route.fulfill({
        json: malformed === "lookup" ? { exists: "yes", key: 17 } : { exists: published, key: "a".repeat(64) },
      })
    if (url.pathname === "/dashboard/targets") {
      snapshots.push(route.request().postDataJSON())
      return route.fulfill({
        json:
          malformed === "snapshot"
            ? { id: 17, nodeName: null }
            : {
                id: "00000000-0000-4000-8000-000000000001",
                key: "a".repeat(64),
                nodeName: "Fixture node",
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
    if (url.pathname === "/dashboard-bootstrap.js")
      return route.fulfill({ contentType: "text/javascript", body: shell })
    if (["/desktop-link", "/ordinary"].includes(url.pathname) || url.pathname.startsWith("/dashboard/apps/"))
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Safe destination</title>" })
    if (url.pathname !== "/app/") return route.abort()
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><meta charset="utf-8">
      <title>Loginom fixture</title><main id="model" style="position:relative;height:200px"></main><a href="/ordinary">Ordinary link</a><button onclick="window.fixture.native = true">Native action</button>
      <script>
        addEventListener('beforeunload', event => {event.preventDefault(); event.returnValue = ''});
        window.fixture = {status: ${JSON.stringify(status)}, calls: 0, rows: [[42]], wait: false};
        const node = {
          get_Guid: async () => 'node-guid',
          get_DisplayName: async () => 'Fixture node',
          get_Status: async () => window.fixture.status,
          ActivateCancellable: async () => {
            window.fixture.calls++;
            if (window.fixture.wait) await new Promise(resolve => {window.fixture.finish = resolve});
            if (window.fixture.executeError) throw Error(window.fixture.executeError);
            window.fixture.status = 'active';
          },
          get_OutputPorts: async () => ({getItem: async () => ({
            get_Socket: async () => ({QueryInterface: async () => ({
              get_Output: async () => ({QueryInterface: async () => ({
                get_Columns: async () => ({get_Count: async () => 1, getItem: async () => ({get_Name: async () => 'count', get_DataType: async () => 1})}),
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
        if (${JSON.stringify(missingAPI)} === 'EndOperationEx') delete bg.EndOperationEx;
      </script><script src="/dashboard-bootstrap.js"></script>`,
    })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  const dialogs = []
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type())
    void dialog.dismiss()
  })
  await page.goto(origin + "/app/")
  return {
    page,
    errors,
    dialogs,
    origin,
    snapshots,
    publish: () => {
      published = true
    },
  }
}
