import { icon } from "./icons.js"

const sections = [
  ["Подключения", [["loginom", "Loginom", "external"], ["providers", "Провайдеры", "globe"], ["models", "Модели", "cpu"], ["servers", "Серверы", "database"]]],
  ["Приложение", [["general", "Общие", "settings"], ["contour", "Режим работы", "shield"], ["shortcuts", "Горячие клавиши", "terminal"], ["help", "Справка", "help"]]],
  ["Администрирование", [["diagnostics", "Диагностика", "chart"]]],
]

const wizard = [
  ["Контур", "Выберите, где будет работать агент."],
  ["Loginom", "Подключите веб-приложение Loginom."],
  ["Модель", "Выберите, где запускается модель для чата."],
  ["Первый запуск", "Проверьте конфигурацию и перейдите к рабочему пространству."],
]

// As in 0.4: a fresh profile has the public stand filled in, empty password, not connected yet.
const defaults = {
  url: "https://app.loginom.ai",
  username: "user",
  hasPassword: false,
  empty: true,
  connected: false,
}
const modelDefaults = {
  local: { kind: "local", name: "Qwen 3 32B", url: "http://127.0.0.1:11434/v1", tested: false },
  intranet: { kind: "intranet", name: "Qwen 3 32B", url: "https://model.intra.example.test/v1", tested: false },
  cloud: { kind: "cloud", name: "GPT-5.4", url: "https://api.example.test/v1", tested: false },
}
const preferences = [
  ["agentPicker", "Выбор агента в чате", "Показывать переключатель между режимами работы агента."],
  ["reasoning", "Ход работы в чате", "Показывать краткий ход работы модели."],
  ["toolDetails", "Подробности действий", "Раскрывать вызовы инструментов в журнале по умолчанию."],
  ["fileTree", "Дерево файлов", "Показывать файлы рабочего пространства в панели просмотра."],
  ["notifications", "Уведомления о задачах", "Сообщать о завершении задачи, ошибке или запросе разрешения."],
  ["sounds", "Звуки уведомлений", "Воспроизводить звук при завершении задачи или запросе разрешения."],
  ["releaseNotes", "История версий", "Показывать сведения о версии после обновления приложения."],
]
const shortcuts = [
  ["Новая сессия", "Ctrl", "N"],
  ["Свернуть панель", "Ctrl", "B"],
  ["Настройки", "Ctrl", ","],
  ["Отправить сообщение", "Enter"],
  ["Новая строка", "Shift", "Enter"],
  ["Закрыть панель", "Esc"],
]

