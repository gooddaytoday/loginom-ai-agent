import { icon } from "./icons.js"

// Iteration 5: settings grouped by what the user does; no «Подключения» group (the word is a catalog type, И1.1-1).
const sections = [
  ["Работа", [["loginom", "Loginom", "external"], ["providers", "Провайдеры", "layers"], ["models", "Модели", "cpu"], ["instructions", "Инструкции", "book"], ["permissions", "Разрешения", "shield"], ["contour", "Сеть", "globe"]]],
  ["Приложение", [["general", "Общие", "settings"], ["shortcuts", "Горячие клавиши", "grid"], ["help", "Справка", "help"], ["diagnostics", "Диагностика", "chart"]]],
]
// The tabs where a policy sets something: they show a lock in the menu.
const policyTabs = { loginom: true, providers: true, models: true, permissions: true, contour: true }

// As in 0.4: a fresh profile has the public stand filled in, empty password, not connected yet.
const publicStand = "https://app.loginom.ai"
const defaults = { url: publicStand, username: "user", hasPassword: false, empty: true, connected: false }
const freeModel = { kind: "cloud", source: "free", provider: "opencode", name: "Бесплатная модель OpenCode", where: "Облако OpenCode" }
// В-82: providers and sign-in methods as in OpenCode 2 (core/src/plugin/provider/*, app/src/providers/connect/*). The
// popular ones in OpenCode's order; the rest is a sample of its 70+. «Свой сервер» is ours: OpenCode 2 sets an
// OpenAI-compatible address only in the config (providers.<id>.settings.baseURL), the product gives it a form.
export const providerCatalog = [
  { id: "opencode", name: "OpenCode", popular: true, tagline: "Бесплатные модели уже подключены; с аккаунтом OpenCode — ещё и платные", methods: [["device", "Аккаунт OpenCode"], ["key", "Ключ API"]], models: ["GPT-5.4 · OpenCode", "Claude Sonnet 5.5 · OpenCode"] },
  { id: "opencode-go", name: "OpenCode Go", popular: true, tagline: "Недорогая подписка на открытые модели", methods: [["key", "Ключ API"]], models: ["Kimi K3", "GLM-5"] },
  { id: "openai", name: "OpenAI", popular: true, tagline: "Подписка ChatGPT Plus или Pro, или ключ API", methods: [["browser", "Войти через ChatGPT"], ["key", "Ключ API"]], models: ["GPT-5.4", "GPT-5.4 mini"] },
  { id: "github-copilot", name: "GitHub Copilot", popular: true, tagline: "Подписка GitHub Copilot: GitHub.com или GitHub Enterprise", methods: [["device", "Войти через GitHub"]], models: ["GPT-5.4 · Copilot", "Claude Sonnet 5.5 · Copilot"] },
  { id: "anthropic", name: "Anthropic", popular: true, tagline: "Ключ API", methods: [["key", "Ключ API"]], models: ["Claude Opus 5.5", "Claude Sonnet 5.5"] },
  { id: "google", name: "Google", popular: true, tagline: "Ключ API", methods: [["key", "Ключ API"]], models: ["Gemini 3 Pro", "Gemini 3 Flash"] },
  { id: "bedrock", name: "Amazon Bedrock", tagline: "Ключ доступа AWS", methods: [["key", "Ключ доступа"]], models: ["Claude Sonnet 5.5 · Bedrock"] },
  { id: "azure", name: "Azure OpenAI", tagline: "Ключ API", methods: [["key", "Ключ API"]], models: ["GPT-5.4 · Azure"] },
  { id: "claude-agent", name: "Claude Code", tagline: "Вход через установленный Claude Code", methods: [["command", "Вход через Claude Code"]], models: ["Claude Sonnet 5.5 · Claude Code"] },
  { id: "deepseek", name: "DeepSeek", tagline: "Ключ API", methods: [["key", "Ключ API"]], models: ["DeepSeek V4"] },
  { id: "mistral", name: "Mistral", tagline: "Ключ API", methods: [["key", "Ключ API"]], models: ["Mistral Large 3"] },
  { id: "openrouter", name: "OpenRouter", tagline: "Ключ API", methods: [["key", "Ключ API"]], models: ["GPT-5.4 · OpenRouter"] },
  { id: "own", name: "Свой сервер", tagline: "OpenAI-совместимый: в сети организации или на этом компьютере (Ollama, LM Studio)", methods: [["own", "Адрес сервера"]], models: [] },
]
const providerById = (id) => providerCatalog.find((entry) => entry.id === id)
// Demo accounts the browser sign-in «returns».
const demoAccounts = { openai: "anna@example.com · ChatGPT Plus", "github-copilot": "anna-ivanova", opencode: "anna@example.com", "claude-agent": "anna@example.com" }
const deviceName = "Только этот компьютер"

// The machine policy file of the demo administrator. A real one lives in policy.json (stage F).
export const policyPath = "C:\\ProgramData\\Loginom AI Agent\\policy.json"
const adminPolicy = {
  loginomUrl: "https://loginom.corp.example",
  models: [{ kind: "intranet", source: "admin", name: "Qwen 3 32B", url: "https://llm.corp.example/v1", where: "Сеть организации" }],
  catalog: "Набор от администратора от 12.11.2026, действует до 11.05.2027",
}

const permissionKinds = [
  ["read", "Читать файлы проекта", "Файлы в папке проекта и приложенные к сообщению.", "allow"],
  ["write", "Создавать и менять файлы проекта", "Документы, отчёты и копии пакетов в папке проекта.", "ask"],
  ["save", "Сохранять пакеты в Loginom", "Агент сам сохраняет в Loginom новый пакет или новую версию.", "ask"],
  ["export", "Запускать сценарии с выгрузками", "Выгрузки пишут в файлы и базы данных вне пакета.", "ask"],
  ["web", "Открывать сайты", "Искать и читать страницы в интернете.", "ask"],
]
const permissionLabels = { allow: "Разрешено", ask: "Спрашивать", deny: "Запрещено" }

const preferences = [
  ["notifications", "Сообщать, когда агент закончил или ждёт ответа", "Уведомление системы, если окно приложения не на виду."],
  ["sounds", "Звук", "Короткий звук вместе с уведомлением."],
  ["agentPicker", "Выбор режима агента", "В поле ввода появится переключатель «Выполнение / Планирование»."],
]
const shortcuts = [
  ["Новый разговор", "Ctrl", "N"],
  ["Поиск", "Ctrl", "K"],
  ["Свернуть панель", "Ctrl", "B"],
  ["Настройки", "Ctrl", ","],
  ["Остановить агента", "Esc"],
  ["Отправить сообщение", "Enter"],
  ["Новая строка", "Shift", "Enter"],
]

function esc(x = "") {
  return String(x).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch])
}

export function ensureSettings(state) {
  const s = (state.settings ??= {})
  s.tab ??= "loginom"
  s.connection ??= { ...defaults }
  // A broken policy keeps the app on this computer: the form does not offer the public stand. The connection stays
  // set aside and comes back with the policy; the empty field is not an unsaved change.
  s.hiddenUrl ??= state.policy === "broken" && !isLocalUrl(s.connection.url) ? s.connection.url : ""
  s.draft ??= { ...s.connection, password: "", url: s.hiddenUrl ? "" : s.connection.url }
  s.closedMode ??= "intranet"
  // В-82: models come from connected providers; the free OpenCode models need no sign-in. «Модели» hides some.
  s.providers ??= []
  s.hidden ??= {}
  s.connect ??= null
  s.models = [freeModel, ...s.providers.flatMap((entry) => entry.models)]
  // The user's choice is kept apart from the model in use, so it comes back when allowed again.
  s.preferred ??= s.models[0].name
  s.permissions ??= Object.fromEntries(permissionKinds.map(([id, , , value]) => [id, value]))
  s.terminal ??= false
  s.instructions ??= ""
  s.instructionsDraft ??= s.instructions
  s.theme = state.theme ?? s.theme ?? "system"
  // Iteration 2: the agent mode picker is off for newcomers; it is turned on in «Общие».
  s.preferences ??= { notifications: true, sounds: false, agentPicker: false }
  s.shortcuts ??= "windows"
  if (s.pendingConnection && !running(state)) {
    s.connection = s.pendingConnection.connection
    s.pendingConnection = undefined
  }
  applyPolicy(state, s)
  return s
}

