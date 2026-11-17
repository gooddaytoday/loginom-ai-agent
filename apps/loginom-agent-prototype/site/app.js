import { editedPackageBase64 } from './edited-package.js'
import { icon } from './icons.js'
import { renderHub, bindHub, hubHasInstalled, openHubSolution } from './hub.js'
import { renderSettings, renderOnboarding, bindSettings, ensureSettings, beforeSettingsLeave } from './settings.js'
import { renderSolutions, bindSolutions, initSolutionDrafts } from './solutions.js'
import { actions as packageActions, byId } from './catalog.js'

const $ = (selector, scope = document) => scope.querySelector(selector)
const app = $('#app')
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem('loginom-demo-' + key)) ?? fallback } catch { return fallback }
}
const write = (key, value) => {
  try { localStorage.setItem('loginom-demo-' + key, JSON.stringify(value)) } catch {}
}
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch])
const pages = {
  home:'Главная', chat:'Разговор', hub:'Решения', loginom:'Пакеты',
  runner:'Запуск решения', studio:'Создать решение', settings:'Настройки', onboarding:'Первый запуск', help:'Справка',
}
const examples = [
  { id:'abc', title:'ABC-анализ товаров', label:'Аналитика продаж', icon:'chart', tone:'red', detail:'Сгруппировать товары по вкладу в выручку', prompt:'Построй ABC-анализ товаров по выручке в Loginom. Используй демонстрационные данные и сохрани результат как сценарий.' },
  { id:'refactor', title:'Проверить сценарий', label:'Аудит', icon:'flow', tone:'blue', detail:'Найти проблемы в пакете Loginom', prompt:'Проверь сценарий продаж и покажи, что можно улучшить.' },
  { id:'quality', title:'Проверить данные', label:'Качество данных', icon:'shield', tone:'violet', detail:'Найти пропуски и дубликаты в таблице', prompt:'Проверь демонстрационные продажи на пропуски и дубликаты. Покажи результат в таблице.' },
]
const seed = [
  {id:'seed-sales', title:'ABC-анализ товаров', date:'Сегодня', phase:'done', prompt:examples[0].prompt, kind:'abc', files:['sales-demo.csv'], project:'Аналитика продаж'},
  {id:'seed-flow', title:'Проверка сценария продаж', date:'Вчера', phase:'done', prompt:examples[1].prompt, kind:'refactor', files:['Продажи.lgp'], project:'Аналитика продаж'},
  {id:'seed-data', title:'Контроль качества выгрузки', date:'Вчера', phase:'done', prompt:examples[2].prompt, kind:'quality', files:['sales-demo.csv'], project:'Аналитика продаж'},
]
const packageViews = {
  sales:[
    ['database','CSV продаж','Входные данные','Демонстрационный CSV · 2 400 строк'],
    ['layers','Подготовка','Преобразование','Проверка пропусков и нормализация форматов'],
    ['chart','ABC-анализ','Расчёт','Группировка по накопленной доле выручки'],
    ['file','Результат','Выход','120 товаров · 3 группы'],
  ],
  quality:[
    ['database','Приём данных','Входные данные','Демонстрационная таблица · 2 400 строк'],
    ['layers','Проверка полей','Преобразование','Проверяются обязательные поля и типы данных'],
    ['shield','Поиск дублей','Контроль','Проверяются повторяющиеся ключи'],
    ['file','Отчёт','Выход','Образец отчёта о качестве данных'],
  ],
  calculation:[
    ['database','JS: Category, amount','Входные данные','Три учебные строки с суммами 10, 20 и 25'],
    ['chart','amount_double','Калькулятор','Формула для расчётного поля'],
    ['layers','Порядок колонок CSV','Подготовка','Столбцы Category, amount и amount_double'],
    ['file','ExportCSV','Выход','Сохранение результата в CSV'],
  ],
  local:[
    ['database','Источник','Входные данные','Пример входного узла'],
    ['layers','Подготовка','Преобразование','Пример обработки входной таблицы'],
    ['flow','Обработка','Расчёт','Пример вычислительного узла'],
    ['file','Результат','Выход','Пример выходной таблицы'],
  ],
}
const exampleEditPrompt = 'Измени формулу в узле amount_double с amount * 2 на amount * 3.'
const editablePackage = {id:'sales-edit',name:'Расчёт суммы.lgp',scope:'personal',folder:'',modified:'2026-11-15',size:'0,1 МБ',view:'calculation'}
// Demo storage of ~50 packages. Loginom lists storage one folder at a time (name, modified, size),
// so the picker browses folders instead of showing «all packages». Rows: name|modified|size in MB.
const demoFolders = {
  'personal|':['Отток клиентов|2026-11-10|2,1','Прогноз спроса|2026-11-06|3,4','Сегментация клиентов|2026-11-03|1,7','Скоринг заявок|2026-10-29|2,6','Остатки на складах|2026-10-27|0,9','Выручка по регионам|2026-10-21|1,1','Анализ корзины|2026-10-14|1,9','Проверка справочников|2026-10-09|0,4','Дебиторская задолженность|2026-10-02|0,7','Кассовые разрывы|2026-09-25|0,6','Маржинальность|2026-09-18|1,3','Ассортиментная матрица|2026-09-11|1,0','Сезонность продаж|2026-09-04|1,5'],
  'personal|Отчёты':['Еженедельный отчёт|2026-11-14|0,8','Отчёт для правления|2026-11-01|1,2','Ежемесячные продажи|2026-10-31|1,4','KPI отделов|2026-10-15|0,9','Отчёт по возвратам|2026-09-30|0,5','План-факт|2026-09-15|0,7','Отчёт по закупкам|2026-08-29|0,6'],
  'personal|Черновики':['Новый сценарий|2026-11-13|0,1','Тест импорта|2026-11-08|0,2','Черновик модели|2026-10-25|0,8','Проба Python|2026-10-12|0,1','Копия Продажи|2026-09-20|1,2'],
  'personal|Архив':['Продажи 2025|2026-01-20|2,4','Продажи 2024|2025-01-15|2,2','Отток 2025|2025-12-10|1,8','Прогноз 2025|2025-11-30|3,0','Скоринг v1|2025-10-04|2,0','Скоринг v2|2025-12-22|2,3','Остатки 2025|2025-12-29|0,8','Сегменты 2024|2024-12-12|1,4','Акции Q1|2025-03-31|0,6','Акции Q2|2025-06-30|0,6','Акции Q3|2025-09-30|0,7','Акции Q4|2025-12-31|0,7','Миграция CRM|2025-08-14|1,1','Старый отчёт|2024-06-01|0,3'],
  'shared|':['Справочник товаров|2026-10-30|0,5','Единая витрина|2026-10-18|4,2','Контроль НСИ|2026-10-05|0,6','Курсы валют|2026-09-28|0,2'],
  'shared|Шаблоны':['Шаблон отчёта|2026-08-20|0,3','Шаблон загрузки|2026-07-15|0,2','Шаблон ABC|2026-06-02|0,4','Шаблон проверки|2026-05-19|0,3'],
}
const serverPackages = [
  {id:'sales',name:'Продажи.lgp',scope:'personal',folder:'',modified:'2026-11-16',size:'1,2 МБ',view:'sales'},
  {id:'quality',name:'Качество данных.lgp',scope:'personal',folder:'',modified:'2026-11-12',size:'0,8 МБ',view:'quality'},
  editablePackage,
  {id:'control',name:'Контроль загрузок.lgp',scope:'shared',folder:'',modified:'2026-11-11',size:'0,6 МБ',view:'quality'},
  {id:'summary',name:'Сводка продаж.lgp',scope:'shared',folder:'',modified:'2026-11-09',size:'0,9 МБ',view:'sales'},
  ...Object.entries(demoFolders).flatMap(([key,rows]) => rows.map((row,index) => {
    const [name,modified,size] = row.split('|')
    const [scope,folder] = key.split('|')
    return {id:key + '#' + index, name:name + '.lgp', scope, folder, modified, size:size + ' МБ', view:'local'}
  })),
]
const state = {
  page:'home', contour:read('contour','online'), theme:read('theme','light'),
  project:'Аналитика продаж', projects:['Аналитика продаж','Демо-проекты'], session:null, tabs:[],
  sessions:[...seed], overlay:null, mobile:false, draft:'', draftFiles:[], mode:'Выполнение',
  solution:'refactor', review:false, reviewTab:'plan', activeRun:false,
  activePackage:serverPackages[0], importedPackages:[], packageScope:'personal',
  packageQuery:'', packageDir:'', packageSort:'date', packageDeep:false, pendingAction:null,
  // Packages the user worked with in this app: the app's own history, not a Loginom feature.
  recentPackages:[{id:'sales',what:'документирование',when:'сегодня'},{id:'sales-edit',what:'изменение в разговоре',when:'вчера'},
    {id:'control',what:'проверка',when:'11 ноября'},{id:'quality',what:'просмотр',when:'10 ноября'}],
  localPackage:null, packageError:'',
  calculationChanged:false, versionName:'', versionError:'',
}
const route = () => {
  const key = location.hash.slice(1).split('/')[0]
  if (key === 'runner' && !hubHasInstalled(state,state.solution)) {
    state.page = 'hub'
    history.replaceState(null,'','#hub')
  } else if (Object.hasOwn(pages, key) && key !== 'chat') state.page = key
  else if (key !== 'chat' || !state.session) state.page = 'home'
}
route()
initSolutionDrafts(state)

