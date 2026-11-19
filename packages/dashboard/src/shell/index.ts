import { lookupResponse, snapshotResponse } from "./response"
import { connect, views } from "./loginom/adapter"
import { mountDashboard, sandboxFrame } from "./frame"
import { probe } from "./probe"
import type { Update, View } from "./loginom/types"

const message = (error: unknown) => String((error as { message?: unknown } | null)?.message ?? error)
const nodeError = (error: unknown) => Error("Узел завершился с ошибкой: " + message(error) + ". Исправьте сценарий и нажмите ещё раз")
const calculating = "Идёт расчёт"
const dashboardLabel = "Dashboard"
const pageSize = 100
const dataLabel = "Данные узла"

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

function status(padded = true) {
  const note = element("p")
  note.role = "status"
  if (padded) note.style.padding = "0 20px"
  return note
}

function actionButton(text: string) {
  const button = element("button", text)
  button.type = "button"
  button.style.cssText = "cursor:pointer;padding:7px 6px"
  return button
}

start()
function start() {
  const studioHttpsPort = document.currentScript?.getAttribute("data-dashboard-studio-https-port")
  let supported: boolean | undefined
  async function post(path: string, body: unknown, signal?: AbortSignal) {
    const res = await fetch(location.origin + "/dashboard/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) throw Error(await res.text())
    return res.json() as Promise<unknown>
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
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const remove = () => {
      clearTimeout(refreshTimer)
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
      const section = element("section")
      overlay = section
      const escape = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return
        event.preventDefault()
        event.stopPropagation()
        close()
      }
      section.addEventListener("keydown", escape, true)
      section.id = "dashboard-tab-overlay"
      section.ariaLabel = dashboardLabel
      section.style.cssText =
        "position:absolute;inset:0;z-index:100;display:flex;flex-direction:column;background:#fff;font:14px system-ui;color:#242638"
      const header = element("header")
      header.style.cssText =
        "display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:space-between;padding:2px 16px;background:#393744;color:white"
      const title = element("strong", dashboardLabel)
      const back = actionButton("Вернуться к сценарию")
      back.onclick = close
      header.append(title, back)
      const note = status()
      const feedback = status()
      feedback.style.userSelect = "text"
      section.append(header, note)
      owner.View.el.dom.append(section)
      back.focus()
      const inform = (...contents: (string | HTMLElement)[]) => {
        feedback.replaceChildren(...contents)
        section.append(feedback)
      }
      try {
        const selected = studio.tableNode(visual)
        if (!selected) {
          note.textContent = "Dashboard для этого узла недоступен"
          return
        }
        const node = selected
        note.textContent = busy ? calculating : "Открываем dashboard…"
        const target = await studio.binding(owner, form, node)
        const find = (signal?: AbortSignal) => post("lookup", target, signal).then(lookupResponse)
        let lookup = await find()
        async function checkHost() {
          if (lookup.mode !== "strict" || !lookup.hash) return
          const result = supported ?? (await probe(lookup.appOrigin, document.body))
          if (result !== null) supported = result
          if (!result) throw Error(result === null
            ? "Хост dashboard недоступен"
            : "Dashboard открывается в Chrome, Edge или Яндекс Браузере на Chromium 152 и новее")
        }
        await checkHost()
        await pending
        if (overlay !== section) return
        busy++
        const task = pending.then(async () => {
          if (!(await studio.active(node)) || errors.has(lookup.key)) {
            note.textContent = calculating
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
        const values = (params: typeof available) => params.map(({ name, value }) => ({ name, value }))
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
            parameters: values(params),
            published: Boolean(lookup.hash),
          }))
        }
        title.textContent = nodeName
        const chatUrl = (id: string) => `loginom-ai-agent://dashboard?id=${id}&action=${lookup.hash ? "edit" : "create"}`
        const desktopLink = (id: string) => {
          const link = element("a", "Открыть чат в Desktop")
          link.href = chatUrl(id)
          link.target = "_blank"
          link.rel = "noopener"
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
            if (overlay === section) inform(message(e))
          })
        }
        if (lookup.cliButton) {
          const cli = actionButton("Скопировать команду для CLI")
          cli.onclick = () => snapshotAction(async id => {
            const command = `loginom-ai-agent-cli run --dashboard ${id} "<опишите задачу>"`
            let text = command
            try {
              await navigator.clipboard.writeText(command)
              text = "Команда скопирована"
            } catch {
              // Plain HTTP and clipboard policy can require manual copying.
            }
            if (overlay === section) inform(text)
          })
          back.before(cli)
        }
        let refresh: (() => void) | undefined
        if (!lookup.hash) {
          const snapshot = await capture()
          if (!snapshot || overlay !== section) return
          const chat = desktopLink(snapshot.id)
          note.replaceChildren("Опишите dashboard для узла «" + nodeName + "» в чате. ", chat)
          // A long first execution can outlive the browser's user gesture. The same link remains clickable.
          chat.click()
        } else await show(available)
        schedule()
        function schedule() {
          if (overlay === section) refreshTimer = setTimeout(poll, 3_000)
        }
        async function poll() {
          try {
            const next = await find(AbortSignal.timeout(5_000)).catch(() => null)
            if (overlay !== section || !next?.hash || next.key !== lookup.key ||
              next.mode !== lookup.mode || next.appOrigin !== lookup.appOrigin) return
            lookup = next
            if (refresh) return refresh()
            await checkHost()
            await pending
            if (overlay === section) await show(await parameters())
          } catch (e) {
            if (overlay === section && note.firstChild) note.firstChild.textContent = message(e) + " "
          } finally {
            schedule()
          }
        }
        async function show(available: Awaited<ReturnType<typeof parameters>>) {
          const chat = actionButton("Изменить в чате")
          chat.style.textDecoration = "underline"
          chat.onclick = () => snapshotAction(id => {
            // A queued calculation can outlive the user gesture required for opening Desktop.
            if (!navigator.userActivation?.isActive) {
              inform("Продолжите в Desktop: ", desktopLink(id))
              return
            }
            window.open(chatUrl(id), "_blank", "noopener")
          })
          const state = async (params = available) => {
            const error = errors.get(lookup.key) ?? null
            return {
              type: "state" as const,
              parameters: values(params),
              table: error === null && (await studio.active(node)) ? await studio.table(node) : null,
              error,
              busy: false,
            }
          }
          let current = await state()
          if (overlay !== section) return
          back.before(chat)
          let frame: HTMLIFrameElement
          let dashboard: ReturnType<typeof mountDashboard>
          const run = (update: Update) => {
            busy++
            offset = 0
            renderData()
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
            const refresh = () => {
              finish()
              if (overlay === section) renderData()
            }
            pending = task.then(refresh, refresh)
          }
          const version = element("span")
          title.after(version)
          available.forEach(parameter => {
            const label = element("label", parameter.name + " ")
            const input = element("input")
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
          const data = element("div")
          data.hidden = true
          data.style.cssText = "overflow:auto;padding:0 20px"
          const truncation = status()
          const dataStatus = status(false)
          const previous = element("button", "Назад")
          const next = element("button", "Далее")
          const table = element("table")
          table.ariaLabel = dataLabel
          data.append(dataStatus, previous, next, table)
          let offset = 0
          const toggle = actionButton(dataLabel)
          const renderData = () => {
            const result = busy && !data.hidden ? null : current.table
            truncation.textContent = result?.truncated
              ? result.rows.length === result.totalRows
                ? "Некоторые значения укорочены"
                : `Строк получено ${result.rows.length} из ${result.totalRows}`
              : ""
            truncation.hidden = !truncation.textContent
            if (data.hidden) return
            dataStatus.textContent = busy
              ? calculating
              : current.error ?? (result ? (result.totalRows ? "" : "Нет строк") : "Нет данных узла")
            dataStatus.hidden = !dataStatus.textContent
            table.hidden = !result
            previous.hidden = next.hidden = !result || result.rows.length <= pageSize
            table.replaceChildren()
            if (!result) return
            previous.disabled = offset === 0
            next.disabled = offset + pageSize >= result.rows.length
            const headings = table.createTHead().insertRow()
            for (const column of result.schema) {
              const heading = element("th", column.name)
              heading.scope = "col"
              headings.append(heading)
            }
            const body = table.createTBody()
            for (const values of result.rows.slice(offset, offset + pageSize)) {
              const row = body.insertRow()
              for (const value of values) {
                const cell = row.insertCell()
                if (value === null || value === "") {
                  cell.append(element("em", value === null ? "Нет значения" : "Пустая строка"))
                } else cell.textContent = String(value)
              }
            }
          }
          previous.onclick = () => {
            offset -= pageSize
            renderData()
            if (previous.disabled) next.focus()
          }
          next.onclick = () => {
            offset += pageSize
            renderData()
            if (next.disabled) previous.focus()
          }
          toggle.onclick = () => {
            data.hidden = !data.hidden
            frame.hidden = !data.hidden
            toggle.textContent = data.hidden ? dataLabel : "К dashboard"
            renderData()
          }
          chat.before(toggle)
          const failure = status()
          failure.style.cssText += ";max-height:6em;overflow:auto"
          section.append(failure, truncation, data)
          refresh = () => {
            version.textContent = lookup.currentVersion ? "Версия " + lookup.currentVersion.name.slice(0, -5) : ""
            failure.textContent = lookup.latest?.status === "failed"
              ? `Новая публикация ${lookup.latest.name} не собрана. Открыта предыдущая версия. ${lookup.latest.error ?? ""}`
              : ""
            failure.hidden = !failure.textContent
            const src = lookup.appOrigin + "/apps/" + lookup.key + "/" + lookup.hash + "/"
            if (frame?.src === src) return
            stopFrame?.()
            frame?.remove()
            note.remove()
            frame = sandboxFrame(src)
            frame.title = dashboardLabel
            frame.style.cssText = "border:0;flex:1;width:100%;min-height:0"
            frame.hidden = !data.hidden
            dashboard = mountDashboard(frame, {
              close,
              silent: () => {
                note.textContent = "Dashboard не ответил"
                if (studioHttpsPort) {
                  const link = element("a", "Открыть Studio по HTTPS")
                  link.href = `https://${location.hostname}:${studioHttpsPort}/app/`
                  note.append(". ", link)
                }
                frame.replaceWith(note)
              },
            })
            stopFrame = dashboard.stop
            dashboard.send(busy ? { ...current, busy: true } : current)
            data.before(frame)
          }
          refresh()
          renderData()
        }
      } catch (e: unknown) {
        note.textContent = message(e)
      }
    }

    const button = toolbar.insert(0, { itemId: "dashboardApp", text: dashboardLabel, handler: open })
    let revision = 0
    async function update() {
      const seq = ++revision
      const visual = studio.selected(form)
      button.setVisible(Boolean(visual))
      if (!visual) return
      button.setText(dashboardLabel)
      try {
        const node = studio.tableNode(visual)
        if (!node) return
        const lookup = lookupResponse(await post("lookup", await studio.binding(tab(), form, node)))
        if (seq === revision && !view.destroyed) button.setText(lookup.hash ? dashboardLabel : "Создать dashboard")
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