// A policy wins over the user (decision 8). A broken file keeps the app on this computer until it is fixed.
function applyPolicy(state, s) {
  if (state.policy === "set") {
    s.closedMode = "intranet"
    if (s.connection.url !== adminPolicy.loginomUrl) {
      s.connection = { url: adminPolicy.loginomUrl, username: "", hasPassword: false, empty: false, connected: false }
      s.draft = { ...s.connection, password: "" }
    }
    s.models = adminPolicy.models
  }
  if (state.policy === "broken") s.closedMode = "device"
  // A connection outside the mode is not used, but it comes back when the mode allows it again.
  const blocked = Boolean(loginomBlocked(state, s, s.connection.url))
  if (blocked && s.connection.connected) Object.assign(s.connection, { connected: false, parked: true })
  if (!blocked && s.connection.parked) Object.assign(s.connection, { connected: true, parked: false })
  const usable = s.models.filter((model) => allowed(state, s, model))
  s.model = usable.find((model) => model.name === s.preferred) ?? available(state, s)[0] ?? null
}
function allowed(state, s, model) {
  if (state.contour !== "closed") return true
  if (model.kind === "cloud") return false
  return s.closedMode !== "device" || model.kind === "local"
}
function available(state, s) {
  return s.models.filter((model) => allowed(state, s, model) && !(state.policy !== "set" && s.hidden[model.name]))
}
// Iteration 8: the composer's model menu lists what this network mode allows; «Модели» hides some from it (В-82).
export function availableModels(state) {
  return state.settings ? available(state, state.settings) : []
}
// A hidden model still answers in the conversations that use it: hiding filters only the picker, as in OpenCode 2.
export function usableModels(state) {
  const s = state.settings
  return s ? s.models.filter((model) => allowed(state, s, model)) : []
}
function closedMode(state, s) {
  return state.contour === "closed" ? s.closedMode : "online"
}
function loginomBlocked(state, s, url) {
  const mode = closedMode(state, s)
  if (mode === "device" && isWebUrl(url) && !isLocalUrl(url)) return "В режиме «" + deviceName + "» доступен только Loginom на этом компьютере, например http://127.0.0.1:8080."
  if (mode !== "online" && url.replace(/\/$/, "") === publicStand) return "Публичный стенд работает в интернете. В закрытом контуре укажите адрес Loginom вашей организации."
  return ""
}
function lockReason(state) {
  return state.policy === "set" ? "Задано администратором" : state.policy === "broken" ? "Ошибка в файле политики" : "В закрытом контуре"
}

function status(text, tone = "neutral") {
  return '<span class="st-status st-status-' + tone + '"><i></i>' + esc(text) + "</span>"
}
function btn(label, action, opts = "") {
  return '<button class="btn ' + opts + '" data-st="' + action + '" type="button">' + esc(label) + "</button>"
}
function input(label, field, value, opts = {}) {
  return '<label class="st-field"><span>' + label + '</span><input name="' + field + '" data-st-input="' + field + '" type="' + (opts.type ?? "text") + '" value="' +
    esc(value) + '" placeholder="' + esc(opts.placeholder) + '" autocomplete="off"' + (opts.disabled ? " disabled" : "") +
    '>' + (opts.hint ? '<small>' + opts.hint + "</small>" : "") + "</label>"
}
function switchRow(title, description, name, checked) {
  return '<label class="st-switch-row"><span><strong>' + title + '</strong><small>' + description + '</small></span><input type="checkbox" role="switch" data-st-input="' +
    name + '"' + (checked ? " checked" : "") + '><i aria-hidden="true"></i></label>'
}
function sectionHead(title, subtitle, action = "") {
  return '<header class="st-section-title"><div><h2>' + title + '</h2>' + (subtitle ? "<p>" + subtitle + "</p>" : "") + "</div>" + action + "</header>"
}
function notice(title, subtitle, type = "neutral", action = "") {
  return '<div class="st-notice st-notice-' + type + '" role="status"><div class="st-notice-glyph">' + icon(type === "error" ? "alert" : type === "good" ? "check" : type === "lock" ? "lock" : "help") +
    '</div><div><strong>' + title + '</strong><p>' + subtitle + '</p>' + (action ? '<div class="st-notice-actions">' + action + "</div>" : "") + '</div></div>'
}
function listRow(title, text, trailing = "") {
  return '<div class="st-list-row"><span><strong>' + title + '</strong><small>' + text + '</small></span>' + trailing + '</div>'
}
function option(value, label, current) {
  return '<option value="' + esc(value) + '"' + (current === value ? " selected" : "") + ">" + esc(label) + "</option>"
}
// A value the user cannot change: who or what set it is always named.
function locked(value, by = "Задано администратором") {
  return '<span class="st-locked">' + icon("lock", 13) + '<span><b>' + esc(value) + "</b><small>" + by + "</small></span></span>"
}
function card(title, subtitle, body, footer = "", action = "") {
  return '<section class="st-card">' + sectionHead(title, subtitle, action) + '<div class="st-card-body">' + body + "</div>" +
    (footer ? '<footer class="st-card-footer">' + footer + "</footer>" : "") + "</section>"
}

function policyBanner(state) {
  if (state.policy === "set") return notice("Часть настроек задал администратор", "Они отмечены замком. Изменить их может только администратор вашей организации.", "lock")
  if (state.policy === "broken") return notice("Файл политики администратора с ошибкой",
    "Пока администратор его не исправит, приложение работает в режиме «" + deviceName + "»: Loginom и модели — только на этом компьютере. Файл <code>" + esc(policyPath) + "</code>, строка 7: лишняя запятая.",
    "error", btn("Сохранить отчёт для администратора", "download-report", "quiet st-button-small"))
  return ""
}

function loginomLine(state, s) {
  const reason = loginomBlocked(state, s, s.connection.url)
  if (s.connection.url && reason) return status(closedMode(state, s) === "device" ? "Не на этом компьютере — не используется" : "Публичный стенд — не используется в закрытом контуре", "wait")
  return s.connection.connected ? status("Подключён как " + s.connection.username + " · папка /" + s.connection.username, "good") : status(s.test?.ok ? "Проверено, ещё не сохранено" : "Не подключён", "wait")
}
function loginomTab(state, s) {
  const draft = s.draft
  const result = s.test ?? null
  const policy = state.policy === "set"
  const device = closedMode(state, s) === "device"
  const closedHint = policy ? "" : device && (!draft.url || !isLocalUrl(draft.url)) ? "В режиме «" + deviceName + "» нужен Loginom на этом компьютере, например http://127.0.0.1:8080."
    : draft.url && state.contour === "closed" && draft.url.replace(/\/$/, "") === publicStand ? "Публичный стенд в закрытом контуре недоступен — укажите адрес Loginom вашей организации." : ""
  const feedback = result?.error ? notice("Не удалось подключиться", result.error, "error")
    : result?.ok ? notice("Проверка прошла", "Нажмите «Сохранить», чтобы агент работал с этим Loginom.", "good")
      : s.pendingConnection ? notice("Сохранено", "Новое подключение заработает, когда агент закончит текущий ход. Пока он работает с прежним.", "neutral") : ""
  return card("Loginom", "С каким Loginom работает агент: пакеты, хранилище, запуск сценариев.",
    '<div class="st-form-grid">' +
      (policy ? '<div class="st-field"><span>Адрес</span>' + locked(adminPolicy.loginomUrl) + "</div>"
        : input("Адрес", "loginom-url", draft.url, { type: "url", placeholder: device ? "http://127.0.0.1:8080" : "https://loginom.example.org", hint: closedHint })) +
      input("Пользователь", "loginom-user", draft.username, { placeholder: "analyst" }) +
      input("Пароль", "loginom-password", draft.password, { type: "password", disabled: draft.empty, placeholder: draft.empty ? "Не нужен" : draft.hasPassword ? "Пароль сохранён" : "Введите пароль" }) +
    "</div>" +
    '<label class="st-check"><input data-st-input="loginom-empty" type="checkbox"' + (draft.empty ? " checked" : "") + "> Пароль не нужен</label>" +
    '<div class="st-inline-status">' + loginomLine(state, s) + "</div>" + (feedback ? '<div class="st-space-top">' + feedback + "</div>" : ""),
    btn("Проверить", "test-loginom", "quiet") + btn("Сохранить", "save-loginom", "primary"))
}