function esc(x = "") {
  return String(x).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch])
}
function settings(state) {
  return state.settings ??= {}
}
export function ensureSettings(state) {
  const s = settings(state)
  s.tab ??= "loginom"
  s.connection ??= { ...defaults }
  s.draft ??= { ...s.connection, password: "" }
  s.closedMode ??= "intranet"
  s.model ??= { ...modelDefaults[state.contour === "closed" ? defaultKind(s.closedMode) : "local"], tested: true }
  s.modelDraft ??= { ...s.model }
  s.theme = state.theme ?? s.theme ?? "system"
  s.preferences ??= { agentPicker: true, notifications: true, releaseNotes: true }
  s.proxy ??= "system"
  s.proxyUrl ??= ""
  s.mcp ??= true
  s.shortcuts ??= "windows"
  s.helpMode ??= state.contour === "closed" ? "local" : "online"
  s.defaultsConnectionTest ??= { help: "ready" }
  if (state.contour === "closed") restrictModels(s)
  if (s.pendingConnection && !running(state)) {
    s.connection = s.pendingConnection.connection
    s.defaultsConnectionTest = s.pendingConnection.test
    s.pendingConnection = undefined
  }
  return s
}
function flowState(state) {
  const s = ensureSettings(state)
  s.wizard ??= {
    step: 0,
    contour: state.contour,
    closedMode: s.closedMode,
    draft: { url: "", username: "", password: "", hasPassword: false, empty: false },
    modelDraft: { ...modelDefaults[state.contour === "closed" ? defaultKind(s.closedMode) : "local"], url: "", name: "" },
  }
  return s.wizard
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
  return '<div class="st-notice st-notice-' + type + '" role="status"><div class="st-notice-glyph">' + icon(type === "error" ? "alert" : type === "good" ? "check" : "help") +
    '</div><div><strong>' + title + '</strong><p>' + subtitle + '</p></div>' + action + '</div>'
}
function contourOptions(current, mode) {
  const profiles = '<div class="st-choice-grid">' + [
    ["online", "globe", "С доступом в интернет", "Облачные модели и каталог Hub по политике организации."],
    ["closed", "shield", "Закрытый контур", "Локальные модели и внутренние серверы. Hub устанавливается из файла."],
  ].map(([id, glyph, title, copy]) => '<button class="st-choice" type="button" data-st="contour:' + id + '" aria-pressed="' + (current === id) + '"><span class="st-choice-icon">' +
    icon(glyph, 20) + '</span><span class="st-choice-tick"></span><strong>' + title + "</strong><small>" + copy + "</small></button>").join("") + "</div>"
  if (current !== "closed") return profiles
  return profiles + '<div class="st-closed-mode">' +
    listRow("Доступ внутри контура", mode === "device" ? "Модель и материалы Hub хранятся на этом компьютере." : "Агент может обращаться к одобренным адресам в сети организации.",
      '<select aria-label="Доступ внутри контура" data-st-input="closed-mode">' + option("intranet", "Внутренняя сеть", mode) + option("device", "Только этот компьютер", mode) + "</select>") + "</div>"
}
function connectionForm(draft, result, isWizard, pending) {
  const help = result?.help === "ready" ? status("Справка доступна", "good") : status("Справка готова к работе", "good")
  let browser = status("Вход не проверен")
  if (result?.browser === "checking") browser = status("Проверяем вход", "wait")
  if (result?.browser === "verified") browser = status("Вход подтверждён", "good")
  if (result?.browser === "error") browser = status("Вход не подтверждён", "error")
  const feedback = result?.error
    ? notice("Проверьте параметры подключения", result.error, "error")
    : result?.browser === "verified" && result.tested
      ? notice("Подключение проверено", "Параметры вступят в силу после сохранения.", "good")
      : pending ? notice("Настройки сохранены", "Новое подключение вступит в силу после завершения текущей задачи.", "wait") : ""
  return '<section class="st-card st-connection">' + sectionHead("Веб-приложение Loginom", "Подключение для работы с пакетами, узлами и результатами сценариев.",
    btn("Демо-данные", "example-loginom", "quiet st-button-small")) +
    '<div class="st-card-body"><div class="st-form-grid">' +
    input("Адрес веб-приложения", "loginom-url", draft.url, { type: "url", placeholder: "https://loginom.example.test" }) +
    input("Имя пользователя", "loginom-user", draft.username, { placeholder: "analyst" }) +
    input("Пароль", "loginom-password", draft.password, { type: "password", disabled: draft.empty, placeholder: draft.hasPassword ? "Пароль сохранён" : "Введите пароль" }) +
    '<div class="st-field"><span>Папка пользователя</span><div class="st-readonly" data-st-folder>' + esc(draft.username ? "/" + draft.username.trim() : "/user") + '</div></div></div>' +
    '<label class="st-check"><input data-st-input="loginom-empty" type="checkbox"' + (draft.empty ? " checked" : "") + '> Использовать пустой пароль</label>' +
    '<div class="st-connection-status"><div><small>База знаний</small>' + help + '</div><div><small>Веб-приложение</small>' + browser + '</div></div>' +
    feedback + '</div><footer class="st-card-footer">' + btn("Проверить подключение", "test-loginom", "quiet") +
    (isWizard ? "" : btn("Сохранить и закрыть", "save-loginom", "primary")) + "</footer></section>"
}
function modelOptions(draft, contour, mode) {
  const options = [
    ["local", "cpu", "На этом компьютере", "Ollama или LM Studio"],
    ["intranet", "database", "Внутренний сервер", "OpenAI-совместимый API"],
    ["cloud", "globe", "Облачная модель", "Внешний провайдер"],
  ]
  return '<div class="st-model-options">' + options.map(([kind, glyph, title, desc]) => {
    const blocked = contour === "closed" && (kind === "cloud" || (mode === "device" && kind === "intranet"))
    return '<button class="st-model-choice" type="button" data-st="model-kind:' + kind + '" aria-pressed="' + (draft.kind === kind && !blocked) + '"' +
      (blocked ? ' disabled title="Заблокировано политикой контура"' : "") + '><span>' + icon(glyph, 16) +
      '</span><span><strong>' + title + '</strong><small>' + (blocked ? "Заблокировано политикой" : desc) + '</small></span></button>'
  }).join("") + "</div>"
}
function modelForm(draft, contour, wizardMode, error, mode) {
  const feedback = error
    ? notice("Проверка модели", error, "error")
    : draft.tested ? notice("Модель доступна", "В демонстрации подключение к модели успешно.", "good") : ""
  return '<section class="st-card">' + sectionHead("Подключение модели", "Модель обрабатывает запросы и вызывает доступные инструменты.",
    btn("Демо-данные", "example-model", "quiet st-button-small")) +
    '<div class="st-card-body">' + modelOptions(draft, contour, mode) +
    '<div class="st-form-grid st-space-top">' + input("Название модели", "model-name", draft.name, { placeholder: "Qwen 3 32B" }) +
    input("Адрес API", "model-url", draft.url, { type: "url", placeholder: "http://127.0.0.1:11434/v1" }) +
    '</div>' + (draft.kind === "cloud" && contour === "online" ? '<p class="st-footnote">Доступ к облачной модели задаётся в настройках провайдера.</p>' : "") +
    '<div class="st-space-top">' + feedback + '</div></div>' +
    '<footer class="st-card-footer">' + btn("Проверить модель", "test-model", "quiet") +
    (wizardMode ? "" : btn("Сохранить модель", "save-model", "primary")) + "</footer></section>"
}
function listRow(title, text, trailing = "") {
  return '<div class="st-list-row"><span><strong>' + title + '</strong><small>' + text + '</small></span>' + trailing + '</div>'
}
function option(value, label, current) {
  return '<option value="' + value + '"' + (current === value ? " selected" : "") + ">" + label + "</option>"
}
function settingsBody(state, s) {
  const closed = state.contour === "closed"
  const deviceOnly = closed && s.closedMode === "device"
  const helpMode = deviceOnly || (closed && s.helpMode === "online") ? "local" : s.helpMode
  const blockedLoginom = deviceOnly && Boolean(s.connection.url) && !isLocalUrl(s.connection.url)
  const helpReady = helpMode !== "intranet" || isWebUrl(s.helpUrl)
  switch (s.tab) {
    case "loginom":
      return connectionForm(s.draft, s.test ?? s.pendingConnection?.test ?? s.defaultsConnectionTest, false, s.pendingConnection) +
        '<section class="st-card">' + sectionHead("База знаний", "Справка по Loginom и установленные материалы Hub.") +
        '<div class="st-card-body st-list">' + listRow("Источник справки", {
          local: "Встроенная справка и материалы из установленных пакетов.",
          intranet: "Корпоративная база знаний внутри контура.",
          online: "Доступ к справочному сервису Loginom через интернет.",
        }[helpMode], '<select aria-label="Источник справки" data-st-input="help-mode">' +
          option("local", "Локальные материалы", helpMode) + (deviceOnly ? "" : option("intranet", "Внутренний сервер", helpMode)) +
          (closed ? "" : option("online", "Справочный сервис Loginom", helpMode)) + "</select>") +
        (helpMode === "intranet" ? input("Адрес базы знаний", "help-url", s.helpUrl ?? "", { type: "url", placeholder: "https://docs.intra.example.test/" }) : "") +
        '</div><footer class="st-card-footer">' + btn("Открыть Hub", "goto:hub", "quiet") + '</footer></section>'
    case "models":
      return modelForm(s.modelDraft, state.contour, false, s.modelError, s.closedMode)
    case "providers":
      return '<section class="st-card">' + sectionHead("Провайдеры моделей", "Настройте источник модели для рабочего пространства.") +
        '<div class="st-card-body st-list">' +
        listRow("Локальные модели", "Ollama и LM Studio на этом компьютере.", btn("Настроить", "provider:local", "quiet st-button-small")) +
        listRow("Корпоративный провайдер", "OpenAI-совместимый API внутри сети организации.",
          deviceOnly ? status("Заблокировано", "wait") : btn("Настроить", "provider:intranet", "quiet st-button-small")) +
        listRow("Облачные провайдеры", closed ? "Внешние API заблокированы политикой закрытого контура." : "Подключение к внешнему API провайдера.", closed ? status("Заблокировано", "wait") : btn("Настроить", "provider:cloud", "quiet st-button-small")) +
        (s.modelDraft.kind === "cloud" && !closed ? '<label class="st-field"><span>Ключ API</span><input type="password" data-st-input="provider-key" placeholder="' +
          (s.providerKeySaved ? "Ключ задан в демонстрации" : "Демо-ключ") + '" autocomplete="off"><small>Используйте вымышленное значение.</small></label>' +
          '<div class="st-inline-actions">' + btn("Сохранить провайдера", "save-provider", "primary") + "</div>" : "") + "</div></section>"
    case "servers":
      return '<section class="st-card">' + sectionHead("Серверы", "Службы агента и инструменты рабочего пространства.") +
        '<div class="st-card-body st-list">' +
        listRow("Служба Loginom AI Agent", "Встроенная локальная служба.", status("Работает", "good")) +
        switchRow("Инструменты Loginom", "Доступ к узлам и пакетам через подключённый Loginom.", "mcp", s.mcp) +
        listRow("Другие MCP-серверы", deviceOnly ? "Доступны службы на этом компьютере." : closed ? "Доступны локальные команды и внутренние адреса." : "Локальные инструменты и серверы по HTTP.", btn("Добавить сервер", "add-server", "quiet st-button-small")) +
        (s.mcpConfig ? input("Адрес MCP-сервера", "mcp-url", s.mcpUrl ?? "", { type: "url", placeholder: deviceOnly ? "http://127.0.0.1:9000/mcp" : "https://tools.intra.example.test/mcp" }) +
          '<div class="st-inline-actions">' + btn("Проверить сервер", "test-mcp", "primary") + "</div>" : "") +
        (s.mcpTest ? notice(s.mcpTest.title, s.mcpTest.text, s.mcpTest.type) : "") + "</div></section>"
    case "general":
      return '<section class="st-card">' + sectionHead("Внешний вид", "Настройте тему интерфейса для этого устройства.") +
        '<div class="st-card-body st-theme">' + [["system","Как в системе"],["light","Светлая"],["dark","Тёмная"]].map(([id, label]) =>
          '<button type="button" class="st-theme-choice" data-st="theme:' + id + '" aria-pressed="' + (s.theme === id) +
          '"><span class="st-theme-preview st-preview-' + id + '"><i></i><i></i><i></i></span><strong>' + label + '</strong></button>').join("") +
        '</div></section><section class="st-card">' + sectionHead("Рабочее пространство", "Отображение инструментов и уведомления.") +
        '<div class="st-card-body st-list">' + preferences.map(([key, label, desc]) => switchRow(label, desc, "pref:" + key, s.preferences[key])).join("") + "</div></section>"
    case "shortcuts":
      return '<section class="st-card">' + sectionHead("Горячие клавиши", "Основные действия на клавиатуре.",
        '<select aria-label="Платформа" data-st-input="shortcuts">' + option("windows", "Windows / Linux", s.shortcuts) + option("mac", "macOS", s.shortcuts) + "</select>") +
        '<div class="st-card-body st-list">' + shortcuts.map(([label, ...keys]) => listRow(label, "",
          '<span class="st-keys">' + keys.map((key) => "<kbd>" + (key === "Ctrl" && s.shortcuts === "mac" ? "⌘" : key) + "</kbd>").join("") + "</span>")).join("") +
        "</div></section>"
    case "contour":
      return '<section class="st-card">' + sectionHead("Режим работы", "Интернет или закрытый контур. Если режим задал администратор, он отмечен здесь.") +
        '<div class="st-card-body">' + contourOptions(state.contour, s.closedMode) + '<div class="st-space-top">' +
        notice(closed ? "Политика закрытого контура" : "Политика доступа к сети",
          deviceOnly ? "Доступны локальные службы. Модель, справка и пакеты Hub поставляются отдельно." :
            closed ? "Приложение использует локальные службы и внутренние адреса, одобренные администратором." : "Доступ к провайдерам и обновлениям регулируется политикой вашей организации.",
          closed ? "good" : "neutral") +
        '</div></div></section><section class="st-card">' + sectionHead("Сеть и обновления", "Настройки внешних подключений и доставки Hub.") +
        '<div class="st-card-body st-list">' + listRow("Обращения к внешним сервисам", closed ? "Только локальные и внутренние ресурсы." : "Учитываются системные настройки и политика прокси.",
          status(closed ? "Заблокированы" : "Разрешены", closed ? "wait" : "good")) +
        (deviceOnly ? "" : listRow("Прокси", "Маршрут для разрешённых сетевых запросов.",
          '<select aria-label="Прокси" data-st-input="proxy">' + option("system", "Системный", s.proxy) + option("direct", "Без прокси", s.proxy) + option("manual", "Указать адрес", s.proxy) + "</select>") +
        (s.proxy === "manual" ? input("Адрес прокси", "proxy-url", s.proxyUrl, { type: "url", placeholder: "https://proxy.intra.example.test:8080" }) : "")) +
        listRow("Доставка Loginom Hub", closed ? "Импорт подписанных пакетов через окно Hub." : "Каталог и переносимые пакеты для закрытого контура.", btn("Открыть Hub", "goto:hub", "quiet st-button-small")) +
        listRow("Обновление приложения", closed ? "Установка утверждённого дистрибутива с локального носителя." : "Проверка версий через разрешённый канал.", status(closed ? "Через администратора" : "По политике", "neutral")) +
        "</div></section>"
    case "diagnostics":
      return '<section class="st-card">' + sectionHead("Диагностика", "Проверьте доступность компонентов и сохраните отчёт для администратора.",
        btn("Сохранить отчёт", "download-report", "quiet")) +
        '<div class="st-card-body st-list">' + listRow("Веб-приложение Loginom", s.connection.url ? esc(s.connection.url) : "Адрес не задан",
          status(blockedLoginom ? "Адрес запрещён" : s.connection.connected ? "Подключено" : "Вход не подтверждён", s.connection.connected && !blockedLoginom ? "good" : "wait")) +
        listRow("Модель", esc(s.model.name) || "Модель не выбрана", status(s.model.tested ? "Доступна" : "Не проверена", s.model.tested ? "good" : "neutral")) +
        listRow("База знаний", { local: "Локальные материалы", online: "Справочный сервис Loginom", intranet: "Внутренний сервер" }[helpMode],
          status(helpReady ? "Доступна" : "Укажите адрес", helpReady ? "good" : "wait")) +
        listRow("Loginom Hub", closed ? "Локальная библиотека и импорт файла" : "Демонстрационный каталог", status(closed ? "Из файла" : "Каталог", "neutral")) +
        listRow("Внешняя сеть", closed ? "Доступ перекрыт политикой контура" : "Доступ определяется правилами организации", status(closed ? "Заблокирована" : "Разрешена", closed ? "wait" : "good")) +
        (s.diagnosticRan ? notice("Проверка завершена", "Результаты демонстрационной проверки показаны выше.", "good") : "") +
        '</div><footer class="st-card-footer">' + btn("Запустить проверку", "run-diagnostics", "primary") + '</footer></section>'
    case "help":
      return '<section class="st-card">' + sectionHead("Справка", "Подключение, работа с пакетами и доставка каталога в закрытый контур.") +
        '<div class="st-card-body st-help">' + [
          ["Подключить Loginom", "Адрес публичного стенда уже указан. Свой сервер Loginom — в разделе «Loginom».", "tab:loginom", "Открыть «Loginom»"],
          ["Выбрать модель", "Модель видна в поле ввода. Локальные модели и модели во внутренней сети — в разделе «Модели».", "tab:models", "Открыть «Модели»"],
          ["Добавить возможности без интернета", "Администратор получает пакет каталога там, где есть доступ к Hub. В закрытом контуре откройте каталог и импортируйте пакет из файла.", "goto:hub", "Открыть каталог"],
          ["Разобрать пакет Loginom", "Нажмите «+» у поля ввода и выберите пакет — над полем появятся действия с ним. Агент покажет, какие права нужны, и отчёт о результате.", "goto:home", "Новый разговор"],
        ].map(([title, body, target, label], i) => "<details" + (i === 0 ? " open" : "") + "><summary>" + title + icon("down", 16) + "</summary><p>" + body + "</p>" + btn(label, target, "quiet st-button-small") + "</details>").join("") +
        "</div></section>"
    default:
      return ""
  }
}

