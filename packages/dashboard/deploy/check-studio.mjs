// Operator-only live check. Neither this probe nor its adapter module is installed in Studio.
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { loginBrowser } from "../../loginom-runtime/src/connection-check.mjs"

const mode = process.argv[2]
const master = "http://127.0.0.1:32768"
const timeoutMs = 30_000
const shellPath = fileURLToPath(new URL("../dist/shell.js", import.meta.url))

async function check() {
  if (!["master", "7.4.2"].includes(mode)) throw Error("Использование: node check-studio.mjs master|7.4.2")
  const path = process.env.DASHBOARD_STUDIO_CONFIG
  if (!path) throw Error("Не проверено: задайте DASHBOARD_STUDIO_CONFIG — путь к приватному JSON.")
  const config = await readFile(path, "utf8").then(JSON.parse).catch(() => null)
  const password = config?.secrets?.password ?? config?.password
  if (typeof config?.url !== "string" || typeof config.username !== "string" || !config.username || typeof password !== "string")
    throw Error("Не проверено: нужны url, username и password (или secrets.password).")
  const url = URL.parse(config.url)
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (mode === "master") !== (url.origin === master))
    throw Error("Не проверено: URL приватной конфигурации не соответствует выбранному стенду.")
  const packagePath = config.packagePath ?? "/user/dashboard-roi/campaign.lgp"
  const unit = config.unit ?? "Unit1"
  const nodeName = config.nodeName ?? "По убыванию ROI"
  const { chromium } = await import("../../loginom-runtime/client/node_modules/playwright-core/index.mjs")
  const browserPath = chromium.executablePath()
  // Exercise the same adapter as the installed bundle, using readable method names in RPC diagnostics.
  const adapter = execFileSync("bun", ["build", fileURLToPath(new URL("../src/shell/loginom/adapter.ts", import.meta.url)), "--target=browser", "--format=esm"])
  const moduleURL = "data:text/javascript;base64," + adapter.toString("base64")
  for (const entry of mode === "master" ? ["/app/", "/app-debug/"] : [url.pathname]) {
    const profile = await mkdtemp(join(tmpdir(), "dashboard-studio-"))
    const path = mode === "master" ? entry : "/app/"
    const target = new URL(entry, url)
    target.hash = "packages" + packagePath + "/" + unit + "/workflow"
    let context, phase = "вход"
    try {
      const session = await loginBrowser({
        candidate: { url: target.href, username: config.username, password }, profile, browserPath,
        headless: true, keepOpen: true, onRetry: () => {},
      })
      context = session.context
      const page = context.pages()[0]
      page.setDefaultTimeout(timeoutMs)
      const requireClient = () => {
        const actual = new URL(page.url())
        if (actual.origin !== url.origin || actual.pathname !== path)
          throw Error("Не проверено: после входа ожидался клиент " + path)
      }
      try {
        requireClient()
        const version = await page.evaluate(() => window.bg?.app?.Version)
        if (mode === "7.4.2" && !/^7\.4\.2(?:$|[+-])/.test(version)) throw Error("Не проверено: ожидалась сборка 7.4.2.")
        phase = "запуск оболочки"
        if (mode === "7.4.2" && !(await page.locator('script[src$="/shell.js"]').count()))
          await page.addScriptTag({ path: shellPath })
        phase = "выбор табличного узла тестового сценария"
        const nodeId = ";Graph;" + nodeName.replace(/\s/g, "_").replaceAll(",", "")
        const node = page.locator("[data-tid$=" + JSON.stringify(nodeId) + "]:visible")
        await node.click()
        console.log(path, "Studio", version, "— узел выбран штатным кликом после запуска оболочки.")
        const form = page.locator('[data-tid$=";ModelForm"]').filter({ has: node })
        const button = form.locator('[data-tid$=";tlbModel;dashboardApp"]:visible')
        const visible = await button.isVisible()
        console.log(path, visible ? "Кнопка оболочки видна." : "Кнопка оболочки не видна.")
        phase = "API адаптера"
        const result = await withinTimeout(
          page.evaluate(probe, { moduleURL, nodeName, packagePath, deadline: Date.now() + timeoutMs }),
          "Не проверено: истекло время ожидания ответа Studio.",
        )
        requireClient()
        if (result) {
          console.error(path, result)
          throw Error(result)
        }
        if (!visible) throw Error("Не проверено: адаптер доступен, но установленная оболочка не показала кнопку.")
        console.log(path, "API: привязка, параметры, выполнение и чтение живой таблицы подтверждены.")
      } finally {
        await closeSession(page, config.username, packagePath).catch(() => {
          throw Error("Не проверено: штатное закрытие тестового пакета или выход не подтверждены; следующий клиент не открыт.")
        })
        console.log(path, "Тестовый пакет закрыт, выход подтверждён.")
      }
    } catch (error) {
      if (/^(Не проверено:|Отсутствует API:)/.test(error.message)) throw error
      // Playwright and RPC errors may include private inputs. Only expose the stage and known login codes.
      const code = /^LOGINOM_[A-Z_]+$/.test(error.message) ? " (" + error.message + ")" : ""
      throw Error("Не проверено: " + path + ", " + phase + code + ".")
    } finally {
      try { await context?.close() } finally { await rm(profile, { recursive: true, force: true }) }
    }
  }
}