// В-82: as OpenCode 2 «Providers» — connected ones, popular ones, «Show more providers», local models found by themselves.
function providersTab(state, s) {
  if (state.policy === "set") return card("Провайдеры", "Откуда берутся модели.", '<div class="st-list">' +
    adminPolicy.models.map((model) => listRow(esc(model.name), esc(model.where) + " · " + esc(model.url), locked("Модель организации"))).join("") + "</div>") +
    card("Подключить провайдера", "", notice("Провайдеров задал администратор", "Подключить другой нельзя. Если нужна другая модель — обратитесь к администратору.", "lock"))
  const mode = closedMode(state, s)
  const offNote = mode === "device" ? "Нужен интернет — недоступно в режиме «" + deviceName + "»" : "Нужен интернет — недоступно в закрытом контуре"
  const connected = [listRow("OpenCode", "Бесплатные модели без входа, в облачном сервисе OpenCode — данные разговора уходят туда.",
    mode !== "online" ? status(offNote, "wait") : status("Бесплатно", "good"))]
    .concat(s.providers.map((entry) => {
      const provider = providerById(entry.id)
      const how = entry.method === "account" ? "Аккаунт: " + entry.account : entry.method === "own" ? entry.account + " · " + entry.models.length + " мод." : "Ключ API"
      const where = entry.models.every((model) => model.kind === "cloud") ? " · данные разговора уходят в " + provider.name : ""
      const off = entry.models.every((model) => !allowed(state, s, model))
      return listRow(esc(provider.name), esc(how + where), (off ? status(mode === "online" ? "Недоступен" : offNote, "wait") : "") + btn("Отключить", "provider-remove:" + s.providers.indexOf(entry), "quiet st-button-small"))
    })).join("")
  const popular = providerCatalog.filter((entry) => entry.popular && !s.providers.some((item) => item.id === entry.id)).map((entry) =>
    listRow(esc(entry.name), esc(entry.tagline), mode !== "online" ? status(offNote, "wait") : btn("Подключить", "connect-open:" + entry.id, "quiet st-button-small"))).join("")
  return card("Подключённые", "Модели подключённых провайдеров видны в выборе модели в поле ввода.", '<div class="st-list">' + connected + "</div>", "",
    btn("Подключить провайдера", "connect-open", "primary st-button-small")) +
    card("Популярные", mode === "online" ? "Подписка — вход в браузере; ключ API — из личного кабинета провайдера." : "Без интернета они недоступны — ниже свой сервер.",
      '<div class="st-list">' + popular + "</div>", btn("Показать больше провайдеров", "connect-open", "quiet")) +
    card("Свой сервер и модели на этом компьютере", "",
      '<div class="st-list">' + listRow("Ollama, LM Studio, vLLM на этом компьютере", "Находятся сами, когда запущены: их модели появятся в выборе модели без подключения.", status("Сейчас не найдены", "wait")) +
      listRow("Свой сервер", esc(mode === "device" ? "OpenAI-совместимый сервер на этом компьютере" : providerById("own").tagline) + " — отличие от OpenCode 2, там он задаётся только в файле настроек.", btn("Подключить", "connect-open:own", "quiet st-button-small")) + "</div>")
}
// В-82: as OpenCode 2 «Models» — which models the composer offers. There is no default model: a new chat takes the last one chosen.
function modelsTab(state, s) {
  const policy = state.policy === "set"
  const mode = closedMode(state, s)
  const blockedNote = mode === "device" ? "Не на этом компьютере" : "Недоступна в закрытом контуре"
  const groups = [...new Set(s.models.map((model) => model.where))].map((where) => {
    const rows = s.models.map((model, index) => [model, index]).filter(([model]) => model.where === where).map(([model, index]) => {
      const title = esc(model.name) + (model.source === "free" ? " · Бесплатно" : "")
      const text = esc(model.where) + (model.kind === "cloud" ? " — данные разговора уходят в этот облачный сервис" : "")
      if (policy) return listRow(title, text, locked("Модель организации"))
      if (!allowed(state, s, model)) return listRow(title, text, status(blockedNote, "wait"))
      return switchRow(title, text, "model-show:" + index, !s.hidden[model.name])
    }).join("")
    return rows
  }).join("")
  const empty = available(state, s).length ? "" : notice("Нет доступной модели", policy ? "Модели задаёт администратор — обратитесь к нему." : "Без модели агент не ответит. " + (s.models.some((model) => allowed(state, s, model)) ? "Включите модель ниже или подключите провайдера." : mode === "online" ? "Подключите провайдера." : "Без интернета подходит свой сервер — подключите его в «Провайдерах»."), "error")
  return card("Модели", "Какие модели предлагать в поле ввода. Модель для разговора выбирают там же; новый разговор берёт последнюю выбранную.",
    empty + '<div class="st-list' + (empty ? " st-space-top" : "") + '">' + groups + "</div>", "", policy ? "" : btn("Подключить провайдера", "connect-open", "quiet st-button-small"))
}
// В-82: the OpenCode 2 connect window — list, sign-in method, sign-in, «choose a model to start with».
function connectDialog(state, s) {
  const c = s.connect
  const provider = providerById(c.id)
  const mode = closedMode(state, s)
  // «Назад» only before the provider is connected: after that the window just finishes.
  const head = (title, desc) => '<header class="st-connect-head">' + (["method", "auth"].includes(c.step) ? btn("← Назад", "connect-back", "quiet st-button-small") : "") +
    btn("Закрыть", "connect-close", "quiet st-button-small") + "</header>" + '<h2 id="st-connect-title">' + title + "</h2>" + (desc ? "<p>" + desc + "</p>" : "")
  const wrap = (body) => '<dialog class="st-dialog st-connect" aria-labelledby="st-connect-title">' + body + "</dialog>"
  if (c.step === "list") {
    const query = c.query.trim().toLocaleLowerCase("ru")
    const row = (entry) => {
      const off = mode !== "online" && entry.id !== "own"
      const name = (entry.name + " " + entry.tagline).toLocaleLowerCase("ru")
      const on = s.providers.some((item) => item.id === entry.id)
      return '<button type="button" class="st-connect-row" data-name="' + esc(name) + '" data-st="connect-pick:' + entry.id + '"' + (off ? " disabled" : "") + (query && !name.includes(query) ? " hidden" : "") + "><span><strong>" +
        esc(entry.name) + "</strong><small>" + esc(off ? "Нужен интернет — в закрытом контуре недоступно" : entry.tagline) + "</small></span>" + (on ? status("Подключён", "good") : "") + "</button>"
    }
    const connected = providerCatalog.filter((entry) => s.providers.some((item) => item.id === entry.id))
    const group = (label, list) => list.length ? '<div class="st-connect-group"' + (query && list.every((entry) => !(entry.name + " " + entry.tagline).toLocaleLowerCase("ru").includes(query)) ? " hidden" : "") + "><small>" + label + "</small>" + list.map(row).join("") + "</div>" : ""
    // Without internet the own server is the only way in: it goes first.
    const offline = mode !== "online"
    return wrap(head("Подключить провайдера", mode === "online" ? "Модели провайдера появятся в выборе модели. Подписка — вход в браузере, ключ API — из личного кабинета провайдера."
      : "Без интернета подключается только свой сервер" + (mode === "device" ? " на этом компьютере." : " — в сети организации или на этом компьютере.")) +
      '<label class="st-field"><span class="sr-only">Найти провайдера</span><input data-st-input="connect-query" type="search" value="' + esc(c.query) + '" placeholder="Найти провайдера" autocomplete="off" data-autofocus></label>' +
      '<div class="st-connect-list">' + (offline ? group("Без интернета", [providerById("own")]) : "") + group("Подключены", connected.filter((entry) => !offline || entry.id !== "own")) +
      group("Популярные", providerCatalog.filter((entry) => entry.popular && !connected.includes(entry))) +
      group("Остальные", providerCatalog.filter((entry) => !entry.popular && !connected.includes(entry) && !(offline && entry.id === "own")).sort((a, b) => a.name.localeCompare(b.name, "ru"))) +
      '<p class="st-connect-none"' + (query && providerCatalog.every((entry) => !(entry.name + " " + entry.tagline).toLocaleLowerCase("ru").includes(query)) ? "" : " hidden") + '>Такого провайдера нет в списке.</p></div><p class="st-connect-note">В прототипе — часть списка и упрощённое окно; в продукте — родное окно OpenCode 2, где провайдеров больше 70.</p>')
  }
  if (c.step === "method") return wrap(head("Подключить " + esc(provider.name), esc(provider.tagline) + ".") +
    '<div class="st-connect-list">' + provider.methods.map(([id, label]) => '<button type="button" class="st-connect-row" data-st="connect-method:' + id + '"><span><strong>' + esc(label) +
      "</strong><small>" + { browser: "Откроется браузер — войдите и вернитесь сюда", device: "Код для входа в браузере", key: "Ключ из личного кабинета " + esc(provider.name), command: "Вход в терминале" }[id] + "</small></span></button>").join("") + "</div>")
  if (c.step === "auth") {
    const failed = c.error ? notice("Не удалось подключить", esc(c.error), "error", btn("Попробовать снова", "connect-retry", "quiet st-button-small")) : ""
    const demo = notice("Только для прототипа", "Браузера и сервиса " + esc(provider.name) + " здесь нет — подтвердите вход сами.", "neutral",
      btn("Вход подтверждён", "connect-done", "primary st-button-small") + btn("Вход не удался", "connect-fail", "quiet st-button-small"))
    if (c.method === "key") return wrap(head("Подключить " + esc(provider.name), "Вставьте ключ API " + esc(provider.name) + ", чтобы пользоваться его моделями.") +
      input("Ключ API " + esc(provider.name), "connect-key", c.key, { type: "password", placeholder: "Ключ из личного кабинета", hint: "Это прототип — подойдёт любое вымышленное значение." }) +
      (c.error ? notice("Нужен ключ", esc(c.error), "error") : "") + "<footer>" + btn("Продолжить", "connect-key-ok", "primary") + "</footer>")
    if (c.method === "browser") return wrap(head("Подключить " + esc(provider.name), "Откроется браузер — войдите в ChatGPT и вернитесь сюда. Подходящие запросы пойдут по вашему тарифу ChatGPT.") +
      (failed || '<p class="st-connect-wait">' + status("Жду подтверждения…", "wait") + "</p>" + demo) + "<footer>" + btn("Открыть браузер", "connect-browser", "quiet") + "</footer>")
    if (c.method === "device") return wrap(head("Подключить " + esc(provider.name), "Откроется браузер — " + (c.id === "github-copilot" ? "войдите в GitHub (или GitHub Enterprise) и введите код" : "подтвердите, что код там совпадает с этим") + ".") +
      (failed || '<p class="st-connect-code" aria-label="Код для входа">4F7K-92QD</p>' + demo) + "<footer>" + btn("Скопировать ссылку для входа", "connect-copy", "quiet") + btn("Открыть браузер", "connect-browser", "quiet") + "</footer>")
    if (c.method === "command") return wrap(head("Подключить " + esc(provider.name), "Войдите в Claude Code в терминале: <code>claude auth login</code>. Потом нажмите «Проверить снова».") +
      (failed || demo) + "<footer>" + btn("Проверить снова", "connect-done", "quiet") + "</footer>")
    const own = c.own
    return wrap(head("Свой сервер", "OpenAI-совместимый сервер: Ollama, LM Studio на этом компьютере или модель в сети организации.") +
      input("Адрес", "own-url", own.url, { type: "url", placeholder: mode === "device" ? "http://127.0.0.1:11434/v1" : "http://127.0.0.1:11434/v1 или https://llm.example.org/v1",
        hint: mode === "device" ? "В режиме «" + deviceName + "» — только адрес на этом компьютере." : "" }) +
      input("Ключ", "own-key", own.key, { type: "password", placeholder: "Если сервер его требует" }) +
      (own.error ? notice("Модели не найдены", own.error, "error") : "") +
      (own.found ? '<fieldset class="st-found"><legend>Найдено на сервере — подключатся все, начать с:</legend>' + own.found.map((name) =>
        '<label><input type="radio" name="own-pick" data-st-input="own-pick" value="' + esc(name) + '"' + (own.pick === name ? " checked" : "") + "> " + esc(name) + "</label>").join("") + "</fieldset>" : "") +
      "<footer>" + btn("Найти модели", "own-find", own.found ? "quiet" : "primary") + (own.found ? btn("Подключить", "own-add", "primary") : "") + "</footer>")
  }
  if (c.step === "models") {
    const entry = s.providers.find((item) => item.id === c.id)
    return wrap(head("Подключено: " + esc(provider.name), "Выберите модель для начала — сменить можно в любой момент в поле ввода.") +
      '<fieldset class="st-found"><legend>Модели «' + esc(provider.name) + "»</legend>" + entry.models.map((model) =>
        '<label><input type="radio" name="connect-model" data-st-input="connect-model" value="' + esc(model.name) + '"' + (c.pick === model.name ? " checked" : "") + "> " + esc(model.name) + "</label>").join("") + "</fieldset>" +
      "<footer>" + btn("Продолжить", "connect-finish", "primary") + "</footer>")
  }
  return wrap('<h2 id="st-connect-title">ChatGPT подключён</h2><p>Подходящие запросы идут по вашему тарифу ChatGPT. Лимиты — в настройках ChatGPT на chatgpt.com.</p>' +
    "<footer>" + btn("Понятно", "connect-finish", "primary") + "</footer>")
}

