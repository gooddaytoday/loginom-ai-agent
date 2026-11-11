import { lookupResponse, snapshotResponse } from "./response"
import { connect, views } from "./loginom/adapter"
import type { Frame, Update, View } from "./loginom/types"

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
start()
function start() {
  async function post(path: string, body: unknown) {
    const res = await fetch(location.origin + "/dashboard/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw Error(await res.text())
    return (await res.json()) as unknown
  }
  function install(view: View) {
    const api = connect()
    if (!api?.available(view)) return
    const studio = api
    const form = view.Controller
    const toolbar = form.Items.tlbModel
    if (toolbar.getComponent("dashboardApp")) return
    let overlay: HTMLElement | undefined
    let pending: Promise<void> = Promise.resolve(),
      busy = 0
    const errors = new Map<string, string>()
    const selected = () => form.GetOneSelectedNode(false)
    const tab = studio.tab
    const close = () => {
      overlay?.remove()
      overlay = undefined
      update()
    }

    async function open() {
      const visual = selected()
      if (!visual || overlay) return
      const owner = tab()
      const section = document.createElement("section")
      overlay = section
      const escape = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return
        event.preventDefault()
        event.stopPropagation()
        close()
      }
      section.addEventListener("keydown", escape, true)
      section.id = "dashboard-tab-overlay"
      section.setAttribute("aria-label", "Dashboard")
      section.style.cssText =
        "position:absolute;inset:0;z-index:100;display:flex;flex-direction:column;background:#fff;font:14px system-ui;color:#242638"
      const header = document.createElement("header")
      header.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;padding:2px 16px;background:#393744;color:white"
      const title = document.createElement("strong")
      title.textContent = "Dashboard"
      header.append(title)
      const back = document.createElement("button")
      back.textContent = "Вернуться к сценарию"
      back.style.cssText = "cursor:pointer;padding:7px 6px"
      back.onclick = close
      header.append(back)
      const note = document.createElement("p")
      note.style.cssText = "padding:0 20px"
      note.setAttribute("role", "status")
      section.append(header, note)
      owner.View.el.dom.append(section)
      back.focus()
      try {
        // Loginom PortAbstract: subtype 1 is a table. Never execute an export to discover its type.
        if (visual.GetOutputPorts()[0]?.SubType !== 1) {
          note.textContent = "Dashboard для этого узла недоступен"
          return
        }
        const node = visual.GetData()
        note.textContent = busy ? "Идёт расчёт" : "Открываем dashboard…"
        const target = await studio.binding(owner, form, visual)
        const lookup = lookupResponse(await post("lookup", target))
        await pending
        if (overlay !== section) return
        busy++
        const task = pending.then(async () => {
          if (!(await studio.active(node)) || errors.has(lookup.key)) {
            note.textContent = "Идёт расчёт"
            try {
              await studio.execute(node)
              errors.delete(lookup.key)
            } catch (e: unknown) {
              errors.set(lookup.key, message(e))
              throw e
            }
          }
        })
        pending = task.then(
          () => {
            busy--
          },
          () => {
            busy--
          },
        )
        await task
        if (overlay !== section) return
        const parameters = () => studio.parameters(form)
        const available = await parameters()
        const sample = !errors.has(lookup.key) && (await studio.active(node)) ? await studio.table(node, 12) : null
        if (overlay !== section) return
        const snapshot = snapshotResponse(
          await post("targets", {
            binding: target,
            nodeName: await node.get_DisplayName(),
            sample,
            parameters: available,
          }),
        )
        if (overlay !== section) return
        title.textContent = snapshot.nodeName
        const chatUrl =
          "loginom-ai-agent://dashboard?id=" +
          encodeURIComponent(snapshot.id) +
          "&action=" +
          (lookup.exists ? "edit" : "create")
        if (!lookup.exists) {
          const chat = document.createElement("a")
          chat.href = chatUrl
          chat.target = "_blank"
          chat.rel = "noopener"
          chat.textContent = "Открыть чат в Desktop"
          note.replaceChildren("Опишите dashboard для узла «" + snapshot.nodeName + "» в чате. ", chat)
          // A long first execution can outlive the browser's user gesture. The same link remains clickable.
          chat.click()
          return
        }
        const chat = document.createElement("button")
        chat.type = "button"
        chat.textContent = "Изменить в чате"
        chat.style.cssText = "cursor:pointer;text-decoration:underline;padding:7px 6px"
        chat.onclick = () => window.open(chatUrl, "_blank", "noopener")
        back.before(chat)
        const state = async () => {
          const params = await parameters()
          const error = errors.get(lookup.key) ?? null
          return {
            value: params[0]?.value ?? null,
            parameters: params,
            table: !error && (await studio.active(node)) ? await studio.table(node) : null,
            error,
          }
        }
        const run = (update?: Update) => {
          busy++
          const task = pending.then(async () => {
            try {
              if (update) await studio.parameters(form, update)
              await studio.execute(node)
              errors.delete(lookup.key)
              return await state()
            } catch (e: unknown) {
              errors.set(lookup.key, message(e))
              return await state()
            }
          })
          pending = task.then(
            () => {
              busy--
            },
            () => {
              busy--
            },
          )
          return task
        }
        const frame = document.createElement("iframe") as Frame
        frame.title = "Dashboard"
        frame.style.cssText = "border:0;flex:1;width:100%;min-height:0"
        frame.addEventListener("load", () => frame.contentDocument?.addEventListener("keydown", escape, true))
        frame.dashboard = {
          state: async () => {
            await pending
            return state()
          },
          change: (value, name = available[0]?.name) => {
            if (
              !Number.isFinite(value) ||
              !available.some((p) => p.name === name) ||
              (name === "MinBudget" && value < 0)
            )
              return Promise.reject(Error("Недопустимое значение параметра."))
            return run({ name, value })
          },
          run: () => run(),
        }
        frame.src = "/dashboard/apps/" + lookup.key + "/"
        note.remove()
        section.append(frame)
      } catch (e: unknown) {
        note.textContent = "Dashboard: " + message(e)
      }
    }

    const button = toolbar.insert(0, { itemId: "dashboardApp", text: "Dashboard", handler: open })
    let revision = 0
    async function update() {
      const seq = ++revision
      const visual = selected()
      button.setVisible(Boolean(visual))
      if (!visual) return
      button.setText("Dashboard")
      if (visual.GetOutputPorts()[0]?.SubType !== 1) return
      try {
        const lookup = lookupResponse(await post("lookup", await studio.binding(tab(), form, visual)))
        if (seq === revision && !view.destroyed) button.setText(lookup.exists ? "Dashboard" : "Создать dashboard")
      } catch {
        /* Opening the button reports the service error in the tab. */
      }
    }
    studio.listen(view, update, () => {
      revision++
      overlay?.remove()
      overlay = undefined
    })
    update()
  }
  views(install)
}