async function closeSession(page, username, packagePath) {
  if (!(await withinTimeout(closePackage(page, username, packagePath), false))) throw Error("close failed")
  await page.locator('[data-tid="MF;cntMain;tlbMainToolbar;btnAvatar"]').click()
  await page.locator('[data-tid="MF;AppMenuForm;btnLogOut"]').click()
  await page.locator('[data-tid="LoginForm;Login;edtUsername"] input').waitFor()
}

async function closePackage(page, username, packagePath) {
  const held = await page.evaluateHandle(async ({ username, packagePath, deadline }) => {
    const map = window.bg.app.Application.FInstance.FMainForm.FMapTree
    const connection = map.FServerConnection
    const session = connection.Session
    const pkg = map.PackageNodes.Count ? map.PackageNodes.Items(0) : null
    const model = pkg?.Package
    const idle = () => {
      if (window.bg.app.Application.FInstance.FMainForm.FMapTree !== map || map.FServerConnection !== connection ||
          connection.Session !== session || connection.UserName !== username || map.PackageNodes.Count !== (pkg ? 1 : 0) ||
          (pkg && (map.PackageNodes.Items(0) !== pkg || pkg.Package !== model ||
            "/" + pkg.PackageFileName.replaceAll("\\", "/").replace(/^\/+/, "") !== packagePath))) throw Error("package changed")
      return !pkg || pkg.HasRunningNodes() === false
    }
    const clean = async () => !pkg || await session.IsPackageModified(model) === false
    idle() // Verify identity before reading the modification flag or waiting.
    if (!await clean()) throw Error("modified package")
    return {
      idle,
      async close() {
        if (!idle() || !await clean() || !idle() || Date.now() >= deadline) return false
        return !pkg || await map.ClosePackage(pkg, false, true) === true && map.PackageNodes.Count === 0
      },
    }
  }, { username, packagePath, deadline: Date.now() + timeoutMs })
  // A completed table read can precede Studio's running→idle notification.
  await page.waitForFunction(state => state.idle(), held, { polling: 200, timeout: timeoutMs })
  return held.evaluate(state => state.close())
}

async function withinTimeout(operation, timeoutResult) {
  let timer
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, timeoutMs, timeoutResult) })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    clearTimeout(timer)
  }
}