function permissionsTab(state, s) {
  const closed = state.contour === "closed"
  const rows = permissionKinds.map(([id, title, text, initial]) => {
    // Iteration 9 (run 3, finding 22): under a policy every row says who set it — the lock names the administrator,
    // an open row says whether its value is the default one.
    const mark = !state.policy ? "" : '<small id="perm-mark-' + id + '">' + (s.permissions[id] === initial ? "По умолчанию" : "Вы изменили · по умолчанию «" + permissionLabels[initial] + "»") + "</small>"
    const control = id === "web" && closed ? locked(permissionLabels.deny, lockReason(state))
      : '<span class="st-perm"><select data-st-input="perm:' + id + '" aria-label="' + esc(title) + '"' + (mark ? ' aria-describedby="perm-mark-' + id + '"' : "") + ">" + Object.entries(permissionLabels).map(([key, label]) => option(key, label, s.permissions[id])).join("") + "</select>" + mark + "</span>"
    return listRow(title, id === "web" && state.policy === "set" ? text + " Если нужно — обратитесь к администратору." : text, control)
  }).join("")
  const who = state.policy === "set" ? " Строки с замком задал администратор: «Открывать сайты» и терминал. Остальные он не задавал — у них написано, стоит ли значение по умолчанию."
    : state.policy === "broken" ? " Строки с замком закрыты, пока администратор не исправит файл политики. У остальных написано, стоит ли значение по умолчанию."
      : " Строки с замком в разговоре не разрешить."
  return card("Разрешения", "Что агент делает сам без вопроса, что — спросив вас, а что не делает никогда. Кнопки, которые нажимаете вы, например «Сохранить новой версией», эти настройки не затрагивают: они работают по правам вашей учётной записи Loginom. Где стоит «Спрашивать», в разговоре можно разрешить «один раз» или «в этом разговоре»." + who,
    '<div class="st-list">' + rows + "</div>", btn("Всё по умолчанию", "perm-reset", "quiet")) +
    card("Терминал", "Команды на вашем компьютере: установка программ, работа с файлами вне проекта.",
      closed ? listRow("Команды в терминале", "Агент не выполняет команды на компьютере.", locked("Выключен", lockReason(state)))
        : switchRow("Разрешить агенту терминал", s.terminal ? "Включён. Агент спросит про каждую команду и покажет её целиком." : "Выключен. Включите, только если понимаете, зачем агенту команды.", "terminal", s.terminal))
}

