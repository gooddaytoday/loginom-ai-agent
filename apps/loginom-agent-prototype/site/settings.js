import { icon } from "./icons.js"

// Iteration 5: settings grouped by what the user does; no «Подключения» group (the word is a catalog type, И1.1-1).
const sections = [
  ["Работа", [["loginom", "Loginom", "external"], ["models", "Модели", "cpu"], ["permissions", "Разрешения", "shield"], ["contour", "Режим работы", "globe"]]],
  ["Приложение", [["general", "Общие", "settings"], ["shortcuts", "Горячие клавиши", "grid"], ["help", "Справка", "help"], ["diagnostics", "Диагностика", "chart"]]],
]
// The tabs where a policy sets something: they show a lock in the menu.
const policyTabs = { loginom: true, models: true, permissions: true, contour: true }

// As in 0.4: a fresh profile has the public stand filled in, empty password, not connected yet.
const publicStand = "https://app.loginom.ai"
const defaults = { url: publicStand, username: "user", hasPassword: false, empty: true, connected: false }
const freeModel = { kind: "cloud", source: "free", name: "Бесплатная модель OpenCode", where: "Облако OpenCode" }
const cloudServices = { OpenAI: "GPT-5.4", Anthropic: "Claude Sonnet 5.5" }
const deviceName = "Только этот компьютер"

// The machine policy file of the demo administrator. A real one lives in policy.json (stage F).
export const policyPath = "C:\\ProgramData\\Loginom AI Agent\\policy.json"
const adminPolicy = {
  loginomUrl: "https://loginom.corp.example",
  models: [{ kind: "intranet", source: "admin", name: "Qwen 3 32B", url: "https://llm.corp.example/v1", where: "Сеть организации" }],
  catalog: "Набор от администратора от 12.11.2026",
}

const permissionKinds = [
  ["read", "Читать файлы проекта", "Файлы в папке проекта и приложенные к сообщению.", "allow"],
  ["write", "Создавать и менять файлы проекта", "Документы, отчёты и копии пакетов в папке проекта.", "ask"],
  ["save", "Сохранять пакеты в Loginom", "Новая версия рядом с исходным или замена исходного.", "ask"],
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
  s.draft ??= { ...s.connection, password: "" }
  s.closedMode ??= "intranet"
  s.models ??= [freeModel]
  // The user's choice is kept apart from the model in use, so it comes back when allowed again.
  s.preferred ??= s.models[0].name
  s.own ??= { url: "", key: "", found: null, pick: "", error: "" }
  s.cloud ??= { open: false, service: "OpenAI", key: "", error: "" }
  s.permissions ??= Object.fromEntries(permissionKinds.map(([id, , , value]) => [id, value]))
  s.terminal ??= false
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
  const list = available(state, s)
  s.model = list.find((model) => model.name === s.preferred) ?? list[0] ?? null
}
function allowed(state, s, model) {
  if (state.contour !== "closed") return true
  if (model.kind === "cloud") return false
  return s.closedMode !== "device" || model.kind === "local"
}
function available(state, s) {
  return s.models.filter((model) => allowed(state, s, model))
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
  return s.connection.connected ? status("Подключён как " + s.connection.username + " · папка /" + s.connection.username, "good") : status("Не подключён", "wait")
}
function loginomTab(state, s) {
  const draft = s.draft
  const result = s.test ?? null
  const policy = state.policy === "set"
  const closedHint = policy || !draft.url ? "" : closedMode(state, s) === "device" && !isLocalUrl(draft.url) ? "В режиме «" + deviceName + "» нужен Loginom на этом компьютере, например http://127.0.0.1:8080."
    : state.contour === "closed" && draft.url.replace(/\/$/, "") === publicStand ? "Публичный стенд в закрытом контуре недоступен — укажите адрес Loginom вашей организации." : ""
  const feedback = result?.error ? notice("Не удалось подключиться", result.error, "error")
    : result?.ok ? notice("Проверка прошла", "Нажмите «Сохранить», чтобы агент работал с этим Loginom.", "good")
      : s.pendingConnection ? notice("Сохранено", "Новое подключение заработает, когда агент закончит текущий ход. Пока он работает с прежним.", "neutral") : ""
  return card("Loginom", "С каким Loginom работает агент: пакеты, хранилище, запуск сценариев.",
    '<div class="st-form-grid">' +
      (policy ? '<div class="st-field"><span>Адрес</span>' + locked(adminPolicy.loginomUrl) + "</div>"
        : input("Адрес", "loginom-url", draft.url, { type: "url", placeholder: "https://loginom.example.org", hint: closedHint })) +
      input("Пользователь", "loginom-user", draft.username, { placeholder: "analyst" }) +
      input("Пароль", "loginom-password", draft.password, { type: "password", disabled: draft.empty, placeholder: draft.empty ? "Не нужен" : draft.hasPassword ? "Пароль сохранён" : "Введите пароль" }) +
    "</div>" +
    '<label class="st-check"><input data-st-input="loginom-empty" type="checkbox"' + (draft.empty ? " checked" : "") + "> Пароль не нужен</label>" +
    '<div class="st-inline-status">' + loginomLine(state, s) + "</div>" + (feedback ? '<div class="st-space-top">' + feedback + "</div>" : ""),
    btn("Проверить", "test-loginom", "quiet") + btn("Сохранить", "save-loginom", "primary"))
}