const api = {
  icon, render, toast, navigate, setContour, setTheme, useTemplate, runSolution, discuss,
}
function canNavigate(page, tab) {
  if (beforeSettingsLeave(state,page,tab)) return true
  state.overlay = null
  render()
  return false
}
function navigate(page) {
  if (!Object.hasOwn(pages, page) || !canNavigate(page)) return
  state.page = page
  state.overlay = null
  state.mobile = false
  if (location.hash !== '#' + page) history.pushState(null, '', '#' + page)
  render(true)
}
function setContour(contour) {
  state.contour = contour === 'closed' ? 'closed' : 'online'
  write('contour',state.contour)
  render()
}
function setTheme(theme) {
  state.theme = ['light','dark','system'].includes(theme) ? theme : 'light'
  write('theme',state.theme)
  render()
}
function setThemeAttribute() {
  document.documentElement.dataset.theme = state.theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light') : state.theme
}
function toast(message) {
  const el = $('#announcements')
  el.innerHTML = `<span>${icon('check',16)}${esc(message)}</span>`
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => { el.innerHTML = '' }, 3800)
}
function useTemplate(title, prompt) {
  newSession()
  state.draft = prompt
  state.templateTitle = title
  render()
  $('#prompt')?.focus()
}
function runSolution(id, mode = 'review', from = 'hub') {
  if (!hubHasInstalled(state,id)) {
    openHubSolution(state,id)
    return navigate('hub')
  }
  state.solution = id
  state.solutionMode = mode
  state.runnerFrom = from
  navigate('runner')
}
// Runs a package action (document/check/improve/compare) for a chosen package.
function runAction(actionId, pkg, from) {
  const action = packageActions[actionId]
  if (pkg.id) rememberPackage(pkg.id, actionNoun[actionId])
  state.runnerPackage = pkg
  runSolution(action.solution, action.mode, from)
}
function packageRef(item) {
  return {id:item.id, name:item.name, where:'Loginom · ' + packagePath(item), source:'loginom'}
}
const actionNoun = {document:'документирование', check:'проверка', improve:'улучшение', compare:'сравнение'}
function rememberPackage(id, what) {
  state.recentPackages = [{id, what, when:'только что'}, ...state.recentPackages.filter(item => item.id !== id)].slice(0,5)
}
// Opens a new conversation about a finished run, with its report attached.
function discuss(title, prompt, files) {
  newSession()
  state.draft = prompt
  state.draftFiles = files
  state.templateTitle = title
  render()
  $('#prompt')?.focus()
}
function newSession() {
  if (!canNavigate('home')) return
  state.session = null
  state.draft = ''
  state.templateTitle = ''
  state.draftFiles = []
  state.review = false
  navigate('home')
}
function openSession(id) {
  const item = state.sessions.find(entry => entry.id === id)
  if (!item || !canNavigate('chat')) return
  state.project = item.project
  state.session = id
  if (!state.tabs.includes(id)) state.tabs = [...state.tabs.slice(-3),id]
  state.review = false
  state.draft = ''
  state.draftFiles = []
  navigate('chat')
}
function settingsTab(tab) {
  if (!canNavigate('settings',tab)) return
  state.settings ??= {}
  state.settings.tab = tab
  navigate('settings')
}
function navButton(page, glyph, label = pages[page]) {
  const origin = state.page === 'runner' ? ({loginom:'loginom', home:'home'}[state.runnerFrom] || 'hub') : state.page === 'studio' ? 'hub' : state.page
  const selected = origin === page
  return `<button class="nav-item${selected ? ' selected' : ''}" ${selected ? 'aria-current="page"' : ''} data-go="${page}">${icon(glyph,17)}<span>${label}</span></button>`
}
function sidebar() {
  const history = state.sessions.filter(item => item.project === state.project).slice(0,6)
  return `<aside class="sidebar${state.mobile ? ' expanded' : ''}" aria-label="Боковая панель">
    <button class="brand" data-go="home" aria-label="Loginom AI Agent, рабочее пространство">
      <picture><img class="brand-standard" src="assets/loginom-wordmark.svg" alt="Loginom"><img class="brand-inverse" src="assets/loginom-wordmark-light.png" alt="Loginom"></picture><span>AI Agent</span>
    </button>
    <button class="project-switch" data-overlay="projects" aria-label="Выбрать проект">
      <span class="project-avatar">${icon('folder',16)}</span><span class="project-text"><strong>${esc(state.project)}</strong><small>Рабочий проект</small></span>${icon('down',14)}
    </button>
    <button class="btn new-session" data-action="new">${icon('plus',17)} Новый разговор <kbd>⌘ N</kbd></button>
    <nav class="sidenav" aria-label="Рабочее пространство">
      ${navButton('home','home','Главная')}
      ${navButton('loginom','flow','Пакеты')}
      ${navButton('hub','grid','Решения')}
    </nav>
    <section class="sidebar-history" aria-label="Недавние разговоры">
      <h2>Недавние <button class="small-icon" data-overlay="search" aria-label="Найти разговор">${icon('more',16)}</button></h2>
      ${history.length ? history.map(item => `<button class="session-link${state.page === 'chat' && state.session === item.id ? ' current':''}" data-session="${item.id}">${icon('message',15)}<span>${esc(item.title)}</span></button>`).join('') : '<p class="muted">Разговоры появятся здесь</p>'}
    </section>
    <nav class="sidebar-footer" aria-label="Настройки и справка">
      ${navButton('settings','settings')}${navButton('help','help')}
      ${connectionCard()}
      <p class="prototype-mark">Прототип · итерация 1</p>
    </nav>
  </aside>`
}
function connectionCard() {
  const connected = state.settings.connection.connected
  const model = state.settings?.model?.name || 'Демо-модель'
  return `<button class="conn-card" data-settings="loginom" title="Подключение к Loginom и модель">
    <i class="conn-dot ${connected ? 'ok' : 'warn'}"></i>
    <span><strong>${connected ? 'Loginom подключён' : 'Loginom не подключён'}</strong><small>Модель: ${esc(model)}</small></span>${icon('chevron',14)}</button>`
}
function header() {
  const nativeTab = state.page === 'chat' || state.page === 'home'
  return `<header class="topbar">
    <div class="top-left">
      <button class="icon-btn mobile-menu" aria-label="Открыть меню" aria-expanded="${state.mobile}" data-action="menu">${icon('menu',20)}</button>
      <span class="crumb">${esc(state.project)}</span><span class="crumb-arrow">${icon('chevron',11)}</span><span class="crumb-current">${pages[state.page]}</span>
    </div>
    <div class="top-actions">
      <button class="mode-btn${state.contour === 'closed' ? ' closed' : ''}" data-overlay="contour">${icon(state.contour === 'closed' ? 'lock':'globe',15)}<span>${state.contour === 'closed' ? 'Закрытый контур':'Интернет'}</span>${icon('down',13)}</button>
      <button class="icon-btn" title="Поиск (⌘ K)" aria-label="Поиск по приложению" data-overlay="search">${icon('search',18)}</button>
      <button class="icon-btn theme-btn" title="Переключить цветовую схему" aria-label="Переключить цветовую схему" data-action="theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon',17)}</button>
    </div>
  </header>
  ${nativeTab && state.tabs.length ? `<nav class="session-tabs" aria-label="Открытые разговоры">
    <button class="session-tab${state.page === 'home' ? ' active':''}" data-go="home" aria-label="Главная">${icon('home',15)}</button>
    ${state.tabs.map(id => {
      const item = state.sessions.find(x => x.id === id)
      return `<div class="tab-wrap${state.page === 'chat' && state.session === id ? ' active':''}"><button class="session-tab" data-session="${id}">${icon('message',14)}<span>${esc(item?.title)}</span></button><button class="small-icon tab-close" aria-label="Закрыть вкладку ${esc(item?.title)}" data-close-tab="${id}">${icon('close',13)}</button></div>`
    }).join('')}
    <button class="session-tab" data-action="new" aria-label="Новый разговор">${icon('plus',16)}</button>
  </nav>` : ''}`
}
function composer() {
  const selectedModel = state.settings?.model
  const modelName = state.contour === 'closed'
    ? (selectedModel && selectedModel.kind !== 'cloud' ? selectedModel.name : 'Локальная модель')
    : (selectedModel?.name || 'Демо-модель')
  return `<form class="composer" id="composer">
    ${state.draftFiles.length ? `<div class="attachment-list">${state.draftFiles.map((file,i) => `<span>${icon('file',14)} ${esc(file)} <button type="button" class="small-icon" aria-label="Убрать ${esc(file)}" data-remove-file="${i}">${icon('close',13)}</button></span>`).join('')}</div>` : ''}
    <textarea id="prompt" aria-label="Сообщение агенту" placeholder="Опишите задачу или прикрепите файл…" rows="2">${esc(state.draft)}</textarea>
    <div class="composer-toolbar">
      <div class="composer-options">
        <button class="icon-btn neutral" type="button" aria-label="Прикрепить файл" title="Прикрепить файл" data-overlay="attach">${icon('paperclip',17)}</button>
        <span class="divider"></span>
        ${state.settings.preferences.agentPicker ? `<button class="filter-btn" type="button" data-overlay="agent-mode">${icon(state.mode === 'Планирование' ? 'layers' : 'spark',15)} ${state.mode} ${icon('down',12)}</button>` : ''}
        <button class="filter-btn composer-model" type="button" data-settings="models">${icon('cpu',15)} <span class="filter-label">${esc(modelName)}</span> ${icon('down',12)}</button>
      </div>
      <button class="send-btn" type="submit" ${state.draft.trim() ? '' : 'disabled'} aria-label="Отправить сообщение" title="Отправить сообщение">${icon('up',20)}</button>
    </div>
  </form>`
}
function home() {
  const closed = state.contour === 'closed'
  const current = state.sessions.filter(item => item.project === state.project).slice(0,3)
  return `<div class="home-area">
    <section class="welcome">
      <div class="welcome-text">
        <span class="welcome-app"><img src="assets/loginom.png" alt="" width="31" height="31"> Loginom AI Agent</span>
        <h1>С чего начнём?</h1>
        <p>Создавайте сценарии в Loginom, проверяйте данные и используйте готовые решения Hub.</p>
      </div>
      <div class="hero-diagram" aria-hidden="true">
        <span class="hero-orbit orbit-one"></span><span class="hero-orbit orbit-two"></span><span class="hero-orbit orbit-three"></span>
        <span class="diagram-line diagram-l1"></span><span class="diagram-line diagram-l2"></span><span class="diagram-line diagram-l3"></span>
        <span class="hero-node hero-dataset">${icon('database',25)}</span><span class="hero-node hero-flow">${icon('flow',29)}</span><span class="hero-node hero-chart">${icon('chart',24)}</span><span class="hero-node hero-check">${icon('check',16)}</span>
      </div>
    </section>
    <section class="starter" aria-label="Новый разговор">
      ${composer()}
      <div class="composer-context"><span>${icon(closed ? 'lock':'shield',15)}${closed ? 'Закрытый контур · локальные источники':'Демонстрационные данные и сценарии'}</span><button class="link-btn" data-go="onboarding">Мастер первого запуска ${icon('arrow',15)}</button></div>
    </section>
    ${state.settings.connection.connected ? '' : `<div class="connect-banner">${icon('alert',18)}<span><strong>Подключите Loginom.</strong> Без подключения агент может отвечать на вопросы, но не открывает и не меняет пакеты.</span><button class="btn primary" data-settings="loginom">Подключить</button></div>`}
    <section class="scenario-section">
      <div class="section-bar"><h2>Работа с пакетом</h2><button class="link-btn" data-go="loginom">Все пакеты ${icon('arrow',16)}</button></div>
      <div class="action-grid">${Object.entries(packageActions).map(([id,action]) => actionTile(id,action)).join('')}</div>
    </section>
    <section class="scenario-section">
      <div class="section-bar"><h2>Примеры задач</h2><button class="link-btn" data-go="hub">Все решения ${icon('arrow',16)}</button></div>
      <div class="example-grid">${examples.map(item => `<button class="example-card" data-example="${item.id}">
        <div class="example-top"><span class="glyph ${item.tone}">${icon(item.icon,19)}</span>${icon('external',15)}</div><strong>${item.title}</strong><span>${item.detail}</span></button>`).join('')}</div>
    </section>
    <section class="recent-section">
      <div class="section-bar"><h2>Недавние разговоры</h2><button class="link-btn" data-overlay="search">Поиск ${icon('search',15)}</button></div>
      <div class="recent-list">${current.length ? current.map(item => `<button data-session="${item.id}"><span class="recent-icon">${icon('message',17)}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.project)}</small></span><time>${item.date}</time>${icon('chevron',15)}</button>`).join('') : '<p class="empty-note">В этом проекте ещё нет разговоров.</p>'}</div>
    </section>
  </div>`
}
function actionTile(id, action) {
  const ready = hubHasInstalled(state, action.solution)
  return `<button class="action-tile" data-package-action="${id}"><span class="glyph red">${icon(action.icon,19)}</span>
    <strong>${action.title}</strong><span>${action.detail}</span>${ready ? '' : `<small class="action-missing">${icon('plus',13)} Добавить из «Решений»</small>`}</button>`
}
function rightPanel(item) {
  const active = state.reviewTab
  const files = item.kind === 'package-edit'
    ? (canUsePackageEdit(item) ? [item.source.name,...(item.workingPackage?.savedVersion ? [item.workingPackage.name] : [])] : [])
    : [...item.files,...(item.phase === 'done' ? ['Результат.lgp'] : [])]
  return `<aside class="review-panel" aria-label="Проверка результатов">
    <div class="review-heading"><h2>Контекст разговора</h2><button class="icon-btn" data-action="review" aria-label="Закрыть панель">${icon('close',17)}</button></div>
    <div class="review-switch">${[['plan','План'],['files','Файлы'],['log','Журнал']].map(([id,label]) => `<button class="${active === id ? 'active':''}" data-review="${id}" aria-pressed="${active === id}">${label}</button>`).join('')}</div>
    ${active === 'plan' ? plan(item) : active === 'files' ? `<div class="review-stack">${files.map(file => `<div class="review-entry">${icon('file',16)}${esc(file)}</div>`).join('') || '<p class="muted">Файлов пока нет.</p>'}</div>` : `<div class="review-stack"><div class="review-entry">${icon('clock',16)} Запрос принят</div>${item.phase === 'done' ? `<div class="review-entry">${icon('check',16)} Результат сформирован</div>` : ''}</div>`}
  </aside>`
}
function plan(item) {
  if (item.kind === 'package-edit') {
    const completed = item.phase === 'saved' ? 3 : item.workingPackage ? 2 : item.phase === 'proposed' ? 1 : 0
    return `<ol class="run-plan">${['Предложить правку','Применить к черновику','Сохранить новую версию'].map((step,i) => `<li><span>${i < completed ? icon('check',14) : i+1}</span>${step}</li>`).join('')}</ol>`
  }
  return `<ol class="run-plan">
    ${['Проверить входные данные','Подготовить сценарий Loginom','Проверить и сохранить результат'].map((caption,i) => `<li><span>${item.phase === 'done' || (item.phase === 'permission' && i === 0) ? icon('check',14):i+1}</span>${caption}</li>`).join('')}
  </ol>`
}
function resultPackage(item) {
  return {
    id:'result-' + item.id, name:item.kind === 'abc' ? 'ABC-анализ.lgp' : 'Результат.lgp',
    scope:'personal', view:item.kind === 'quality' ? 'quality' : 'sales', isResult:true,
  }
}
function result(item) {
  const info = item.kind === 'quality'
    ? ['Проверка данных завершена','Обнаружены 12 пропусков и 3 дубликата. В отчёте отмечены столбцы, которые нужно проверить перед загрузкой.',[['Строки','2 400'],['Пропуски','12'],['Дубликаты','3']]]
    : item.kind === 'refactor'
    ? ['Сценарий проанализирован','Обнаружены две возможности для упрощения. Разбор сохранён в отчёте вместе со списком проверенных узлов.',[['Проверено узлов','12'],['Рекомендации','2'],['Изменено узлов','0']]]
    : ['Сценарий ABC-анализа собран','Товары распределены по трём группам по накопленной доле выручки. Итоговая таблица и шаги сценария доступны в результатах.',[['Группа A','15 товаров'],['Группа B','28 товаров'],['Группа C','77 товаров']]]
  return `<div class="answer-block"><h2>${info[0]}</h2><p>${info[1]}</p>
    <dl class="result-metrics">${info[2].map(([key,value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <div class="artifact-card"><span class="glyph red">${icon('flow',19)}</span><span><strong>${resultPackage(item).name}</strong><small>Демонстрационный пакет Loginom</small></span><button class="btn" data-action="open-result-package">Открыть ${icon('external',14)}</button></div>
    <div class="answer-actions"><button class="link-btn" data-action="download-result">${icon('download',15)} Скачать отчёт CSV</button><button class="link-btn" data-action="author-from-chat">${icon('box',15)} Сохранить как решение</button></div>
  </div>`
}
function currentPackageEdit() {
  return state.sessions.find(item => item.id === state.session && item.kind === 'package-edit')
}
function canUsePackageEdit(item) {
  return item && item.account === state.packageAccount && item.project === state.project
}
function startPackageEdit(source = state.activePackage) {
  if (source.view !== 'calculation') {
    state.overlay = 'package-edit-example'
    render()
    return
  }
  const item = {
    id:'package-edit-' + Date.now(), title:'Правка · ' + source.name, date:'Сейчас', kind:'package-edit',
    phase:'input', prompt:'', files:[source.name], project:state.project,
    source, sourcePath:packagePath(source) + '/' + source.name, account:state.packageAccount,
  }
  state.sessions = [item,...state.sessions]
  openSession(item.id)
  fillExampleEdit()
}
function fillExampleEdit() {
  state.draft = exampleEditPrompt
  render()
  $('#prompt')?.focus()
}
function editDiff() {
  return `<section class="edit-diff" aria-label="Сравнение до и после">
    <div class="edit-diff-title">${icon('flow',17)} <strong>Калькулятор · amount_double</strong><span class="badge">1 узел</span></div>
    <div class="edit-diff-grid">
      <div><span>До</span><code>amount * 2</code><small>Результат · 20, 40, 50</small></div>
      <div><span>После</span><code>amount * 3</code><small>Результат · 30, 60, 75</small></div>
    </div>
  </section>`
}
function packageOutputButtons(dirty, canDownload) {
  return `<div class="button-row">
    <button class="btn primary" data-action="save-package-version" ${dirty ? '' : 'disabled'}>${icon('file',16)} Сохранить новую версию</button>
    <button class="btn" data-action="download-edited-package" ${canDownload ? '' : 'disabled'}>${icon('download',16)} Скачать .lgp</button>
  </div>`
}
function packageEditBody(item) {
  if (!canUsePackageEdit(item)) return `<div class="answer-block"><h2>Подключение Loginom изменилось</h2><p>Чтобы продолжить правку, вернитесь к тому подключению, с которым был открыт пакет.</p><button class="btn" data-settings="loginom">Настроить Loginom</button></div>`
  if (item.workingPackage) {
    const output = item.workingPackage
    const saved = Boolean(output.savedVersion)
    return `<div class="answer-block"><h2>${saved ? 'Новая версия сохранена' : 'Правки применены к черновику'}</h2>
      <p>${saved ? 'В личной папке Loginom появился учебный пакет.' : 'В черновике есть несохранённые изменения. Сохраните отдельную версию в Loginom или скачайте .lgp.'}</p>
      ${saved ? `<p class="edit-source"><code>${esc(packageFolder(output.scope) + '/' + output.name)}</code></p>` : ''}
      ${editDiff()}
      <div class="edit-actions">${packageOutputButtons(!saved,true)}<button class="link-btn" data-action="open-edit-package">${saved ? 'Открыть новую версию' : 'Открыть черновик'} ${icon('arrow',15)}</button></div></div>`
  }
  if (item.phase === 'proposed') return `<div class="answer-block"><h2>Предлагаемая правка</h2>
    <p>Заменить множитель в формуле с 2 на 3. Ниже сравнение на учебных данных.</p>${editDiff()}
    <div class="edit-approval">${icon('shield',20)}<div><strong>Применить к рабочему черновику?</strong><p>После подтверждения можно будет сохранить отдельный пакет или скачать результат.</p>
    <div class="button-row"><button class="btn primary" data-action="approve-package-edit">Применить правки</button><button class="btn quiet" data-action="decline-package-edit">Отклонить</button></div></div></div></div>`
  if (item.phase === 'declined') return `<div class="answer-block"><h2>Правка отклонена</h2><p>Можно уточнить запрос или снова выбрать учебную правку.</p><button class="btn" data-action="fill-example-edit">Подставить пример запроса</button></div>`
  if (item.phase === 'unsupported') return `<div class="answer-block"><h2>Попробуйте учебную правку</h2><p>В этой демонстрации агент умеет показать замену формулы <code>amount * 2</code> на <code>amount * 3</code>.</p><button class="btn" data-action="fill-example-edit">Подставить пример запроса</button></div>`
  return `<div class="answer-block"><h2>Пакет добавлен в разговор</h2><p>Отправьте запрос внизу. Прототип покажет изменение на учебной схеме расчёта.</p></div>`
}
function approvePackageEdit() {
  const item = currentPackageEdit()
  if (!canUsePackageEdit(item) || item.phase !== 'proposed') return
  item.workingPackage = {
    id:'draft-' + item.id, name:item.source.name, scope:'personal', view:'calculation',
    editSessionId:item.id, project:item.project, isDraft:true,
  }
  item.phase = 'applied'
  render()
}
function chat() {
  const item = state.sessions.find(x => x.id === state.session)
  if (!item) return home()
  const isEdit = item.kind === 'package-edit'
  let body
  if (isEdit) body = packageEditBody(item)
  else if (item.phase === 'permission') {
    body = `<div class="answer-block"><h2>Подготовил план</h2><p>Для следующего шага агенту нужно разрешение на создание демонстрационной копии пакета.</p>${plan(item)}
      <div class="permission-card">${icon('shield',24)}<div><h3>Создать копию пакета?</h3><p>Агент получит доступ к записи только в рабочую папку этого проекта.</p><div class="button-row"><button class="btn primary" data-action="allow">Разрешить один раз</button><button class="btn quiet" data-action="deny">Отклонить</button></div></div></div></div>`
  } else if (item.phase === 'plan') {
    body = `<div class="answer-block"><h2>План работы</h2><p>Проверьте шаги перед запуском.</p>${plan(item)}<button class="btn primary" data-action="run-plan">Перейти к выполнению ${icon('arrow',16)}</button></div>`
  } else if (item.phase === 'running') {
    body = `<div class="answer-block" role="status"><h2><span class="spinner"></span> Выполняется сценарий</h2><p>Подготавливаю результат и проверяю выходные данные.</p>${plan(item)}<button class="btn" data-action="stop">${icon('stop',16)} Остановить</button></div>`
  } else if (item.phase === 'done') {
    body = result(item)
  } else {
    body = `<div class="answer-block"><h2>Выполнение остановлено</h2><p>${item.phase === 'denied' ? 'Разрешение на запись отклонено.' : 'Запуск остановлен пользователем.'}</p><button class="btn" data-action="back-to-plan">Вернуться к плану</button></div>`
  }
  return `<div class="chat-layout${state.review ? ' with-review':''}">
    <div class="chat-main">
      <div class="chat-title"><div><p class="eyebrow">Разговор</p><h1>${esc(item.title)}</h1></div><div class="button-row"><button class="btn" data-action="review" aria-pressed="${state.review}">${icon('panel',17)} <span>Контекст</span></button><button class="icon-btn" aria-label="Действия с разговором" data-overlay="session-options">${icon('more',20)}</button></div></div>
      ${isEdit && canUsePackageEdit(item) ? `<div class="chat-package-context"><span class="glyph red">${icon('flow',18)}</span><span><strong>${esc(item.source.name)}</strong><small>${esc(item.sourcePath)}</small></span><span class="badge">Пакет в разговоре</span></div>` : ''}
      <div class="chat-timeline">
        ${(item.previous || []).map(prompt => `<div class="user-message previous-message">${esc(prompt)}</div>`).join('')}
        ${item.prompt ? `<div class="user-message">${esc(item.prompt)}${!isEdit && item.files.length ? `<div class="message-files">${item.files.map(file => `<span>${icon('file',14)}${esc(file)}</span>`).join('')}</div>` : ''}</div>` : ''}
        <div class="agent-message"><span class="agent-avatar"><img src="assets/loginom.png" alt="" width="31" height="31"></span><div><strong class="agent-caption">Loginom AI Agent</strong>${body}</div></div>
      </div>
      <div class="chat-bottom">${!isEdit || (canUsePackageEdit(item) && !item.workingPackage && item.phase !== 'proposed') ? composer() : ''}<p class="muted">${isEdit ? 'Учебная формула и файл .lgp для демонстрации.' : 'Демонстрационный разговор. Реальные пакеты и данные не изменяются.'}</p></div>
    </div>
    ${state.review ? rightPanel(item):''}
  </div>`
}
function packageFolder(scope) {
  return scope === 'shared' ? '/Общие/Аналитика' : '/' + (state.settings.connection.username || 'analyst')
}
function packagePath(item) {
  return packageFolder(item.scope) + (item.folder ? '/' + item.folder : '')
}
function packageEntries() {
  return [...serverPackages,...state.importedPackages]
}
function openPackage(item) {
  state.activePackage = item
  rememberPackage(item.id, 'просмотр')
  state.node = item.view === 'calculation' ? 1 : null
  if (state.page === 'loginom') dismiss()
  else navigate('loginom')
  $('.package-top strong')?.focus()
}
function localDestination(name) {
  const baseName = name.slice(0,-4).replace(/[\\/:<>"|?*%#]/g,'_').trim() || 'Пакет'
  const taken = new Set(packageEntries().filter(item => item.scope === 'personal').map(item => item.name.toLocaleLowerCase('ru')))
  let destination = baseName + '.lgp'
  for (let index = 1; taken.has(destination.toLocaleLowerCase('ru')); index++) {
    destination = baseName + (index === 1 ? ' — копия' : ' — копия (' + index + ')') + '.lgp'
  }
  return destination
}
function selectLocalPackage(name, example = false) {
  state.packageError = /\.lgp$/i.test(name) ? '' : 'Выберите файл с расширением .lgp.'
  state.localPackage = state.packageError ? null : {name,destination:localDestination(name),example}
  render()
  $(state.packageError ? '#package-local-file' : '[data-action="open-local-package"]')?.focus()
}
// One picker for «Открыть из Loginom» and for choosing the package of an action (state.pendingAction).
function packagePicker(local) {
  if (!state.settings.connection.connected) return `<p class="dialog-desc">Сначала подтвердите подключение к Loginom Studio.</p><button class="btn primary" data-settings="loginom">${icon('settings',16)} Настроить Loginom</button>`
  if (!local) return `<p class="dialog-desc">${state.pendingAction ? 'Агент будет работать с копией — исходный пакет не изменится.' : 'Пакеты из папок, доступных вашей учётной записи Loginom.'}</p>
      <label class="search-field">${icon('search',18)}<input id="package-search" aria-label="Найти пакет" value="${esc(state.packageQuery)}" placeholder="Найти пакет по имени" autocomplete="off"></label>
      <div id="package-browse">${packageBrowse()}</div>`
  const candidate = state.localPackage
  return `<p class="dialog-desc">Для работы в Loginom Studio копия локального пакета загружается в вашу папку на сервере Loginom.</p>
    <label class="package-file-select"><span class="glyph red">${icon('upload',20)}</span><span><strong>Выбрать файл .lgp</strong><small>Файл с вашего компьютера</small></span><input id="package-local-file" type="file" accept=".lgp" aria-label="Выбрать файл .lgp"></label>
    ${state.packageError ? `<p class="package-error" role="alert">${state.packageError}</p>` : ''}
    ${candidate ? `<dl class="package-preview"><div><dt>Файл на компьютере</dt><dd>${esc(candidate.name)}</dd></div><div><dt>Копия в Loginom</dt><dd><code>${esc(packageFolder('personal') + '/' + candidate.destination)}</code></dd></div></dl>`
      : '<button class="link-btn sample-package" data-action="sample-package">Выбрать учебный файл</button>'}
    <p class="muted package-picker-note">В прототипе используется только имя файла. Открывается учебная схема.</p>
    <div class="button-row package-picker-actions"><button class="btn quiet" data-action="dismiss">Отмена</button><button class="btn primary" data-action="open-local-package" ${candidate ? '' : 'disabled'}>Загрузить копию и открыть</button></div>`
}
// Recent: the app's own history. Below: one Loginom folder, folders first, then packages newest first.
// Search covers the open folder; searching subfolders opens them one by one, so it is a separate step.
function packageBrowse() {
  const q = state.packageQuery.trim().toLocaleLowerCase('ru')
  const match = item => item.name.toLocaleLowerCase('ru').includes(q)
  const scoped = packageEntries().filter(item => item.scope === state.packageScope)
  const deep = state.packageDeep && q
  const files = scoped.filter(item => deep ? (item.folder || '').startsWith(state.packageDir) : (item.folder || '') === state.packageDir).filter(match)
    .sort((a,b) => state.packageSort === 'name' ? a.name.localeCompare(b.name,'ru') : (b.modified || '').localeCompare(a.modified || ''))
  const folders = state.packageDir || deep ? [] : [...new Set(scoped.map(item => item.folder).filter(Boolean))]
    .filter(name => name.toLocaleLowerCase('ru').includes(q)).sort((a,b) => a.localeCompare(b,'ru'))
  const recent = state.packageDir ? [] : state.recentPackages.map(entry => ({...entry, item:packageEntries().find(item => item.id === entry.id)}))
    .filter(entry => entry.item && match(entry.item)).slice(0,3)
  const row = (item, sub, meta) => `<button class="pkg-row" data-package-id="${esc(item.id)}"><span class="glyph red">${icon('flow',16)}</span><span class="pkg-name"><strong>${esc(item.name)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${meta ? `<span class="pkg-meta">${meta}</span>` : ''}</button>`
  const meta = item => [item.modified?.split('-').reverse().join('.'), item.size].filter(Boolean).join(' · ')
  const root = packageFolder(state.packageScope)
  return `${recent.length ? `<p class="pkg-section">Недавние <span>— с ними вы работали в приложении</span></p>
      <div class="pkg-list pkg-recent">${recent.map(entry => row(entry.item, packagePath(entry.item) + ' · ' + entry.what + ', ' + entry.when)).join('')}</div>` : ''}
    <div class="pkg-bar"><div class="package-folders pkg-roots" aria-label="Папки Loginom">${[['personal','Моя папка'],['shared','Общие папки']].map(([scope,label]) => `<button class="btn quiet" data-package-scope="${scope}" aria-pressed="${state.packageScope === scope}" title="${esc(packageFolder(scope))}">${icon('folder',15)} ${label}</button>`).join('')}</div>
      <button class="link-btn pkg-sort" data-action="package-sort" aria-label="Порядок: ${state.packageSort === 'name' ? 'по имени' : 'сначала новые'}">${state.packageSort === 'name' ? 'По имени' : 'Сначала новые'} ${icon('down',14)}</button></div>
    ${state.packageDir ? `<nav class="pkg-crumbs" aria-label="Открытая папка"><button class="link-btn" data-package-dir="">${esc(root)}</button><span>/</span><strong>${esc(state.packageDir)}</strong></nav>` : ''}
    <div class="pkg-list pkg-files" id="package-files">${folders.map(name => {
      const count = scoped.filter(item => item.folder === name).length
      return `<button class="pkg-row" data-package-dir="${esc(name)}"><span class="glyph blue">${icon('folder',16)}</span><span class="pkg-name"><strong>${esc(name)}</strong></span><span class="pkg-meta">${count} ${packageWord(count)}</span>${icon('chevron',15)}</button>`
    }).join('')}${files.map(item => row(item, deep ? packagePath(item) : '', meta(item))).join('')}${folders.length + files.length ? '' : `<p class="empty-note">${q ? `Нет пакетов с «${esc(state.packageQuery.trim())}» в имени${deep ? '' : ' в этой папке'}.` : 'В этой папке нет пакетов.'}</p>`}</div>
    <p class="pkg-count">${q ? `Найдено: ${files.length}${deep ? ' — в этой папке и вложенных' : ' в этой папке'}` : `${files.length} ${packageWord(files.length)}${folders.length ? ' · папок: ' + folders.length : ''}`}${q && !deep && !state.packageDir ? ` · <button class="link-btn" data-action="package-deep">Искать и во вложенных папках</button>` : ''}</p>`
}
function packageWord(count) {
  if (count % 10 === 1 && count % 100 !== 11) return 'пакет'
  if ([2,3,4].includes(count % 10) && ![12,13,14].includes(count % 100)) return 'пакета'
  return 'пакетов'
}
function packageForOutput() {
  if (state.page !== 'chat') {
    const item = state.activePackage
    return item.isDraft && item.project !== state.project ? null : item
  }
  const item = currentPackageEdit()
  return canUsePackageEdit(item) ? item.workingPackage : null
}
function hasPackageEdits(item) {
  return Boolean(item && (item.isDraft || (item.id === editablePackage.id && state.calculationChanged)))
}
function proposedVersionName(item) {
  const taken = new Set(packageEntries().filter(item => item.scope === 'personal').map(item => item.name.toLocaleLowerCase('ru')))
  const stem = item.name.slice(0,-4).replace(/ — v[0-9]+$/, '')
  let version = 2
  while (taken.has((stem + ' — v' + version + '.lgp').toLocaleLowerCase('ru'))) version++
  return stem + ' — v' + version + '.lgp'
}
function versionDialog() {
  if (!state.settings.connection.connected) return `<p class="dialog-desc">Подтвердите подключение к Loginom, чтобы сохранить версию в хранилище.</p><button class="btn primary" data-settings="loginom">${icon('settings',16)} Настроить Loginom</button>`
  return `<p class="dialog-desc">Сохраните изменения отдельным пакетом. Новая версия появится в личной папке Loginom.</p>
    <form id="package-version-form" class="package-version-form">
      <label for="package-version-name">Имя нового пакета</label>
      <input id="package-version-name" name="version" type="text" value="${esc(state.versionName)}" required maxlength="120" aria-describedby="package-version-folder${state.versionError ? ' package-version-error' : ''}" ${state.versionError ? 'aria-invalid="true"' : ''}>
      <div id="package-version-folder" class="package-path">Папка Loginom <code>${esc(packageFolder('personal'))}</code></div>
      ${state.versionError ? `<p class="package-error" id="package-version-error" role="alert">${state.versionError}</p>` : ''}
      <div class="button-row package-picker-actions"><button type="button" class="btn quiet" data-action="dismiss">Отмена</button><button class="btn primary" type="submit">Сохранить в Loginom</button></div>
    </form>`
}
function savePackageVersion(name) {
  const source = packageForOutput()
  if (!hasPackageEdits(source) || !state.settings.connection.connected) return
  state.versionName = name
  if (!/^[^\\/:<>"|?*%#]+\.lgp$/i.test(name)) state.versionError = 'Укажите имя файла с расширением .lgp.'
  else if (packageEntries().some(item => item.scope === 'personal' && item.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'))) state.versionError = 'Это имя уже занято. Введите другое имя для новой версии.'
  else state.versionError = ''
  if (state.versionError) return render()
  const saved = {...source,id:'version-' + state.importedPackages.length,name,isDraft:false,savedVersion:true,folder:'',modified:new Date().toISOString().slice(0,10)}
  state.importedPackages.push(saved)
  if (source.editSessionId) {
    const chat = state.sessions.find(item => item.id === source.editSessionId)
    chat.workingPackage = saved
    chat.phase = 'saved'
  } else {
    state.calculationChanged = false
  }
  if (state.page === 'chat') dismiss()
  else openPackage(saved)
  toast('Новая версия сохранена в демосреде Loginom')
}
function downloadEditedPackage() {
  const item = packageForOutput()
  if (!hasPackageEdits(item) && !item?.savedVersion) return
  const bytes = Uint8Array.from(atob(editedPackageBase64), ch => ch.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}))
  const link = document.createElement('a')
  link.href = url
  link.download = item.savedVersion ? item.name : proposedVersionName(item)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url),1000)
  toast('Учебный .lgp скачивается')
}
function calculationInspector(changed,canEditManually) {
  return `<div class="calculation-inspector">
    <div><p class="eyebrow">Поле amount_double</p><h2>Расчёт суммы</h2><p class="muted">В примере меняется множитель в формуле.</p></div>
    <div class="formula-preview"><span>Формула</span><code>amount * ${changed ? 3 : 2}</code></div>
    <div class="formula-preview"><span>Результат на трёх строках</span><strong>${changed ? '30, 60, 75' : '20, 40, 50'}</strong></div>
    ${canEditManually ? `<button class="btn" data-action="change-calculation" aria-pressed="${changed}">${icon(changed ? 'refresh' : 'wand',16)} ${changed ? 'Отменить правку' : 'Применить формулу ×3'}</button>` : ''}
  </div>`
}
function packages() {
  const item = state.activePackage
  const nodes = packageViews[item.view]
  const isCalculation = item.view === 'calculation'
  const dirty = hasPackageEdits(item)
  const canDownload = dirty || Boolean(item.savedVersion)
  return `<div class="native-page packages-page">
    <div class="native-heading"><div><p class="eyebrow">Loginom</p><h1>Пакеты</h1><p>Откройте пакет, чтобы посмотреть схему, задокументировать, проверить или улучшить его.</p></div><div class="button-row"><button class="btn primary" data-action="package-server">${icon('folder',17)} Из Loginom</button><button class="btn" data-action="package-computer">${icon('upload',17)} С компьютера</button></div></div>
    <section class="package-frame"><div class="package-top"><span class="glyph red">${icon('flow',21)}</span><div><strong tabindex="-1">${esc(item.name)}</strong><small>${item.isDraft ? 'Рабочий черновик в разговоре' : `${esc(packagePath(item))} · ${item.savedVersion ? 'новая версия' : item.isResult ? 'результат разговора' : item.localCopy ? 'копия с компьютера' : 'хранилище Loginom'}`}</small></div><span class="badge">Учебная схема</span></div>
    <div class="package-canvas" aria-label="Учебная схема из четырёх узлов">${nodes.map(([glyph,title,detail],i) => `${i ? '<span class="canvas-connector"></span>':''}<button class="canvas-node ${state.node === i ? 'active':''}" data-node="${i}"><span class="glyph ${['blue','violet','red','green'][i]}">${icon(glyph,22)}</span><strong>${title}</strong><small>${detail}</small></button>`).join('')}</div>
    ${isCalculation && state.node === 1 ? calculationInspector(canDownload,item.id === editablePackage.id) : `<div class="package-foot">${Number.isInteger(state.node) ? nodes[state.node][3]:'Выберите узел, чтобы увидеть сведения.'}</div>`}
    <div class="package-save-bar">
      ${isCalculation ? `<span class="package-save-status${dirty ? ' dirty' : ''}" role="status">${icon(dirty ? 'circle' : 'check',15)} ${dirty ? 'Есть несохранённые изменения' : item.savedVersion ? 'Сохранено в Loginom · демо' : 'Исходная версия'}</span>`
        : `<button class="link-btn" data-action="edit-package-example">${icon('wand',17)} Попробовать изменение пакета</button>`}
      ${isCalculation ? packageOutputButtons(dirty,canDownload) : ''}
      ${item.editSessionId ? `<button class="link-btn" data-session="${item.editSessionId}">${icon('message',16)} Вернуться к разговору</button>`
        : !item.savedVersion && !dirty ? `<button class="btn package-chat-cta" data-action="ask-package-edit">${icon('message',16)} Изменить с агентом</button>` : ''}
    </div></section>
    ${item.isDraft ? '' : `<div class="section-bar package-section"><h2>Что сделать с пакетом</h2><button class="link-btn" data-go="hub">Другие решения ${icon('arrow',16)}</button></div>
    <div class="action-grid">${Object.entries(packageActions).map(([id,action]) => actionTile(id,action)).join('')}</div>`}
  </div>`
}
function help() {
  return `<div class="native-page help-page">
    <div class="native-heading"><div><p class="eyebrow">Поддержка</p><h1>Справка</h1><p>Подключение, работа со сценариями и доставка решений в закрытый контур.</p></div></div>
    <div class="help-list">${[
      ['Подключить Loginom и модель','Выберите режим работы, настройте адрес Loginom и подключите доступную модель.', 'onboarding','Начать настройку'],
      ['Добавить возможности Hub без интернета','Администратор получает пакет с зависимостями на стороне с доступом к Hub. В закрытом контуре откройте Hub и импортируйте пакет из файла.', 'hub','Открыть Hub'],
      ['Проверить состояние подключения','Loginom, база знаний, модель и источник Hub проверяются отдельно. Для закрытой поставки база знаний и модель должны быть доступны локально или по внутренней сети.', 'settings','Открыть настройки'],
      ['Разобрать пакет Loginom','Выберите пакет, откройте узел или запустите решение. Агент покажет требуемые разрешения и результат выполнения.', 'loginom','Открыть демопакет'],
    ].map(([title,body,page,label],i) => `<details ${i === 0 ? 'open':''}><summary>${title}${icon('down',16)}</summary><p>${body}</p><button class="link-btn" data-go="${page}">${label} ${icon('arrow',16)}</button></details>`).join('')}</div>
  </div>`
}
function overlay() {
  const kind = state.overlay
  if (!kind) return ''
  const content = {
    'package-edit-example':['Изменение на учебном пакете',`<p class="dialog-desc">Сценарий правки формулы в прототипе доступен для пакета «Расчёт суммы.lgp». Откройте его в чате, чтобы увидеть сравнение, подтверждение и сохранение.</p><div class="button-row package-picker-actions"><button class="btn quiet" type="button" data-action="dismiss">Отмена</button><button class="btn primary" type="button" data-action="ask-example-package-edit">Открыть учебный пакет в чате</button></div>`],
    'package-version':['Сохранить новую версию', kind === 'package-version' ? versionDialog() : ''],
    'pick-package':[packageActions[state.pendingAction]?.title + ': какой пакет?', kind === 'pick-package' ? packagePicker(false) : ''],
    'package-server':['Открыть из Loginom', kind === 'package-server' ? packagePicker(false) : ''],
    'package-computer':['Открыть с компьютера', kind === 'package-computer' ? packagePicker(true) : ''],
    contour: ['Режим работы',`<p class="dialog-desc">Профиль определяет, какие источники доступны приложению.</p>
      <div class="dialog-options"><button data-contour="online"><span class="glyph blue">${icon('globe',20)}</span><span><strong>Подключённый режим</strong><small>Веб-каталог Hub и разрешённые внешние модели</small></span>${state.contour === 'online' ? icon('check',18):''}</button>
      <button data-contour="closed"><span class="glyph red">${icon('lock',20)}</span><span><strong>Закрытый контур</strong><small>Внутренние или локальные источники, импорт пакетов из файла</small></span>${state.contour === 'closed' ? icon('check',18):''}</button></div><button class="link-btn" data-settings="contour">Политика и диагностика ${icon('arrow',15)}</button>`],
    projects: ['Рабочий проект',`<div class="dialog-options">${state.projects.map((name,index) => `<button data-project="${index}"><span class="glyph blue">${icon('folder',19)}</span><span><strong>${esc(name)}</strong></span>${state.project === name ? icon('check',18):''}</button>`).join('')}</div>
      <form id="project-form" class="inline-form"><label for="project-name" class="sr-only">Название проекта</label><input id="project-name" name="name" maxlength="45" placeholder="Название нового проекта" required><button class="btn primary">Добавить</button></form>`],
    search: ['Поиск',`<label class="search-field">${icon('search',19)}<input id="search-query" placeholder="Найти разговор или раздел…" aria-label="Поиск по приложению" autocomplete="off"><kbd>Esc</kbd></label><div id="search-results" class="search-results">${searchResults('')}</div>`],
    attach: ['Добавить контекст',`<p class="dialog-desc">Подключите пример или добавьте имя файла с устройства. Для этой демонстрации достаточно примеров.</p>
      <div class="dialog-options"><button data-file="sales-demo.csv"><span class="glyph blue">${icon('database',18)}</span><span><strong>sales-demo.csv</strong><small>Пример таблицы продаж</small></span>${icon('plus',18)}</button><button data-file="Продажи.lgp"><span class="glyph red">${icon('flow',19)}</span><span><strong>Продажи.lgp</strong><small>Пример пакета Loginom</small></span>${icon('plus',18)}</button></div>
      <label class="btn attach-control">${icon('upload',16)} Выбрать файл <input type="file" id="local-attachment" aria-label="Выбрать файл с устройства"></label>`],
    'agent-mode':['Режим агента',`<div class="dialog-options">${[['Выполнение','Предлагает план и запрашивает разрешения на действия'],['Планирование','Готовит план до начала выполнения']].map(([mode,detail]) => `<button data-agent-mode="${mode}"><span class="glyph red">${icon(mode === 'Планирование' ? 'layers':'spark',19)}</span><span><strong>${mode}</strong><small>${detail}</small></span>${state.mode === mode ? icon('check',18):''}</button>`).join('')}</div>`],
    'session-options':['Разговор',`<div class="dialog-options"><button data-action="rename-session"><span class="glyph blue">${icon('file',19)}</span><span><strong>Переименовать</strong></span>${icon('chevron',17)}</button>${currentPackageEdit() ? '' : `<button data-action="download-result"><span class="glyph red">${icon('download',19)}</span><span><strong>Скачать демонстрационный отчёт CSV</strong></span></button>`}</div>`],
    rename:['Переименовать разговор',`<form class="inline-form" id="rename-form"><label class="sr-only" for="session-name">Имя разговора</label><input id="session-name" name="name" maxlength="70" value="${esc(state.sessions.find(x => x.id === state.session)?.title)}" required><button class="btn primary">Сохранить</button></form>`],
  }[kind]
  if (!content) return ''
  return `<dialog class="app-dialog" id="app-dialog" aria-labelledby="app-dialog-title"><div class="app-dialog-heading"><h2 id="app-dialog-title">${content[0]}</h2><button class="icon-btn" data-action="dismiss" aria-label="Закрыть">${icon('close',20)}</button></div><div class="app-dialog-body">${content[1]}</div></dialog>`
}
function searchResults(value) {
  const q = value.trim().toLocaleLowerCase('ru')
  const entries = [
    ['home','Главная','home'],
    ['hub','Решения (Loginom Hub)','grid'],
    ['loginom','Пакеты','flow'],
    ['settings','Настройки','settings'],
    ['onboarding','Мастер первого запуска','spark'],
    ['studio','Создать решение','box'],
    ['help','Справка','help'],
  ].filter(([,label]) => label.toLocaleLowerCase('ru').includes(q)).map(([page,label,glyph]) =>
    `<button data-go="${page}">${icon(glyph,17)}<span>${label}</span>${icon('arrow',15)}</button>`)
  const list = state.sessions.filter(x => x.title.toLocaleLowerCase('ru').includes(q)).slice(0,7).map(x =>
    `<button data-session="${x.id}">${icon('message',17)}<span>${esc(x.title)}</span>${icon('arrow',15)}</button>`)
  return [...entries,...list].join('') || '<p class="empty-note">Совпадений нет. Попробуйте другое название.</p>'
}
function pageContents() {
  switch (state.page) {
    case 'home': return home()
    case 'chat': return chat()
    case 'hub': return renderHub(state)
    case 'settings': return renderSettings(state)
    case 'onboarding': return renderOnboarding(state)
    case 'runner':
    case 'studio': return renderSolutions(state)
    case 'loginom': return packages()
    case 'help': return help()
  }
}
function render(resetScroll = false) {
  state.activeRun = state.sessions.some(item => item.phase === 'running') || Object.values(state.solutions.runs).some(run => run.status === 'running')
  const settings = ensureSettings(state)
  const packageAccount = JSON.stringify([settings.connection.url,settings.connection.username])
  if (state.packageAccount && state.packageAccount !== packageAccount) {
    state.importedPackages = []
    state.activePackage = serverPackages[0]
    state.runnerPackage = null
    state.calculationChanged = false
    state.node = null
    for (const [id,run] of Object.entries(state.solutions.runs)) {
      if (!run.boundPackage) continue
      clearInterval(run.timer)
      delete state.solutions.runs[id]
    }
  }
  state.packageAccount = packageAccount
  if (state.activePackage.isDraft && state.activePackage.project !== state.project) {
    state.activePackage = serverPackages[0]
    state.node = null
  }
  const scroll = resetScroll ? 0 : ($('#main')?.scrollTop ?? 0)
  setThemeAttribute()
  document.title = pages[state.page] + ' · Loginom AI Agent'
  app.innerHTML = `<div class="workspace">
    ${sidebar()}${state.mobile ? '<button class="mobile-scrim" aria-label="Закрыть меню" data-action="menu"></button>':''}
    <div class="workspace-main">${header()}<main id="main" class="page page-${state.page}">${pageContents()}</main>
    </div>
  </div>${overlay()}`
  $('#main').scrollTop = scroll
  const dialog = $('#app-dialog')
  if (dialog) {
    dialog.showModal()
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss() })
    dialog.addEventListener('click', event => { if (event.target === dialog) dismiss() })
    $('#search-query')?.focus()
    $('#package-search')?.focus()
    $('#package-version-name')?.focus()
    $('#session-name')?.select()
  }
  if (state.page === 'hub') bindHub(app,state,api)
  if (['settings','onboarding'].includes(state.page)) bindSettings(app,state,api)
  if (['runner','studio'].includes(state.page)) bindSolutions(app,state,api)
}
function dismiss() {
  state.overlay = null
  state.pendingAction = null
  render()
}
function resetPackageBrowse() {
  state.packageQuery = ''
  state.packageDir = ''
  state.packageDeep = false
}
function attach(name) {
  if (!state.draftFiles.includes(name)) state.draftFiles.push(name)
  dismiss()
  $('#prompt')?.focus()
}
function send() {
  const prompt = state.draft.trim()
  if (!prompt) {
    $('#prompt')?.focus()
    return
  }
  const old = state.page === 'chat' ? state.sessions.find(x => x.id === state.session) : null
  if (old?.kind === 'package-edit') {
    if (!canUsePackageEdit(old) || old.workingPackage) return
    old.prompt = prompt
    const supported = /утро[ий]|(?:[*×хx]\s*3\b)|(?:умно[жз]|множител|формул).{0,45}\b3\b/i.test(prompt)
    old.phase = supported ? 'proposed' : 'unsupported'
    state.draft = ''
    render()
    $('.chat-main .answer-block h2')?.scrollIntoView({block:'nearest'})
    return
  }
  if (old && old.phase === 'running') {
    toast('Дождитесь результата или остановите выполнение')
    return
  }
  const kind = /дубликат|пропуск|выгрузк/i.test(prompt) ? 'quality' : /проверь|оптимиз|улучш/i.test(prompt) ? 'refactor' : 'abc'
  const next = {
    id: old?.id ?? 'session-' + Date.now(), date:'Сейчас', title:old?.title || state.templateTitle || prompt.slice(0,56),
    kind, phase:state.mode === 'Планирование' ? 'plan':'permission', files:state.draftFiles.slice(), prompt, project:state.project,
    previous:old ? [...(old.previous || []), old.prompt].slice(-4) : [],
  }
  state.sessions = [next, ...state.sessions.filter(x => x.id !== next.id)]
  state.templateTitle = ''
  openSession(next.id)
}
function setPhase(phase) {
  const item = state.sessions.find(x => x.id === state.session)
  if (!item) return
  item.phase = phase
  state.activeRun = state.sessions.some(x => x.phase === 'running')
  render()
  if (phase === 'running') setTimeout(() => {
    if (item.phase !== 'running') return
    item.phase = 'done'
    state.activeRun = state.sessions.some(x => x.phase === 'running')
    if (state.session === item.id && state.page === 'chat') render()
    toast('Демонстрационный результат готов')
  },1100)
}
function downloadResult() {
  const item = state.sessions.find(x => x.id === state.session)
  if (!item) return
  const csv = {
    quality:'Показатель,Количество\nПроверено строк,2400\nПропуски,12\nДубликаты,3\n',
    refactor:'Показатель,Количество\nПроверено узлов,12\nРекомендации,2\nИзменено узлов,0\n',
    abc:'Группа,Количество товаров\nA,15\nB,28\nC,77\n',
  }
  const url = URL.createObjectURL(new Blob(['\uFEFF',csv[item.kind]],{type:'text/csv;charset=utf-8'}))
  const a = document.createElement('a')
  a.href = url
  a.download = item.kind + '-demo.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url),1000)
  if (state.overlay) dismiss()
}
const actions = {
  new:newSession,
  menu:() => { state.mobile = !state.mobile; render() },
  theme:() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light':'dark'),
  dismiss,
  review:() => { state.review = !state.review; render() },
  allow:() => setPhase('running'), deny:() => setPhase('denied'),
  'run-plan':() => setPhase('permission'), 'back-to-plan':() => setPhase('plan'), stop:() => setPhase('stopped'),
  'download-result':downloadResult,
  'edit-package-example':() => {
    state.activePackage = editablePackage
    state.node = 1
    render()
    $('.calculation-inspector button')?.focus()
  },
  'change-calculation':() => {
    state.calculationChanged = !state.calculationChanged
    render()
    $('.calculation-inspector button')?.focus()
  },
  'ask-package-edit':() => startPackageEdit(),
  'ask-example-package-edit':() => startPackageEdit(editablePackage),
  'fill-example-edit':fillExampleEdit,
  'approve-package-edit':approvePackageEdit,
  'decline-package-edit':() => {
    const item = currentPackageEdit()
    if (!canUsePackageEdit(item) || item.phase !== 'proposed') return
    item.phase = 'declined'
    render()
  },
  'open-edit-package':() => {
    const item = currentPackageEdit()
    if (canUsePackageEdit(item) && item.workingPackage) openPackage(item.workingPackage)
  },
  'save-package-version':() => {
    const item = packageForOutput()
    if (!hasPackageEdits(item)) return
    state.versionName = proposedVersionName(item)
    state.versionError = ''
    state.overlay = 'package-version'
    render()
  },
  'download-edited-package':downloadEditedPackage,
  'open-result-package':() => {
    const session = state.sessions.find(item => item.id === state.session)
    if (session?.phase === 'done') openPackage(resultPackage(session))
  },
  'package-server':() => { resetPackageBrowse(); state.pendingAction = null; state.overlay = 'package-server'; render() },
  'package-sort':() => {
    state.packageSort = state.packageSort === 'name' ? 'date' : 'name'
    $('#package-browse').innerHTML = packageBrowse()
    $('[data-action="package-sort"]')?.focus()
  },
  'package-deep':() => {
    state.packageDeep = true
    $('#package-browse').innerHTML = packageBrowse()
    $('#package-search')?.focus()
  },
  'package-computer':() => {
    state.localPackage = null
    state.packageError = ''
    state.overlay = 'package-computer'
    render()
  },
  'sample-package':() => selectLocalPackage('Мой сценарий.lgp',true),
  'open-local-package':() => {
    if (!state.localPackage) return
    const item = {
      id:'local-' + state.importedPackages.length, name:state.localPackage.destination, scope:'personal',
      localCopy:true, view:state.localPackage.example ? 'calculation' : 'local', folder:'', modified:new Date().toISOString().slice(0,10),
    }
    state.importedPackages.push(item)
    state.localPackage = null
    openPackage(item)
    toast('Учебная копия открыта')
  },
  'author-from-chat':() => {
    const session = state.sessions.find(item => item.id === state.session)
    if (!session) return
    Object.assign(state.solutions.author,{
      method:'chat',title:session.title,description:session.prompt.slice(0,900),id:'',
      feedback:'Поля предложены по текущему разговору.',warning:false,
    })
    navigate('studio')
  },
  'rename-session':() => { state.overlay = 'rename'; render() },
}
app.addEventListener('click', event => {
  const el = event.target.closest('button')
  if (!el) return
  const d = el.dataset
  if (d.go) return navigate(d.go)
  if (d.settings) return settingsTab(d.settings)
  if (d.overlay) { state.overlay = d.overlay; return render() }
  if (d.session) return openSession(d.session)
  if (d.closeTab) {
    state.tabs = state.tabs.filter(id => id !== d.closeTab)
    if (state.session === d.closeTab) {
      if (state.tabs.length) return openSession(state.tabs.at(-1))
      return newSession()
    }
    return render()
  }
  if (d.contour) {
    state.overlay = null
    return setContour(d.contour)
  }
  if (d.project != null) {
    state.project = state.projects[Number(d.project)]
    return newSession()
  }
  if (d.example) {
    const example = examples.find(item => item.id === d.example)
    return useTemplate(example.title,example.prompt)
  }
  if (d.file) return attach(d.file)
  if (d.removeFile != null) {
    state.draftFiles.splice(Number(d.removeFile),1)
    return render()
  }
  if (d.agentMode) { state.mode = d.agentMode; return dismiss() }
  if (d.review) { state.reviewTab = d.review; return render() }
  if (d.node != null) { state.node = Number(d.node); return render() }
  if (d.packageScope) {
    resetPackageBrowse()
    state.packageScope = d.packageScope
    return render()
  }
  if (d.packageDir !== undefined) {
    resetPackageBrowse()
    state.packageDir = d.packageDir
    return render()
  }
  if (d.packageId) {
    const item = packageEntries().find(entry => entry.id === d.packageId)
    const action = state.pendingAction
    if (!item) return
    state.overlay = null
    state.pendingAction = null
    if (action) return runAction(action, packageRef(item), 'home')
    return openPackage(item)
  }
  if (d.packageAction) {
    if (state.page === 'loginom') return runAction(d.packageAction, packageRef(state.activePackage), 'loginom')
    resetPackageBrowse()
    state.pendingAction = d.packageAction
    state.overlay = 'pick-package'
    return render()
  }
  if (Object.hasOwn(actions,d.action)) actions[d.action]()
})
app.addEventListener('input', event => {
  if (event.target.id === 'prompt') {
    state.draft = event.target.value
    $('.send-btn').disabled = !state.draft.trim()
  }
  if (event.target.id === 'search-query') $('#search-results').innerHTML = searchResults(event.target.value)
  if (event.target.id === 'package-search') {
    state.packageQuery = event.target.value
    if (!event.target.value.trim()) state.packageDeep = false
    $('#package-browse').innerHTML = packageBrowse()
  }
})
app.addEventListener('change', event => {
  if (event.target.id === 'package-local-file' && event.target.files[0]) selectLocalPackage(event.target.files[0].name)
  if (event.target.id === 'local-attachment' && event.target.files[0]) attach(event.target.files[0].name)
})
app.addEventListener('submit', event => {
  const id = event.target.id
  if (!['composer','project-form','rename-form','package-version-form'].includes(id)) return
  event.preventDefault()
  if (id === 'composer') return send()
  if (id === 'package-version-form') return savePackageVersion(new FormData(event.target).get('version').trim())
  const name = new FormData(event.target).get('name').trim()
  if (!name) return
  if (id === 'rename-form') {
    state.sessions.find(x => x.id === state.session).title = name
    return dismiss()
  }
  if (!state.projects.includes(name)) state.projects.push(name)
  state.project = name
  return newSession()
})
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'n' && (event.metaKey || event.ctrlKey) && !document.querySelector('dialog[open]')) {
    event.preventDefault()
    newSession()
    $('#prompt')?.focus()
  }
  if (event.key === ',' && (event.metaKey || event.ctrlKey) && !document.querySelector('dialog[open]')) {
    event.preventDefault()
    navigate('settings')
  }
  if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
    if (document.querySelector('dialog[open]:not(#app-dialog)')) return
    event.preventDefault()
    state.overlay = state.overlay === 'search' ? null:'search'
    render()
  }
  if (event.key === 'Enter' && event.target.id === 'prompt' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    send()
  }
  if (event.key === 'Enter' && event.target.id === 'search-query') $('#search-results button')?.click()
})
addEventListener('popstate',() => { route(); state.overlay = null; render(true) })
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',() => { if (state.theme === 'system') render() })
render()
