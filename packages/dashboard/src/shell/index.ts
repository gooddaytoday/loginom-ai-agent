import { lookupResponse, snapshotResponse } from "./response"
import { connect, views } from "./loginom/adapter"
import { mountDashboard, sandboxFrame } from "./frame"
import { probe } from "./probe"
import type { Update, View } from "./loginom/types"

const message = (error: unknown) => String((error as { message?: unknown } | null)?.message ?? error)
const nodeError = (error: unknown) => Error("Узел завершился с ошибкой: " + message(error) + ". Исправьте сценарий и нажмите ещё раз")
start()
function start() {
  let supported: boolean | undefined
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
    const finish = () => {
      busy--
    }
    const errors = new Map<string, string>()
    const tab = studio.tab
    let stopFrame: (() => void) | undefined
    const remove = () => {
      stopFrame?.()
      stopFrame = undefined
      overlay?.remove()
      overlay = undefined
    }
    const close = () => {
      remove()
      update()
    }

    async function open() {
      const visual = studio.selected(form)
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
      const feedback = document.createElement("p")
      feedback.style.cssText = "padding:0 20px"
      feedback.setAttribute("role", "status")
      section.append(header, note)
      owner.View.el.dom.append(section)
      back.focus()
      try {
        const node = studio.tableNode(visual)
        if (!node) {
          note.textContent = "Dashboard для этого узла недоступен"
          return
        }
        note.textContent = busy ? "Идёт расчёт" : "Открываем dashboard…"
        const target = await studio.binding(owner, form, node)
        const lookup = lookupResponse(await post("lookup", target))
        if (lookup.mode === "strict" && lookup.hash !== null) {
          const result = supported ?? (await probe(lookup.appOrigin, document.body))
          if (result !== null) supported = result
          if (overlay !== section) return
          if (result === null) return void (note.textContent = "Хост dashboard недоступен")
          if (!result) return void (note.textContent = "Dashboard открывается в Chrome, Edge или Яндекс Браузере на Chromium 152 и новее")
        }
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
              throw nodeError(e)
            }
          }
        })
        pending = task.then(finish, finish)
        await task
        if (overlay !== section) return
        const parameters = () => studio.parameters(form)
        const available = await parameters()
        const nodeName = await studio.name(node)
        const capture = async (params = available) => {
          if (errors.has(lookup.key)) throw nodeError(errors.get(lookup.key))
          const sample = await studio.table(node, 100, false)
          const rows: typeof sample.rows = []
          const encoder = new TextEncoder()
          let bytes = encoder.encode(JSON.stringify({ schema: sample.schema, rows })).length
          if (bytes > 524_288) throw Error("Схема данных превышает допустимый размер образца")
          // Count each original row once; removing rows by re-encoding the whole sample blocks Studio.
          for (const row of sample.rows) {
            const length = encoder.encode(JSON.stringify(row)).length + (rows.length ? 1 : 0)
            if (bytes + length > 524_288) break
            rows.push(row)
            bytes += length
          }
          const capturedName = await studio.name(node)
          if (overlay !== section) return
          return snapshotResponse(await post("snapshots", {
            binding: target,
            nodeName: capturedName,
            sample: { schema: sample.schema, rows },
            parameters: params.map(parameter => ({ name: parameter.name, value: parameter.value })),
            published: lookup.hash !== null,
          }))
        }
        title.textContent = nodeName
        const chatUrl = (id: string) =>
          "loginom-ai-agent://dashboard?id=" +
          encodeURIComponent(id) +
          "&action=" +
          (lookup.hash !== null ? "edit" : "create")
        const desktopLink = (id: string) => {
          const link = document.createElement("a")
          link.href = chatUrl(id)
          link.target = "_blank"
          link.rel = "noopener"
          link.textContent = "Открыть чат в Desktop"
          return link
        }
        const snapshotAction = (action: (id: string) => void | Promise<void>) => {
          const task = pending.then(async () => {
            if (overlay !== section) return
            const fresh = await capture(await parameters())
            if (overlay !== section || !fresh) return
            await action(fresh.id)
          })
          pending = task.catch((e: unknown) => {
            if (overlay !== section) return
            feedback.textContent = message(e)
            section.append(feedback)
          })
        }
        if (lookup.cliButton) {
          const cli = document.createElement("button")
          cli.type = "button"
          cli.textContent = "Скопировать команду для CLI"
          cli.style.cssText = "cursor:pointer;padding:7px 6px"
          cli.onclick = () => snapshotAction(async id => {
            await navigator.clipboard.writeText(`loginom-ai-agent-cli run --dashboard ${id} "<опишите задачу>"`)
            if (overlay !== section) return
            feedback.textContent = "Команда скопирована"
            section.append(feedback)
          })
          back.before(cli)
        }
        if (lookup.hash === null) {
          const snapshot = await capture()
          if (overlay !== section || !snapshot) return
          const chat = desktopLink(snapshot.id)
          note.replaceChildren("Опишите dashboard для узла «" + nodeName + "» в чате. ", chat)
          // A long first execution can outlive the browser's user gesture. The same link remains clickable.
          chat.click()
          return
        }
        const chat = document.createElement("button")
        chat.type = "button"
        chat.textContent = "Изменить в чате"
        chat.style.cssText = "cursor:pointer;text-decoration:underline;padding:7px 6px"
        chat.onclick = () => snapshotAction(id => {
          // A queued calculation can outlive the user gesture required for opening Desktop.
          if (!navigator.userActivation?.isActive) {
            note.replaceChildren("Продолжите в Desktop: ", desktopLink(id))
            section.append(note)
            return
          }
          window.open(chatUrl(id), "_blank", "noopener")
        })
        back.before(chat)
        const state = async (params = available) => {
          const error = errors.get(lookup.key) ?? null
          return {
            type: "state" as const,
            parameters: params.map(parameter => ({ name: parameter.name, value: parameter.value })),
            table: error === null && (await studio.active(node)) ? await studio.table(node) : null,
            error,
            busy: false,
          }
        }
        let current = await state()
        if (overlay !== section) return
        const run = (update: Update) => {
          busy++
          const task = pending.then(async () => {
            dashboard.send({ ...current, busy: true })
            try {
              await studio.parameters(form, update)
              await studio.execute(node)
              errors.delete(lookup.key)
            } catch (e: unknown) {
              errors.set(lookup.key, message(e))
            }
            current = await parameters().then(state).catch((e: unknown) => ({
              type: "state" as const, parameters: [], table: null, error: message(e), busy: false,
            }))
            dashboard.send(current)
          })
          pending = task.then(finish, finish)
        }
        const path = document.createElement("span")
        path.textContent = target.packagePath
        title.after(path)
        available.forEach(parameter => {
          const label = document.createElement("label")
          label.textContent = parameter.name + " "
          const input = document.createElement("input")
          input.type = "number"
          input.step = "any"
          input.value = parameter.value === null ? "" : String(parameter.value)
          input.style.cssText = "width:8em;padding:4px"
          input.onchange = () => {
            const value = input.valueAsNumber
            const valid = Number.isFinite(value) && (!parameter.integer || Number.isSafeInteger(value))
            input.setCustomValidity(valid ? "" : "Недопустимое значение параметра")
            if (!valid) return input.reportValidity()
            run({ name: parameter.name, value })
          }
          label.append(input)
          chat.before(label)
        })
        const frame = sandboxFrame(lookup.appOrigin + "/apps/" + lookup.key + "/" + lookup.hash + "/")
        frame.title = "Dashboard"
        frame.style.cssText = "border:0;flex:1;width:100%;min-height:0"
        const dashboard = mountDashboard(frame, {
          close,
          silent: () => {
            note.textContent = "Dashboard не ответил"
            frame.replaceWith(note)
          },
        })
        stopFrame = dashboard.stop
        dashboard.send(current)
        note.remove()
        section.append(frame)
      } catch (e: unknown) {
        note.textContent = message(e)
      }
    }

    const button = toolbar.insert(0, { itemId: "dashboardApp", text: "Dashboard", handler: open })
    let revision = 0
    async function update() {
      const seq = ++revision
      const visual = studio.selected(form)
      button.setVisible(Boolean(visual))
      if (!visual) return
      button.setText("Dashboard")
      try {
        const node = studio.tableNode(visual)
        if (!node) return
        const lookup = lookupResponse(await post("lookup", await studio.binding(tab(), form, node)))
        if (seq === revision && !view.destroyed) button.setText(lookup.hash !== null ? "Dashboard" : "Создать dashboard")
      } catch {
        /* Opening the button reports the service error in the tab. */
      }
    }
    studio.listen(view, update, () => {
      revision++
      remove()
    })
    update()
  }
  views(install)
}
