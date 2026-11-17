import { editedPackageBase64 } from './edited-package.js'
import { icon } from './icons.js'
import { renderHub, bindHub, hubHasInstalled, openHubSolution, showHubType } from './hub.js'
import { renderSettings, renderOnboarding, bindSettings, ensureSettings, beforeSettingsLeave } from './settings.js'
import { renderSolutions, bindSolutions, initSolutionDrafts } from './solutions.js'
import { actions as packageActions, byId, tierBadge } from './catalog.js'

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
  home:'Новый разговор', chat:'Разговор', project:'Проект', hub:'Каталог', loginom:'Пакеты',
  runner:'Запуск действия', studio:'Создать навык', settings:'Настройки', onboarding:'Первый запуск', review:'Что решить',
}
// Clicking an example fills the composer; it never sends. «document» also attaches a sample package,
// so a newcomer sees the package actions appear.
const examples = [
  { id:'abc', title:'ABC-анализ товаров', icon:'chart', tone:'red', detail:'Сгруппировать товары по вкладу в выручку', prompt:'Построй ABC-анализ товаров по выручке в Loginom. Используй демонстрационные данные и сохрани результат как сценарий.' },
  { id:'document', title:'Задокументировать пакет', icon:'file', tone:'green', detail:'Описание узлов и данных на учебном пакете', prompt:'Задокументируй этот пакет: назначение, входные данные и что делает каждый узел.', pkg:true },
  { id:'refactor', title:'Проверить сценарий', icon:'flow', tone:'blue', detail:'Найти проблемы в пакете Loginom', prompt:'Проверь сценарий продаж и покажи, что можно улучшить.' },
  { id:'quality', title:'Проверить данные', icon:'shield', tone:'violet', detail:'Найти пропуски и дубликаты в таблице', prompt:'Проверь демонстрационные продажи на пропуски и дубликаты. Покажи результат в таблице.' },
]
const placeholders = {
  1:'Опишите задачу: собрать сценарий, разобрать пакет, проверить данные',
  2:'Что сделать в Loginom? Например, задокументировать пакет',
}
// Iteration 2: the prototype opens as a first launch («new») or as after a week of work («used»);
// the owner compares variants on the review page.
const stage = read('stage','new') === 'used' ? 'used' : 'new'
const variant = {nav:'plus', placeholder:1, status:'composer', panel:'pinned', ...read('variant',{})}
const seed = [
  {id:'seed-sales', title:'ABC-анализ товаров', date:'Сегодня', phase:'done', prompt:examples[0].prompt, kind:'abc', files:['sales-demo.csv'], project:'p-sales'},
  {id:'seed-flow', title:'Проверка сценария продаж', date:'Вчера', phase:'done', prompt:examples.find(item => item.id === 'refactor').prompt, kind:'refactor', files:['Продажи.lgp'], project:'p-sales', pinned:true},
  {id:'seed-data', title:'Контроль качества выгрузки', date:'Вчера', phase:'done', prompt:examples.find(item => item.id === 'quality').prompt, kind:'quality', files:['sales-demo.csv'], project:null},
]
// Projects as in the ChatGPT desktop app: a project groups chats with shared instructions and sources.
// A chat may have no project. Mechanism in OpenCode: a project is a working folder with AGENTS.md.
const projectColors = {red:'Красный', blue:'Синий', green:'Зелёный', violet:'Фиолетовый', amber:'Оранжевый'}
const seedProjects = [
  {id:'p-sales', name:'Аналитика продаж', color:'red', instructions:'Отвечай кратко. Новые сценарии сохраняй в папку «Продажи».', sources:['sales-demo.csv','Продажи.lgp'], pinned:false},
  {id:'p-report', name:'Ежемесячная отчётность', color:'blue', instructions:'', sources:[], pinned:false},
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
let peek = false, peekWanted = false, peekHeld = false, peekTimer = 0
const state = {
  page:'home', contour:read('contour','online'), theme:read('theme','light'),
  project:null, projects:stage === 'used' ? seedProjects.map(item => ({...item, sources:[...item.sources]})) : [], session:null, tabs:[],
  projectView:null, projectTab:'chats', menu:null, showProjectChats:true, renameId:null, deleteId:null,
  sessions:stage === 'used' ? seed.map(item => ({...item})) : [], overlay:null, mobile:false, draft:'', draftFiles:[], mode:'Выполнение',
  collapsed:read('collapsed',variant.panel === 'rail'), draftPackage:null, pickFor:null, connecting:false,
  // What the user has already done: things appear after these events and never disappear.
  progress:stage === 'used' ? {ownChats:3, packages:true, catalog:true, examplesHidden:false} : {ownChats:0, packages:false, catalog:false, examplesHidden:false},
  solution:'refactor', review:false, reviewTab:'plan', activeRun:false,
  // Actions shown on Home; the rest are one click away in «Все действия».
  pinnedActions:['document','check','improve','compare'],
  activePackage:serverPackages[0], importedPackages:[], packageScope:'personal',
  packageQuery:'', packageDir:'', packageSort:'date', packageDeep:false, pendingAction:null,
  // Packages the user worked with in this app: the app's own history, not a Loginom feature.
  recentPackages:stage === 'used' ? [{id:'sales',what:'документирование',when:'сегодня'},{id:'sales-edit',what:'изменение в разговоре',when:'вчера'},
    {id:'control',what:'проверка',when:'11 ноября'},{id:'quality',what:'просмотр',when:'10 ноября'}] : [],
  localPackage:null, packageError:'',
  calculationChanged:false, versionName:'', versionError:'',
}
const route = () => {
  const key = location.hash.slice(1).split('/')[0]
  if (key === 'runner' && !hubHasInstalled(state,state.solution)) {
    state.page = 'hub'
    history.replaceState(null,'','#hub')
  } else if (Object.hasOwn(pages, key) && !['chat','project'].includes(key)) state.page = key
  else if (key === 'chat' && state.session) state.page = 'chat'
  else if (key === 'project' && projectById(state.projectView)) state.page = 'project'
  else state.page = 'home'
}
route()
// «Проекты» on the review page reloads as a returning user and opens a project.
const pendingProject = read('openProject', null)
if (pendingProject) {
  write('openProject', null)
  if (projectById(pendingProject)) {
    state.projectView = state.project = pendingProject
    state.page = 'project'
    history.replaceState(null,'','#project')
  }
}
initSolutionDrafts(state)
// A fresh profile has the public Loginom stand filled in but not connected (as in 0.4).
if (stage === 'used') ensureSettings(state).connection.connected = true

const api = {
  icon, render, toast, navigate, setContour, setTheme, useTemplate, runSolution, discuss, pinSolution,
}
// Pins the package actions of a just-installed catalog item to Home, if there is room.
function pinSolution(solution) {
  const ids = Object.entries(packageActions).filter(([id,action]) => action.solution === solution && !action.noPackage && !state.pinnedActions.includes(id)).map(([id]) => id)
  if (!ids.length) return toast('Уже среди действий с пакетом')
  if (state.pinnedActions.length + ids.length > 4) return toast('В строке действий помещается четыре. Уберите одно в «Ещё».', 'alert')
  state.pinnedActions = [...state.pinnedActions, ...ids]
  toast('Добавлено в строку действий с пакетом')
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
  if (page === 'hub') state.progress.catalog = true
  if (page === 'loginom') state.progress.packages = true
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
function toast(message, kind = 'check') {
  const el = $('#announcements')
  el.innerHTML = `<span>${icon(kind,16)}${esc(message)}</span>`
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
  // Only documenting a file from the computer works without Loginom.
  if (!state.settings.connection.connected && hubHasInstalled(state, action.solution) && !(actionId === 'document' && pkg?.source === 'local')) {
    state.overlay = 'loginom-status'
    return render()
  }
  if (!hubHasInstalled(state, action.solution)) {
    openHubSolution(state, action.solution)
    return navigate('hub')
  }
  if (pkg?.id) rememberPackage(pkg.id, actionNoun[actionId] || action.title.toLocaleLowerCase('ru'))
  state.runnerPackage = pkg
  runSolution(action.run?.solution || action.solution, action.run?.mode ?? action.mode, from)
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
  // Coming back from Схема, Каталог or Настройки keeps what the user typed and chose.
  const keepDraft = state.session === null && !['home','project'].includes(state.page)
  state.session = null
  // «Новый разговор» in the panel starts a chat outside any project; inside a project, use its page.
  state.project = null
  if (!keepDraft) {
    state.draft = ''
    state.templateTitle = ''
    state.draftFiles = []
    state.draftPackage = null
  }
  state.review = false
  navigate('home')
}
function projectById(id) {
  return state.projects.find(item => item.id === id)
}
function openProject(id) {
  if (!projectById(id) || !canNavigate('project')) return
  if (state.projectView !== id) {
    state.draftFiles = []
    state.draftPackage = null
    state.projectTab = 'chats'
  }
  state.projectView = state.project = id
  state.session = null
  state.review = false
  navigate('project')
}
function openSession(id) {
  const item = state.sessions.find(entry => entry.id === id)
  if (!item || !canNavigate('chat')) return
  if (state.page === 'chat' && state.session === id && !state.review) return
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
  if (state.page !== 'settings') state.returnTo = state.page
  state.settings ??= {}
  state.settings.tab = tab
  navigate('settings')
}
function navButton(page, glyph, label = pages[page]) {
  const origin = state.page === 'runner' ? ({loginom:'loginom', home:'home', chat:'chat'}[state.runnerFrom] || 'hub') : state.page === 'studio' ? 'hub' : state.page
  const selected = origin === page
  return `<button class="nav-item${selected ? ' selected' : ''}" ${selected ? 'aria-current="page"' : ''} data-go="${page}">${icon(glyph,17)}<span>${label}</span></button>`
}
// The panel follows the ChatGPT desktop app: «Новый разговор», then «Закреплённые» (only once something is
// pinned), «Проекты» with «Новый проект», and «Разговоры» — every chat, newest first, a project chat labelled
// with its project. «…» on a row (it appears on hover) holds the actions. In variant «panel» Пакеты and
// Каталог join the panel after the first visit. Nothing that appeared ever disappears or moves.
function sidebar() {
  const items = variant.nav === 'panel'
    ? [state.progress.packages || state.page === 'loginom' ? navButton('loginom','flow','Пакеты') : '', state.progress.catalog || state.page === 'hub' ? navButton('hub','grid','Каталог') : ''].join('')
    : ''
  const pinnedProjects = state.projects.filter(item => item.pinned)
  const pinnedChats = state.sessions.filter(item => item.pinned)
  const recents = state.sessions.filter(item => !item.pinned && (state.showProjectChats || !item.project))
  return `<aside class="sidebar${state.mobile ? ' expanded' : ''}" aria-label="Боковая панель">
    <div class="sidebar-head">
      <button class="icon-btn neutral collapse-btn" data-action="collapse" aria-label="${state.collapsed ? 'Закрепить панель' : 'Свернуть панель до значков'}" title="${state.collapsed ? 'Закрепить панель' : 'Свернуть панель до значков'} (Ctrl+B)"><span class="rail-ico">${icon('panel',18)}</span>${state.collapsed ? `<span class="pin-ico">${icon('pin',18)}</span>` : ''}</button>
      <button class="brand" data-action="new" aria-label="Loginom AI Agent, новый разговор">
        <picture><img class="brand-standard" src="assets/loginom-wordmark.svg" alt="Loginom"><img class="brand-inverse" src="assets/loginom-wordmark-light.png" alt="Loginom"></picture><span>AI Agent</span>
      </button>
    </div>
    <button class="btn new-session${state.page === 'home' ? ' current' : ''}" data-action="new">${icon('plus',17)}<span>Новый разговор</span><kbd>Ctrl N</kbd></button>
    ${items ? `<nav class="sidenav" aria-label="Разделы">${items}</nav>` : ''}
    <div class="sidebar-history">
      ${pinnedProjects.length || pinnedChats.length ? `<section class="side-section" aria-label="Закреплённые">
        <div class="side-head"><h2>${icon('pin',15)}<span>Закреплённые</span>${chatsMark(pinnedChats)}</h2></div>
        ${pinnedProjects.map(projectRow).join('')}${pinnedChats.map(chatRow).join('')}</section>` : ''}
      <section class="side-section" aria-label="Проекты">
        <div class="side-head"><h2><span>Проекты</span></h2></div>
        <div class="side-row"><button class="project-link new-project" data-overlay="new-project">${icon('folder-plus',17)}<span>Новый проект</span></button></div>
        ${state.projects.filter(item => !item.pinned).map(projectRow).join('')}
      </section>
      ${recents.length ? `<section class="side-section" aria-label="Разговоры">
        <div class="side-head"><h2>${icon('clock',15)}<span>Разговоры</span>${chatsMark(recents)}</h2>${moreButton('recents','','Как показывать разговоры')}</div>
        ${recents.map(chatRow).join('')}</section>` : ''}
    </div>
    <nav class="sidebar-footer" aria-label="Настройки">
      ${runNotice()}
      ${navButton('settings','settings')}
      <button class="prototype-mark" data-go="review"><b class="proto-badge" aria-hidden="true">П2</b><span>Прототип 2 · что решить</span></button>
    </nav>
  </aside>`
}
function moreButton(kind, id, label) {
  const open = state.menu?.kind === kind && state.menu.id === id
  return `<button class="row-more" type="button" data-menu="${kind}:${id}" aria-label="${esc(label)}" aria-haspopup="menu" aria-expanded="${open}">${icon('more',16)}</button>`
}
function projectRow(item) {
  const current = state.page === 'project' && state.projectView === item.id
  return `<div class="side-row project-row"><button class="project-link${current ? ' current' : ''}" data-open-project="${item.id}" ${current ? 'aria-current="page"' : ''}><span class="pc-${item.color}">${icon('folder',17)}</span><span>${esc(item.name)}</span></button>${moreButton('project',item.id,`Действия с проектом «${item.name}»`)}</div>`
}
// A chat that belongs to a project always says so: the desktop ChatGPT's Recents does not, and its users
// complain they cannot tell where a chat went.
function chatRow(item) {
  const project = projectById(item.project)
  const current = state.page === 'chat' && state.session === item.id
  return `<div class="side-row chat-row"><button class="session-link${current ? ' current' : ''}" data-session="${item.id}">${icon('message',15)}<span class="row-text"><span>${esc(item.title)}</span>${project ? `<small class="pc-${project.color}">${esc(project.name)}</small>` : ''}</span>${sessionMark(item)}</button>${moreButton('chat',item.id,`Действия с разговором «${item.title}»`)}</div>`
}
// One mark for a whole list: what the collapsed panel shows on the section's icon.
function chatsMark(list) {
  return sessionMark(list.find(item => item.phase === 'running') || list.find(item => sessionMark(item)) || {})
}
// Status next to a conversation: the agent is working or waits for the user.
function sessionMark(item) {
  if (item.phase === 'running') return '<i class="conn-dot busy" title="Агент работает"></i><span class="sr-only">— агент работает</span>'
  if (['permission','plan','connect'].includes(item.phase) || item.phase === 'proposed') return '<i class="conn-dot warn" title="Ждёт вашего ответа"></i><span class="sr-only">— ждёт вашего ответа</span>'
  return ''
}
function runNotice() {
  const runs = Object.entries(state.solutions?.runs || {})
  const running = runs.some(([,run]) => run.step === 'running')
  const unseen = running ? null : runs.find(([,run]) => run.unseen)
  return `${running ? `<button class="conn-run" data-go="runner">${icon('play',16)}<i class="conn-dot busy"></i><span>Выполняется действие</span>${icon('chevron',14)}</button>` : ''}${unseen ? `<button class="conn-run" data-open-run="${unseen[0]}">${icon('play',16)}<i class="conn-dot ${unseen[1].outcome === 'success' ? 'ok' : 'warn'}"></i><span>${unseen[1].outcome === 'success' ? 'Готово — открыть результат' : 'Запуск завершён — посмотреть'}</span>${icon('chevron',14)}</button>` : ''}`
}
// Loginom is the agent's main dependency, so its state is always on screen: in the composer or in the
// top bar (the owner chooses). Not connected — an orange dot and words, not just a colour.
function loginomChip() {
  const connected = state.settings.connection.connected
  const label = state.connecting ? 'Подключаюсь…' : connected ? 'Loginom' : 'Loginom<span class="lgm-state"> не подключён</span>'
  return `<button class="lgm-chip${connected ? '' : ' off'}" type="button" data-overlay="loginom-status" title="${connected ? 'Loginom подключён · ' + esc(hostOf(state.settings.connection.url)) : 'Loginom не подключён — нажмите, чтобы подключить'}"><i class="conn-dot ${state.connecting ? 'busy' : connected ? 'ok' : 'warn'}"></i><span>${label}</span></button>`
}
function hostOf(url) {
  try { return new URL(url).host } catch { return url || '' }
}
function sessionProject() {
  return state.sessions.find(item => item.id === state.session)?.project
}
function header() {
  const nativeTab = state.page === 'chat' || state.page === 'home'
  return `<header class="topbar">
    <div class="top-left">
      <button class="icon-btn mobile-menu" aria-label="Открыть меню" aria-expanded="${state.mobile}" data-action="menu">${icon('menu',20)}</button>
      ${['home','chat','project'].includes(state.page) ? '' : `<span class="crumb-current">${pages[state.page]}</span>`}
      ${state.page === 'chat' && projectById(sessionProject()) ? `<button class="crumb-project" data-open-project="${sessionProject()}">${icon('folder',16)}<span>${esc(projectById(sessionProject()).name)}</span></button>` : ''}
    </div>
    <div class="top-actions">
      ${variant.status === 'top' || !['home','chat','project'].includes(state.page) ? loginomChip() : ''}
      <button class="icon-btn theme-btn" title="Переключить цветовую схему" aria-label="Переключить цветовую схему" data-action="theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon',17)}</button>
    </div>
  </header>
  ${nativeTab && state.tabs.length > 1 ? `<nav class="session-tabs" aria-label="Открытые разговоры">
    ${state.tabs.map(id => {
      const item = state.sessions.find(x => x.id === id)
      return `<div class="tab-wrap${state.page === 'chat' && state.session === id ? ' active':''}"><button class="session-tab" data-session="${id}">${icon('message',14)}<span>${esc(item?.title)}</span></button><button class="small-icon tab-close" aria-label="Закрыть вкладку ${esc(item?.title)}" data-close-tab="${id}">${icon('close',13)}</button></div>`
    }).join('')}
  </nav>` : ''}`
}
function composer() {
  const modelName = currentModel()
  const pkg = state.draftPackage
  return `<form class="composer" id="composer">
    ${pkg ? packageContext(pkg) : ''}
    ${state.draftFiles.length ? `<div class="attachment-list">${state.draftFiles.map((file,i) => `<span>${icon('file',14)} ${esc(file)} <button type="button" class="small-icon" aria-label="Убрать ${esc(file)}" data-remove-file="${i}">${icon('close',13)}</button></span>`).join('')}</div>` : ''}
    <textarea id="prompt" aria-label="Сообщение агенту" placeholder="${state.page === 'chat' ? 'Уточните задачу или задайте вопрос' : state.page === 'project' ? esc(`Новый разговор в проекте «${projectById(state.projectView)?.name}»`) : esc(placeholders[variant.placeholder] || placeholders[1])}" rows="2">${esc(state.draft)}</textarea>
    <div class="composer-toolbar">
      <div class="composer-options">
        <button class="icon-btn neutral plus-btn" type="button" aria-label="Добавить: пакет, файл, каталог" title="Пакет из Loginom, файл с компьютера, каталог" data-overlay="plus">${icon('plus',18)}</button>
        ${state.settings.preferences.agentPicker ? `<button class="filter-btn mode-pick" type="button" data-overlay="agent-mode" title="Режим агента: ${state.mode}">${icon(state.mode === 'Планирование' ? 'layers' : 'spark',15)} <span class="filter-label">${state.mode}</span> ${icon('down',12)}</button>` : ''}
      </div>
      <div class="composer-options">
        ${variant.status === 'composer' ? loginomChip() : ''}
        <button class="filter-btn composer-model${modelName ? '' : ' lgm-chip off'}" type="button" data-settings="models" title="Модель">${icon('cpu',15)} <span class="filter-label">${esc(modelName || 'Выберите модель')}</span> ${icon('down',12)}</button>
        <button class="send-btn" type="submit" ${state.draft.trim() ? '' : 'disabled'} aria-label="Отправить сообщение" title="Отправить сообщение">${icon('up',20)}</button>
      </div>
    </div>
  </form>`
}
// A chosen package: its chip and «Что сделать с пакетом» right above the input.
function packageContext(pkg) {
  const shown = state.pinnedActions.filter(id => packageActions[id] && !packageActions[id].noPackage)
  return `<div class="pkg-context${state.freshPackage ? ' fresh' : ''}">
    <div class="pkg-chip"><span class="glyph red">${icon('flow',15)}</span><span><strong>${esc(pkg.name)}</strong><small>${esc(pkg.where)}</small></span>
      ${pkg.item ? `<button type="button" class="link-btn" data-action="open-draft-package">Схема</button>` : ''}
      <button type="button" class="small-icon" data-action="remove-package" aria-label="Убрать пакет ${esc(pkg.name)}">${icon('close',13)}</button></div>
    <div class="pkg-actions" role="group" aria-label="Что сделать с пакетом"><span>Что сделать с пакетом:</span>${shown.map(id => {
      const action = packageActions[id]
      const ready = hubHasInstalled(state, action.solution)
      return `<button type="button" class="chip-btn" data-package-action="${id}" ${ready ? '' : 'title="Добавить из каталога"'}>${ready ? '' : icon('plus',13)}${action.title}</button>`
    }).join('')}<button type="button" class="chip-btn" data-overlay="all-actions" title="Все действия с пакетом">Ещё</button></div>
  </div>`
}
// A new conversation is the start screen: the input and, for newcomers, examples.
function home() {
  const p = state.progress
  const showExamples = !p.examplesHidden && p.ownChats < 3
  return `<div class="home-area new-chat">
    <section class="starter" aria-label="Новый разговор">${composer()}</section>
    ${showExamples ? `<section class="examples" aria-labelledby="examples-title">
      <div class="section-bar"><h2 id="examples-title">Примеры задач</h2><button class="icon-btn neutral" data-action="hide-examples" aria-label="Скрыть примеры задач" title="Скрыть. Вернуть можно через «+»">${icon('close',16)}</button></div>
      <div class="example-grid">${examples.map(item => `<button class="example-card" data-example="${item.id}">
        <span class="glyph ${item.tone}">${icon(item.icon,18)}</span><strong>${item.title}</strong><span>${item.detail}</span></button>`).join('')}</div>
    </section>` : ''}
  </div>`
}
function actionTile(id, action) {
  const ready = hubHasInstalled(state, action.solution)
  return `<button class="action-tile" data-package-action="${id}"><span class="glyph red">${icon(action.icon,19)}</span>
    <strong>${action.title}</strong><span>${action.detail}</span>${byId(action.solution)?.tier !== 'official' ? tierBadge(byId(action.solution)) : ''}${ready ? '' : `<small class="action-missing">${icon('plus',13)} Добавить из каталога</small>`}</button>`
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
  if (item.kind === 'chat') return `<div class="answer-block"><p>Я помогаю работать в Loginom: собираю сценарии, разбираю и документирую пакеты, проверяю данные. Опишите задачу своими словами или выберите пакет через «+» — над полем появятся действия с ним.</p><p class="muted">Для работы с пакетами нужен Loginom — я предложу подключиться, когда он понадобится.</p></div>`
  if (item.kind === 'document') return `<div class="answer-block"><h2>Пакет задокументирован</h2><p>Описаны назначение пакета, входные данные и каждый узел. Пакет не изменялся.</p>
    <dl class="result-metrics"><div><dt>Узлов описано</dt><dd>12</dd></div><div><dt>Входные данные</dt><dd>2 таблицы</dd></div><div><dt>Изменено</dt><dd>ничего</dd></div></dl>
    <div class="artifact-card"><span class="glyph green">${icon('file',19)}</span><span><strong>${esc((item.files[0] || 'Пакет.lgp').replace(/\.lgp$/i,''))} — описание.md</strong><small>В папке проекта</small></span><button class="btn" data-action="download-result">Скачать ${icon('download',14)}</button></div></div>`
  const info = item.kind === 'quality'
    ? ['Проверка данных завершена','Обнаружены 12 пропусков и 3 дубликата. В отчёте отмечены столбцы, которые нужно проверить перед загрузкой.',[['Строки','2 400'],['Пропуски','12'],['Дубликаты','3']]]
    : item.kind === 'refactor'
    ? ['Сценарий проанализирован','Обнаружены две возможности для упрощения. Разбор сохранён в отчёте вместе со списком проверенных узлов.',[['Проверено узлов','12'],['Рекомендации','2'],['Изменено узлов','0']]]
    : ['Сценарий ABC-анализа собран','Товары распределены по трём группам по накопленной доле выручки. Итоговая таблица и шаги сценария доступны в результатах.',[['Группа A','15 товаров'],['Группа B','28 товаров'],['Группа C','77 товаров']]]
  return `<div class="answer-block"><h2>${info[0]}</h2><p>${info[1]}</p>
    <dl class="result-metrics">${info[2].map(([key,value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <div class="artifact-card"><span class="glyph red">${icon('flow',19)}</span><span><strong>${resultPackage(item).name}</strong><small>Демонстрационный пакет Loginom</small></span><button class="btn" data-action="open-result-package">Открыть ${icon('external',14)}</button></div>
    <div class="answer-actions"><button class="link-btn" data-action="download-result">${icon('download',15)} Скачать отчёт CSV</button><button class="link-btn" data-action="author-from-chat">${icon('box',15)} Сохранить как навык</button></div>
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
// A project page as in ChatGPT: its own input (a chat started here belongs to the project), the instructions
// every chat of the project follows, and two tabs — its chats and its sources.
function projectPage() {
  const project = projectById(state.projectView)
  if (!project) return home()
  const chats = state.sessions.filter(item => item.project === project.id)
  const tab = state.projectTab === 'sources' ? 'sources' : 'chats'
  return `<div class="home-area project-page">
    <div class="project-head"><span class="project-mark pc-${project.color}">${icon('folder',24)}</span><h1>${esc(project.name)}</h1>${moreButton('project',project.id,`Действия с проектом «${project.name}»`).replace('row-more','row-more page-more')}</div>
    <section class="starter" aria-label="Новый разговор в проекте">${composer()}</section>
    <button class="project-instructions" data-overlay="project-settings"><span class="glyph violet">${icon('book',17)}</span><span><strong>Инструкции для агента</strong><small>${project.instructions ? esc(project.instructions) : 'Как работать в этом проекте: тон, формат, куда сохранять результаты'}</small></span><span class="link-btn">${project.instructions ? 'Изменить' : 'Добавить'}</span></button>
    <div class="project-tabs" role="tablist" aria-label="Содержимое проекта">
      <button role="tab" data-project-tab="chats" aria-selected="${tab === 'chats'}">Разговоры <span>${chats.length}</span></button>
      <button role="tab" data-project-tab="sources" aria-selected="${tab === 'sources'}">Источники <span>${project.sources.length}</span></button>
    </div>
    ${tab === 'chats'
      ? (chats.length ? `<div class="project-list">${chats.map(item => `<button class="project-chat" data-session="${item.id}">${icon('message',16)}<span><strong>${esc(item.title)}</strong><small>${esc(item.date)}${sessionMark(item) ? ' · ' + (item.phase === 'running' ? 'агент работает' : 'ждёт вашего ответа') : ''}</small></span></button>`).join('')}</div>`
        : `<p class="project-empty">Разговоров пока нет. Напишите задачу в поле выше — разговор появится здесь, а агент учтёт инструкции и источники проекта.</p>`)
      : `${project.sources.length ? `<div class="project-list">${project.sources.map((name,index) => `<div class="project-source">${icon(/\.lgp$/i.test(name) ? 'flow' : 'file',16)}<span>${esc(name)}</span><button class="small-icon" data-remove-source="${index}" aria-label="Убрать ${esc(name)} из проекта">${icon('close',13)}</button></div>`).join('')}</div>`
          : `<p class="project-empty">Источники — файлы, которые агент видит во всех разговорах проекта: таблицы, документы, пакеты .lgp.</p>`}
        <label class="btn project-add-source">${icon('upload',16)} Добавить файл<input type="file" id="project-source" class="sr-only"></label>`}
  </div>`
}
function chat() {
  const item = state.sessions.find(x => x.id === state.session)
  if (!item) return home()
  const isEdit = item.kind === 'package-edit'
  let body
  if (isEdit) body = packageEditBody(item)
  else if (item.phase === 'connect') {
    body = `<div class="answer-block"><h2>Для этой задачи нужен Loginom</h2><p>Я буду строить и проверять сценарий в Loginom. Подключитесь — и я продолжу.</p>${connectCard()}</div>`
  } else if (item.phase === 'permission') {
    body = `<div class="answer-block"><h2>Подготовил план</h2><p>Для следующего шага агенту нужно ваше разрешение.</p>${plan(item)}
      <div class="permission-card">${icon('shield',24)}<div><h3>${item.kind === 'refactor' ? 'Создать копию пакета?' : 'Сохранить новый сценарий в Loginom?'}</h3><p>${item.kind === 'refactor' ? 'Исходный пакет не изменится: агент работает с копией в вашей папке.' : 'Агент создаст пакет в вашей папке Loginom и больше ничего не изменит.'}</p><div class="button-row"><button class="btn primary" data-action="allow">Разрешить один раз</button><button class="btn quiet" data-action="deny">Отклонить</button></div></div></div></div>`
  } else if (item.phase === 'plan') {
    body = `<div class="answer-block"><h2>План работы</h2><p>Проверьте шаги перед запуском.</p>${plan(item)}<button class="btn primary" data-action="run-plan">Перейти к выполнению ${icon('arrow',16)}</button></div>`
  } else if (item.phase === 'running') {
    body = `<div class="answer-block" role="status"><h2><span class="spinner"></span> ${item.kind === 'document' ? 'Описываю пакет' : 'Выполняется сценарий'}</h2><p>${item.kind === 'document' ? 'Читаю узлы и связи между ними.' : 'Подготавливаю результат и проверяю выходные данные.'}</p>${item.kind === 'document' ? '' : plan(item)}<button class="btn" data-action="stop">${icon('stop',16)} Остановить</button></div>`
  } else if (item.phase === 'done' || item.phase === 'answer') {
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
// Setup happens where it is needed: the public stand is filled in, one button connects.
function connectCard() {
  const c = state.settings.connection
  if (state.contour === 'closed') return `<div class="connect-card"><span class="glyph red">${icon('lock',19)}</span><div><strong>Подключиться к Loginom</strong>
    <p class="muted">В закрытом контуре адрес Loginom задаёт администратор или вы — в настройках.</p>
    <div class="button-row"><button class="btn primary" data-settings="loginom">Настройки подключения</button></div></div></div>`
  return `<div class="connect-card"><span class="glyph red">${icon('external',19)}</span><div>
    <strong>Подключиться к Loginom</strong>
    <dl><div><dt>Адрес</dt><dd>${esc(hostOf(c.url))}</dd></div><div><dt>Пользователь</dt><dd>${esc(c.username)}</dd></div></dl>
    <p class="muted">${c.empty || !c.hasPassword ? 'Пароль для этого стенда не нужен.' : 'Пароль сохранён.'} Другой сервер Loginom — «Изменить».</p>
    <div class="button-row"><button class="btn primary" data-action="connect-loginom" ${state.connecting ? 'disabled' : ''}>${state.connecting ? '<span class="spinner"></span> Подключаюсь…' : 'Подключить'}</button><button class="btn quiet" data-settings="loginom">Изменить</button></div>
  </div></div>`
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
  const localFile = (style, label) => `<label class="${style}">${label}<input id="action-local-file" class="sr-only" type="file" accept=".lgp"></label>`
  if (!state.settings.connection.connected && state.pendingAction === 'document') return `<p class="dialog-desc">Документировать можно файл .lgp с компьютера — для этого Loginom не нужен.</p>
      <div class="button-row">${localFile('btn primary', icon('upload',15) + ' Файл .lgp с компьютера')}</div><p class="pkg-section">Или пакет из Loginom</p>${connectCard()}`
  if (!state.settings.connection.connected) return `<p class="dialog-desc">Пакеты хранятся в Loginom.</p>${connectCard()}`
  const lead = state.pendingAction === 'document' ? `Выберите пакет в Loginom или ${localFile('link-btn pkg-local', 'файл .lgp с компьютера')}. Исходный пакет не изменится.`
    : state.pendingAction ? 'Агент будет работать с копией — исходный пакет не изменится.' : 'Пакеты из папок, доступных вашей учётной записи Loginom.'
  if (!local) return `<p class="dialog-desc">${lead}</p>
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
    <div class="pkg-list pkg-files" id="package-files">${folders.map(name => `<button class="pkg-row" data-package-dir="${esc(name)}"><span class="glyph blue">${icon('folder',16)}</span><span class="pkg-name"><strong>${esc(name)}</strong></span>${icon('chevron',15)}</button>`).join('')}${files.map(item => row(item, deep ? packagePath(item) : '', meta(item))).join('')}${folders.length + files.length ? '' : `<p class="empty-note">${q ? `Нет пакетов с «${esc(state.packageQuery.trim())}» в имени${deep ? '' : ' в этой папке'}.` : 'В этой папке нет пакетов.'}</p>`}</div>
    <p class="pkg-count">${q ? `Найдено: ${files.length}${deep ? ' — в этой папке и вложенных' : ' в этой папке'}` : `${files.length} ${packageWord(files.length)}${folders.length ? ' · папок: ' + folders.length : ''}`}${q && !deep && !state.packageDir ? ` · <button class="link-btn" data-action="package-deep">Искать и во вложенных папках</button>` : ''}</p>`
}
// Actions come with app updates and from the catalog; the user pins up to four of them to Home.
function allActions() {
  const entries = Object.entries(packageActions)
  const installed = entries.filter(([,action]) => hubHasInstalled(state, action.solution))
  const row = ([id,action]) => {
    const item = byId(action.solution)
    const ready = hubHasInstalled(state, action.solution)
    const pinned = state.pinnedActions.includes(id)
    return `<div class="all-action"><button class="all-action-main" data-package-action="${id}"><span class="glyph red">${icon(action.icon,17)}</span>
      <span><strong>${action.title}${item?.tier && item.tier !== 'official' ? ` ${tierBadge(item)}` : ''}</strong><small>${action.detail}</small></span></button>
      ${ready ? '' : `<button class="pin-btn" data-package-action="${id}">Добавить</button>`}${!action.noPackage && (ready || pinned) ? `<button class="pin-btn" data-pin-action="${id}" aria-pressed="${pinned}" title="${pinned ? 'Убрать из строки действий' : 'Показывать в строке действий'}">${pinned ? 'Закреплено' : 'Закрепить'}</button>` : ''}</div>`
  }
  const group = (title, list) => list.length ? `<p class="pkg-section">${title}</p><div class="all-actions">${list.map(row).join('')}</div>` : ''
  return `<p class="dialog-desc">Новые действия появляются с обновлениями приложения и из каталога. Закреплённые — до четырёх — видны над полем ввода, когда выбран пакет.</p>
    ${group('Установлены', installed.filter(([,action]) => !action.noPackage))}
    ${group('Без пакета', installed.filter(([,action]) => action.noPackage))}
    ${group('Есть в каталоге', entries.filter(([,action]) => !hubHasInstalled(state, action.solution)))}
    <button class="link-btn" data-action="catalog-actions">Все действия в каталоге ${icon('arrow',15)}</button>`
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
    ${item.isDraft ? '' : `<div class="section-bar package-section"><h2>Что сделать с пакетом</h2><button class="link-btn" data-action="catalog-actions">Ещё действия в каталоге ${icon('arrow',16)}</button></div>
    <div class="action-grid">${Object.entries(packageActions).filter(([id,action]) => !action.noPackage && (hubHasInstalled(state,action.solution) || state.pinnedActions.includes(id))).map(([id,action]) => actionTile(id,action)).join('')}</div>`}
  </div>`
}
// Owner review page for iteration 2: variants to compare, what to try, what changed.
function review() {
  const choice = (key, value, label, hint) => `<button class="rv-choice" data-variant="${key}:${value}" aria-pressed="${String(variant[key]) === String(value)}"><strong>${label}</strong><small>${hint}</small></button>`
  const look = [
    ['Первый запуск','Начните как новый пользователь. Нажмите пример «ABC-анализ товаров» — текст встанет в поле — и отправьте. Разговор сразу появится в панели, а агент попросит подключить Loginom прямо в разговоре — одна кнопка.','stage-new'],
    ['Пакет','«+» у поля ввода → «Пакет из Loginom…» → выберите пакет. Над полем появится «Что сделать с пакетом». Пример «Задокументировать пакет» показывает то же на учебном файле.','try-package'],
    ['Панель','Свернуть — кнопка в левом верхнем углу панели или Ctrl+B: остаются значки. Наведите на них мышь — панель раскроется поверх страницы; выбор пункта или уход мыши свернут её, кнопка с булавкой закрепит. «После недели работы» — так выглядит приложение у того, кто им уже пользуется.','stage-used'],
    ['Проекты','Как в ChatGPT: в панели — «Проекты» и «Разговоры». Откройте проект «Аналитика продаж»: поле ввода начинает разговор в проекте, ниже — инструкции, разговоры и источники. «…» у разговора в панели (появляется при наведении) — закрепить, перенести в проект, переименовать, удалить.','try-projects'],
  ]
  const later = [
    'Закрытый контур без модели: в поле ввода вместо модели — «Выберите модель», отправка ведёт в настройки моделей.',
    'Элементы по наведению — действия над сообщением (копировать, повторить) — появятся вместе с лентой разговора в следующей итерации.',
    'Поиск по приложению убран. Поиск остался внутри каталога и окна выбора пакета: там десятки элементов (И1-7). Если и его убрать — скажите.',
    'После перезагрузки страницы прототип начинает заново: разговоры и счётчики не сохраняются.',
    'Из ChatGPT пока не перенесены: архив разговоров, перетаскивание разговора на проект, ручной порядок, отдельная память проекта.',
  ]
  const questions = [
    'Поиск. В ChatGPT поиск по разговорам и проектам — строкой в панели; по вашему решению В-6 поиска нет. Когда проектов и разговоров станет много, листать их долго. Рекомендую добавить «Поиск» строкой под «Новым разговором» (Ctrl K). Добавить?',
  ]
  const open11 = [
    'Названия в каталоге: Действие · Навык · Пакет Loginom · Подключение (И1.1-1).',
    'Список файлов Loginom идёт через внутренний метод веб-клиента: просить ли разработчиков Loginom его закрепить, и занимает ли фоновая сессия лицензию (И1.1-3).',
    'Тексты для сообщества и отметка «Понимаю, что Loginom это не проверял…» (И1.1-4).',
  ]
  const changed = ['Проекты и разговоры — как в ChatGPT: в панели «Новый разговор», «Проекты» с «Новый проект», «Разговоры» (разговор из проекта подписан его названием), закреплённое — сверху. У проекта своя страница: поле ввода, инструкции, разговоры, источники.','Панель сворачивается до значков (кнопка, Ctrl+B) и раскрывается поверх страницы при наведении мыши; выбор пункта сворачивает её.','Справка и режим работы — в настройках; поиск и «С чего начнём?» убраны; мастера первого запуска нет.','Loginom подключается там, где он понадобился; его состояние видно всегда.','Модель — в поле ввода; «+» — пакет, файл, каталог, примеры.','«Примеры задач» под полем: вставляют текст, закрываются крестиком, перестают показываться после трёх своих разговоров.','Действия с пакетом — над полем ввода, когда пакет выбран.','Вкладки разговоров — только когда открыто больше одного.','Без Loginom агент отвечает на вопросы; подключиться просит, только когда задаче нужен Loginom.','Переключатель «Выполнение / Планирование» скрыт для новичка; включается в Настройки → Общие.','В режиме «Интернет» модель есть сразу — бесплатная модель OpenCode.']
  return `<div class="native-page review-page">
    <div class="native-heading"><div><p class="eyebrow">Прототип · итерация 2 — оболочка</p><h1>Что решить</h1><p>Выберите вариант в четырёх вопросах — переключение сразу меняет прототип. Затем пройдите четыре сценария, около 10 минут.</p></div></div>
    <h2 class="rv-heading">Выбрать вариант</h2>
    <div class="rv-variants">
      <div><h3>1. Где «Пакеты» и «Каталог»</h3><div class="rv-choices">${choice('nav','plus','Только через «+»','Панель не меняется: новый разговор, проекты, разговоры')}${choice('nav','panel','Появляются в панели','«Пакеты» — после первого пакета, «Каталог» — после первого захода')}</div></div>
      <div><h3>2. Подсказка в поле ввода</h3><div class="rv-choices">${choice('placeholder',1,'Вариант 1',esc(placeholders[1]))}${choice('placeholder',2,'Вариант 2',esc(placeholders[2]))}</div></div>
      <div><h3>3. Где состояние Loginom</h3><div class="rv-choices">${choice('status','composer','В поле ввода','Рядом с моделью; на страницах без поля ввода — вверху справа')}${choice('status','top','Вверху справа','Рядом с темой, видно на любой странице')}</div></div>
      <div><h3>4. Панель при первом запуске</h3><div class="rv-choices">${choice('panel','pinned','Закреплена','Подписи видны сразу; свернуть до значков — кнопкой или Ctrl+B')}${choice('panel','rail','Свёрнута до значков','Раскрывается, когда на неё наведена мышь')}</div></div>
    </div>
    <h2 class="rv-heading">Вопрос</h2>
    <ul class="rv-questions">${questions.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Посмотреть</h2>
    <div class="rv-grid">${look.map(([title,text,target],index) => `<article class="rv-card"><span class="rv-num">${'АБВГ'[index]}</span><h3>${title}</h3><p>${text}</p><button class="btn" data-action="${target}">${target === 'stage-new' ? 'Начать как новый пользователь' : target === 'try-projects' ? 'Открыть проект' : target === 'stage-used' ? 'После недели работы' : 'Открыть'} ${icon('arrow',15)}</button></article>`).join('')}</div>
    <h2 class="rv-heading">Пока не показано</h2>
    <ul class="rv-changes">${later.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Ещё ждут ответа с итерации 1.1</h2>
    <ul class="rv-questions rv-answers">${open11.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Что изменилось</h2>
    <ul class="rv-changes">${changed.map(text => `<li>${text}</li>`).join('')}</ul>
  </div>`
}
function projectForm(project) {
  return `<form id="project-form" class="project-form">
    <label for="project-name">Название</label>
    <input id="project-name" name="name" maxlength="45" value="${esc(project?.name)}" placeholder="Например, Отчётность за квартал" required>
    <fieldset class="color-pick"><legend>Цвет</legend>${Object.entries(projectColors).map(([color,label]) => `<label title="${label}"><input type="radio" name="color" value="${color}" ${color === (project?.color || 'red') ? 'checked' : ''}><span class="pc-${color}">${icon('folder',20)}</span><span class="sr-only">${label}</span></label>`).join('')}</fieldset>
    ${project ? `<label for="project-instructions">Инструкции для агента</label>
    <textarea id="project-instructions" name="instructions" rows="4" placeholder="Например: отвечай кратко; новые сценарии сохраняй в папку «Продажи»">${esc(project.instructions)}</textarea>
    <p class="field-hint">Агент следует им во всех разговорах проекта.</p>` : '<p class="field-hint">Инструкции и источники добавите на странице проекта.</p>'}
    <div class="button-row"><button class="btn primary">${project ? 'Сохранить' : 'Создать проект'}</button></div>
  </form>`
}
// The «…» menu of a chat, a project or the chats list. It lives outside the panel so the panel's clipping
// does not cut it; render() places it under the button that opened it.
function rowMenu() {
  const menu = state.menu
  if (!menu) return ''
  const item = (act, glyph, label, extra = '') => `<button role="menuitem" data-menu-act="${act}" ${extra}>${icon(glyph,16)}<span>${label}</span></button>`
  const chat = menu.kind === 'chat' ? state.sessions.find(entry => entry.id === menu.id) : null
  const project = menu.kind === 'project' ? projectById(menu.id) : null
  const items = chat && menu.step === 'move'
    ? [item('back','chevron','Назад','class="menu-back"'), ...state.projects.filter(entry => entry.id !== chat.project).map(entry => `<button role="menuitem" data-menu-act="move:${entry.id}"><span class="pc-${entry.color}">${icon('folder',16)}</span><span>${esc(entry.name)}</span></button>`),
       item('new-project-move','folder-plus','Новый проект…')]
    : chat ? [item('rename','file','Переименовать'), item('pin','pin',chat.pinned ? 'Открепить' : 'Закрепить'), item('move','folder','Перенести в проект'),
       chat.project ? item('unmove','close','Убрать из проекта') : '', item('delete','alert','Удалить','class="danger"')]
    : project ? [item('pin','pin',project.pinned ? 'Открепить' : 'Закрепить'), item('settings','settings','Настройки проекта'), item('delete','alert','Удалить проект','class="danger"')]
    : [`<button role="menuitemcheckbox" data-menu-act="toggle-project-chats" aria-checked="${state.showProjectChats}">${icon(state.showProjectChats ? 'check' : 'circle',16)}<span>Показывать разговоры проектов</span></button>`]
  return `<div class="row-menu" id="row-menu" role="menu" aria-label="Действия">${items.join('')}</div>`
}
function overlay() {
  const kind = state.overlay
  if (!kind) return ''
  const content = {
    'package-edit-example':['Изменение на учебном пакете',`<p class="dialog-desc">Сценарий правки формулы в прототипе доступен для пакета «Расчёт суммы.lgp». Откройте его в чате, чтобы увидеть сравнение, подтверждение и сохранение.</p><div class="button-row package-picker-actions"><button class="btn quiet" type="button" data-action="dismiss">Отмена</button><button class="btn primary" type="button" data-action="ask-example-package-edit">Открыть учебный пакет в чате</button></div>`],
    'package-version':['Сохранить новую версию', kind === 'package-version' ? versionDialog() : ''],
    'all-actions':['Действия с пакетом', kind === 'all-actions' ? allActions() : ''],
    'pick-package':[packageActions[state.pendingAction]?.title + ': какой пакет?', kind === 'pick-package' ? packagePicker(false) : ''],
    'package-server':['Открыть из Loginom', kind === 'package-server' ? packagePicker(false) : ''],
    'package-computer':['Открыть с компьютера', kind === 'package-computer' ? packagePicker(true) : ''],
    'new-project': ['Новый проект', kind === 'new-project' ? projectForm(null) : ''],
    'project-settings': ['Настройки проекта', kind === 'project-settings' ? projectForm(projectById(state.projectView)) : ''],
    'delete-chat': ['Удалить разговор?', kind === 'delete-chat' ? `<p class="dialog-desc">«${esc(state.sessions.find(item => item.id === state.deleteId)?.title)}» удалится насовсем.</p><div class="button-row"><button class="btn danger" data-action="confirm-delete-chat">Удалить</button><button class="btn" data-action="dismiss">Отмена</button></div>` : ''],
    'delete-project': ['Удалить проект?', kind === 'delete-project' ? `<p class="dialog-desc">Проект «${esc(projectById(state.deleteId)?.name)}» удалится вместе с инструкциями и источниками. Его разговоры (${state.sessions.filter(item => item.project === state.deleteId).length}) останутся в «Разговорах» без проекта.</p><div class="button-row"><button class="btn danger" data-action="confirm-delete-project">Удалить проект</button><button class="btn" data-action="dismiss">Отмена</button></div>` : ''],
    // «+» is the one always-visible door to everything that is not on screen yet.
    plus: ['Добавить',`<div class="dialog-options">
        <button data-action="plus-package"><span class="glyph red">${icon('flow',19)}</span><span><strong>Пакет из Loginom…</strong><small>Агент будет работать с пакетом; над полем появятся действия с ним</small></span>${icon('chevron',17)}</button>
        <label class="dialog-option"><span class="glyph blue">${icon('upload',18)}</span><span><strong>Файл с компьютера…</strong><small>Таблица, документ или пакет .lgp</small></span><input type="file" id="local-attachment" class="sr-only" aria-label="Выбрать файл с компьютера"></label>
        <button data-action="plus-catalog"><span class="glyph violet">${icon('grid',18)}</span><span><strong>Каталог…</strong><small>Действия, навыки и готовые сценарии из Loginom Hub</small></span>${icon('chevron',17)}</button>
        ${state.page === 'home' && (state.progress.examplesHidden || state.progress.ownChats >= 3) ? `<button data-action="show-examples"><span class="glyph green">${icon('spark',18)}</span><span><strong>Примеры задач</strong><small>Показать примеры под полем ввода</small></span>${icon('chevron',17)}</button>` : ''}
      </div>
      <p class="pkg-section">Учебные файлы</p>
      <div class="dialog-options"><button data-file="sales-demo.csv"><span class="glyph blue">${icon('database',18)}</span><span><strong>sales-demo.csv</strong><small>Пример таблицы продаж</small></span>${icon('plus',18)}</button><button data-file="Продажи.lgp"><span class="glyph red">${icon('flow',19)}</span><span><strong>Продажи.lgp</strong><small>Учебный пакет Loginom</small></span>${icon('plus',18)}</button></div>`],
    'loginom-status': ['Loginom', kind === 'loginom-status' ? (state.settings.connection.connected
      ? `<div class="connect-card"><span class="glyph green">${icon('check',19)}</span><div><strong>Подключено</strong>
          <dl><div><dt>Адрес</dt><dd>${esc(hostOf(state.settings.connection.url))}</dd></div><div><dt>Пользователь</dt><dd>${esc(state.settings.connection.username)}</dd></div><div><dt>Папка</dt><dd>${esc(packageFolder('personal'))}</dd></div></dl>
          <div class="button-row"><button class="btn quiet" data-settings="loginom">${icon('settings',15)} Настройки подключения</button></div></div></div>`
      : `<p class="dialog-desc">Без Loginom агент отвечает на вопросы, но не открывает и не меняет пакеты.</p>${connectCard()}`) : ''],
    'agent-mode':['Режим агента',`<div class="dialog-options">${[['Выполнение','Предлагает план и запрашивает разрешения на действия'],['Планирование','Готовит план до начала выполнения']].map(([mode,detail]) => `<button data-agent-mode="${mode}"><span class="glyph red">${icon(mode === 'Планирование' ? 'layers':'spark',19)}</span><span><strong>${mode}</strong><small>${detail}</small></span>${state.mode === mode ? icon('check',18):''}</button>`).join('')}</div>`],
    'session-options':['Разговор',`<div class="dialog-options"><button data-action="rename-session"><span class="glyph blue">${icon('file',19)}</span><span><strong>Переименовать</strong></span>${icon('chevron',17)}</button>${currentPackageEdit() ? '' : `<button data-action="download-result"><span class="glyph red">${icon('download',19)}</span><span><strong>Скачать демонстрационный отчёт CSV</strong></span></button>`}</div>`],
    rename:['Переименовать разговор',`<form class="inline-form" id="rename-form"><label class="sr-only" for="session-name">Имя разговора</label><input id="session-name" name="name" maxlength="70" value="${esc(state.sessions.find(x => x.id === state.renameId)?.title)}" required><button class="btn primary">Сохранить</button></form>`],
  }[kind]
  if (!content) return ''
  return `<dialog class="app-dialog" id="app-dialog" aria-labelledby="app-dialog-title"><div class="app-dialog-heading"><h2 id="app-dialog-title">${content[0]}</h2><button class="icon-btn" data-action="dismiss" aria-label="Закрыть">${icon('close',20)}</button></div><div class="app-dialog-body">${content[1]}</div></dialog>`
}
function pageContents() {
  switch (state.page) {
    case 'home': return home()
    case 'chat': return chat()
    case 'project': return projectPage()
    case 'hub': return renderHub(state)
    case 'settings': return renderSettings(state)
    case 'onboarding': return renderOnboarding(state)
    case 'runner':
    case 'studio': return renderSolutions(state)
    case 'loginom': return packages()
    case 'review': return review()
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
  if (settings.connection.connected) for (const item of state.sessions.filter(x => x.phase === 'connect')) {
    item.phase = firstPhase(item)
    if (item.phase === 'running') finishLater(item)
  }
  if (state.activePackage.isDraft && state.activePackage.project !== state.project) {
    state.activePackage = serverPackages[0]
    state.node = null
  }
  const scroll = resetScroll ? 0 : ($('#main')?.scrollTop ?? 0)
  const focused = document.activeElement?.id === 'prompt' ? [$('#prompt').selectionStart, $('#prompt').selectionEnd] : null
  setThemeAttribute()
  document.title = pages[state.page] + ' · Loginom AI Agent'
  app.innerHTML = `<div class="workspace${state.collapsed ? ' collapsed' : ''}${state.collapsed && peek ? ' peek' : ''}">
    ${sidebar()}${state.mobile ? '<button class="mobile-scrim" aria-label="Закрыть меню" data-action="menu"></button>':''}
    <div class="workspace-main">${header()}<main id="main" tabindex="-1" class="page page-${state.page}">${pageContents()}</main>
    </div>
  </div>${rowMenu()}${overlay()}`
  $('#main').scrollTop = scroll
  if (focused && $('#prompt') && !state.overlay) {
    $('#prompt').focus()
    $('#prompt').setSelectionRange(...focused)
  }
  state.freshPackage = false
  const menu = $('#row-menu')
  if (menu) {
    menu.style.left = Math.max(8, Math.min(state.menu.x, innerWidth - menu.offsetWidth - 8)) + 'px'
    menu.style.top = Math.max(8, Math.min(state.menu.y, innerHeight - menu.offsetHeight - 8)) + 'px'
    if (state.menu.keyboard) menu.querySelector('button')?.focus()
  }
  const dialog = $('#app-dialog')
  if (dialog) {
    dialog.showModal()
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss() })
    dialog.addEventListener('click', event => { if (event.target === dialog) dismiss() })
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
  state.pickFor = null
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
// Closed contour without a model from the administrator: the input says «Выберите модель» before the first send.
function currentModel() {
  const model = state.settings?.model
  if (!model?.name || (state.contour === 'closed' && model.kind === 'cloud')) return ''
  return model.name
}
function send() {
  const prompt = state.draft.trim()
  if (!prompt) {
    $('#prompt')?.focus()
    return
  }
  if (!currentModel()) {
    toast('Сначала выберите модель — без неё агент не ответит', 'alert')
    return settingsTab('models')
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
  const withPackage = Boolean(state.draftPackage)
  const kind = /документ/i.test(prompt) && withPackage ? 'document'
    : /дубликат|пропуск|выгрузк/i.test(prompt) ? 'quality' : /проверь|оптимиз|улучш/i.test(prompt) ? 'refactor'
    : /abc|сценари|loginom|пакет|узл|данн|таблиц|lgp/i.test(prompt) || withPackage ? 'abc' : 'chat'
  // Questions need no Loginom; documenting a file from the computer neither. The rest asks to connect.
  const needsLoginom = kind !== 'chat' && !(kind === 'document' && state.draftPackage?.source === 'local')
  const phase = needsLoginom && !state.settings.connection.connected ? 'connect'
    : kind === 'chat' ? 'answer' : kind === 'document' ? 'running' : firstPhase()
  const next = {
    id: old?.id ?? 'session-' + Date.now(), date:'Сейчас', title:old?.title || state.templateTitle || prompt.slice(0,56),
    kind, phase,
    files:[...(state.draftPackage ? [state.draftPackage.name] : []), ...state.draftFiles], prompt, project:state.project,
    previous:old ? [...(old.previous || []), old.prompt].slice(-4) : [],
  }
  // Examples stop showing once the user has started three conversations of their own.
  if (!old && !state.templateTitle) state.progress.ownChats++
  if (state.draftPackage) state.progress.packages = true
  state.sessions = [next, ...state.sessions.filter(x => x.id !== next.id)]
  state.templateTitle = ''
  state.draftPackage = null
  openSession(next.id)
  if (phase === 'running') setPhase('running')
}
// Documenting only reads the package, so it needs no permission to write.
function firstPhase(item) {
  if (item?.kind === 'document') return 'running'
  return state.mode === 'Планирование' ? 'plan' : 'permission'
}
function connectLoginom() {
  if (state.connecting) return
  state.connecting = true
  render()
  setTimeout(() => {
    state.connecting = false
    ensureSettings(state).connection.connected = true
    toast('Loginom подключён')
    render()
  }, 700)
}
function chooseDraftPackage(ref) {
  state.draftPackage = ref
  state.freshPackage = true
  state.progress.packages = true
  if (!['home','chat','project'].includes(state.page)) navigate('home')
  else render()
  $('#prompt')?.focus()
}
function setPhase(phase) {
  const item = state.sessions.find(x => x.id === state.session)
  if (!item) return
  item.phase = phase
  state.activeRun = state.sessions.some(x => x.phase === 'running')
  render()
  if (phase === 'running') finishLater(item)
}
function finishLater(item) {
  setTimeout(() => {
    if (item.phase !== 'running') return
    item.phase = 'done'
    state.activeRun = state.sessions.some(x => x.phase === 'running')
    render()
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
    document:'Узел,Что делает\nCSV продаж,Загружает продажи\nПодготовка,Проверяет пропуски\nABC-анализ,Группирует товары\nРезультат,Выгружает таблицу\n',
    chat:'Ответ\nДемонстрационный разговор\n',
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
  collapse:() => { state.collapsed = !state.collapsed; peekHeld = state.collapsed; setPeek(false); write('collapsed',state.collapsed); render() },
  'connect-loginom':connectLoginom,
  'hide-examples':() => {
    state.progress.examplesHidden = true
    render()
    toast('Примеры скрыты. Вернуть — через «+»')
    $('#prompt')?.focus()
  },
  'show-examples':() => {
    state.progress.examplesHidden = false
    state.progress.ownChats = 0
    dismiss()
  },
  'stage-new':() => { write('stage','new'); write('collapsed',variant.panel === 'rail'); write('contour','online'); location.hash = ''; location.reload() },
  'try-projects':() => {
    if (stage === 'used' && projectById('p-sales')) return openProject('p-sales')
    write('stage','used')
    write('openProject','p-sales')
    location.hash = ''
    location.reload()
  },
  'stage-used':() => { write('stage','used'); location.hash = ''; location.reload() },
  'try-package':() => { newSession(); state.pickFor = 'composer'; actions['plus-package']() },
  'plus-package':() => {
    resetPackageBrowse()
    state.pendingAction = null
    state.pickFor = 'composer'
    state.overlay = 'package-server'
    render()
  },
  'plus-catalog':() => navigate('hub'),
  'remove-package':() => { state.draftPackage = null; render(); $('#prompt')?.focus() },
  'open-draft-package':() => { if (state.draftPackage?.item) openPackage(state.draftPackage.item) },
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
  'catalog-actions':() => { showHubType(state, 'Действие'); navigate('hub') },
  'review-actions':() => { navigate('home'); state.overlay = 'all-actions'; render() },
  'review-skills':() => { showHubType(state, 'Навык'); navigate('hub') },
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
  'rename-session':() => { state.renameId = state.session; state.overlay = 'rename'; render() },
  'confirm-delete-chat':() => {
    const id = state.deleteId
    state.sessions = state.sessions.filter(item => item.id !== id)
    state.tabs = state.tabs.filter(tab => tab !== id)
    state.overlay = null
    toast('Разговор удалён')
    if (state.page === 'chat' && state.session === id) return state.projectView && projectById(sessionProjectOf(id)) ? openProject(state.projectView) : newSession()
    render()
  },
  'confirm-delete-project':() => {
    const id = state.deleteId
    state.projects = state.projects.filter(item => item.id !== id)
    for (const item of state.sessions.filter(entry => entry.project === id)) item.project = null
    if (state.project === id) state.project = null
    state.overlay = null
    toast('Проект удалён, его разговоры — в «Разговорах»')
    if (state.page === 'project' && state.projectView === id) return newSession()
    render()
  },
}
function sessionProjectOf(id) {
  return state.sessions.find(item => item.id === id)?.project
}
// What a «…» menu item does. The menu closes after every item except «Перенести в проект», which opens
// the list of projects in its place.
function menuAction(act) {
  const menu = state.menu
  const chat = menu.kind === 'chat' ? state.sessions.find(item => item.id === menu.id) : null
  const project = menu.kind === 'project' ? projectById(menu.id) : null
  if (act === 'move' || act === 'back') {
    state.menu = {...menu, step:act === 'move' ? 'move' : null}
    return render()
  }
  state.menu = null
  if (act === 'toggle-project-chats') state.showProjectChats = !state.showProjectChats
  if (act === 'pin' && chat) chat.pinned = !chat.pinned
  if (act === 'pin' && project) project.pinned = !project.pinned
  if (act === 'rename') {
    state.renameId = chat.id
    state.overlay = 'rename'
  }
  if (act === 'delete') {
    state.deleteId = menu.id
    state.overlay = chat ? 'delete-chat' : 'delete-project'
  }
  if (act === 'settings') {
    state.projectView = project.id
    state.overlay = 'project-settings'
  }
  if (act === 'unmove') {
    chat.project = null
    toast('Разговор убран из проекта')
  }
  if (act.startsWith('move:')) {
    chat.project = act.slice(5)
    if (state.session === chat.id) state.project = chat.project
    toast(`Перенесено в «${projectById(chat.project).name}»`)
  }
  if (act === 'new-project-move') {
    state.moveAfterCreate = chat.id
    state.overlay = 'new-project'
  }
  render()
}
app.addEventListener('click', event => {
  const opener = event.target.closest('[data-menu]')
  if (opener) {
    const [kind, id = ''] = opener.dataset.menu.split(':')
    const rect = opener.getBoundingClientRect()
    const same = state.menu?.kind === kind && state.menu.id === id
    state.menu = same ? null : {kind, id, x:rect.left, y:rect.bottom + 4, keyboard:!event.detail}
    return render()
  }
  const act = event.target.closest('[data-menu-act]')
  if (act) return menuAction(act.dataset.menuAct)
  if (state.menu) {
    state.menu = null
    render()
  }
  const el = event.target.closest('button')
  if (!el) return
  const d = el.dataset
  if (d.go) return navigate(d.go)
  if (d.settings) return settingsTab(d.settings)
  if (d.overlay) { state.overlay = d.overlay; return render() }
  if (d.session) return openSession(d.session)
  if (d.openProject) return openProject(d.openProject)
  if (d.projectTab) {
    state.projectTab = d.projectTab
    return render()
  }
  if (d.removeSource) {
    projectById(state.projectView).sources.splice(Number(d.removeSource),1)
    return render()
  }
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
  if (d.variant) {
    const [key, value] = d.variant.split(':')
    variant[key] = key === 'placeholder' ? Number(value) : value
    write('variant',variant)
    if (key === 'panel') {
      state.collapsed = value === 'rail'
      write('collapsed',state.collapsed)
      setPeek(false)
    }
    return render()
  }
  if (d.example) {
    const example = examples.find(item => item.id === d.example)
    useTemplate(example.title,example.prompt)
    if (example.pkg) chooseDraftPackage({name:'Продажи.lgp', where:'Учебный файл · на компьютере', source:'local'})
    return
  }
  if (d.file) {
    if (/\.lgp$/i.test(d.file)) {
      state.overlay = null
      return chooseDraftPackage({name:d.file, where:'Учебный файл · на компьютере', source:'local'})
    }
    return attach(d.file)
  }
  if (d.removeFile != null) {
    state.draftFiles.splice(Number(d.removeFile),1)
    return render()
  }
  if (d.agentMode) { state.mode = d.agentMode; return dismiss() }
  if (d.review) { state.reviewTab = d.review; return render() }
  if (d.node != null) { state.node = Number(d.node); return render() }
  if (d.openRun) {
    const [solution, mode] = d.openRun.split(':')
    state.solution = solution
    state.solutionMode = mode || state.solutionMode
    state.solutions.runs[d.openRun].unseen = false
    return navigate('runner')
  }
  if (d.pinAction) {
    const pinned = state.pinnedActions.includes(d.pinAction)
    if (!pinned && state.pinnedActions.length >= 4) return toast('В строке действий помещается четыре. Сначала уберите одно.', 'alert')
    state.pinnedActions = pinned ? state.pinnedActions.filter(id => id !== d.pinAction) : [...state.pinnedActions, d.pinAction]
    return render()
  }
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
    const forComposer = state.pickFor === 'composer'
    state.overlay = null
    state.pendingAction = null
    state.pickFor = null
    if (action) return runAction(action, packageRef(item), 'home')
    if (forComposer) {
      rememberPackage(item.id, 'разговор')
      return chooseDraftPackage({...packageRef(item), item})
    }
    return openPackage(item)
  }
  if (d.packageAction) {
    const action = packageActions[d.packageAction]
    state.overlay = null
    if (!hubHasInstalled(state, action.solution)) return runAction(d.packageAction, null, 'home')
    if (action.noPackage) return runAction(d.packageAction, null, 'home')
    if (state.draftPackage && state.page !== 'loginom') return runAction(d.packageAction, state.draftPackage, state.page === 'chat' ? 'chat' : 'home')
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
  if (event.target.id === 'package-search') {
    state.packageQuery = event.target.value
    if (!event.target.value.trim()) state.packageDeep = false
    $('#package-browse').innerHTML = packageBrowse()
  }
})
app.addEventListener('change', event => {
  if (event.target.id === 'package-local-file' && event.target.files[0]) selectLocalPackage(event.target.files[0].name)
  if (event.target.id === 'action-local-file' && event.target.files[0]) {
    const name = event.target.files[0].name
    const action = state.pendingAction
    if (!/\.lgp$/i.test(name)) return toast('Выберите файл с расширением .lgp')
    state.overlay = null
    state.pendingAction = null
    runAction(action, {name, where:'На компьютере', source:'local'}, 'home')
  }
  if (event.target.id === 'project-source' && event.target.files[0]) {
    projectById(state.projectView).sources.push(event.target.files[0].name)
    state.projectTab = 'sources'
    return render()
  }
  if (event.target.id === 'local-attachment' && event.target.files[0]) {
    const name = event.target.files[0].name
    if (!/\.lgp$/i.test(name)) return attach(name)
    state.overlay = null
    chooseDraftPackage({name, where:'На компьютере', source:'local'})
  }
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
    state.sessions.find(x => x.id === state.renameId).title = name
    return dismiss()
  }
  const form = new FormData(event.target)
  if (state.overlay === 'project-settings') {
    Object.assign(projectById(state.projectView), {name, color:form.get('color'), instructions:form.get('instructions').trim()})
    return dismiss()
  }
  const project = {id:'p-' + Date.now(), name, color:form.get('color'), instructions:'', sources:[], pinned:false}
  state.projects.push(project)
  state.overlay = null
  const moved = state.sessions.find(item => item.id === state.moveAfterCreate)
  state.moveAfterCreate = null
  if (moved) {
    moved.project = project.id
    if (state.session === moved.id) state.project = project.id
    toast(`Перенесено в «${name}»`)
    return render()
  }
  return openProject(project.id)
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
  if (event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey) && !document.querySelector('dialog[open]')) {
    event.preventDefault()
    actions.collapse()
  }
  if (event.key === 'Escape' && state.menu) {
    const opener = `[data-menu="${state.menu.kind}:${state.menu.id}"]`
    state.menu = null
    render()
    document.querySelector(opener)?.focus()
    return
  }
  if (event.key === 'Escape' && state.collapsed && !document.querySelector('dialog[open]')) {
    if (document.activeElement?.closest('.sidebar')) focusPage()
    if (peek) {
      peekHeld = true
      setPeek(false)
    }
  }
  if (event.key === 'Enter' && event.target.id === 'prompt' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    send()
  }
})
// Collapsed panel: a rail of icons that opens over the page while the mouse is on it. render() rebuilds
// the DOM, so the open state lives in `peek` and the class is toggled in place: no re-render, no flicker.
// A short delay keeps a mouse passing by from opening it; a pending change is not restarted on every move.
function peekSidebar(open) {
  if (open === peekWanted) return
  peekWanted = open
  clearTimeout(peekTimer)
  peekTimer = setTimeout(() => setPeek(open), open ? 90 : 200)
}
function setPeek(open) {
  clearTimeout(peekTimer)
  peek = peekWanted = open
  document.querySelector('.workspace')?.classList.toggle('peek', open && state.collapsed)
}
// After the user collapses the panel or presses Esc with the mouse still on it, it stays a rail until the
// mouse leaves; otherwise it would open again under the cursor right after the click. While render()
// swaps the DOM the pointer briefly lands on #app itself — that is not the mouse leaving.
// Not while a button is held (selecting text by dragging past the left edge); pointer events over a dialog
// say nothing about the panel either. The 90 ms delay lets a mouse cross the 60 px rail without opening it.
document.addEventListener('pointerover', event => {
  const target = event.target
  if (event.pointerType !== 'mouse' || event.buttons || !state.collapsed || [app, document.body, document.documentElement].includes(target) || target.closest('dialog')) return
  const inside = Boolean(target.closest('.sidebar, .row-menu'))
  if (!inside) peekHeld = false
  if (peekHeld) return
  peekSidebar(inside)
})
// A choice made in the opened panel closes it, so the panel does not cover the page that just opened.
// Chosen from the keyboard, focus moves on to the page instead of falling back to the panel. Without a
// mouse (touch screens) a tap on the rail outside its icons opens it and a tap on the page closes it.
document.addEventListener('click', event => {
  if (!state.collapsed) return
  const inside = event.target.closest('.sidebar, .row-menu')
  if (!inside) return peek && setPeek(false)
  if (!event.target.closest('.sidebar button:not([data-menu])')) return setPeek(true)
  peekHeld = true
  setPeek(false)
  if (!event.detail && !document.querySelector('dialog[open]')) focusPage()
})
function focusPage() {
  ($('#prompt') || $('#main'))?.focus()
}
document.documentElement.addEventListener('pointerleave', () => { peekHeld = false; if (state.collapsed) peekSidebar(false) })
addEventListener('popstate',() => { route(); state.overlay = null; render(true) })
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',() => { if (state.theme === 'system') render() })
render()