// Runs only on the authenticated page. No synthetic RPC results or dashboard service required.
async function probe({ moduleURL, nodeName, packagePath, deadline }) {
  const missing = name => "Отсутствует API: " + name
  const members = (owner, methods, values = "") => {
    for (const [names, method] of [[methods, true], [values, false]])
      for (const name of names.split(" ").filter(Boolean)) {
        const value = name.split(".").reduce((obj, key) => obj?.[key], owner)
        if (method ? typeof value !== "function" : value == null) return missing(name)
      }
  }
  const global = members(window,
    "Out ReleaseObject bg.AsyncInvoker bg.selectAsyncValue bg.ScopeFindObjectSelector bg.ScopeFindObject bg.EndOperationEx bg.app.Application.Instance.FMainForm.GetActiveTab Ext.onReady Ext.create Ext.ComponentQuery.query",
    "mxEvent.CHANGE bg.IBGModelPackage bg.IBGModelOutputSocket bg.IBGDataSource bg.IBGEditableVariablesOutputSocket bg.TBGDataType.dtFloat bg.TBGDataType.dtInteger bg.TBGDataType.dtBoolean bg.TBGModelNodeStatus.mnsActive bg.TBGProcessingMode.pmExecute bg.TBGNodeActivateMode.namAsynchronous")
  if (global) return global
  const { connect } = await import(moduleURL)
  const studio = connect()
  const tab = studio.tab()
  if (!tab?.View?.el?.dom) return missing("GetActiveTab().View.el.dom")
  const view = window.Ext.ComponentQuery.query("panel#pnlModelForm").find(v => v.rendered && tab.View.el.dom.contains(v.el.dom))
  if (!view) return "Не проверено: в активной вкладке нет формы сценария."
  const form = view.Controller
  const button = form?.Items?.tlbModel?.getComponent?.("dashboardApp")
  if (!button && typeof window.Ext.create("Ext.app.Controller", { id: "dashboardApiProbe" })?.control !== "function")
    return missing("Ext.app.Controller.control")
  if (button) {
    const buttonAPI = members(button, "setVisible setText")
    if (buttonAPI) return buttonAPI
  }
  const shape = members(view, "on Controller.GetOneSelectedNode Controller.Items.tlbModel.insert Controller.Items.tlbModel.getComponent Controller.FDiagram.GetMxGraph")
  if (shape) return shape
  const graph = form.FDiagram.GetMxGraph()
  const listeners = members(graph, "getSelectionModel") || members(graph.getSelectionModel(), "addListener removeListener")
  if (listeners) return listeners
  const visual = form.GetOneSelectedNode(false)
  if (!visual) return "Не проверено: табличный узел не выбран."
  const visualAPI = members(visual, "GetOutputPorts GetData")
  if (visualAPI) return visualAPI
  if (visual.GetOutputPorts()[0]?.SubType !== 1) return "Не проверено: первый выход узла не табличный."
  const node = visual.GetData()
  const nodeAPI = members(node, "get_DisplayName get_Guid get_OutputPorts get_Status ActivateCancellable")
  if (nodeAPI) return nodeAPI
  try {
    if (await node.get_DisplayName() !== nodeName || (await studio.binding(tab, form, node)).packagePath !== packagePath)
      return "Не проверено: выбран другой узел или пакет."
    // Check writable RPC members on the real numerical variable without changing or saving the fixture.
    const vars = form.FDiagram.VariablesNode?.GetData()
    if (!vars) return "Не проверено: в тестовом сценарии нет узла переменных."
    const assistAPI = members(await vars.GetConfigureAssist(), "BeginOperationEx")
    if (assistAPI) return assistAPI
    const rows = await studio.parameters(form)
    if (!rows.length) return "Не проверено: нет числовой переменной для проверки параметров."
    // A delayed RPC can resolve while the host is closing the session.
    if (Date.now() >= deadline) return "Не проверено: истекло время ожидания ответа Studio."
    await studio.execute(node)
    const table = await studio.table(node, 1)
    if (!table.schema.length || !table.rows.length) return "Не проверено: нет строки для проверки чтения табличного выхода."
    const sockets = await (await vars.get_Component()).get_OutputSockets()
    const socket = await (await (await sockets.ItemByName("UserVariables")).get_Socket()).QueryInterface(window.bg.IBGEditableVariablesOutputSocket)
    const elements = await (await socket.get_Variables()).get_Elements()
    for (let i = 0; i < await elements.get_Count(); i++) {
      const variable = await elements.getItem(i)
      if (await variable.get_Name() === rows[0].name) return members(await variable.get_Value(), "get_AsVariant set_AsVariant")
    }
    return "Не проверено: числовая переменная больше недоступна."
  } catch (error) {
    const name = /\.([\w$]+) is not a function/.exec(error.message)?.[1] ??
      /Cannot read properties of (?:undefined|null) \(reading '([\w$]+)'\)/.exec(error.message)?.[1]
    if (name) return missing(name)
    return "Не проверено: Studio не завершила чтение привязки, параметров или расчёт узла."
  }
}

check().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