// В-65: instructions for every chat, as OpenCode's global AGENTS.md. A project adds its own; a skill is for one kind of task.
function instructionsTab(s) {
  return card("Инструкции для агента", "Агент следует им во всех разговорах. У проекта могут быть свои — агент учтёт и те, и другие.",
    '<label class="st-field"><span>Инструкции</span><textarea data-st-input="instructions" rows="7" placeholder="Например: узлы называй по смыслу, по-русски; перед расчётом выручки — проверка пустых значений">' +
      esc(s.instructionsDraft) + "</textarea><small>Приёмы для одного вида задач удобнее сделать навыком: «Каталог» → «Создать своё» → «Навык».</small></label>",
    btn("Сохранить", "save-instructions", "primary"))
}
function contourTab(state, s) {
  const mode = closedMode(state, s)
  const choice = state.policy
    ? '<div class="st-list">' + listRow("Режим", state.policy === "broken" ? "Пока файл политики с ошибкой: Loginom и модели — только на этом компьютере." : "Сеть организации: модели и Loginom внутри неё.",
      locked(state.policy === "broken" ? deviceName : "Закрытый контур", lockReason(state))) + "</div>"
    : '<div class="st-choice-grid">' + [
      ["online", "globe", "Интернет", "Облачные модели, каталог Loginom Hub, сайты."],
      ["closed", "shield", "Закрытый контур", "Ничего не уходит в интернет. Модели и Loginom — у вас или в сети организации."],
    ].map(([id, glyph, title, copy]) => '<button class="st-choice" type="button" data-st="contour:' + id + '" aria-pressed="' + (state.contour === id) + '"><span class="st-choice-icon">' +
      icon(glyph, 20) + '</span><span class="st-choice-tick"></span><strong>' + title + "</strong><small>" + copy + "</small></button>").join("") + "</div>" +
      (state.contour === "closed" ? '<div class="st-closed-mode">' + listRow("Где всё работает", mode === "device" ? "Только на этом компьютере: сеть организации тоже недоступна." : "На этом компьютере и в сети организации.",
        '<select aria-label="Где всё работает" data-st-input="closed-mode">' + option("intranet", "Сеть организации", s.closedMode) + option("device", deviceName, s.closedMode) + "</select>") + "</div>" : "")
  const policy = state.policy === "set"
  const effects = policy ? [
    ["Модели", "Только модель, которую задал администратор.", locked("Qwen 3 32B")],
    ["Loginom", "Сервер, который задал администратор.", locked(adminPolicy.loginomUrl.replace("https://", ""))],
    ["Каталог", adminPolicy.catalog + "; навыки «Сообщество» администратор не разрешил.", locked("Из файла")],
    // В-76: the demo policy turns own skills off; «Инструкции» stay.
    ["Свои навыки", "Агент их не применяет; составить и передать администратору можно. «Инструкции» работают.", locked("Выключены")],
    ["Сайты", "Агент их не открывает.", locked("Запрещены")],
    ["Обновления", "Новые версии устанавливает администратор.", locked("Выключены")],
  ] : {
    online: [["Свои навыки и действия", "Работают у вас; опубликовать для всех — после проверки Loginom."], ["Модели", "Бесплатные OpenCode, провайдеры по подписке или ключу и свой сервер."], ["Loginom", "Любой адрес, в том числе публичный стенд."], ["Каталог", "Loginom Hub из интернета."], ["Сайты", "Агент открывает их, если разрешено в «Разрешениях»."], ["Обновления", "Приходят автоматически."]],
    intranet: [["Свои навыки и действия", "Работают у вас; поделиться — файлом через администратора."], ["Модели", "Только свои: на этом компьютере и в сети организации."], ["Loginom", "Сервер в сети организации; публичный стенд недоступен."], ["Каталог", "Из файла: «Каталог» → «Импорт из файла»; навыки «Сообщество» — только если разрешил администратор."], ["Сайты", "Агент их не открывает."], ["Обновления", "Сами не приходят: новую версию установщика ставите вы или администратор."]],
    device: [["Свои навыки и действия", "Работают у вас; поделиться — файлом через администратора."], ["Модели", "Только на этом компьютере."], ["Loginom", "Только на этом компьютере."], ["Каталог", "Из файла; навыки «Сообщество» — только если разрешил администратор."], ["Сайты", "Агент их не открывает."], ["Обновления", "Сами не приходят: новую версию установщика ставите вы или администратор."]],
  }[mode]
  return card("Сеть", "Куда приложению и агенту можно обращаться по сети.", choice) +
    card("Что меняется", "", '<div class="st-list">' + effects.map(([title, text, trailing = ""]) => listRow(title, text, trailing)).join("") +
      listRow("Документация Loginom", "Встроена в приложение: агент читает её без сети.", "") +
      (mode === "device" ? "" : listRow("Прокси", "Как в настройках системы.", "")) + "</div>")
}

function diagnosticsTab(state, s) {
  const ran = s.diagnosticRan
  const mode = closedMode(state, s)
  const reason = loginomBlocked(state, s, s.connection.url)
  const rows = [
    ["Loginom", esc(s.connection.url || "Адрес не задан"), s.connection.connected ? ["Подключён", "good"] : [reason ? "Не используется в этом режиме" : "Не подключён", "error"], "loginom"],
    ["Модель", s.model ? esc(s.model.name + " · " + s.model.where) : "Модели нет", s.model ? (ran ? ["Отвечает", "good"] : ["Ещё не проверялась", "neutral"]) : ["Нужна модель", "error"], "models"],
    ["Документация Loginom", "Встроена в приложение", ["Работает", "good"]],
    ["Каталог", mode === "online" ? "Loginom Hub" : state.policy === "set" ? adminPolicy.catalog : "Из файла", ["Работает", "good"]],
    ["Политика администратора", state.policy ? esc(policyPath) : "Нет — настройки задаёте вы", state.policy === "broken" ? ["Ошибка в строке 7", "error"] : state.policy ? ["Применена", "good"] : ["Нет", "neutral"]],
    ["Сеть", { online: "Режим «Интернет»", intranet: "Закрытый контур, сеть организации", device: "Режим «" + deviceName + "»" }[mode], [{ online: "Интернет доступен", intranet: "Только сеть организации", device: "Сеть не используется" }[mode], "neutral"]],
    ["Служба агента", "Работает на этом компьютере", ["Работает", "good"]],
    ["Журнал действий агента", "Что агент читал и менял, что и в какую модель отправлял. Хранится на этом компьютере; в отчёт не входит — его выгружает администратор.", ["Ведётся", "good"]],
  ]
  const problems = rows.filter(([, , [, tone]]) => tone === "error")
  const summary = !ran ? "" : problems.length
    ? notice("Нужно внимание: " + problems.map(([title]) => title).join(", "), "Остальное работает.", "error",
      problems.filter(([, , , tab]) => tab).map(([, , , tab]) => btn("Открыть «" + (tab === "models" ? "Модели" : "Loginom") + "»", "tab:" + tab, "quiet st-button-small")).join(" "))
    : notice("Всё работает", "Проблем не найдено.", "good")
  return card("Диагностика", "Проверьте, что всё работает, и сохраните отчёт, если нужна помощь администратора.",
    '<div class="st-list">' + rows.map(([title, text, [label, tone]]) => listRow(title, text, status(label, tone))).join("") + "</div>" +
    (summary ? '<div class="st-space-top">' + summary + "</div>" : ""),
    btn("Проверить всё", "run-diagnostics", ran ? "quiet" : "primary") + btn("Сохранить отчёт для администратора", "download-report", "quiet")) +
    '<p class="st-footnote">В отчёте — режим сети, состояние политики, адрес Loginom и модель. Пароли, ключи и содержимое разговоров в него не попадают.</p>'
}