function modelsTab(state, s) {
  const list = available(state, s)
  const mode = closedMode(state, s)
  const policy = state.policy === "set"
  const blockedNote = mode === "device" ? "Не на этом компьютере" : "Недоступна в закрытом контуре"
  const rows = s.models.map((model, index) => {
    const trailing = policy ? locked("Модель организации") : !allowed(state, s, model) ? status(blockedNote, "wait")
      : model.source === "free" ? status("Без входа", "good") : btn("Убрать", "model-remove:" + index, "quiet st-button-small")
    return listRow(esc(model.name), esc(model.where) + (model.kind === "cloud" ? " — данные разговора уходят в этот облачный сервис" : ""), trailing)
  }).join("")
  const picker = list.length
    ? '<label class="st-field"><span>Модель по умолчанию</span><select data-st-input="model-default" aria-label="Модель по умолчанию">' +
      list.map((model) => option(model.name, model.name + " · " + model.where, s.model?.name)).join("") + "</select>" +
      "<small>С ней начинается каждый разговор. Её имя видно в поле ввода.</small></label>"
    : notice("Нет доступной модели", "Без модели агент не ответит. Добавьте свою модель по адресу — ниже.", "error")
  const first = card("Модели", "Какая модель отвечает в разговорах и откуда модели берутся.",
    picker + '<div class="st-list st-space-top">' + rows + "</div>")
  if (policy) return first + card("Добавить модель", "", notice("Модели задал администратор", "Добавить свою модель нельзя. Если нужна другая — обратитесь к администратору.", "lock"))
  const own = s.own
  const ownForm = own.open ? '<div class="st-subform">' +
    input("Адрес", "own-url", own.url, { type: "url", placeholder: mode === "device" ? "http://127.0.0.1:11434/v1" : "http://127.0.0.1:11434/v1 или https://llm.example.org/v1",
      hint: "Ollama, LM Studio или OpenAI-совместимый сервер." + (mode === "device" ? " В режиме «" + deviceName + "» — только адрес на этом компьютере." : "") }) +
    input("Ключ", "own-key", own.key, { type: "password", placeholder: "Если сервер его требует" }) +
    (own.error ? notice("Модели не найдены", own.error, "error") : "") +
    (own.found ? '<fieldset class="st-found"><legend>Найдено на сервере</legend>' + own.found.map((name) =>
      '<label><input type="radio" name="own-pick" data-st-input="own-pick" value="' + esc(name) + '"' + (own.pick === name ? " checked" : "") + "> " + esc(name) + "</label>").join("") + "</fieldset>" : "") +
    '<div class="st-inline-actions">' + btn("Найти модели", "own-find", own.found ? "quiet" : "primary") + (own.found ? btn("Добавить и выбрать", "own-add", "primary") : "") + btn("Отмена", "own-cancel", "quiet") + "</div></div>" : ""
  const cloud = s.cloud
  const cloudForm = cloud.open ? '<div class="st-subform"><label class="st-field"><span>Сервис</span><select data-st-input="cloud-service" aria-label="Сервис">' +
    Object.keys(cloudServices).map((name) => option(name, name, cloud.service)).join("") + "</select></label>" +
    input("Ключ", "cloud-key", cloud.key, { type: "password", placeholder: "Ключ из личного кабинета сервиса", hint: "Используйте вымышленное значение: это прототип." }) +
    (cloud.error ? notice("Нужен ключ", cloud.error, "error") : "") +
    '<div class="st-inline-actions">' + btn("Подключить", "cloud-add", "primary") + btn("Отмена", "cloud-cancel", "quiet") + "</div></div>" : ""
  const offNote = mode === "device" ? "Недоступно в режиме «" + deviceName + "»" : "Недоступно в закрытом контуре"
  return first + card("Добавить модель", "",
    '<div class="st-list">' +
    listRow("Своя модель по адресу", "На этом компьютере (Ollama, LM Studio) или на сервере вашей организации.", own.open ? "" : btn("Добавить", "own-open", "quiet st-button-small")) + ownForm +
    listRow("Облачный сервис по ключу", "OpenAI, Anthropic и другие. Данные разговора уходят в этот сервис.",
      mode !== "online" ? status(offNote, "wait") : cloud.open ? "" : btn("Подключить", "cloud-open", "quiet st-button-small")) + cloudForm +
    listRow("Бесплатные модели OpenCode", "Работают без входа, в облачном сервисе OpenCode.",
      mode !== "online" ? status(offNote, "wait") : s.models.some((model) => model.source === "free") ? status("Подключены", "good") : btn("Вернуть", "free-add", "quiet st-button-small")) +
    "</div>")
}