export function renderSettings(state) {
  const s = ensureSettings(state)
  return '<div class="st-suite st-page"><header class="st-page-head"><div><h1>Настройки</h1><p>Подключения, модели, режим работы и справка.</p></div>' +
    '</header><div class="st-layout"><nav class="st-nav" aria-label="Разделы настроек">' +
    sections.map(([group, tabs]) => '<div class="st-nav-group"><small>' + group + "</small>" + tabs.map(([id, label, glyph]) =>
      '<button type="button" data-st="tab:' + id + '"' + (s.tab === id ? ' aria-current="page"' : "") + '>' + icon(glyph, 16) + "<span>" + label + "</span></button>").join("") +
      "</div>").join("") + '</nav><div class="st-content">' + settingsBody(state, s) + "</div></div>" +
    (s.leaveTo ? '<dialog aria-labelledby="st-unsaved" class="st-dialog"><h2 id="st-unsaved">Есть несохранённые настройки</h2><p>Вернитесь к редактированию или закройте настройки без сохранения.</p><footer>' +
      btn("Закрыть без сохранения", "discard-loginom", "quiet") + btn("Продолжить редактирование", "stay-loginom", "primary") +
      "</footer></dialog>" : "") + "</div>"
}

export function renderOnboarding(state) {
  const w = flowState(state)
  let body = ""
  if (w.step === 0) {
    body = '<section class="st-card">' + sectionHead("Профиль сети", "Доступные источники и способы доставки Hub зависят от профиля.") +
      '<div class="st-card-body">' + contourOptions(w.contour, w.closedMode) + '</div></section>'
  }
  if (w.step === 1) body = connectionForm(w.draft, w.test, true, false)
  if (w.step === 2) body = modelForm(w.modelDraft, w.contour, true, w.modelError, w.closedMode)
  if (w.step === 3) {
    body = '<section class="st-card">' + sectionHead("Рабочее пространство готово", "Подключения можно изменить в настройках.") +
      '<div class="st-card-body st-list">' +
      listRow("Контур", w.contour === "closed" ? (w.closedMode === "device" ? "Только этот компьютер" : "Локальные службы и сеть организации") : "Доступ по политике организации",
        status(w.contour === "closed" ? "Закрытый" : "С интернетом", "good")) +
      listRow("Loginom", w.draft.url ? esc(w.draft.url) : "Можно добавить позже",
        status(w.test?.browser === "verified" ? "Вход подтверждён" : "Вход не проверен", w.test?.browser === "verified" ? "good" : "neutral")) +
      listRow("Модель", esc(w.modelDraft.name) || "Можно добавить позже",
        status(w.modelDraft.tested ? "Доступна" : "Не проверена", w.modelDraft.tested ? "good" : "neutral")) +
      listRow("Loginom Hub", w.contour === "closed" ? "Перенесите пакет Hub и импортируйте его из файла." : "Расширения, сценарии и база знаний из каталога.",
        btn("Открыть Hub", "finish:hub", "quiet st-button-small")) + "</div></section>"
  }
  return '<div class="st-suite st-page st-onboarding"><header class="st-page-head"><div><div class="eyebrow">Первый запуск</div><h1>Настройка Loginom AI Agent</h1><p>' +
    wizard[w.step][1] + '</p></div>' + btn("Закрыть", "goto:settings", "quiet") + '</header>' +
    '<ol class="st-steps" aria-label="Этапы настройки">' + wizard.map(([name], index) => '<li' +
      (w.step === index ? ' aria-current="step"' : "") + ' class="' + (w.step > index ? "complete" : "") + '"><span>' +
      (w.step > index ? "✓" : index + 1) + "</span>" + name + "</li>").join("") + '</ol><div class="st-wizard-content">' +
    body + '</div><footer class="st-wizard-footer">' +
    (w.step > 0 ? btn("Назад", "wizard-back", "quiet") : "<span></span>") + '<div class="st-inline-actions">' +
    ([1, 2].includes(w.step) ? btn("Настроить позже", "wizard-skip", "quiet") : "") +
    (w.step === 3 ? btn("Перейти к работе", "finish:home", "primary") :
      btn(w.step === 0 ? "Продолжить" : "Сохранить и продолжить", "wizard-next", "primary")) + "</div></footer></div>"
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
function connectionError(draft, contour, mode) {
  if (!isWebUrl(draft.url)) return "Введите адрес Loginom, начиная с http:// или https://."
  if (contour === "closed" && mode === "device" && !isLocalUrl(draft.url)) return "Для профиля «Только этот компьютер» укажите локальный адрес, например http://127.0.0.1:8080."
  if (!draft.username.trim()) return "Укажите имя пользователя."
  if (!draft.password && !draft.hasPassword && !draft.empty) return "Введите пароль или выберите использование пустого пароля."
  return ""
}
function modelError(draft, contour, mode) {
  if (contour === "closed" && draft.kind === "cloud") return "Выберите локальную модель или внутреннего провайдера."
  if (!draft.name.trim()) return "Укажите название модели."
  if (!isWebUrl(draft.url)) return "Введите действительный адрес API."
  if (contour === "closed" && mode === "device" && (draft.kind !== "local" || !isLocalUrl(draft.url))) return "Укажите API модели на этом компьютере."
  return ""
}
function savedConnection(draft, verified) {
  const { password, ...saved } = draft
  return { ...saved, username: saved.username.trim(), hasPassword: Boolean(!saved.empty && (password || saved.hasPassword)), connected: verified }
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
function setKind(target, kind) {
  target.modelDraft = { ...modelDefaults[kind], name: "", url: "" }
  target.modelError = ""
}
function running(state) {
  return state.activeRun === true || state.running === true || state.activeRun?.status === "running"
}
function defaultKind(mode) {
  return mode === "device" ? "local" : "intranet"
}
function restrictModels(target) {
  const rejected = (model) => model.kind === "cloud" || (target.closedMode === "device" && model.kind !== "local")
  if (rejected(target.modelDraft)) setKind(target, defaultKind(target.closedMode))
  if (target.model && rejected(target.model)) target.model = { ...target.modelDraft }
}

export function bindSettings(root, state, api) {
  const panel = root.querySelector(".st-suite")
  if (!panel) return
  const s = ensureSettings(state)
  const inWizard = state.page === "onboarding" || panel.classList.contains("st-onboarding")
  const target = inWizard ? flowState(state) : s
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
  const handleInput = (event) => {
    const element = event.target
    const name = element.dataset.stInput
    if (!name) return
    const value = element.type === "checkbox" ? element.checked : element.value
    if (name.startsWith("loginom-")) {
      const key = { "loginom-url": "url", "loginom-user": "username", "loginom-password": "password", "loginom-empty": "empty" }[name]
      if (!key) return
      target.draft[key] = value
      target.test = { browser: "idle" }
      for (const node of panel.querySelectorAll(".st-connection .st-connection-status > div:last-child .st-status")) {
        node.outerHTML = status("Вход не проверен")
      }
      panel.querySelector(".st-connection .st-notice")?.remove()
      if (key === "username") panel.querySelector("[data-st-folder]").textContent = value.trim() ? "/" + value.trim() : "/user"
      if (key === "empty") {
        if (value) target.draft.password = ""
        api.render()
      }
    }
    if (name.startsWith("model-")) {
      target.modelDraft[name === "model-name" ? "name" : "url"] = value
      target.modelDraft.tested = false
      target.modelError = ""
      panel.querySelector(".st-content .st-notice, .st-wizard-content .st-notice")?.remove()
    }
    if (name.startsWith("pref:")) s.preferences[name.split(":")[1]] = value
    if (name === "proxy") { s.proxy = value; api.render() }
    if (name === "proxy-url") s.proxyUrl = value
    if (name === "help-mode") { s.helpMode = value; api.render() }
    if (name === "help-url") s.helpUrl = value
    if (name === "shortcuts") { s.shortcuts = value; api.render() }
    if (name === "mcp") s.mcp = value
    if (name === "mcp-url") s.mcpUrl = value
    if (name === "provider-key") s.providerKeyDraft = Boolean(value)
    if (name === "closed-mode") {
      target.closedMode = value
      restrictModels(target)
      api.render()
    }
  }
  panel.addEventListener("input", handleInput)
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
      if (inWizard) {
        target.contour = value
        if (value === "closed") restrictModels(target)
      } else {
        if (value === "closed") restrictModels(s)
        api.setContour(value)
        return
      }
    }
    if (action === "example-loginom") {
      const deviceOnly = (inWizard ? target.contour : state.contour) === "closed" && target.closedMode === "device"
      target.draft = { url: deviceOnly ? "http://127.0.0.1:8080/" : defaults.url, username: defaults.username, password: "demo-loginom", hasPassword: false, empty: false }
      target.test = { browser: "idle" }
    }
    if (action === "test-loginom") {
      const error = connectionError(target.draft, inWizard ? target.contour : state.contour, target.closedMode)
      target.test = error ? { browser: "error", error } :
        target.draft.url.includes("unavailable") ? { help: "ready", browser: "error", error: "Справка доступна. Сервер Loginom не ответил. Проверьте адрес и сетевую политику." } :
          { help: "ready", browser: "verified", tested: true }
    }
    if (action === "save-loginom") {
      const error = connectionError(target.draft, state.contour, s.closedMode)
      if (error) { target.test = { browser: "error", error }; api.render(); return }
      const browser = (s.test ?? s.defaultsConnectionTest).browser
      const next = { connection: savedConnection(s.draft, browser === "verified"), test: { help: "ready", browser } }
      if (running(state)) s.pendingConnection = next
      else {
        s.connection = next.connection
        s.defaultsConnectionTest = next.test
      }
      s.draft = { ...next.connection, password: "" }
      s.test = undefined
      api.toast(s.pendingConnection ? "Настройки применятся после завершения задачи" : "Подключение Loginom сохранено")
      api.navigate("home")
      return
    }
    if (action === "provider") {
      setKind(s, value)
      if (value !== "cloud") s.tab = "models"
    }
    if (action === "save-provider") {
      if (!s.providerKeyDraft) { api.toast("Введите демонстрационный ключ"); return }
      s.providerKeySaved = true
      s.providerKeyDraft = false
      s.tab = "models"
      api.toast("Провайдер сохранён в демонстрации")
    }
    if (action === "model-kind" && target.modelDraft.kind !== value) setKind(target, value)
    if (action === "example-model") {
      target.modelDraft = { ...modelDefaults[target.modelDraft.kind] }
      target.modelError = ""
    }
    if (action === "test-model" || action === "save-model") {
      const error = modelError(target.modelDraft, inWizard ? target.contour : state.contour, target.closedMode)
      target.modelError = error || (target.modelDraft.url.includes("unavailable") ? "Модель недоступна. Проверьте адрес сервера и сеть." : "")
      if (target.modelError) target.modelDraft.tested = false
      if (action === "test-model" && !target.modelError) target.modelDraft.tested = true
      if (action === "save-model" && !target.modelError) {
        s.model = { ...s.modelDraft }
        api.toast("Модель сохранена")
      }
    }
    if (action === "theme") {
      s.theme = value
      if (api.setTheme) api.setTheme(value)
      else {
        state.theme = value
        const dark = value === "dark" || (value === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
        document.documentElement.dataset.theme = dark ? "dark" : "light"
      }
    }
    if (action === "add-server") s.mcpConfig = !s.mcpConfig
    if (action === "test-mcp") {
      const deviceOnly = state.contour === "closed" && s.closedMode === "device"
      s.mcpTest = deviceOnly && !isLocalUrl(s.mcpUrl)
        ? { title: "Укажите локальный адрес", text: "Этот профиль разрешает подключение к службам на текущем компьютере.", type: "error" }
        : isWebUrl(s.mcpUrl)
        ? { title: "Сервер доступен", text: "Демонстрационная проверка завершена.", type: "good" }
        : { title: "Укажите адрес MCP-сервера", text: "Адрес должен начинаться с http:// или https://.", type: "error" }
    }
    if (action === "run-diagnostics") s.diagnosticRan = true
    if (action === "download-report") {
      const blob = new Blob([
        "Loginom AI Agent — демонстрационная диагностика\n",
        "Контур: " + (state.contour === "closed" ? "закрытый" : "с интернетом") + "\n",
        "Loginom: " + (s.connection.connected ? "подключён" : "вход не подтверждён") + "\n",
        "Модель: " + (s.model.tested ? "доступна" : "не проверена") + "\n",
        "Loginom Hub: " + (state.contour === "closed" ? "импорт из файла" : "каталог") + "\n",
        "Адреса, ключи и пользовательские данные исключены.\n",
      ], { type: "text/plain;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = "loginom-agent-diagnostics.txt"
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      api.toast("Отчёт сохранён")
      return
    }
    if (action === "wizard-back") target.step -= 1
    if (action === "wizard-next") {
      const error = target.step === 1 ? connectionError(target.draft, target.contour, target.closedMode) :
        target.step === 2 ? modelError(target.modelDraft, target.contour, target.closedMode) : ""
      if (error) {
        if (target.step === 1) target.test = { browser: "error", error }
        else target.modelError = error
        api.render()
        return
      }
      target.step += 1
    }
    if (action === "wizard-skip") {
      if (target.step === 1) {
        target.test = undefined
        target.draft = { url: "", username: "", password: "", hasPassword: false, empty: false }
      } else target.modelDraft = { ...target.modelDraft, name: "", url: "", tested: false }
      target.step += 1
    }
    if (action === "finish") {
      s.closedMode = target.closedMode
      if (target.draft.url) {
        s.connection = savedConnection(target.draft, target.test?.browser === "verified")
        s.draft = { ...s.connection, password: "" }
        s.defaultsConnectionTest = { help: "ready", browser: target.test?.browser ?? "idle" }
        s.test = undefined
      }
      if (target.modelDraft.name) {
        s.model = { ...target.modelDraft }
        s.modelDraft = { ...s.model }
      }
      if (target.contour === "closed") restrictModels(s)
      api.setContour(target.contour)
      s.wizard = undefined
      api.navigate(value)
      return
    }
    api.render()
  })
}