function helpTab(state, s) {
  const policy = state.policy === "set"
  const closed = state.contour === "closed"
  const device = closedMode(state, s) === "device"
  return card("Справка", "Как пользоваться приложением. Документация самого Loginom встроена и доступна агенту.", '<div class="st-about brand"><picture><img class="brand-standard" src="assets/loginom-wordmark.svg" alt="Loginom"><img class="brand-inverse" src="assets/loginom-wordmark-light.png" alt="Loginom"></picture><span>AI Agent · версия 0.5.0 (прототип)</span></div><div class="st-help">' + [
    ["Подключить Loginom", policy ? "Адрес Loginom задал администратор. В «Loginom» введите пользователя и пароль, нажмите «Сохранить»."
      : device ? "Сейчас — только Loginom на этом компьютере. В «Loginom» укажите его адрес, например http://127.0.0.1:8080, пользователя и пароль."
      : closed ? "В закрытом контуре публичный стенд недоступен. В «Loginom» укажите адрес сервера вашей организации, пользователя и пароль."
        : "Адрес публичного стенда уже указан. Свой сервер — в «Loginom»: адрес, пользователь, пароль, «Проверить».", "tab:loginom", "Открыть «Loginom»"],
    ["Выбрать модель", policy ? "Модели задал администратор; выберите одну из них в поле ввода."
      : closed ? "«Провайдеры» → «Свой сервер»: Ollama или LM Studio на этом компьютере" + (device ? "." : " или сервер вашей организации.") : "«Провайдеры»: подписка (например, ChatGPT), ключ API или свой сервер. Модель для разговора — в поле ввода.", "tab:providers", "Открыть «Провайдеры»"],
    ["Чтобы ничего не уходило в интернет", policy ? "Настройку сети задал администратор — раздел «Сеть» отмечен замком." : state.policy === "broken" ? "Пока файл политики с ошибкой, приложение и так работает без сети." : "«Сеть» → «Закрытый контур».", "tab:contour", "Открыть «Сеть»"],
    ["Что агент делает без вопроса", "«Разрешения»: по каждому виду действий — разрешено, спрашивать или запрещено." + (closed ? " Терминал в закрытом контуре выключен." : " Терминал выключен, пока вы его не включите."), "tab:permissions", "Открыть «Разрешения»"],
    ["Разобрать пакет Loginom", "Нажмите «+» у поля ввода и выберите пакет — над полем появятся действия с ним.", "goto:home", "Новый разговор"],
  ].map(([title, body, target, label], i) => "<details" + (i === 0 ? " open" : "") + "><summary>" + title + icon("down", 16) + "</summary><p>" + body + "</p>" + btn(label, target, "quiet st-button-small") + "</details>").join("") + "</div>")
}

function settingsBody(state, s) {
  switch (s.tab) {
    case "loginom": return loginomTab(state, s)
    case "providers": return providersTab(state, s)
    case "models": return modelsTab(state, s)
    case "instructions": return instructionsTab(s)
    case "permissions": return permissionsTab(state, s)
    case "contour": return contourTab(state, s)
    case "diagnostics": return diagnosticsTab(state, s)
    case "help": return helpTab(state, s)
    case "general":
      return card("Внешний вид", "", '<div class="st-theme">' + [["system", "Как в системе"], ["light", "Светлая"], ["dark", "Тёмная"]].map(([id, label]) =>
        '<button type="button" class="st-theme-choice" data-st="theme:' + id + '" aria-pressed="' + (s.theme === id) +
        '"><span class="st-theme-preview st-preview-' + id + '"><i></i><i></i><i></i></span><strong>' + label + "</strong></button>").join("") + "</div>") +
        card("Работа с агентом", "", '<div class="st-list">' + preferences.map(([key, label, desc]) => switchRow(label, desc, "pref:" + key, s.preferences[key])).join("") + "</div>")
    case "shortcuts":
      return card("Горячие клавиши", "Основные действия на клавиатуре.", '<div class="st-list">' + shortcuts.map(([label, ...keys]) => listRow(label, "",
        '<span class="st-keys">' + keys.map((key) => "<kbd>" + (key === "Ctrl" && s.shortcuts === "mac" ? "⌘" : key) + "</kbd>").join("") + "</span>")).join("") + "</div>", "",
        '<select aria-label="Платформа" data-st-input="shortcuts">' + option("windows", "Windows / Linux", s.shortcuts) + option("mac", "macOS", s.shortcuts) + "</select>")
    default:
      return ""
  }
}

export function renderSettings(state) {
  const s = ensureSettings(state)
  return '<div class="st-suite st-page"><header class="st-page-head"><div><h1>Настройки</h1><p>Loginom, модели, инструкции, разрешения и сеть.</p></div>' +
    '</header><div class="st-layout"><nav class="st-nav" aria-label="Разделы настроек">' +
    sections.map(([group, tabs]) => '<div class="st-nav-group"><small>' + group + "</small>" + tabs.map(([id, label, glyph]) =>
      '<button type="button" data-st="tab:' + id + '"' + (s.tab === id ? ' aria-current="page"' : "") + ">" + icon(glyph, 16) + "<span>" + label + "</span>" +
      (state.policy === "set" && policyTabs[id] ? '<span class="st-nav-lock" title="Есть настройки администратора">' + icon("lock", 12) + "</span>" : "") + "</button>").join("") +
      "</div>").join("") + '</nav><div class="st-content">' + (state.policy ? '<div class="st-policy">' + policyBanner(state) + "</div>" : "") + settingsBody(state, s) + "</div></div>" +
    (s.connect && state.policy !== "set" ? connectDialog(state, s) : "") +
    (s.leaveTo ? '<dialog aria-labelledby="st-unsaved" class="st-dialog"><h2 id="st-unsaved">Подключение Loginom не сохранено</h2><p>Вернитесь и сохраните или уйдите без сохранения.</p><footer>' +
      btn("Уйти без сохранения", "discard-loginom", "quiet") + btn("Вернуться", "stay-loginom", "primary") +
      "</footer></dialog>" : "") + "</div>"
}

export function startConnect(state, id = "") {
  const s = ensureSettings(state)
  s.connect = connectState(id)
  s.tab = "providers"
}
function connectState(id) {
  const provider = providerById(id)
  const step = !provider ? "list" : provider.methods.length > 1 ? "method" : "auth"
  return { step, id, method: provider && provider.methods.length === 1 ? provider.methods[0][0] : "", query: "", key: "", error: "", pick: "", own: { url: "", key: "", found: null, pick: "", error: "" } }
}
// The connected provider's models; a sign-in also names the account it came back with.
function connectProvider(s, id, method, models, pick) {
  const provider = providerById(id)
  const account = method === "account" ? demoAccounts[id] ?? "" : method === "own" ? models[0].url : ""
  const list = models ?? provider.models.map((name) => ({ kind: "cloud", source: "provider", provider: id, name, where: provider.name }))
  // Several own servers live side by side; a provider is connected once (its accounts are OpenCode's, stage C).
  s.providers = [...s.providers.filter((entry) => id === "own" ? entry.account !== account : entry.id !== id), { id, method, account, models: list }]
  s.connect.step = "models"
  s.connect.pick = pick ?? list[0].name
  s.connect.error = ""
}
// A model chosen after connecting goes to the composer it was connected from (В-82, OpenCode: controller.ts). A stopped
// turn keeps its failed model: «Продолжить с другой моделью» there is the user's explicit choice. Returns the chat changed.
function useModel(state, name) {
  const item = state.returnTo === "chat" ? state.sessions?.find((entry) => entry.id === state.session) : null
  if (item && !(item.modelError && !item.modelError.resolved)) {
    Object.assign(item, { model: name, modelSwitched: true })
    return true
  }
  if (!item) state.nextModel = name
  return false
}
// The window closes; settings opened from a task return to it (finding 7 of run 3).
function closeConnect(state, s, api) {
  s.connect = null
  if (backToTask(state, api)) return
  api.render()
}