function permissionsTab(state, s) {
  const closed = state.contour === "closed"
  const rows = permissionKinds.map(([id, title, text]) => {
    const control = id === "web" && closed ? locked(permissionLabels.deny, lockReason(state))
      : '<select data-st-input="perm:' + id + '" aria-label="' + esc(title) + '">' + Object.entries(permissionLabels).map(([key, label]) => option(key, label, s.permissions[id])).join("") + "</select>"
    return listRow(title, text, control)
  }).join("")
  return card("Разрешения", "Что агент делает без вопроса, что — спросив вас, а что не делает никогда. В разговоре по-прежнему можно разрешить «один раз» или «в этом разговоре».",
    '<div class="st-list">' + rows + "</div>", btn("Как при установке", "perm-reset", "quiet")) +
    card("Терминал", "Команды на вашем компьютере: установка программ, работа с файлами вне проекта.",
      closed ? listRow("Команды в терминале", "Агент не выполняет команды на компьютере.", locked("Выключен", lockReason(state)))
        : switchRow("Разрешить агенту терминал", s.terminal ? "Включён. Агент спросит про каждую команду и покажет её целиком." : "Выключен. Включите, только если понимаете, зачем агенту команды.", "terminal", s.terminal))
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
    ["Сайты", "Агент их не открывает.", locked("Запрещены")],
    ["Обновления", "Новые версии устанавливает администратор.", locked("Выключены")],
  ] : {
    online: [["Свои навыки и действия", "Работают у вас; опубликовать для всех — после проверки Loginom."], ["Модели", "Бесплатные OpenCode, облачные по ключу и свои."], ["Loginom", "Любой адрес, в том числе публичный стенд."], ["Каталог", "Loginom Hub из интернета."], ["Сайты", "Агент открывает их, если разрешено в «Разрешениях»."], ["Обновления", "Приходят автоматически."]],
    intranet: [["Свои навыки и действия", "Работают у вас; поделиться — файлом через администратора."], ["Модели", "Только свои: на этом компьютере и в сети организации."], ["Loginom", "Сервер в сети организации; публичный стенд недоступен."], ["Каталог", "Из файла: «Каталог» → «Импорт из файла»; навыки «Сообщество» — только если разрешил администратор."], ["Сайты", "Агент их не открывает."], ["Обновления", "Сами не приходят: новую версию установщика ставите вы или администратор."]],
    device: [["Свои навыки и действия", "Работают у вас; поделиться — файлом через администратора."], ["Модели", "Только на этом компьютере."], ["Loginom", "Только на этом компьютере."], ["Каталог", "Из файла; навыки «Сообщество» — только если разрешил администратор."], ["Сайты", "Агент их не открывает."], ["Обновления", "Сами не приходят: новую версию установщика ставите вы или администратор."]],
  }[mode]
  return card("Режим работы", "Куда приложению и агенту можно обращаться по сети.", choice) +
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
    ["Модель", s.model ? esc(s.model.name + " · " + s.model.where) : "Модели нет", s.model ? (ran ? ["Отвечает", "good"] : ["Не проверена", "neutral"]) : ["Нужна модель", "error"], "models"],
    ["Документация Loginom", "Встроена в приложение", ["Работает", "good"]],
    ["Каталог", mode === "online" ? "Loginom Hub" : state.policy === "set" ? adminPolicy.catalog : "Из файла", ["Работает", "good"]],
    ["Политика администратора", state.policy ? esc(policyPath) : "Нет — настройки задаёте вы", state.policy === "broken" ? ["Ошибка в строке 7", "error"] : state.policy ? ["Применена", "good"] : ["Нет", "neutral"]],
    ["Сеть", { online: "Режим «Интернет»", intranet: "Закрытый контур, сеть организации", device: "Режим «" + deviceName + "»" }[mode], [{ online: "Интернет доступен", intranet: "Только сеть организации", device: "Сеть не используется" }[mode], "neutral"]],
    ["Служба агента", "Работает на этом компьютере", ["Работает", "good"]],
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
    '<p class="st-footnote">В отчёт не попадают пароли, ключи и содержимое разговоров.</p>'
}

function helpTab(state) {
  const policy = state.policy === "set"
  const closed = state.contour === "closed"
  return card("Справка", "Как пользоваться приложением. Документация самого Loginom встроена и доступна агенту.", '<div class="st-about brand"><picture><img class="brand-standard" src="assets/loginom-wordmark.svg" alt="Loginom"><img class="brand-inverse" src="assets/loginom-wordmark-light.png" alt="Loginom"></picture><span>AI Agent · версия 0.5.0 (прототип)</span></div><div class="st-help">' + [
    ["Подключить Loginom", policy ? "Адрес Loginom задал администратор. В «Loginom» введите пользователя и пароль, нажмите «Сохранить»."
      : closed ? "В закрытом контуре публичный стенд недоступен. В «Loginom» укажите адрес сервера вашей организации, пользователя и пароль."
        : "Адрес публичного стенда уже указан. Свой сервер — в «Loginom»: адрес, пользователь, пароль, «Проверить».", "tab:loginom", "Открыть «Loginom»"],
    ["Выбрать модель", policy ? "Модели задал администратор; в «Моделях» выберите одну из них по умолчанию."
      : "«Модели» → «Своя модель по адресу»: Ollama или LM Studio на этом компьютере или сервер вашей организации." + (closed ? "" : " Или облачный сервис по ключу."), "tab:models", "Открыть «Модели»"],
    ["Чтобы ничего не уходило в интернет", state.policy ? "Режим работы задал администратор — он отмечен замком в «Режиме работы»." : "«Режим работы» → «Закрытый контур».", "tab:contour", "Открыть «Режим работы»"],
    ["Что агент делает без вопроса", "«Разрешения»: по каждому виду действий — разрешено, спрашивать или запрещено." + (closed ? " Терминал в закрытом контуре выключен." : " Терминал выключен, пока вы его не включите."), "tab:permissions", "Открыть «Разрешения»"],
    ["Разобрать пакет Loginom", "Нажмите «+» у поля ввода и выберите пакет — над полем появятся действия с ним.", "goto:home", "Новый разговор"],
  ].map(([title, body, target, label], i) => "<details" + (i === 0 ? " open" : "") + "><summary>" + title + icon("down", 16) + "</summary><p>" + body + "</p>" + btn(label, target, "quiet st-button-small") + "</details>").join("") + "</div>")
}