// Settings opened from a task («Подключиться к Loginom», «Подключить модель») return to it after a successful step.
function backToTask(state, api) {
  if (!state.returnTo) return false
  const page = state.returnTo
  state.returnTo = null
  api.navigate(page)
  return true
}
function isWebUrl(value) {
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && Boolean(url.hostname)
  } catch {
    return false
  }
}
function isLocalUrl(value) {
  if (!isWebUrl(value)) return false
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname)
}
// Run 3: in the closed contour a model address must look like the organization's network, not the internet. The
// product's outbound guard blocks the rest anyway (stage F); the form says so before the user relies on it.
// The closed contour refuses a model address of a known internet service up front; any other address may be in the
// organization's network — the product's outbound guard decides (stage F). In «Интернет» an own model on a public host
// is a cloud model: data leaves the organization, and the closed contour later drops it.
const publicModelHosts = /(^|\.)(openai\.com|anthropic\.com|googleapis\.com|mistral\.ai|openrouter\.ai|deepseek\.com|groq\.com|together\.xyz|x\.ai|cohere\.(ai|com)|opencode\.ai)$/
function isPublicModelUrl(value) {
  return isWebUrl(value) && publicModelHosts.test(new URL(value).hostname)
}
function isOrgUrl(value) {
  if (!isWebUrl(value)) return false
  const host = new URL(value).hostname.replace(/^\[|\]$/g, "")
  return isLocalUrl(value) || !host.includes(".") || /^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /\.(local|lan|internal|intranet|corp|home\.arpa|example|test)$/.test(host)
}
function connectionError(state, s) {
  const draft = s.draft
  const url = state.policy === "set" ? adminPolicy.loginomUrl : draft.url
  if (!isWebUrl(url)) return "Введите адрес Loginom, начиная с http:// или https://."
  const reason = loginomBlocked(state, s, url)
  if (reason) return reason
  if (!draft.username.trim()) return "Укажите пользователя."
  if (!draft.password && !draft.hasPassword && !draft.empty) return "Введите пароль или отметьте «Пароль не нужен»."
  if (url.includes("unavailable")) return "Сервер Loginom не ответил за 30 секунд. Откройте этот адрес в браузере: если Loginom не открывается и там, проверьте адрес или сеть."
  return ""
}
function savedConnection(state, draft) {
  const { password, ...saved } = draft
  return { ...saved, url: state.policy === "set" ? adminPolicy.loginomUrl : saved.url, username: saved.username.trim(), hasPassword: Boolean(!saved.empty && (password || saved.hasPassword)), connected: true, parked: false }
}
function isDirty(s) {
  if (!s.draft.url && !s.draft.username && !s.draft.password) return false
  const saved = s.pendingConnection?.connection ?? s.connection
  const url = s.draft.url || (s.hiddenUrl === saved.url ? saved.url : "")
  return url !== saved.url || s.draft.username !== saved.username || s.draft.empty !== saved.empty || Boolean(s.draft.password)
}
export function beforeSettingsLeave(state, page, tab) {
  const s = state.settings
  if (state.page !== "settings" || s?.tab !== "loginom" || !s.draft || !s.connection) return true
  if (page === "settings" && (!tab || tab === "loginom")) return true
  if (!isDirty(s)) {
    if (!s.draft.url && !s.draft.username && !s.draft.password) s.draft = { ...s.connection, password: "" }
    return true
  }
  s.leaveTo = tab ? ["tab", tab] : ["goto", page]
  return false
}
function running(state) {
  return state.activeRun === true || state.running === true || state.activeRun?.status === "running"
}
function foundModels(url) {
  if (url.includes("unavailable")) return null
  return isLocalUrl(url) ? ["qwen3:32b", "gemma3:27b"] : ["Qwen 3 32B", "Llama 3.3 70B"]
}
// Every change of the model in use is announced: data may now go elsewhere.
function announceModel(api, before, s, extra = "") {
  if (before === (s.model?.name ?? "")) return extra && api.toast(extra, "alert")
  api.toast((s.model ? "Новые разговоры теперь начинаются с модели «" + s.model.name + "»." : "В этом режиме нет доступной модели — подключите провайдера в «Провайдерах».") + (extra ? " " + extra : ""), s.model && !extra ? undefined : "alert")
}
function downloadReport(state, s, api) {
  const mode = closedMode(state, s)
  const lines = [
    "Loginom AI Agent — отчёт диагностики (прототип)",
    "Сеть: " + { online: "Интернет", intranet: "Закрытый контур, сеть организации", device: deviceName }[mode],
    "Политика администратора: " + (state.policy === "broken" ? "ошибка в строке 7 — " + policyPath : state.policy ? "применена — " + policyPath : "нет"),
    "Loginom: " + (s.connection.url || "адрес не задан") + " — " + (s.connection.connected ? "подключён" : "не подключён"),
    "Модель: " + (s.model ? s.model.name + " (" + s.model.where + ")" : "не выбрана"),
    "Пароли, ключи и содержимое разговоров исключены.",
  ]
  const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = "loginom-agent-diagnostics.txt"
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  api.toast("Отчёт сохранён")
}