function settingsBody(state, s) {
  switch (s.tab) {
    case "loginom": return loginomTab(state, s)
    case "models": return modelsTab(state, s)
    case "permissions": return permissionsTab(state, s)
    case "contour": return contourTab(state, s)
    case "diagnostics": return diagnosticsTab(state, s)
    case "help": return helpTab(state)
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
  return '<div class="st-suite st-page"><header class="st-page-head"><div><h1>Настройки</h1><p>Loginom, модели, разрешения и режим работы.</p></div>' +
    '</header><div class="st-layout"><nav class="st-nav" aria-label="Разделы настроек">' +
    sections.map(([group, tabs]) => '<div class="st-nav-group"><small>' + group + "</small>" + tabs.map(([id, label, glyph]) =>
      '<button type="button" data-st="tab:' + id + '"' + (s.tab === id ? ' aria-current="page"' : "") + ">" + icon(glyph, 16) + "<span>" + label + "</span>" +
      (state.policy === "set" && policyTabs[id] ? '<span class="st-nav-lock" title="Есть настройки администратора">' + icon("lock", 12) + "</span>" : "") + "</button>").join("") +
      "</div>").join("") + '</nav><div class="st-content">' + (state.policy ? '<div class="st-policy">' + policyBanner(state) + "</div>" : "") + settingsBody(state, s) + "</div></div>" +
    (s.leaveTo ? '<dialog aria-labelledby="st-unsaved" class="st-dialog"><h2 id="st-unsaved">Подключение Loginom не сохранено</h2><p>Вернитесь и сохраните или уйдите без сохранения.</p><footer>' +
      btn("Уйти без сохранения", "discard-loginom", "quiet") + btn("Вернуться", "stay-loginom", "primary") +
      "</footer></dialog>" : "") + "</div>"
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
  const saved = s.pendingConnection?.connection ?? s.connection
  return s.draft.url !== saved.url || s.draft.username !== saved.username || s.draft.empty !== saved.empty || Boolean(s.draft.password)
}
export function beforeSettingsLeave(state, page, tab) {
  const s = state.settings
  if (state.page !== "settings" || s?.tab !== "loginom" || !s.draft || !s.connection) return true
  if (page === "settings" && (!tab || tab === "loginom")) return true
  if (!isDirty(s)) return true
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
function announceModel(api, before, s) {
  if (before === (s.model?.name ?? "")) return
  api.toast(s.model ? "Модель по умолчанию теперь «" + s.model.name + "»" : "В этом режиме нет доступной модели — добавьте свою в «Моделях»", s.model ? undefined : "alert")
}
function downloadReport(state, s, api) {
  const mode = closedMode(state, s)
  const lines = [
    "Loginom AI Agent — отчёт диагностики (прототип)",
    "Режим работы: " + { online: "Интернет", intranet: "Закрытый контур, сеть организации", device: deviceName }[mode],
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
  const dialog = panel.querySelector(".st-dialog")
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
    if (name.startsWith("loginom-")) {
      const key = { "loginom-url": "url", "loginom-user": "username", "loginom-password": "password", "loginom-empty": "empty" }[name]
      s.draft[key] = value
      s.test = undefined
      panel.querySelector(".st-content .st-space-top .st-notice")?.remove()
      if (key === "empty") {
        if (value) s.draft.password = ""
        api.render()
      }
      return
    }
    if (name === "own-url" || name === "own-key") {
      s.own[name === "own-url" ? "url" : "key"] = value
      if (name === "own-url" && (s.own.found || s.own.error)) {
        // The old result no longer matches the address; redraw without losing the caret.
        const caret = element.selectionStart
        s.own.found = null
        s.own.error = ""
        api.render()
        const field = document.querySelector('[data-st-input="own-url"]')
        field?.focus()
        field?.setSelectionRange(caret, caret)
      }
      return
    }
    if (name === "own-pick") s.own.pick = value
    if (name === "cloud-key") s.cloud.key = value
    if (name === "cloud-service") s.cloud.service = value
    if (name === "model-default") {
      s.preferred = value
      ensureSettings(state)
      api.toast("Модель по умолчанию теперь «" + s.model.name + "»")
      api.render()
      return
    }
    if (name.startsWith("perm:")) {
      s.permissions[name.split(":")[1]] = value
      api.toast("Сохранено")
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
      s.draft = { ...(s.pendingConnection?.connection ?? s.connection), password: "" }
      s.test = undefined
      if (type === "goto") { api.navigate(next); return }
      s.tab = next
    }
    if (action === "contour") {
      const before = s.model?.name ?? ""
      api.setContour(value)
      ensureSettings(state)
      announceModel(api, before, s)
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
      api.toast(s.pendingConnection ? "Сохранено — заработает после текущего хода агента" : "Loginom подключён")
      // Back to the task only when settings were opened from it («Подключиться к Loginom», «Настроить Loginom»).
      if (state.returnTo) {
        const page = state.returnTo
        state.returnTo = null
        api.navigate(page)
        return
      }
    }
    if (action === "own-open") s.own = { open: true, url: "", key: "", found: null, pick: "", error: "" }
    if (action === "own-cancel") s.own.open = false
    if (action === "own-find") {
      const url = s.own.url.trim()
      const found = isWebUrl(url) ? foundModels(url) : null
      s.own.error = !isWebUrl(url) ? "Введите адрес, начиная с http:// или https://."
        : closedMode(state, s) === "device" && !isLocalUrl(url) ? "В режиме «" + deviceName + "» доступен только адрес на этом компьютере, например http://127.0.0.1:11434/v1."
          : !found ? "Сервер не ответил. Проверьте адрес и запущены ли Ollama или LM Studio."
            : ""
      s.own.found = s.own.error ? null : found
      s.own.pick = s.own.found?.[0] ?? ""
    }
    if (action === "own-add") {
      const local = isLocalUrl(s.own.url)
      const model = { kind: local ? "local" : "intranet", source: "own", name: s.own.pick, url: s.own.url.trim(), where: local ? "Этот компьютер" : "Сеть организации" }
      s.models = [...s.models.filter((item) => item.name !== model.name), model]
      s.preferred = model.name
      s.own.open = false
      ensureSettings(state)
      api.toast("Модель «" + model.name + "» добавлена и выбрана по умолчанию")
    }
    if (action === "cloud-open") s.cloud = { open: true, service: "OpenAI", key: "", error: "" }
    if (action === "cloud-cancel") s.cloud.open = false
    if (action === "cloud-add") {
      if (!s.cloud.key.trim()) { s.cloud.error = "Вставьте ключ из личного кабинета " + s.cloud.service + "."; api.render(); return }
      const model = { kind: "cloud", source: "cloud", name: cloudServices[s.cloud.service], where: s.cloud.service }
      s.models = [...s.models.filter((item) => item.name !== model.name), model]
      s.cloud.open = false
      api.toast(s.cloud.service + " подключён: " + model.name + ". Выбрать её можно в «Модели по умолчанию»")
    }
    if (action === "free-add") s.models = [freeModel, ...s.models]
    if (action === "model-remove") {
      const before = s.model?.name ?? ""
      const model = s.models[Number(value)]
      s.models = s.models.filter((item) => item !== model)
      ensureSettings(state)
      api.toast("Модель «" + model.name + "» убрана")
      if (before === model.name) announceModel(api, before, s)
    }
    if (action === "perm-reset") {
      s.permissions = Object.fromEntries(permissionKinds.map(([id, , , initial]) => [id, initial]))
      s.terminal = false
      api.toast("Разрешения и терминал — как при установке")
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