export function bindSettings(root, state, api) {
  const panel = root.querySelector(".st-suite")
  if (!panel) return
  const s = ensureSettings(state)
  const connect = panel.querySelector(".st-connect")
  if (connect) {
    connect.showModal()
    ;(connect.querySelector("[data-autofocus]") ?? connect.querySelector("input, .st-connect-row, footer .btn"))?.focus()
    // Esc or «Закрыть» cancels the attempt, as in OpenCode.
    connect.addEventListener("cancel", (event) => {
      event.preventDefault()
      closeConnect(state, s, api)
    })
    connect.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !["connect-key", "own-url", "own-key"].includes(event.target.dataset.stInput)) return
      event.preventDefault()
      connect.querySelector("footer .btn.primary")?.click()
    })
  }
  const dialog = panel.querySelector(".st-dialog:not(.st-connect)")
  if (dialog) {
    const stay = dialog.querySelector('[data-st="stay-loginom"]')
    dialog.showModal()
    stay.focus()
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault()
      stay.click()
    })
  }
  panel.addEventListener("input", (event) => {
    const element = event.target
    const name = element.dataset.stInput
    if (!name) return
    const value = element.type === "checkbox" ? element.checked : element.value
    if (name === "instructions") { s.instructionsDraft = value; return }
    if (name.startsWith("loginom-")) {
      const key = { "loginom-url": "url", "loginom-user": "username", "loginom-password": "password", "loginom-empty": "empty" }[name]
      s.draft[key] = value
      s.test = undefined
      panel.querySelector(".st-content .st-space-top .st-notice")?.remove()
      panel.querySelectorAll(".st-status").forEach((el) => { if (el.textContent === "Проверено, ещё не сохранено") el.lastChild.textContent = "Не подключён" })
      if (key === "empty") {
        if (value) s.draft.password = ""
        api.render()
      }
      return
    }
    if (name === "connect-query") {
      // Filter in place: a redraw would take the caret away.
      const query = value.trim().toLocaleLowerCase("ru")
      s.connect.query = value
      const rows = [...panel.querySelectorAll(".st-connect-list .st-connect-row")]
      rows.forEach((row) => { row.hidden = Boolean(query) && !row.dataset.name.includes(query) })
      panel.querySelectorAll(".st-connect-group").forEach((group) => { group.hidden = [...group.querySelectorAll(".st-connect-row")].every((row) => row.hidden) })
      panel.querySelector(".st-connect-none").hidden = rows.some((row) => !row.hidden)
      return
    }
    if (name === "connect-key") { s.connect.key = value; return }
    if (name === "connect-model") { s.connect.pick = value; return }
    if (name.startsWith("model-show:")) {
      const model = s.models[Number(name.split(":")[1])]
      s.hidden[model.name] = !value
      ensureSettings(state)
      api.toast(value ? "«" + model.name + "» снова в выборе модели" : "«" + model.name + "» убрана из выбора модели; разговоры, где она отвечает, продолжают с ней")
      api.render()
      return
    }
    if (name === "own-url" || name === "own-key") {
      const own = s.connect.own
      own[name === "own-url" ? "url" : "key"] = value
      if (name === "own-url" && (own.found || own.error)) {
        // The old result no longer matches the address; redraw without losing the caret.
        const caret = element.selectionStart
        own.found = null
        own.error = ""
        api.render()
        const field = document.querySelector('[data-st-input="own-url"]')
        field?.focus()
        field?.setSelectionRange(caret, caret)
      }
      return
    }
    if (name === "own-pick") s.connect.own.pick = value
    if (name.startsWith("perm:")) {
      s.permissions[name.split(":")[1]] = value
      api.toast("Сохранено")
      // The «по умолчанию» mark follows the value.
      if (state.policy) {
        api.render()
        document.querySelector('[data-st-input="' + name + '"]')?.focus()
      }
    }
    if (name === "terminal") {
      s.terminal = value
      api.render()
    }
    if (name.startsWith("pref:")) s.preferences[name.split(":")[1]] = value
    if (name === "shortcuts") { s.shortcuts = value; api.render() }
    if (name === "closed-mode") {
      const before = s.model?.name ?? ""
      s.closedMode = value
      ensureSettings(state)
      announceModel(api, before, s)
      api.render()
    }
  })
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-st]")
    if (!button || !panel.contains(button)) return
    const [action, value] = button.dataset.st.split(":")
    if (action === "tab" || action === "goto") {
      if (!beforeSettingsLeave(state, action === "tab" ? "settings" : value, action === "tab" ? value : undefined)) { api.render(); return }
      if (action === "goto") { api.navigate(value); return }
      s.tab = value
    }
    if (action === "stay-loginom") s.leaveTo = null
    if (action === "discard-loginom") {
      const [type, next] = s.leaveTo
      s.leaveTo = null
      const saved = s.pendingConnection?.connection ?? s.connection
      s.draft = { ...saved, password: "", url: s.hiddenUrl === saved.url ? "" : saved.url }
      s.test = undefined
      if (type === "goto") { api.navigate(next); return }
      s.tab = next
    }
    if (action === "contour") {
      const before = s.model?.name ?? ""
      api.setContour(value)
      ensureSettings(state)
      // The public stand is not used in a closed contour: say so, or the Loginom chip turns orange without a reason.
      announceModel(api, before, s, s.connection.connected && loginomBlocked(state, s, s.connection.url) ? "Публичный стенд Loginom здесь недоступен — укажите сервер организации в «Loginom»." : "")
      api.render()
      return
    }
    if (action === "save-instructions") {
      s.instructions = s.instructionsDraft.trim()
      s.instructionsDraft = s.instructions
      api.toast(s.instructions ? "Инструкции сохранены — агент следует им во всех разговорах" : "Инструкции убраны")
      api.render()
      return
    }
    if (action === "test-loginom") {
      const error = connectionError(state, s)
      s.test = error ? { error } : { ok: true }
    }
    if (action === "save-loginom") {
      const error = connectionError(state, s)
      // Save checks, as in 0.4: the check runs here if the user skipped it.
      if (error) { s.test = { error }; api.render(); return }
      const next = { connection: savedConnection(state, s.draft) }
      if (running(state)) s.pendingConnection = next
      else s.connection = next.connection
      s.draft = { ...next.connection, password: "" }
      s.test = undefined
      api.toast(s.pendingConnection ? "Сохранено — заработает после текущего хода агента" : "Loginom подключён: " + s.connection.url.replace(/^https?:\/\//, "").replace(/\/$/, ""))
      // Back to the task only when settings were opened from it («Подключиться к Loginom», «Настроить Loginom»).
      if (backToTask(state, api)) return
    }
    if (action === "connect-open") s.connect = connectState(value ?? "")
    if (action === "connect-pick") s.connect = connectState(value)
    if (action === "connect-method") Object.assign(s.connect, { step: "auth", method: value, error: "" })
    if (action === "connect-back") {
      const provider = providerById(s.connect.id)
      s.connect = s.connect.step === "auth" && provider.methods.length > 1 ? { ...s.connect, step: "method", error: "" } : connectState("")
    }
    if (action === "connect-close") { closeConnect(state, s, api); return }
    if (action === "connect-retry") s.connect.error = ""
    if (action === "connect-fail") s.connect.error = "Вход не подтверждён в браузере. Попробуйте снова или выберите другой способ."
    if (action === "connect-browser") { api.toast("В приложении здесь откроется браузер со входом в " + (s.connect.method === "browser" ? "ChatGPT" : providerById(s.connect.id).name)); return }
    if (action === "connect-copy") { api.toast("Ссылка для входа скопирована"); return }
    if (action === "connect-key-ok") {
      if (!s.connect.key.trim()) { s.connect.error = "Вставьте ключ API из личного кабинета " + providerById(s.connect.id).name + "."; api.render(); return }
      connectProvider(s, s.connect.id, "key")
      api.toast(providerById(s.connect.id).name + " подключён")
    }
    if (action === "connect-done") {
      connectProvider(s, s.connect.id, "account")
      api.toast(providerById(s.connect.id).name + " подключён")
    }
    if (action === "own-find") {
      const own = s.connect.own
      const url = own.url.trim()
      const found = isWebUrl(url) ? foundModels(url) : null
      own.error = !isWebUrl(url) ? "Введите адрес, начиная с http:// или https://."
        : closedMode(state, s) === "device" && !isLocalUrl(url) ? "В режиме «" + deviceName + "» доступен только адрес на этом компьютере, например http://127.0.0.1:11434/v1."
          : state.contour === "closed" && isPublicModelUrl(url) ? "Это облачный сервис в интернете: в закрытом контуре модель должна быть в сети организации или на этом компьютере."
          : !found ? "Сервер не ответил. Проверьте адрес и запущены ли Ollama или LM Studio."
            : ""
      own.found = own.error ? null : found
      own.pick = own.found?.[0] ?? ""
    }
    if (action === "own-add") {
      const own = s.connect.own
      const local = isLocalUrl(own.url)
      const cloud = !local && isPublicModelUrl(own.url)
      const url = own.url.trim()
      const where = local ? "Этот компьютер" : cloud ? new URL(url).hostname : "Сеть организации"
      const models = own.found.map((name) => ({ kind: local ? "local" : cloud ? "cloud" : "intranet", source: "own", provider: "own", name, url, where }))
      connectProvider(s, "own", "own", models, own.pick)
      api.toast("Свой сервер подключён: " + models.length + " мод.")
    }
    if (action === "connect-finish") {
      const c = s.connect
      if (c.step === "models") {
        // The chosen model is offered again even if it was hidden, and goes to the composer before any welcome.
        delete s.hidden[c.pick]
        s.preferred = c.pick
        const inChat = useModel(state, c.pick)
        ensureSettings(state)
        const model = s.models.find((entry) => entry.name === c.pick)
        const where = model?.kind === "cloud" ? " — данные разговора уйдут в «" + model.where + "»" : ""
        api.toast((inChat ? "В этом разговоре дальше отвечает «" : "Новые разговоры начинаются с «") + c.pick + "»" + where)
        // ChatGPT says once what the plan covers (OpenCode: chatgpt-welcome.tsx).
        if (c.id === "openai" && s.providers.find((entry) => entry.id === "openai")?.method === "account" && !s.chatgptWelcomed) {
          s.chatgptWelcomed = true
          c.step = "welcome"
          api.render()
          return
        }
      }
      closeConnect(state, s, api)
      return
    }
    if (action === "provider-remove") {
      const before = s.model?.name ?? ""
      const entry = s.providers[Number(value)]
      s.providers = s.providers.filter((item) => item !== entry)
      ensureSettings(state)
      const after = s.model?.name ?? ""
      api.toast(providerById(entry.id).name + " отключён — его модели убраны из выбора." + (before !== after ? after ? " Новые разговоры начинаются с «" + after + "»." : " Доступной модели нет." : ""), before !== after ? "alert" : undefined)
    }
    if (action === "perm-reset") {
      s.permissions = Object.fromEntries(permissionKinds.map(([id, , , initial]) => [id, initial]))
      s.terminal = false
      api.toast("Разрешения и терминал — по умолчанию")
    }
    if (action === "theme") {
      s.theme = value
      api.setTheme(value)
      return
    }
    if (action === "run-diagnostics") s.diagnosticRan = true
    if (action === "download-report") { downloadReport(state, s, api); return }
    api.render()
  })
}
