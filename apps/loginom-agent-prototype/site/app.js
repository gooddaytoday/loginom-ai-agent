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
const placeholder = 'Опишите задачу: собрать сценарий, разобрать пакет, проверить данные'
// Iteration 2: the prototype opens as a first launch («new») or as after a week of work («used»);
// the owner compares variants on the review page.
const stage = read('stage','new') === 'used' ? 'used' : 'new'
const seed = [
  {id:'seed-sales', title:'ABC-анализ товаров', date:'Сегодня', phase:'done', prompt:examples[0].prompt, kind:'abc', files:['sales-demo.csv'], project:'p-sales'},
  {id:'seed-flow', title:'Проверка сценария продаж', date:'Вчера', phase:'done', prompt:examples.find(item => item.id === 'refactor').prompt, kind:'refactor', files:['Продажи.lgp'], project:'p-sales'},
  {id:'seed-south', title:'Почему упала выручка в регионе Юг', date:'3 дня назад', phase:'done', prompt:'Почему в октябре упала выручка в регионе Юг? Посмотри по демонстрационным продажам.', kind:'abc', files:['sales-demo.csv'], project:'p-sales'},
  {id:'seed-oct', title:'Сводка продаж за октябрь', date:'Вчера', phase:'done', prompt:'Собери сводку продаж за октябрь по категориям и регионам.', kind:'abc', files:['sales-demo.csv'], project:'p-report'},
  {id:'seed-acc', title:'Проверить выгрузку для бухгалтерии', date:'4 дня назад', phase:'done', prompt:'Проверь выгрузку для бухгалтерии на пропуски и дубликаты.', kind:'quality', files:['sales-demo.csv'], project:'p-report'},
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
  // Iteration 4: the agent's working copy of «Продажи.lgp». 5th: what happened to the node, 6th: how it was.
  'sales-improve':[
    ['database','CSV продаж','Входные данные','Демонстрационный CSV · 2 400 строк'],
    ['layers','Фильтр по дате','Преобразование','Теперь стоит до разветвления и фильтрует один раз для обеих веток','mod','Фильтр по дате (ветка «Регионы»)'],
    ['shield','Проверка пустых значений','Контроль','Новый узел: строки без цены или региона уходят в таблицу «Пропуски»','add',''],
    ['layers','Фильтр по дате (ветка «Города»)','Преобразование','Удалён: дублировал фильтр в ветке «Регионы»','del','Фильтр по дате (ветка «Города»)'],
    ['chart','Выручка по городам','Расчёт','Переименован; расчёт не менялся','mod','Узел14'],
    ['file','Результат','Выход','120 строк — как в исходном пакете'],
  ],
  'sales-v2':[
    ['database','CSV продаж','Входные данные','Демонстрационный CSV · 2 400 строк'],
    ['layers','Фильтр по дате','Преобразование','Один фильтр до разветвления'],
    ['shield','Проверка пустых значений','Контроль','Строки без цены или региона — в отдельную таблицу'],
    ['chart','Выручка по городам','Расчёт','Сумма выручки по городам'],
    ['file','Результат','Выход','120 строк'],
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
let peek = false, peekWanted = false, peekHeld = false, peekTimer = 0, pointerInPanel = false
const state = {
  page:'home', contour:read('contour','online'), theme:read('theme','light'),
  project:null, projects:stage === 'used' ? seedProjects.map(item => ({...item, sources:[...item.sources]})) : [], session:null,
  projectView:null, projectTab:'chats', menu:null, renameId:null, deleteId:null,
  expanded:stage === 'used' ? ['p-sales','p-report'] : [], showAll:[], detail:read('detail','brief'), editTurn:null,
  sessions:stage === 'used' ? seed.map(item => ({...item})) : [], overlay:null, mobile:false, draft:'', draftFiles:[], mode:'Выполнение',
  collapsed:read('collapsed',false), draftPackage:null, pickFor:null, connecting:false,
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
  // Back and forward keep «which project am I in» in step with the page.
  if (state.page === 'home') state.project = null
  if (state.page === 'project') state.project = state.projectView
  if (state.page === 'chat') state.project = state.sessions.find(item => item.id === state.session)?.project ?? null
}
route()
// «Проекты» on the review page reloads as a returning user and opens a project.
const pendingChat = read('openChat', null)
if (pendingChat) {
  write('openChat', null)
  if (state.sessions.some(item => item.id === pendingChat)) {
    state.session = pendingChat
    state.project = state.sessions.find(item => item.id === pendingChat).project
    expandProject(state.project)
    state.scrollToEnd = true
    state.page = 'chat'
    history.replaceState(null,'','#chat')
  }
}
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
function toast(message, kind = 'check', session = '') {
  const el = $('#announcements')
  el.innerHTML = `<span>${icon(kind,16)}${esc(message)}${session ? `<button class="toast-open" data-toast-session="${session}">Открыть</button>` : ''}</span>`
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => { el.innerHTML = '' }, session ? 7000 : 3800)
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
// «Улучшить» changes a package, so it goes to the conversation with a change card (owner's decision В-28);
// the wizard stays for actions that do not change the package.
function improveInChat(pkg) {
  state.overlay = null
  state.pendingAction = null
  if (state.page !== 'chat') newSession()
  if (pkg) state.draftPackage = pkg
  state.draft = 'Внеси улучшения в этот пакет'
  send()
}
function runAction(actionId, pkg, from) {
  if (actionId === 'improve') return improveInChat(pkg)
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
  state.editTurn = null
  // As in Codex, a new chat goes to the project you are in; the start screen shows it and lets you change it.
  const context = state.page === 'chat' ? sessionProject() : state.page === 'project' ? state.projectView : state.project
  state.project = projectById(context) ? context : null
  state.session = null
  if (!keepDraft) {
    state.draft = ''
    state.templateTitle = ''
    state.draftFiles = []
    state.draftPackage = null
  }
  state.review = false
  navigate('home')
  $('#prompt')?.focus()
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
  expandProject(id)
  navigate('project')
  $('#prompt')?.focus()
}
function expandProject(id) {
  if (id && !state.expanded.includes(id)) state.expanded.push(id)
}
function openSession(id) {
  if (state.editTurn?.session !== id) state.editTurn = null
  const item = state.sessions.find(entry => entry.id === id)
  if (!item || !canNavigate('chat')) return
  expandProject(item.project)
  state.project = item.project
  state.session = id
  state.review = false
  state.draft = ''
  state.draftFiles = []
  // A conversation opens at its latest turn, as in ChatGPT.
  state.scrollToEnd = true
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
// The panel follows the Codex desktop app: «Новый разговор», «Закреплённые» (only once something is pinned),
// «Проекты» — folders with their chats inside — and «Разговоры» for chats without a project. «…» on a row
// (it appears on hover) holds the actions. «Поиск» (Ctrl K) finds projects and chats. Пакеты and Каталог
// stay behind the input's «+» (owner's choice). Nothing that appeared ever disappears or moves.
function sidebar() {
  const pinnedProjects = state.projects.filter(item => item.pinned)
  const pinnedChats = state.sessions.filter(item => item.pinned)
  const loose = state.sessions.filter(item => !item.pinned && !projectById(item.project))
  return `<aside class="sidebar${state.mobile ? ' expanded' : ''}" aria-label="Боковая панель">
    <div class="sidebar-head">
      <button class="icon-btn neutral collapse-btn" data-action="collapse" aria-label="${state.collapsed ? 'Закрепить панель' : 'Свернуть панель до значков'}" title="${state.collapsed ? 'Закрепить панель' : 'Свернуть панель до значков'} (Ctrl+B)"><span class="rail-ico">${icon('panel',18)}</span>${state.collapsed ? `<span class="pin-ico">${icon('pin',18)}</span>` : ''}</button>
    </div>
    <button class="btn new-session${state.page === 'home' ? ' current' : ''}" data-action="new">${icon('compose',17)}<span>Новый разговор</span><kbd>Ctrl N</kbd></button>
    <button class="nav-item search-row" data-overlay="search">${icon('search',17)}<span>Поиск</span><kbd>Ctrl K</kbd></button>
    <div class="sidebar-history">
      <span class="rail-history" aria-hidden="true">${icon('clock',17)}${chatsMark(state.sessions)}</span>
      ${pinnedProjects.length || pinnedChats.length ? `<section class="side-section" aria-label="Закреплённые">
        <div class="side-head"><h2>Закреплённые</h2></div>
        ${pinnedProjects.map(projectTree).join('')}${pinnedChats.map(item => chatRow(item)).join('')}</section>` : ''}
      <section class="side-section" aria-label="Проекты">
        <div class="side-head"><h2>Проекты</h2></div>
        <div class="side-row"><button class="project-link new-project" data-overlay="new-project">${icon('folder-plus',17)}<span>Новый проект</span></button></div>
        ${state.projects.filter(item => !item.pinned).map(projectTree).join('')}
      </section>
      ${loose.length ? `<section class="side-section" aria-label="Разговоры">
        <div class="side-head"><h2>Разговоры</h2></div>
        ${loose.map(item => chatRow(item)).join('')}</section>` : ''}
    </div>
    <nav class="sidebar-footer" aria-label="Настройки">
      ${runNotice()}
      ${navButton('settings','settings')}
      <button class="prototype-mark" data-go="review"><b class="proto-badge" aria-hidden="true">П2</b><span>Прототип 2 · что решить</span></button>
    </nav>
  </aside>`
}
function menuOpener(menu) {
  const scope = {panel:'.sidebar', list:'.project-list', page:'.page-more'}[menu.where]
  const selector = `[data-menu="${menu.kind}:${menu.id}"]`
  return document.querySelector(menu.where === 'page' ? scope + selector : `${scope} ${selector}`) || document.querySelector(`#main ${selector}`)
}
function moreButton(kind, id, label) {
  const open = state.menu?.kind === kind && state.menu.id === id
  return `<button class="row-more" type="button" data-menu="${kind}:${id}" aria-label="${esc(label)}" aria-haspopup="menu" aria-expanded="${open}">${icon('more',16)}</button>`
}
// As in the Codex desktop app: a project is a folder in the panel. A click opens or closes it; its chats
// are listed inside it, newest first. On hover: a new chat in this project, and «…».
function projectTree(project) {
  const open = state.expanded.includes(project.id)
  const chats = state.sessions.filter(item => item.project === project.id && !item.pinned)
  const openChat = state.page === 'chat' && chats.some(item => item.id === state.session)
  const all = state.showAll.includes(project.id) || chats.slice(6).some(item => item.id === state.session)
  const shown = all ? chats : chats.slice(0,6)
  const pinnedHere = state.sessions.some(item => item.project === project.id && item.pinned)
  // A closed folder holding the open chat is highlighted, so the user still sees where they are.
  const current = (state.page === 'project' && state.projectView === project.id) || (!open && openChat)
  return `<div class="side-row project-row"><button class="project-link${current ? ' current' : ''}" data-toggle-project="${project.id}" aria-expanded="${open}"><span class="pc-${project.color}">${icon(open ? 'folder-open' : 'folder',17)}${open ? '' : chatsMark(chats)}</span><span>${esc(project.name)}</span></button>
    <span class="row-actions"><button class="row-act" type="button" data-open-project="${project.id}" aria-label="Новый разговор в проекте «${esc(project.name)}»" title="Новый разговор в проекте">${icon('compose',16)}</button>${moreButton('project',project.id,`Действия с проектом «${project.name}»`)}</span></div>
    ${open ? `<div class="project-chats" role="group" aria-label="Разговоры проекта «${esc(project.name)}»">${shown.map(item => chatRow(item, true)).join('') || `<p class="side-empty">${pinnedHere ? 'Разговоры проекта — в «Закреплённых»' : 'Разговоров пока нет'}</p>`}${shown.length < chats.length ? `<button class="show-more" data-show-all="${project.id}">Показать ещё ${chats.length - shown.length}</button>` : chats.length > 6 && state.showAll.includes(project.id) ? `<button class="show-more" data-show-all="${project.id}">Свернуть список</button>` : ''}</div>` : ''}`
}
// Inside its project a chat is just a title. Out of it (pinned) it is labelled with the project.
function chatRow(item, nested = false) {
  const project = nested ? null : projectById(item.project)
  const current = state.page === 'chat' && state.session === item.id
  return `<div class="side-row chat-row${nested ? ' nested' : ''}"><button class="session-link${current ? ' current' : ''}" data-session="${item.id}">${nested ? '' : icon('message',15)}<span class="row-text"><span>${esc(item.title)}</span>${project ? `<small><i class="pc-dot pc-${project.color}"></i>${esc(project.name)}</small>` : ''}</span>${sessionMark(item)}</button>${moreButton('chat',item.id,`Действия с разговором «${item.title}»`)}</div>`
}
// One mark for a whole list: what the collapsed panel shows on the section's icon.
function chatsMark(list) {
  return sessionMark(list.find(item => item.phase === 'running') || list.find(item => sessionMark(item)) || {})
}
// Status next to a conversation: the agent is working or waits for the user.
function sessionMark(item) {
  if (['running','retrying','writing'].includes(item.phase)) return '<i class="conn-dot busy" title="Агент работает"></i><span class="sr-only">— агент работает</span>'
  if (item.phase === 'failed') return '<i class="conn-dot warn" title="Шаг не выполнен — нужна ваша помощь"></i><span class="sr-only">— шаг не выполнен</span>'
  if (['permission','question','plan','connect'].includes(item.phase) || item.phase === 'proposed') return '<i class="conn-dot warn" title="Ждёт вашего ответа"></i><span class="sr-only">— ждёт вашего ответа</span>'
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
  if (state.loginomDown) return `<button class="lgm-chip off" type="button" data-overlay="loginom-status" title="Loginom не отвечает — нажмите, чтобы проверить"><i class="conn-dot warn"></i><span>Loginom<span class="lgm-state"> не отвечает</span></span></button>`
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
  return `<header class="topbar">
    <div class="top-left">
      <button class="icon-btn mobile-menu" aria-label="Открыть меню" aria-expanded="${state.mobile}" data-action="menu">${icon('menu',20)}</button>
      <button class="brand top-brand" data-action="new" aria-label="Loginom AI Agent, новый разговор">
        <picture><img class="brand-standard" src="assets/loginom-wordmark.svg" alt="Loginom"><img class="brand-inverse" src="assets/loginom-wordmark-light.png" alt="Loginom"></picture><span>AI Agent</span>
      </button>
      ${['home','chat','project'].includes(state.page) ? '' : `<span class="crumb-current">${pages[state.page]}</span>`}
      ${state.page === 'chat' && projectById(sessionProject()) ? `<button class="crumb-project" data-open-project="${sessionProject()}">${icon('folder',16)}<span>${esc(projectById(sessionProject()).name)}</span></button>` : ''}
    </div>
    <div class="top-actions">
      ${['home','chat','project'].includes(state.page) ? '' : loginomChip()}
      <button class="icon-btn theme-btn" title="Переключить цветовую схему" aria-label="Переключить цветовую схему" data-action="theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon',17)}</button>
    </div>
  </header>`
}
function composer() {
  const modelName = currentModel()
  const pkg = state.draftPackage
  return `<form class="composer" id="composer">
    ${state.editTurn && state.editTurn.session === state.session && state.page === 'chat' ? `<div class="edit-banner">${icon('compose',15)}<span>Изменяете сообщение — ответы после него заменятся новыми${state.importedPackages.some(entry => entry.savedVersion) || salesState().replaced ? '. Пакеты, уже сохранённые в Loginom, останутся как есть' : ''}</span><button type="button" class="link-btn" data-action="cancel-edit">Отмена</button></div>` : ''}
    ${pkg ? packageContext(pkg) : ''}
    ${state.draftFiles.length ? `<div class="attachment-list">${state.draftFiles.map((file,i) => `<span>${icon('file',14)} ${esc(file)} <button type="button" class="small-icon" aria-label="Убрать ${esc(file)}" data-remove-file="${i}">${icon('close',13)}</button></span>`).join('')}</div>` : ''}
    <textarea id="prompt" aria-label="Сообщение агенту" placeholder="${state.page === 'chat' && state.editTurn?.session === state.session ? 'Изменённое сообщение' : state.page === 'chat' && ['running','retrying'].includes(currentItem()?.phase) ? 'Поправка агенту — учтёт после текущего шага' : state.page === 'chat' ? 'Уточните задачу или задайте вопрос' : state.page === 'project' || projectById(state.project) ? esc(`Новый разговор в проекте «${projectById(state.page === 'project' ? state.projectView : state.project)?.name}»`) : esc(placeholder)}" rows="2">${esc(state.draft)}</textarea>
    <div class="composer-toolbar">
      <div class="composer-options">
        <button class="icon-btn neutral plus-btn" type="button" aria-label="Добавить: пакет, файл, каталог" title="Пакет из Loginom, файл с компьютера, каталог" data-overlay="plus">${icon('plus',18)}</button>
        ${state.page === 'home' && state.projects.length ? `<button class="filter-btn dest-chip" type="button" data-menu="dest:" aria-haspopup="menu" aria-expanded="${state.menu?.kind === 'dest'}" title="Где будет разговор">${icon('folder',15)} <span class="filter-label">${esc(projectById(state.project)?.name || 'Без проекта')}</span> ${icon('down',12)}</button>` : ''}
        ${state.settings.preferences.agentPicker ? `<button class="filter-btn mode-pick" type="button" data-overlay="agent-mode" title="Режим агента: ${state.mode}">${icon(state.mode === 'Планирование' ? 'layers' : 'spark',15)} <span class="filter-label">${state.mode}</span> ${icon('down',12)}</button>` : ''}
      </div>
      <div class="composer-options">
        ${loginomChip()}
        <button class="filter-btn composer-model${modelName ? '' : ' lgm-chip off'}" type="button" data-settings="models" title="Модель">${icon('cpu',15)} <span class="filter-label">${esc(modelName || 'Выберите модель')}</span> ${icon('down',12)}</button>
        ${state.page === 'chat' && ['running','retrying','writing'].includes(currentItem()?.phase) ? `<button class="stop-btn" type="button" data-action="stop" title="Остановить агента (Esc)">${icon('stop',14)}<span>Остановить</span></button>` : ''}
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
    id:'result-' + item.id, name:item.kind === 'abc' ? 'ABC-анализ.lgp' : item.kind === 'refactor' ? 'Продажи — улучшено.lgp' : 'Результат.lgp',
    scope:'personal', view:item.kind === 'quality' ? 'quality' : 'sales', isResult:true,
  }
}
function result(item) {
  if (item.kind === 'improve') return changeCard(item)
  if (item.kind === 'clean') return `<div class="answer-block"><h2>Замечаний нет</h2><p>Проверил «${esc(item.files?.[0] || 'Продажи.lgp')}»: повторов, непонятных имён и пропущенных проверок не нашёл. Пакет не менял.</p>${(item.files?.[0] || 'Продажи.lgp') === 'Продажи.lgp' && salesState().replaced ? `<p class="muted">«Продажи.lgp» уже заменён улучшенной версией. Прежняя версия сохранена как «Продажи — до правки.lgp».</p><button class="btn" data-action="restore-sales">${icon('refresh',15)} Вернуть прежнюю версию</button>` : ''}</div>`
  if (item.kind === 'refactor') return `<div class="answer-block"><h2>Нашёл 3 улучшения</h2><p>Пакет «Продажи.lgp» не менял. Что можно сделать лучше:</p>
    <ol class="findings"><li><strong>«Фильтр по дате» повторяется</strong> в двух ветках — достаточно одного до разветвления.</li><li><strong>«Узел14»</strong> — по имени не понять, что он считает; это выручка по городам.</li><li><strong>Нет проверки пустых значений</strong> перед расчётом — строки без цены или региона искажают итог.</li></ol>
    <div class="button-row"><button class="btn primary" data-action="improve-from-check">${icon('wand',15)} Внести улучшения</button><span class="muted">Агент изменит копию; исходный пакет изменится, только если вы решите его заменить.</span></div></div>`
  if (item.kind === 'chat') return `<div class="answer-block"><p>Я помогаю работать в Loginom: собираю сценарии, разбираю и документирую пакеты, проверяю данные. Опишите задачу своими словами или выберите пакет через «+» — над полем появятся действия с ним.</p>${state.settings.connection.connected ? '' : '<p class="muted">Для работы с пакетами нужен Loginom — я предложу подключиться, когда он понадобится.</p>'}</div>`
  if (item.kind === 'document') return `<div class="answer-block"><h2>Пакет задокументирован</h2><p>Описаны назначение пакета, входные данные и каждый узел. Пакет не изменялся.</p>
    <dl class="result-metrics"><div><dt>Узлов описано</dt><dd>12</dd></div><div><dt>Входные данные</dt><dd>2 таблицы</dd></div><div><dt>Изменено</dt><dd>ничего</dd></div></dl>
    <div class="artifact-card"><span class="glyph green">${icon('file',19)}</span><span><strong>${esc((item.files[0] || 'Пакет.lgp').replace(/\.lgp$/i,''))} — описание.md</strong><small>В папке проекта</small></span><button class="btn" data-action="download-result">Скачать ${icon('download',14)}</button></div></div>`
  const info = item.kind === 'quality'
    ? ['Проверка данных завершена','Обнаружены 12 пропусков и 3 дубликата. В отчёте отмечены столбцы, которые нужно проверить перед загрузкой.',[['Строки','2 400'],['Пропуски','12'],['Дубликаты','3']]]
    : item.kind === 'refactor'
    ? ['Нашёл 3 улучшения','Пакет не менял. Что можно сделать лучше:',[['Проверено узлов','6'],['Замечаний','3'],['Пакет','не изменён']]]
    : ['Сценарий ABC-анализа собран','Товары распределены по трём группам по накопленной доле выручки. Итоговая таблица и шаги сценария доступны в результатах.',[['Группа A','15 товаров'],['Группа B','28 товаров'],['Группа C','77 товаров']]]
  return `<div class="answer-block"><h2>${info[0]}</h2><p>${info[1]}</p>
    <dl class="result-metrics">${info[2].map(([key,value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>
    ${item.kind === 'quality' ? `<div class="artifact-card"><span class="glyph green">${icon('file',19)}</span><span><strong>Качество выгрузки.html</strong><small>Отчёт в папке проекта</small></span><button class="btn" data-action="download-result">Скачать CSV ${icon('download',14)}</button></div>`
      : `<div class="artifact-card"><span class="glyph red">${icon('flow',19)}</span><span><strong>${resultPackage(item).name}</strong><small>${item.kind === 'refactor' ? 'Копия в /user, рядом с исходным' : 'Пакет в /user'}</small></span><button class="btn" data-action="open-result-package">Открыть ${icon('external',14)}</button></div>`}
    <div class="answer-actions"><button class="link-btn" data-action="download-result">${icon('download',15)} Скачать отчёт CSV</button><button class="link-btn" data-action="author-from-chat">${icon('box',15)} Сохранить как навык</button></div>
  </div>`
}
// What is really in Loginom: the package is one, so cards and the schema read this instead of keeping their own copy.
function salesState() {
  return {replaced:serverPackages.find(entry => entry.id === 'sales').view === 'sales-v2', backup:state.importedPackages.some(entry => entry.id === 'sales-backup')}
}
function savedVersion(turn) {
  return turn.change?.savedId && state.importedPackages.find(entry => entry.id === turn.change.savedId)
}
// The card's state: replaced (whoever did it) > saved (if the version still exists) > discarded > draft.
function changeState(turn) {
  if (salesState().replaced) return 'replaced'
  if (savedVersion(turn)) return 'saved'
  return turn.change?.discarded ? 'discarded' : 'draft'
}
// The scripted improvements exist only in the original «Продажи.lgp»; any other package or a replaced one has none.
function improvable(name) {
  return (name || 'Продажи.lgp') === 'Продажи.lgp' && !salesState().replaced
}
// What the agent changed in its working copy, as in Codex's «Edited file +2 −2» card: one row per node.
const packageChanges = [
  ['mod','Фильтр по дате','перенесён из ветки «Регионы» до разветвления — теперь один на обе ветки'],
  ['del','Фильтр по дате (ветка «Города»)','удалён — дублировал фильтр в ветке «Регионы»'],
  ['mod','Узел14 → «Выручка по городам»','переименован'],
  ['add','Проверка пустых значений','новый узел: строки без цены или региона — в отдельную таблицу'],
]
function changeCard(turn) {
  const at = turn.index
  const current = changeState(turn)
  const saved = savedVersion(turn)
  const next = proposedVersionName(serverPackages.find(entry => entry.id === 'sales'))
  const counts = [['add','новый'],['mod','изменено'],['del','удалён']].map(([kind,label]) => [kind, packageChanges.filter(([type]) => type === kind).length, label])
  const status = {
    draft:'Изменения — в копии пакета. «Продажи.lgp» в Loginom не менялся: сохраните изменения новой версией рядом с ним или замените исходный.',
    saved:`Сохранено новой версией «${esc(saved?.name || '')}» в /user. Исходный «Продажи.lgp» не изменён.`,
    replaced:'Исходный «Продажи.lgp» в Loginom заменён этими изменениями. Прежняя версия сохранена как «Продажи — до правки.lgp» — её можно вернуть.',
    discarded:'Изменения отменены: копия удалена, «Продажи.lgp» не менялся.',
  }[current]
  const view = `<button class="btn" data-change="view:${at}">${icon('flow',15)} Посмотреть на схеме</button>`
  const actions = {
    draft:`<button class="btn primary" data-change="save:${at}">${icon('plus',15)} Сохранить новой версией</button>${view}<button class="btn quiet" data-change="replace:${at}">Заменить исходный…</button><button class="link-btn discard-link" data-change="discard:${at}">Отменить изменения</button>`,
    saved:`<button class="btn" data-change="open:${at}">${icon('external',15)} Открыть «${esc(saved?.name || '')}»</button>${view}<button class="btn quiet" data-change="replace:${at}">Заменить исходный…</button><button class="link-btn discard-link" data-change="unsave:${at}">Удалить новую версию</button>`,
    replaced:`<button class="btn" data-change="open:${at}">${icon('external',15)} Открыть «Продажи.lgp»</button>${view}<button class="link-btn discard-link" data-change="restore:${at}">Вернуть прежнюю версию</button>`,
    discarded:`<button class="link-btn" data-change="undiscard:${at}">Вернуть изменения</button>`,
  }[current]
  return `<div class="answer-block change-block"><h2>${current === 'discarded' ? 'Изменения отменены' : 'Изменил копию «Продажи.lgp»'}</h2><p>${status}</p>
    ${current === 'discarded' ? '' : `<div class="change-card${current === 'draft' ? '' : ' is-' + current}">
      <div class="change-head">${icon('flow',17)}<strong>${current === 'saved' ? esc(saved.name) : 'Продажи.lgp'}</strong><span class="badge">${{draft:'копия, не сохранена', saved:'новая версия', replaced:'заменён в Loginom'}[current]}</span><span class="change-counts">${counts.map(([kind,count,label]) => `<b class="c-${kind}">${{add:'+',mod:'~',del:'−'}[kind]}${count} ${label}</b>`).join('')}</span></div>
      <ul class="change-list">${packageChanges.map(([kind,name,what]) => `<li class="c-${kind}"><span class="mark" aria-label="${{add:'добавлен',mod:'изменён',del:'удалён'}[kind]}">${{add:'+',mod:'~',del:'−'}[kind]}</span><span><strong>${esc(name)}</strong> — ${esc(what)}</span></li>`).join('')}</ul>
      <p class="change-check">${icon('check',14)} Сверено с исходным: те же 120 товаров и итог; 12 строк без цены или региона теперь в отдельной таблице «Пропуски»</p>
    </div>`}
    <div class="change-actions">${actions}</div>
    ${current === 'draft' ? `<p class="change-note">Новая версия появится рядом с исходным: /user/${esc(next)}</p>` : ''}
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
    <button class="project-instructions" data-project-settings="${project.id}"><span class="glyph violet">${icon('book',17)}</span><span><strong>Инструкции для агента</strong><small>${project.instructions ? esc(project.instructions) : 'Как работать в этом проекте: тон, формат, куда сохранять результаты'}</small></span><span class="link-btn">${project.instructions ? 'Изменить' : 'Добавить'}</span></button>
    <div class="project-tabs" role="tablist" aria-label="Содержимое проекта">
      <button role="tab" id="ptab-chats" aria-controls="ppanel" data-project-tab="chats" aria-selected="${tab === 'chats'}">Разговоры <span>${chats.length}</span></button>
      <button role="tab" id="ptab-sources" aria-controls="ppanel" data-project-tab="sources" aria-selected="${tab === 'sources'}">Источники <span>${project.sources.length}</span></button>
    </div>
    <div id="ppanel" role="tabpanel" aria-labelledby="ptab-${tab}">
    ${tab === 'chats'
      ? (chats.length ? `<div class="project-list">${chats.map(item => `<div class="side-row"><button class="project-chat" data-session="${item.id}">${icon('message',16)}<span><strong>${esc(item.title)}</strong><small>${esc(item.date)}${sessionMark(item) ? ' · ' + (item.phase === 'running' ? 'агент работает' : 'ждёт вашего ответа') : ''}</small></span></button>${moreButton('chat',item.id,`Действия с разговором «${item.title}»`)}</div>`).join('')}</div>`
        : `<p class="project-empty">Разговоров пока нет. Напишите задачу в поле выше — разговор появится здесь, а агент учтёт инструкции и источники проекта.</p>`)
      : `${project.sources.length ? `<div class="project-list">${project.sources.map((name,index) => `<div class="project-source">${icon(/\.lgp$/i.test(name) ? 'flow' : 'file',16)}<span>${esc(name)}</span><button class="small-icon" data-remove-source="${index}" aria-label="Убрать ${esc(name)} из проекта">${icon('close',13)}</button></div>`).join('')}</div>`
          : `<p class="project-empty">Источники — файлы, которые агент видит во всех разговорах проекта: таблицы, документы, пакеты .lgp.</p>`}
        <label class="btn project-add-source">${icon('upload',16)} Добавить файл<input type="file" id="project-source" class="sr-only"></label>`}
    </div>
  </div>`
}
// Iteration 3 — the conversation feed. A turn is one request and the agent's work on it: steps named in plain
// words, a permission or a question where the agent needs the user, then the answer. The prototype has no
// model, so the steps of each kind of task are scripted; a real run gets them from OpenCode tool calls.
const scripts = {
  abc:{plan:['Проверить данные','Собрать сценарий','Проверить и сохранить'], steps:[
    {plan:0, icon:'database', live:'Читаю таблицу «sales-demo.csv»', done:'Прочитал таблицу «sales-demo.csv»', short:'прочитал таблицу', detail:'2 400 строк, 6 столбцов: дата, товар, регион, количество, цена, выручка', time:4, think:[3,'Для ABC-анализа нужна выручка по товарам. Сначала посмотрю, какие столбцы есть в таблице.']},
    {plan:1, think:[5,'Выручка есть по строкам продаж. Сгруппирую по товару, отсортирую по убыванию и поделю по накопленной доле: обычные пороги 80 / 15 / 5 %.'], icon:'flow', live:'Собираю сценарий в Loginom', fail:'собрать сценарий в Loginom', done:'Собрал сценарий из 4 узлов', short:'собрал сценарий из 4 узлов', detail:'Импорт CSV → Группировка по товару → Сортировка по выручке → ABC-классификация (80 / 15 / 5 %)', time:21},
    {plan:2, icon:'play', live:'Запускаю сценарий', done:'Запустил сценарий на демонстрационных данных', short:'проверил на данных', detail:'120 товаров: A — 15, B — 28, C — 77 · выполнено за 1,2 с', time:9},
    {plan:2, icon:'download', ask:'permission', live:'Сохраняю пакет в Loginom', done:'Сохранил «ABC-анализ.lgp» в /user', short:'сохранил «ABC-анализ.lgp»', detail:'Новый пакет; другие пакеты не изменены', time:3},
  ], permission:{title:'Сохранить новый пакет в Loginom?', text:'Агент создаст пакет «ABC-анализ.lgp» в вашей папке Loginom. Другие пакеты не изменятся.', args:[['Пакет','ABC-анализ.lgp'],['Папка','/user'],['Изменится','появится новый пакет']], trace:'сохранить «ABC-анализ.lgp» в /user', scope:'сохранять новые пакеты в /user', denied:'Хорошо, сохранять не стал. Сценарий собран и проверен — он остался в этом разговоре. Скажите, если сохранить в другую папку.'}},
  quality:{plan:['Прочитать данные','Найти пропуски и дубликаты','Составить отчёт'], steps:[
    {plan:0, icon:'database', live:'Читаю таблицу «sales-demo.csv»', done:'Прочитал таблицу «sales-demo.csv»', short:'прочитал таблицу', detail:'2 400 строк, 6 столбцов', time:3},
    {plan:1, icon:'shield', live:'Ищу пропуски', done:'Нашёл 12 пропусков в 2 столбцах', short:'нашёл 12 пропусков', detail:'регион — 9, цена — 3', time:6},
    {plan:1, think:[4,'Дубликатом можно считать и полную копию строки, и повтор продажи с другой ценой. От этого зависит результат — лучше спросить.'], icon:'shield', ask:'question', live:'Ищу дубликаты', done:'Нашёл 3 дубликата', short:'нашёл 3 дубликата', detail:'Правило: {answer}', time:5},
    {plan:2, icon:'file', live:'Составляю отчёт', done:'Составил отчёт «Качество выгрузки.html»', short:'составил отчёт', detail:'В папке проекта', time:4},
  ], question:{text:'Какие строки считать дубликатами?', options:[['Полное совпадение строки','Все столбцы одинаковые'],['Совпадение товара и даты','Одна продажа записана дважды, например с разной ценой'],['Совпадение номера документа','Если в выгрузке есть номер документа']]}},
  clean:{plan:['Открыть пакет','Проверить узлы'], steps:[
    {plan:0, icon:'flow', live:'Открываю «{pkg}»', done:'Открыл «{pkg}» только для чтения', short:'открыл пакет', time:2},
    {plan:1, icon:'layers', live:'Проверяю узлы', done:'Проверил узлы «{pkg}»', short:'проверил узлы', time:9},
  ]},
  refactor:{plan:['Открыть пакет','Проверить узлы','Собрать замечания'], steps:[
    {plan:0, icon:'flow', live:'Открываю «Продажи.lgp»', done:'Открыл «Продажи.lgp» только для чтения', short:'открыл пакет', time:2},
    {plan:1, think:[6,'«Фильтр по дате» стоит отдельно в двух ветках — его можно поставить один раз до разветвления. «Узел14» по имени не понять. Перед расчётом нет проверки пустых значений.'], icon:'layers', live:'Проверяю узлы', done:'Проверил 6 узлов', short:'проверил 6 узлов', detail:'Повтор «Фильтра по дате», непонятное имя «Узел14», нет проверки пустых значений', time:14},
    {plan:2, icon:'file', live:'Собираю замечания', done:'Собрал 3 замечания', short:'собрал 3 замечания', time:3},
  ]},
  // Changes go to a working copy; the package in Loginom changes only when the user saves (iteration 4).
  improve:{plan:['Открыть копию','Внести изменения','Сверить результат'], steps:[
    {plan:0, icon:'flow', live:'Открываю копию «Продажи.lgp»', done:'Открыл копию «Продажи.lgp» для правки', short:'открыл копию пакета', detail:'Исходный пакет не меняется — вы решите, что делать с изменениями', time:2},
    {plan:1, icon:'layers', live:'Переношу «Фильтр по дате»', done:'Вынес «Фильтр по дате» до разветвления', short:'вынес фильтр', detail:'Раньше он стоял отдельно в каждой ветке', time:6, think:[4,'Фильтр одинаковый в обеих ветках: поставлю его один раз перед разветвлением, второй удалю.']},
    {plan:1, icon:'close', live:'Удаляю повтор фильтра', done:'Удалил повторный «Фильтр по дате»', short:'удалил повтор', detail:'Он дублировал первый', time:2},
    {plan:1, icon:'compose', live:'Переименовываю узел', done:'Переименовал «Узел14» → «Выручка по городам»', short:'переименовал узел', time:2},
    {plan:1, icon:'shield', live:'Добавляю проверку пустых значений', done:'Добавил узел «Проверка пустых значений»', short:'добавил проверку', detail:'Строки без цены или региона уходят в отдельную таблицу', time:7},
    {plan:2, icon:'check', live:'Сверяю результат с исходным пакетом', done:'Сверил результат с исходным пакетом', short:'сверил результат', detail:'Те же 120 товаров и итог; 12 строк без цены или региона — в таблице «Пропуски». Выгрузок в пакете нет — запуск ничего не записал', time:9},
  ]},
  document:{plan:['Прочитать пакет','Описать узлы','Собрать документ'], steps:[
    {plan:0, icon:'flow', live:'Читаю пакет', done:'Прочитал пакет «{pkg}»: 12 узлов, 3 подмодели', short:'прочитал пакет', time:3},
    {plan:1, icon:'book', live:'Ищу описания узлов в справке Loginom', done:'Нашёл в справке Loginom описания 9 типов узлов', short:'нашёл описания в справке', time:5},
    {plan:2, icon:'file', live:'Пишу документ', done:'Написал «{doc}»', short:'написал описание', detail:'В папке проекта', time:12},
  ]},
  chat:{steps:[]},
}
function scriptOf(turn) {
  return scripts[turn.kind] || scripts.chat
}
function followed(text, turn) {
  if (!turn.instruction) return text
  const how = ` — по вашему указанию: «${turn.instruction}»`
  return / в \/user$/.test(text) ? text.replace(/ в \/user$/, how) : text + how
}
function stepText(text, turn) {
  const pkg = (turn.files?.[0] || 'Продажи.lgp')
  return text.replaceAll('{pkg}', pkg).replace('{doc}', pkg.replace(/\.lgp$/i,'') + ' — описание.md').replace('{answer}', turn.answer || '')
}
function turnTime(turn) {
  const seconds = scriptOf(turn).steps.slice(0, turn.step).reduce((sum, step) => sum + step.time + (step.think?.[0] || 0), 0) + (turn.errors?.length || 0) * 33
  return seconds >= 60 ? `${Math.floor(seconds / 60)} мин ${seconds % 60} с` : `${seconds} с`
}
// A finished seed or history turn: every step done, the user's answers filled in as they would have been.
function completeTurn(turn) {
  const script = scriptOf(turn)
  turn.step = script.steps.length
  turn.decisions = turn.decisions || (script.permission ? [{at:script.steps.findIndex(step => step.ask === 'permission'), choice:'once'}] : [])
  if (script.question && !turn.answer) turn.answer = script.question.options[1][0]
  turn.steer = turn.steer || []
  return turn
}
// The engine: one step every ~0.7 s; a step that needs the user stops the run until they answer.
function runSteps(item) {
  clearTimeout(item.timer)
  const script = scriptOf(item)
  if (item.step >= script.steps.length) return writeAnswer(item, 'done')
  const step = script.steps[item.step]
  const asked = (item.cleared || []).includes(item.step)
  if (step.ask === 'permission' && !asked && (item.allowed || []).includes(script.permission.scope)) {
    item.decisions.push({at:item.step, choice:'auto'})
    item.cleared.push(item.step)
  }
  if (step.ask === 'permission' && !(item.cleared || []).includes(item.step)) {
    item.phase = 'permission'
    if (state.session !== item.id || state.page !== 'chat') toast(`«${item.title}» ждёт вашего разрешения`, 'alert', item.id)
    return render()
  }
  if (step.ask === 'question' && !asked) {
    item.phase = 'question'
    if (state.session !== item.id || state.page !== 'chat') toast(`«${item.title}» ждёт вашего ответа`, 'alert', item.id)
    return render()
  }
  item.phase = 'running'
  render()
  item.timer = setTimeout(() => {
    if (item.phase !== 'running') return
    if (item.failAt === item.step) return stepFailed(item)
    item.step++
    runSteps(item)
  }, 750)
}
// The demo «Сбой Loginom» makes the step that works in Loginom fail twice; «Повторить шаг» then succeeds.
function stepFailed(item) {
  state.loginomDown = true
  item.errors = [...(item.errors || []), {at:item.step, attempt:(item.errors || []).filter(entry => entry.at === item.step).length + 1}]
  if (item.errors.filter(entry => entry.at === item.step).length < 2) {
    item.phase = 'retrying'
    item.retryIn = 3
    const tick = () => {
      if (item.phase !== 'retrying') return
      if (--item.retryIn > 0) {
        render()
        item.timer = setTimeout(tick, 1000)
        return
      }
      runSteps(item)
    }
    render()
    item.timer = setTimeout(tick, 1000)
    return
  }
  item.phase = 'failed'
  render()
  if (state.session !== item.id || state.page !== 'chat') toast(`«${item.title}»: шаг не выполнен`, 'alert', item.id)
}
// The answer is written out as it comes, then the result card appears (a real model streams its text).
function writeAnswer(item, finalPhase) {
  clearInterval(item.writer)
  const box = document.createElement('div')
  box.innerHTML = result(item)
  const title = box.querySelector('h2')?.textContent || ''
  const full = title + (box.querySelector('p')?.textContent || '')
  item.phase = 'writing'
  item.writeText = full
  item.writeTitle = title.length
  item.written = 0
  item.writeFinal = finalPhase
  render()
  item.writer = setInterval(() => {
    item.written = Math.min(full.length, item.written + 7)
    const stream = item.id === state.session && $('.answer-stream')
    if (stream) {
      stream.querySelector('h2') && (stream.querySelector('h2').textContent = full.slice(0, Math.min(item.written, title.length)))
      stream.querySelector('p').textContent = full.slice(title.length, Math.max(title.length, item.written))
    }
    if (item.written < full.length) return
    clearInterval(item.writer)
    item.phase = finalPhase
    render()
    if (state.session !== item.id && finalPhase === 'done') toast(`Готово: «${item.title}»`, 'check', item.id)
  }, 35)
}
function startRun(item) {
  Object.assign(item, {step:0, decisions:[], cleared:[], steer:[], answer:null, expanded:false, instruction:'', errors:[], failAt:state.failNext && item.kind !== 'chat' ? 1 : null})
  state.failNext = false
  if (item.kind === 'chat') return writeAnswer(item, 'answer')
  if (state.mode === 'Планирование' && item.kind !== 'document') {
    item.phase = 'plan'
    return render()
  }
  runSteps(item)
}
function currentItem() {
  return state.sessions.find(item => item.id === state.session)
}
function permit(choice, text = '') {
  const item = currentItem()
  if (!item || item.phase !== 'permission') return
  item.decisions.push({at:item.step, choice, text})
  // «Сказать иначе»: the agent takes the instruction and asks again for the adjusted action.
  if (choice === 'instead') {
    item.instruction = text
    item.insteadOpen = false
    item.dockDraft = {}
    render()
    return $('#dock-title')?.focus()
  }
  if (choice === 'deny') {
    item.phase = 'denied'
    render()
    return $('#prompt')?.focus()
  }
  if (choice === 'session') item.allowed = [...(item.allowed || []), scriptOf(item).permission.scope]
  item.cleared.push(item.step)
  runSteps(item)
  $('#prompt')?.focus()
}
function answerQuestion(answer) {
  const item = currentItem()
  if (!item || item.phase !== 'question' || !answer.trim()) return
  item.answer = answer.trim()
  item.cleared.push(item.step)
  runSteps(item)
  $('#prompt')?.focus()
}
function copyText(text) {
  navigator.clipboard?.writeText(text).then(() => toast('Скопировано'), () => toast('Не удалось скопировать — выделите текст вручную', 'alert'))
}
// Plain-text answer of a turn, for «Копировать».
function answerText(turn) {
  const box = document.createElement('div')
  box.innerHTML = turnAnswer(turn)
  return box.innerText.trim()
}
function turnAnswer(turn, live = false) {
  if (turn.phase === 'denied') {
    return `<div class="answer-block"><p>${esc(scriptOf(turn).permission.denied)}</p></div>`
  }
  if (turn.phase === 'failed') return `<div class="answer-block failed" role="alert"><h2>${icon('alert',18)} Не удалось ${esc(scriptOf(turn).steps[turn.step].fail || 'выполнить шаг')}</h2><p>Loginom (${esc(hostOf(state.settings.connection.url))}) дважды не ответил за 30 секунд. Сделанные шаги выше сохранены.</p><p>Что сделать: проверьте, открывается ли Loginom в браузере. Если нет — он выключен или недоступна сеть, обратитесь к администратору. Когда Loginom заработает, нажмите «Повторить шаг».</p>${live ? `<div class="button-row"><button class="btn primary" data-action="retry-step">${icon('refresh',15)} Повторить шаг</button><button class="btn" data-overlay="loginom-status">Проверить подключение</button><button class="link-btn" data-action="copy-error">${icon('copy',14)} Скопировать текст ошибки</button></div>` : ''}</div>`
  if (turn.phase === 'writing') {
    const text = turn.writeText || '', title = turn.writeTitle || 0
    return `<div class="answer-block answer-stream">${title ? `<h2>${esc(text.slice(0, Math.min(turn.written, title)))}</h2>` : ''}<p>${esc(text.slice(title, Math.max(title, turn.written)))}<span class="stream-caret" aria-hidden="true"></span></p></div>`
  }
  if (turn.phase === 'stopped') return `<div class="answer-block"><p>${turn.step ? 'Остановлено по вашей команде. Сделанные шаги не отменяются — они перечислены выше.' : 'Остановлено по вашей команде до первого шага.'}</p>${live ? `<button class="btn" data-action="resume">${icon('play',15)} Продолжить</button>` : ''}</div>`
  if (turn.phase === 'interrupted') return `<div class="answer-block"><p class="muted">${turn.step ? 'Не закончено — вы отправили новое сообщение. Сделанные шаги выше.' : 'Не начато — вы отправили новое сообщение.'}</p></div>`
  const steer = turn.steer?.length ? `<p class="steer-note">Учёл вашу поправку: «${esc(turn.steer.at(-1).text)}». <span class="muted">В прототипе цифры не меняются.</span></p>` : ''
  return steer + result(turn)
}
function turnSteps(turn, live, turnIndex) {
  const script = scriptOf(turn)
  const detailed = state.detail === 'full'
  const rows = []
  const errorRows = at => (turn.errors || []).filter(entry => entry.at === at).forEach(entry => rows.push(`<li class="step error">${icon('alert',15)}<span>Не удалось ${esc(script.steps[at].fail || 'выполнить шаг')}<small>Loginom не ответил за 30 с · попытка ${entry.attempt} из 2</small></span></li>`))
  script.steps.slice(0, turn.step).forEach((step, index) => {
    errorRows(index)
    for (const decision of (turn.decisions || []).filter(entry => entry.at === index && entry.choice === 'retry')) rows.push(`<li class="step-trace">${icon('refresh',14)}<span>Вы повторили шаг</span></li>`)
    for (const decision of (turn.decisions || []).filter(entry => entry.at === index && entry.choice !== 'retry')) rows.push(decision.choice === 'instead'
      ? `<li class="step-trace steer">${icon('message',14)}<span>Вы попросили иначе: «${esc(decision.text)}»</span></li>`
      : `<li class="step-trace">${icon('check',14)}<span>${{session:'Вы разрешили в этом разговоре', auto:'Разрешено ранее в этом разговоре', once:'Вы разрешили один раз'}[decision.choice]}: ${esc(followed(script.permission.trace, turn))}</span></li>`)
    if (step.ask === 'question') rows.push(`<li class="step-trace">${icon('help',14)}<span>${esc(script.question.text)} — <strong>${esc(turn.answer || '')}</strong></span></li>`)
    if (detailed && step.think) rows.push(`<li class="step think">${icon('spark',14)}<span>Думал ${step.think[0]} с<small>${esc(step.think[1])}</small></span></li>`)
    rows.push(`<li class="step done">${icon(step.icon,15)}<span>${esc(step.ask === 'permission' ? followed(stepText(step.done, turn), turn) : stepText(step.done, turn))}${step.detail && (detailed || turn.open?.includes(index)) ? `<small>${esc(stepText(step.detail, turn))}</small>` : ''}</span>${step.detail && !detailed ? `<button class="small-icon step-more" data-step-detail="${turnIndex}:${index}" aria-label="${turn.open?.includes(index) ? 'Скрыть' : 'Показать'} подробности шага" aria-expanded="${Boolean(turn.open?.includes(index))}">${icon('more',14)}</button>` : ''}</li>`)
    ;(turn.steer || []).filter(entry => entry.at === index + 1).forEach(entry => rows.push(`<li class="step-trace steer">${icon('message',14)}<span>Ваша поправка: «${esc(entry.text)}»</span></li>`))
  })
  const denied = turn.decisions?.find(entry => entry.choice === 'deny')
  if (denied) rows.push(`<li class="step-trace denied">${icon('close',14)}<span>Вы отклонили: ${esc(script.permission.trace)}</span></li>`)
  errorRows(turn.step)
  ;(turn.steer || []).filter(entry => entry.at > turn.step).forEach(entry => rows.push(`<li class="step-trace steer">${icon('message',14)}<span>Ваша поправка: «${esc(entry.text)}» — ${turn.phase === 'running' ? 'учту после текущего шага' : turn.phase === 'retrying' ? 'учту после повтора шага' : 'учту, когда продолжите'}</span></li>`))
  if (live && turn.phase === 'retrying') rows.push(`<li class="step live" role="status"><span class="spinner"></span><span>Повторю через ${turn.retryIn} с…</span></li>`)
  if (live && turn.phase === 'running') rows.push(`<li class="step live" role="status"><span class="spinner"></span><span>${esc(stepText(script.steps[turn.step].live, turn))}…</span></li>`)
  if (live && ['permission','question'].includes(turn.phase)) rows.push(`<li class="step waiting">${icon('alert',15)}<span>${turn.phase === 'permission' ? 'Жду вашего разрешения — внизу' : 'Жду вашего ответа — внизу'}</span></li>`)
  return `<ol class="turn-steps">${rows.join('')}</ol>`
}
function turnPlan(turn) {
  const script = scriptOf(turn)
  const current = script.steps[Math.min(turn.step, script.steps.length - 1)]?.plan ?? 0
  const finished = turn.step >= script.steps.length
  return `<ol class="turn-plan" aria-label="План">${script.plan.map((label, index) => `<li class="${finished || index < current ? 'is-done' : index === current ? 'is-current' : ''}">${finished || index < current ? icon('check',13) : index === current ? '<span class="dot"></span>' : '<span class="ring"></span>'}${label}</li>`).join('')}</ol>`
}
function turnView(item, turn, index, live) {
  const script = scriptOf(turn)
  const finished = ['done','answer','denied','stopped','interrupted','failed'].includes(turn.phase)
  const hasSteps = script.steps.length && turn.step > 0 || (live && ['running','retrying','permission','question','failed'].includes(turn.phase))
  const brief = state.detail !== 'full'
  const objects = [...script.steps.slice(0, turn.step).map(step => step.short), ...((turn.errors || []).some(entry => entry.at < turn.step) ? ['повторил шаг после сбоя Loginom'] : [])]
  const unresolved = (turn.errors || []).some(entry => entry.at >= turn.step)
  const summary = (finished || turn.phase === 'writing') && hasSteps && brief && !turn.expanded && !unresolved
  return `<div class="turn">
    <div class="user-turn"><div class="user-message">${esc(turn.prompt)}${turn.files?.length ? `<div class="message-files">${turn.files.map(file => `<span>${icon('file',14)}${esc(file)}</span>`).join('')}</div>` : ''}</div>
      <div class="msg-actions"><button class="msg-act" data-copy-prompt="${index}">${icon('copy',14)}<span>Копировать</span></button><button class="msg-act" data-edit-turn="${index}" ${live && !['done','answer','denied','stopped','interrupted','failed','connect'].includes(turn.phase) ? 'disabled' : ''}>${icon('compose',14)}<span>Изменить</span></button><button class="msg-act" data-fork-turn="${index}" ${live && !['done','answer','denied','stopped','interrupted','failed'].includes(turn.phase) ? 'disabled' : ''}>${icon('branch',14)}<span>Ответвить</span></button></div></div>
    <div class="agent-message"><span class="agent-avatar"><img src="assets/loginom.png" alt="" width="31" height="31"></span><div class="agent-body"><strong class="agent-caption">Loginom AI Agent</strong>
      ${turn.phase === 'connect' ? `<div class="answer-block"><h2>Для этой задачи нужен Loginom</h2><p>Я буду строить и проверять сценарий в Loginom. Подключитесь — и я продолжу.</p>${connectCard()}</div>` : ''}
      ${turn.phase === 'plan' ? `<div class="answer-block"><h2>План работы</h2><p>Проверьте шаги — и я начну.</p>${turnPlan(turn)}<button class="btn primary" data-action="run-plan">Выполнить ${icon('arrow',16)}</button></div>` : ''}
      ${live && ['running','retrying','permission','question'].includes(turn.phase) && script.plan ? turnPlan(turn) : ''}
      ${summary ? `<button class="turn-summary" data-expand-turn="${index}" aria-expanded="false">${icon('chevron',14)}<span>Работал ${turnTime(turn)} · ${esc(objects.join(', '))}</span></button>` : ''}
      ${hasSteps && !summary ? `${finished && brief && !unresolved ? `<button class="turn-summary open" data-expand-turn="${index}" aria-expanded="true">${icon('chevron',14)}<span>Работал ${turnTime(turn)}</span></button>` : finished ? `<p class="turn-time">Работал ${turnTime(turn)}</p>` : ''}${turnSteps(turn, live, index)}` : ''}
      ${finished || turn.phase === 'writing' ? turnAnswer({...turn, id:item.id + '-' + index, index}, live) : ''}
      ${finished ? `<div class="msg-actions agent-actions"><button class="msg-act" data-copy-answer="${index}">${icon('copy',14)}<span>Копировать</span></button><span class="turn-meta">${hasSteps ? turnTime(turn) + ' · ' : ''}${esc(currentModel() || 'модель')}</span></div>` : ''}
    </div></div>
  </div>`
}
// The input area of a chat: the agent's question or permission takes the input's place until answered.
function chatDock(item) {
  const script = scriptOf(item)
  if (item.phase === 'permission') {
    const ask = script.permission
    return `<section class="dock" aria-labelledby="dock-title">
      <div class="dock-head">${icon('shield',20)}<h2 id="dock-title" tabindex="-1">${esc(ask.title)}</h2></div>
      <p>${esc(ask.text)}</p>
      <dl class="dock-args">${ask.args.map(([key,value]) => `<div><dt>${key}</dt><dd>${esc(item.instruction && key === 'Папка' ? 'по вашему указанию' : value)}</dd></div>`).join('')}${item.instruction ? `<div class="dock-instruction"><dt>Ваше указание</dt><dd>«${esc(item.instruction)}»</dd></div>` : ''}</dl>
      <div class="dock-actions"><button class="btn primary" data-permit="once">Разрешить один раз</button><button class="btn" data-permit="session" aria-describedby="dock-scope">Разрешать в этом разговоре</button><button class="btn" data-permit="deny">Отклонить</button></div>
      <p class="dock-scope" id="dock-scope">«В этом разговоре» — больше не спрашивать только об одном: ${esc(ask.scope)}.</p>
      ${item.insteadOpen ? `<form class="dock-instead" id="instead-form"><label for="instead-text">Что сделать иначе</label><div><input id="instead-text" name="text" value="${esc(item.dockDraft?.['instead-text'] || '')}" placeholder="Например: сохрани в папку «Продажи»" autocomplete="off"><button class="btn">Отправить</button></div></form>`
        : `<button class="link-btn dock-more" data-action="open-instead">${icon('message',14)} Сказать, что сделать иначе</button>`}
    </section>`
  }
  if (item.phase === 'question') {
    const ask = script.question
    return `<section class="dock" aria-labelledby="dock-title">
      <div class="dock-head">${icon('help',20)}<h2 id="dock-title" tabindex="-1">Вопрос агента</h2></div>
      <p class="dock-question">${esc(ask.text)}</p>
      <div class="dock-options">${ask.options.map(([label, hint]) => `<button class="dock-option" data-answer="${esc(label)}"><strong>${esc(label)}</strong><small>${esc(hint)}</small></button>`).join('')}</div>
      <form class="dock-instead" id="answer-form"><label for="answer-text">Свой ответ</label><div><input id="answer-text" name="text" value="${esc(item.dockDraft?.['answer-text'] || '')}" placeholder="Опишите правило своими словами" autocomplete="off"><button class="btn">Ответить</button></div></form>
      <button class="link-btn dock-more" data-answer="${esc(ask.options[0][0])}">Пропустить — пусть агент решит сам (${esc(ask.options[0][0].toLowerCase())})</button>
    </section>`
  }
  return ''
}
function chat() {
  const item = state.sessions.find(x => x.id === state.session)
  if (!item) return home()
  const isEdit = item.kind === 'package-edit'
  const turns = isEdit ? [] : [...(item.history || []), item]
  const dock = isEdit ? '' : chatDock(item)
  return `<div class="chat-layout${state.review ? ' with-review':''}">
    <div class="chat-main">
      <div class="chat-title"><div><p class="eyebrow">Разговор</p><h1>${esc(item.title)}</h1></div><div class="button-row">${isEdit ? '' : `<div class="detail-toggle" role="group" aria-label="Подробность ленты"><button data-detail="brief" aria-pressed="${state.detail !== 'full'}">Кратко</button><button data-detail="full" aria-pressed="${state.detail === 'full'}">Подробно</button></div>`}<button class="btn" data-action="review" aria-pressed="${state.review}">${icon('panel',17)} <span>Контекст</span></button>${moreButton('chat',item.id,`Действия с разговором «${item.title}»`).replace('row-more','row-more page-more')}</div></div>
      ${isEdit && canUsePackageEdit(item) ? `<div class="chat-package-context"><span class="glyph red">${icon('flow',18)}</span><span><strong>${esc(item.source.name)}</strong><small>${esc(item.sourcePath)}</small></span><span class="badge">Пакет в разговоре</span></div>` : ''}
      <div class="chat-timeline">
        ${isEdit ? `${item.prompt ? `<div class="user-message">${esc(item.prompt)}</div>` : ''}<div class="agent-message"><span class="agent-avatar"><img src="assets/loginom.png" alt="" width="31" height="31"></span><div><strong class="agent-caption">Loginom AI Agent</strong>${packageEditBody(item)}</div></div>`
          : turns.map((turn, index) => turnView(item, turn, index, index === turns.length - 1)).join('')}
      </div>
      <div class="chat-bottom">${dock || (!isEdit || (canUsePackageEdit(item) && !item.workingPackage && item.phase !== 'proposed') ? composer() : '')}<p class="muted">${isEdit ? 'Учебная формула и файл .lgp для демонстрации.' : 'Демонстрационный разговор. Реальные пакеты и данные не изменяются.'}</p></div>
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
// The working copy on the schema: added, changed and removed nodes marked; a selected node shows before → after.
function changedPackage(item) {
  const nodes = packageViews['sales-improve']
  const showBefore = state.showBefore
  const shown = showBefore ? nodes.filter(node => node[4] !== 'add') : nodes
  const chat = state.sessions.find(entry => entry.id === item.changeOf?.session)
  const turn = chat && [...(chat.history || []), chat][item.changeOf.at]
  const current = turn ? changeState(turn) : 'draft'
  const node = Number.isInteger(state.node) ? shown[state.node] : null
  const mark = {add:'Новый', mod:'Изменён', del:'Удалён'}
  return `<div class="native-page packages-page">
    <div class="native-heading"><div><p class="eyebrow">Loginom · копия из разговора</p><h1>Изменения в «Продажи.lgp»</h1><p>${{draft:'Так будет выглядеть пакет с изменениями. Исходный «Продажи.lgp» в Loginom пока не менялся.', saved:'Изменения сохранены новой версией рядом с исходным; «Продажи.lgp» не менялся.', replaced:'Исходный «Продажи.lgp» в Loginom уже заменён этими изменениями; прежняя версия — «Продажи — до правки.lgp».', discarded:'Изменения отменены; «Продажи.lgp» не менялся.'}[current]}</p></div></div>
    <section class="package-frame"><div class="package-top"><span class="glyph red">${icon('flow',21)}</span><div><strong tabindex="-1">Продажи.lgp</strong><small>${{draft:'Копия для правки · не сохранена', saved:'Копия · сохранена новой версией', replaced:'Заменил исходный в Loginom', discarded:'Изменения отменены'}[current]}</small></div>
      <div class="detail-toggle" role="group" aria-label="Что показать"><button data-show-before="0" aria-pressed="${!showBefore}">Изменения</button><button data-show-before="1" aria-pressed="${Boolean(showBefore)}">Как было</button></div></div>
    <div class="change-legend"><span class="c-add">+ новый</span><span class="c-mod">~ изменён</span><span class="c-del">− удалён</span></div>
    <div class="package-canvas diff-canvas" aria-label="Схема пакета с изменениями">${shown.map(([glyph,title,kind,detail,status,before],i) => `${i ? '<span class="canvas-connector"></span>':''}<button class="canvas-node ${state.node === i ? 'active':''} ${status && !showBefore ? 'is-' + status : ''}" data-node="${i}" aria-pressed="${state.node === i}">${status && !showBefore ? `<span class="node-mark">${mark[status]}</span>` : ''}<span class="glyph ${['blue','violet','green','violet','red','green'][nodes.indexOf(shown[i])]}">${icon(glyph,22)}</span><strong>${showBefore && before ? before : title}</strong><small>${kind}</small></button>`).join('')}</div>
    <div class="package-foot" role="status">${node ? (node[4] && !showBefore ? `<strong>${mark[node[4]]}: ${esc(node[1])}.</strong> ${esc(node[3])}${node[5] && node[4] === 'mod' ? `<br><span class="muted">Было: ${esc(node[5])}.</span>` : ''}` : esc(node[2] + (showBefore && node[4] === 'mod' ? ' — до изменений' : ''))) : 'Выберите узел, чтобы увидеть, что в нём изменилось.'}</div>
    <div class="package-save-bar">
      ${current === 'draft' ? `<button class="btn primary" data-change="save:${item.changeOf?.at}">${icon('plus',15)} Сохранить новой версией</button><button class="btn quiet" data-change="replace:${item.changeOf?.at}">Заменить исходный…</button><button class="link-btn discard-link" data-change="discard:${item.changeOf?.at}">Отменить изменения</button>` : ''}
      ${chat ? `<button class="link-btn" data-session="${chat.id}">${icon('message',16)} Вернуться к разговору</button>` : ''}
    </div></section>
  </div>`
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
  if (state.activePackage.view === 'sales-improve') return changedPackage(state.activePackage)
  const item = state.activePackage
  const nodes = packageViews[item.view]
  const isCalculation = item.view === 'calculation'
  const dirty = hasPackageEdits(item)
  const canDownload = dirty || Boolean(item.savedVersion)
  return `<div class="native-page packages-page">
    <div class="native-heading"><div><p class="eyebrow">Loginom</p><h1>Пакеты</h1><p>Откройте пакет, чтобы посмотреть схему, задокументировать, проверить или улучшить его.</p></div><div class="button-row"><button class="btn primary" data-action="package-server">${icon('folder',17)} Из Loginom</button><button class="btn" data-action="package-computer">${icon('upload',17)} С компьютера</button></div></div>
    <section class="package-frame"><div class="package-top"><span class="glyph red">${icon('flow',21)}</span><div><strong tabindex="-1">${esc(item.name)}</strong><small>${item.isDraft ? 'Рабочий черновик в разговоре' : `${esc(packagePath(item))} · ${item.id === 'sales' && salesState().replaced ? 'заменён в разговоре; прежняя версия — «Продажи — до правки.lgp»' : item.savedVersion ? 'новая версия' : item.isResult ? 'результат разговора' : item.localCopy ? 'копия с компьютера' : 'хранилище Loginom'}`}</small></div><span class="badge">Учебная схема</span></div>
    <div class="package-canvas" aria-label="Учебная схема из четырёх узлов">${nodes.map(([glyph,title,detail],i) => `${i ? '<span class="canvas-connector"></span>':''}<button class="canvas-node ${state.node === i ? 'active':''}" data-node="${i}"><span class="glyph ${['blue','violet','red','green'][i]}">${icon(glyph,22)}</span><strong>${title}</strong><small>${detail}</small></button>`).join('')}</div>
    ${isCalculation && state.node === 1 ? calculationInspector(canDownload,item.id === editablePackage.id) : `<div class="package-foot">${Number.isInteger(state.node) ? nodes[state.node][3]:'Выберите узел, чтобы увидеть сведения.'}</div>`}
    <div class="package-save-bar">
      ${isCalculation ? `<span class="package-save-status${dirty ? ' dirty' : ''}" role="status">${icon(dirty ? 'circle' : 'check',15)} ${dirty ? 'Есть несохранённые изменения' : item.savedVersion ? 'Сохранено в Loginom · демо' : 'Исходная версия'}</span>`
        : ''}
      ${isCalculation ? packageOutputButtons(dirty,canDownload) : ''}
      ${item.id === 'sales' && salesState().replaced ? `<button class="btn" data-action="restore-sales">${icon('refresh',15)} Вернуть прежнюю версию</button>` : ''}
      ${item.editSessionId ? `<button class="link-btn" data-session="${item.editSessionId}">${icon('message',16)} Вернуться к разговору</button>`
        : !item.savedVersion && !dirty ? `<button class="btn package-chat-cta" data-action="ask-package-edit">${icon('message',16)} Изменить с агентом</button>` : ''}
    </div></section>
    ${item.isDraft ? '' : `<div class="section-bar package-section"><h2>Что сделать с пакетом</h2><button class="link-btn" data-action="catalog-actions">Ещё действия в каталоге ${icon('arrow',16)}</button></div>
    <div class="action-grid">${Object.entries(packageActions).filter(([id,action]) => !action.noPackage && (hubHasInstalled(state,action.solution) || state.pinnedActions.includes(id))).map(([id,action]) => actionTile(id,action)).join('')}</div>`}
  </div>`
}
// Owner review page for iteration 2: variants to compare, what to try, what changed.
// Owner review page: iteration 4 (a package in the conversation) — what to try, questions with a recommendation.
function review() {
  const look = [
    ['Проверка → улучшения','«Проверь сценарий продаж» — агент читает пакет и находит 3 улучшения, ничего не меняя. Кнопка «Внести улучшения» — агент правит копию по шагам. В конце — карточка изменений: что добавлено, изменено, удалено.','try-check','Начать'],
    ['Изменения на схеме','В карточке изменений — «Посмотреть на схеме»: изменённые узлы подсвечены, у каждого «было → стало»; переключатель «Как было». Отсюда же можно сохранить.','try-check','Начать'],
    ['Сохранить или отменить','«Сохранить новой версией» — рядом с исходным появится «Продажи — v2.lgp», исходный не тронут. «Заменить исходный…» — только с подтверждением и с резервной копией. «Отменить изменения», «Отменить сохранение», «Вернуть прежнюю версию».','try-check','Начать'],
  ]
  const questions = [
    '<strong>Сохранение</strong> — новой версией рядом с исходным; заменить исходный — отдельной кнопкой, с подтверждением и копией «… — до правки» (В-25).',
    '<strong>Сверка запуском</strong> — только если в пакете нет выгрузок; если есть — агент спрашивает разрешение и перечисляет выгрузки (В-26).',
    '<strong>Имя новой версии</strong> — «Продажи — v2.lgp», «— v3» и дальше (В-27).',
    '<strong>«Улучшить»</strong> над полем ввода и на странице пакета — разговор с карточкой изменений; мастер — для действий, которые пакет не меняют (В-28).',
  ]
  const later = [
    'Правка пакета, открытого с компьютера (.lgp): та же карточка, сохранение — файлом рядом с исходным или в Loginom.',
    'Несколько правок подряд в одном разговоре — сейчас каждая карточка независима.',
    'Сверка пакета, в котором есть выгрузки: агент спрашивает разрешение на запуск и перечисляет, какие выгрузки сработают (В-26) — в прототипе у «Продажи.lgp» выгрузок нет.',
    'Ход разговора и счётчики живут до перезагрузки страницы.',
  ]
  const chosen = [
    'Итерация 3 (лента разговора): «Кратко» по умолчанию; разрешения без постоянного «Всегда»; поправка во время работы без очереди; вместо «Повторить ответ» — «Изменить» и «Ответвить» (В-21…В-24).',
    'Итерация 2 (оболочка): «Пакеты» и «Каталог» через «+», подсказка «Опишите задачу…», Loginom в поле ввода, панель закреплена, поиск в панели, проекты-папки как в Codex.',
  ]
  const open11 = [
    'Названия в каталоге: Действие · Навык · Пакет Loginom · Подключение (И1.1-1).',
    'Список файлов Loginom идёт через внутренний метод веб-клиента: просить ли разработчиков Loginom его закрепить, и занимает ли фоновая сессия лицензию (И1.1-3).',
    'Тексты для сообщества и отметка «Понимаю, что Loginom это не проверял…» (И1.1-4).',
  ]
  const changed = ['«Проверь сценарий» теперь только читает и находит улучшения; «Внести улучшения» — отдельный ход.','Агент правит копию пакета; в ленте — карточка изменений: +1 ~2 −1, строка на каждый узел, «Сверено с исходным».','«Посмотреть на схеме»: узлы с отметками «новый / изменён / удалён», «было → стало», переключатель «Как было».','Сохранить новой версией, заменить исходный (подтверждение и резервная копия), отменить изменения, отменить сохранение, вернуть прежнюю версию.','На странице пакета «Изменить с агентом» начинает этот же путь.','«Улучшить» над полем ввода, на странице пакета и в «Ещё» ведёт в разговор с карточкой изменений, а не в мастер.']
  return `<div class="native-page review-page">
    <div class="native-heading"><div><p class="eyebrow">Прототип · итерация 4 — пакет в разговоре</p><h1>Что решить</h1><p>Новое — как агент меняет пакет Loginom и как вы решаете, что с изменениями делать. Пройдите путь, около 10 минут. Решения по итерации — ниже.</p></div></div>
    <h2 class="rv-heading">Посмотреть</h2>
    <div class="rv-grid">${look.map(([title,text,target,label],index) => `<article class="rv-card"><span class="rv-num">${'АБВ'[index]}</span><h3>${title}</h3><p>${text}</p><button class="btn" data-action="${target}">${label} ${icon('arrow',15)}</button></article>`).join('')}</div>
    <h2 class="rv-heading">Решено по итерации 4</h2>
    <ul class="rv-changes">${questions.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Пока не показано</h2>
    <ul class="rv-changes">${later.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Что изменилось</h2>
    <ul class="rv-changes">${changed.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Решено раньше</h2>
    <ul class="rv-changes">${chosen.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Ещё ждут ответа с итерации 1.1</h2>
    <ul class="rv-questions rv-answers">${open11.map(text => `<li>${text}</li>`).join('')}</ul>
  </div>`
}
function searchResults(query) {
  const q = query.trim().toLowerCase()
  const has = text => String(text || '').toLowerCase().includes(q)
  const projects = q ? state.projects.filter(item => has(item.name)) : []
  // A match in the title comes first, then in the project name, then in the request text; newest first within each.
  const rank = item => has(item.title) ? 0 : has(projectById(item.project)?.name) ? 1 : 2
  const chats = state.sessions.filter(item => !q || has(item.title) || has(item.prompt) || has(projectById(item.project)?.name)).sort((a, b) => q ? rank(a) - rank(b) : 0).slice(0, q ? 20 : 8)
  if (!projects.length && !chats.length) return `<p class="search-empty">${q ? 'Ничего не нашлось. Поиск идёт по названиям проектов и разговоров и по тексту запросов.' : 'Разговоров пока нет.'}</p>`
  return `${projects.length ? `<p class="search-group">Проекты</p>${projects.map(item => `<button class="search-hit" data-open-project="${item.id}"><span class="pc-${item.color}">${icon('folder',17)}</span><span><strong>${esc(item.name)}</strong></span></button>`).join('')}` : ''}${chats.length ? `<p class="search-group">${q ? 'Разговоры' : 'Недавние разговоры'}</p>${chats.map(item => {
    const project = projectById(item.project)
    return `<button class="search-hit" data-session="${item.id}">${icon('message',16)}<span><strong>${esc(item.title)}</strong><small>${project ? `<i class="pc-dot pc-${project.color}"></i>${esc(project.name)} · ` : ''}${esc(item.date)}</small></span></button>`
  }).join('')}` : ''}`
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
       chat.project ? item('unmove','close','Убрать из проекта') : '', menu.where === 'page' && !currentPackageEdit() ? item('download','download','Скачать демонстрационный отчёт CSV') : '', item('delete','alert','Удалить','class="danger"')]
    : project ? [item('pin','pin',project.pinned ? 'Открепить' : 'Закрепить'), item('settings','settings','Настройки проекта'), item('delete','alert','Удалить проект','class="danger"')]
    : [item('dest:', projectById(state.project) ? 'circle' : 'check', 'Без проекта'), ...state.projects.map(entry => `<button role="menuitem" data-menu-act="dest:${entry.id}"><span class="pc-${entry.color}">${icon(entry.id === state.project ? 'check' : 'folder',16)}</span><span>${esc(entry.name)}</span></button>`)]
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
    search: ['Поиск', kind === 'search' ? `<label class="sr-only" for="chat-search">Поиск по проектам и разговорам</label><input id="chat-search" class="search-input" type="search" autocomplete="off" placeholder="Название, проект или слова из запроса"><div id="search-results" class="search-results">${searchResults('')}</div>` : ''],
    'new-project': ['Новый проект', kind === 'new-project' ? projectForm(null) : ''],
    'project-settings': ['Настройки проекта', kind === 'project-settings' ? projectForm(projectById(state.settingsProjectId)) : ''],
    'replace-package': ['Заменить исходный пакет?', kind === 'replace-package' ? `<p class="dialog-desc">Пакет «Продажи.lgp» в /user будет перезаписан изменённой копией. Перед этим агент сохранит прежнюю версию как «Продажи — до правки.lgp» — её можно будет вернуть.</p><p class="dialog-desc">Если пакет запускается по расписанию или его открывают коллеги, они сразу получат изменённую версию.</p><div class="button-row"><button class="btn danger" data-action="confirm-replace-package">Заменить исходный</button><button class="btn" data-action="dismiss">Отмена</button></div>` : ''],
    'delete-chat': ['Удалить разговор?', kind === 'delete-chat' ? `<p class="dialog-desc">«${esc(state.sessions.find(item => item.id === state.deleteId)?.title)}» удалится насовсем.</p><div class="button-row"><button class="btn danger" data-action="confirm-delete-chat">Удалить</button><button class="btn" data-action="dismiss">Отмена</button></div>` : ''],
    'delete-project': ['Удалить проект?', kind === 'delete-project' ? `<p class="dialog-desc">Проект «${esc(projectById(state.deleteId)?.name)}» удалится насовсем вместе с разговорами (${state.sessions.filter(item => item.project === state.deleteId).length}), инструкциями и источниками.</p><div class="button-row"><button class="btn danger" data-action="confirm-delete-project">Удалить проект</button><button class="btn" data-action="dismiss">Отмена</button></div>` : ''],
    // «+» is the one always-visible door to everything that is not on screen yet.
    plus: ['Добавить',`<div class="dialog-options">
        <button data-action="plus-package"><span class="glyph red">${icon('flow',19)}</span><span><strong>Пакет из Loginom…</strong><small>Агент будет работать с пакетом; над полем появятся действия с ним</small></span>${icon('chevron',17)}</button>
        <label class="dialog-option"><span class="glyph blue">${icon('upload',18)}</span><span><strong>Файл с компьютера…</strong><small>Таблица, документ или пакет .lgp</small></span><input type="file" id="local-attachment" class="sr-only" aria-label="Выбрать файл с компьютера"></label>
        <button data-action="plus-catalog"><span class="glyph violet">${icon('grid',18)}</span><span><strong>Каталог…</strong><small>Действия, навыки и готовые сценарии из Loginom Hub</small></span>${icon('chevron',17)}</button>
        ${state.page === 'home' && (state.progress.examplesHidden || state.progress.ownChats >= 3) ? `<button data-action="show-examples"><span class="glyph green">${icon('spark',18)}</span><span><strong>Примеры задач</strong><small>Показать примеры под полем ввода</small></span>${icon('chevron',17)}</button>` : ''}
      </div>
      <p class="pkg-section">Учебные файлы</p>
      <div class="dialog-options"><button data-file="sales-demo.csv"><span class="glyph blue">${icon('database',18)}</span><span><strong>sales-demo.csv</strong><small>Пример таблицы продаж</small></span>${icon('plus',18)}</button><button data-file="Продажи.lgp"><span class="glyph red">${icon('flow',19)}</span><span><strong>Продажи.lgp</strong><small>Учебный пакет Loginom</small></span>${icon('plus',18)}</button></div>`],
    'loginom-status': ['Loginom', kind === 'loginom-status' ? (state.loginomDown
      ? `<div class="connect-card"><span class="glyph red">${icon('alert',19)}</span><div><strong>Loginom не отвечает</strong>
          <p class="muted">Последний запрос к ${esc(hostOf(state.settings.connection.url))} остался без ответа 30 секунд. Проверьте, открывается ли Loginom в браузере. Если нет — он выключен или недоступна сеть: обратитесь к администратору.</p>
          <div class="button-row"><button class="btn primary" data-action="recheck-loginom">${icon('refresh',15)} Проверить снова</button><button class="btn quiet" data-settings="loginom">${icon('settings',15)} Настройки подключения</button></div></div></div>`
      : state.settings.connection.connected
      ? `<div class="connect-card"><span class="glyph green">${icon('check',19)}</span><div><strong>Подключено</strong>
          <dl><div><dt>Адрес</dt><dd>${esc(hostOf(state.settings.connection.url))}</dd></div><div><dt>Пользователь</dt><dd>${esc(state.settings.connection.username)}</dd></div><div><dt>Папка</dt><dd>${esc(packageFolder('personal'))}</dd></div></dl>
          <div class="button-row"><button class="btn quiet" data-settings="loginom">${icon('settings',15)} Настройки подключения</button></div></div></div>`
      : `<p class="dialog-desc">Без Loginom агент отвечает на вопросы, но не открывает и не меняет пакеты.</p>${connectCard()}`) : ''],
    'agent-mode':['Режим агента',`<div class="dialog-options">${[['Выполнение','Предлагает план и запрашивает разрешения на действия'],['Планирование','Готовит план до начала выполнения']].map(([mode,detail]) => `<button data-agent-mode="${mode}"><span class="glyph red">${icon(mode === 'Планирование' ? 'layers':'spark',19)}</span><span><strong>${mode}</strong><small>${detail}</small></span>${state.mode === mode ? icon('check',18):''}</button>`).join('')}</div>`],
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
    item.phase = 'starting'
    setTimeout(() => startRun(item))
  }
  if (state.activePackage.isDraft && state.activePackage.project !== state.project) {
    state.activePackage = serverPackages[0]
    state.node = null
  }
  const scroll = resetScroll ? 0 : ($('#main')?.scrollTop ?? 0)
  // The feed follows the agent while the user reads the end of it; scrolling up to read stops that.
  const before = $('#main')
  const atEnd = state.scrollToEnd || (before && state.page === 'chat' && before.scrollHeight - before.scrollTop - before.clientHeight < 140)
  const active = document.activeElement
  const focused = active?.id && /^(INPUT|TEXTAREA)$/.test(active.tagName) ? [active.id, active.selectionStart, active.selectionEnd] : null
  const dockBefore = $('#dock-title')?.textContent
  setThemeAttribute()
  document.title = pages[state.page] + ' · Loginom AI Agent'
  app.innerHTML = `<div class="workspace${state.collapsed ? ' collapsed' : ''}${state.collapsed && peek ? ' peek' : ''}">
    ${sidebar()}${state.mobile ? '<button class="mobile-scrim" aria-label="Закрыть меню" data-action="menu"></button>':''}
    <div class="workspace-main">${header()}<main id="main" tabindex="-1" class="page page-${state.page}">${pageContents()}</main>
    </div>
  </div>${rowMenu()}${overlay()}`
  $('#main').scrollTop = scroll
  if (atEnd && state.page === 'chat') $('#main').scrollTop = $('#main').scrollHeight
  state.scrollToEnd = false
  const refocus = focused && document.getElementById(focused[0])
  if (refocus && (!state.overlay || refocus.closest('dialog'))) {
    refocus.focus()
    if (refocus.setSelectionRange && focused[1] != null) refocus.setSelectionRange(focused[1], focused[2])
  }
  // 7: a permission or a question that just appeared takes focus on its heading — Enter there does nothing.
  if ($('#dock-title') && $('#dock-title').textContent !== dockBefore && !refocus?.closest?.('.dock') && !state.overlay) $('#dock-title').focus()
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
    $('#project-name')?.focus()
    $('#chat-search')?.focus()
    $('#session-name')?.focus()
    $('#session-name')?.select()
  }
  if (state.page === 'hub') bindHub(app,state,api)
  if (['settings','onboarding'].includes(state.page)) bindSettings(app,state,api)
  if (['runner','studio'].includes(state.page)) bindSolutions(app,state,api)
}
function dismiss() {
  state.overlay = null
  state.moveAfterCreate = null
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
  // While the agent works, a message is a correction: it reaches the agent after the current step.
  if (old && ['running','retrying'].includes(old.phase) && state.editTurn?.session !== old.id) {
    old.steer.push({text:prompt, at:old.step + 1})
    state.draft = ''
    render()
    $('#prompt')?.focus()
    return
  }
  const withPackage = Boolean(state.draftPackage)
  let kind = /документ/i.test(prompt) && withPackage ? 'document'
    : /дубликат|пропуск|выгрузк/i.test(prompt) ? 'quality' : /проверь|оптимиз/i.test(prompt) ? 'refactor'
    : /внеси|улучш|объедин|исправ|переимен|измени/i.test(prompt) ? 'improve'
    : /abc|сценари|loginom|пакет|узл|данн|таблиц|lgp/i.test(prompt) || withPackage ? 'abc'
    // A follow-up without a task word continues the previous task («Собери такой же для регионов»); a question is answered.
    : old && old.kind !== 'chat' && !/\?\s*$/.test(prompt) ? old.kind : 'chat'
  if (['refactor','improve'].includes(kind) && !improvable(state.draftPackage?.name || (old ? old.files?.[0] : ''))) kind = 'clean'
  // Questions need no Loginom; documenting a file from the computer neither. The rest asks to connect.
  const needsLoginom = kind !== 'chat' && !(kind === 'document' && state.draftPackage?.source === 'local')
  const phase = needsLoginom && !state.settings.connection.connected ? 'connect' : 'starting'
  if (old) {
    clearTimeout(old.timer)
    clearInterval(old.writer)
  }
  // «Изменить» on a message: the turns from it on are replaced by the new request.
  const editAt = old && state.editTurn?.session === old.id ? state.editTurn.index : null
  const earlier = old ? [...(old.history || []), turnSnapshot(old)] : []
  const next = {
    id: old?.id ?? 'session-' + Date.now(), date:'Сейчас', title:old?.title || state.templateTitle || prompt.slice(0,56),
    kind, phase,
    files:[...(state.draftPackage ? [state.draftPackage.name] : []), ...state.draftFiles], prompt,
    project:old ? old.project : state.page === 'project' ? state.projectView : projectById(state.project) ? state.project : null,
    history:editAt === null ? earlier : earlier.slice(0, editAt), allowed:[...(old?.allowed || [])],
    step:0, decisions:[], cleared:[], steer:[],
  }
  state.editTurn = null
  // Examples stop showing once the user has started three conversations of their own.
  if (!old && !state.templateTitle) state.progress.ownChats++
  if (state.draftPackage) state.progress.packages = true
  state.sessions = [next, ...state.sessions.filter(x => x.id !== next.id)]
  state.templateTitle = ''
  state.draftPackage = null
  state.scrollToEnd = true
  openSession(next.id)
  if (phase === 'starting') startRun(next)
}
function tryPrompt(text) {
  newSession()
  state.draft = text
  render()
  $('#prompt')?.focus()
}
function changeAction(value, keyboard = false) {
  const [act, at] = value.split(':')
  const from = state.page === 'loginom' && state.activePackage.changeOf
  const item = from ? state.sessions.find(entry => entry.id === from.session) : currentItem()
  if (!item) return
  const turns = [...(item.history || []), item]
  const turn = turns[Number(at)]
  turn.change = turn.change || {}
  if (act === 'view') return openPackage({id:'draft-' + item.id + '-' + at, name:'Продажи.lgp', scope:'personal', folder:'', view:'sales-improve', isDraft:true, project:item.project, changeOf:{session:item.id, at:Number(at)}})
  if (act === 'open') return openPackage(changeState(turn) === 'saved' ? savedVersion(turn) : serverPackages.find(entry => entry.id === 'sales'))
  if (act === 'replace') {
    if (salesState().replaced) return toast('Исходный пакет уже заменён')
    state.replaceTurn = {session:item.id, at:Number(at)}
    state.overlay = 'replace-package'
    return render()
  }
  if (act === 'save') {
    const name = proposedVersionName(serverPackages.find(entry => entry.id === 'sales'))
    const saved = {id:'version-' + Date.now(), name, scope:'personal', folder:'', modified:new Date().toISOString().slice(0,10), size:'1,2 МБ', view:'sales-v2', savedVersion:true, editSessionId:item.id}
    state.importedPackages.push(saved)
    turn.change = {savedId:saved.id}
    toast(`Сохранено: «${name}» в /user`)
  }
  if (act === 'unsave') {
    state.importedPackages = state.importedPackages.filter(entry => entry.id !== turn.change.savedId)
    turn.change = {}
    toast('Новая версия удалена из Loginom — изменения снова в копии')
  }
  if (act === 'discard') turn.change = {discarded:true}
  if (act === 'undiscard') turn.change = {}
  if (act === 'restore') restoreSales()
  render()
  // From the keyboard, focus stays in the card (or the schema's bar) instead of falling to the page.
  if (keyboard) (document.querySelector(`.turn [data-change$=":${at}"]`) || document.querySelector('.package-save-bar button'))?.focus()
}
function restoreSales() {
  const original = serverPackages.find(entry => entry.id === 'sales')
  original.view = 'sales'
  original.modified = '2026-11-16'
  state.importedPackages = state.importedPackages.filter(entry => entry.id !== 'sales-backup')
  toast('Вернул прежнюю версию «Продажи.lgp»')
}
// Replacing the original is a separate, explicit step: the agent keeps a backup first.
function replacePackage() {
  const item = state.sessions.find(entry => entry.id === state.replaceTurn?.session)
  if (!item || salesState().replaced) return dismiss()
  const original = serverPackages.find(entry => entry.id === 'sales')
  state.importedPackages.push({...original, id:'sales-backup', name:'Продажи — до правки.lgp', view:'sales'})
  original.view = 'sales-v2'
  original.modified = new Date().toISOString().slice(0,10)
  state.overlay = null
  toast('«Продажи.lgp» заменён, прежняя версия — «Продажи — до правки.lgp»')
  render()
}
function feedAction(d) {
  const item = currentItem()
  const turns = [...(item.history || []), item]
  if (d.expandTurn != null) {
    const turn = turns[Number(d.expandTurn)]
    turn.expanded = !turn.expanded
    return render()
  }
  if (d.stepDetail != null) {
    const [turnIndex, index] = d.stepDetail.split(':').map(Number)
    const turn = turns[turnIndex]
    turn.open = turn.open?.includes(index) ? turn.open.filter(entry => entry !== index) : [...(turn.open || []), index]
    return render()
  }
  if (d.copyPrompt != null) return copyText(turns[Number(d.copyPrompt)].prompt)
  if (d.copyAnswer != null) return copyText(answerText(turns[Number(d.copyAnswer)]))
  if (d.editTurn != null) {
    state.editTurn = {session:item.id, index:Number(d.editTurn)}
    state.draft = turns[Number(d.editTurn)].prompt
    render()
    const prompt = $('#prompt')
    prompt?.focus()
    prompt?.setSelectionRange(prompt.value.length, prompt.value.length)
    return
  }
  // «Ответвить»: a new chat with the history up to and including this turn; the original stays as it was.
  const index = Number(d.forkTurn)
  const base = turns[index]
  const fork = {...turnSnapshot(base), id:'session-' + Date.now(), date:'Сейчас', title:'Ветка: ' + item.title, project:item.project,
    history:turns.slice(0, index).map(turn => turn === item ? turnSnapshot(item) : structuredClone(turn)), allowed:[]}
  state.sessions = [fork, ...state.sessions]
  openSession(fork.id)
  toast('Создан новый разговор с историей до этого места')
}
function turnSnapshot(item) {
  // A copy, not shared references: a fork's decisions must not show up in the original.
  return structuredClone({instruction:item.instruction, prompt:item.prompt, files:item.files, kind:item.kind, phase:item.phase === 'writing' ? item.writeFinal : ['running','retrying','permission','question','plan','connect','starting'].includes(item.phase) ? 'interrupted' : item.phase,
    step:item.step, decisions:item.decisions || [], answer:item.answer, steer:item.steer || [], cleared:item.cleared || [], allowed:item.allowed || [], errors:item.errors || [], change:item.change})
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
  collapse:() => { state.collapsed = !state.collapsed; peekHeld = state.collapsed && pointerInPanel; setPeek(false); write('collapsed',state.collapsed); render() },
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
  'stage-new':() => { write('stage','new'); write('collapsed',false); write('contour','online'); location.hash = ''; location.reload() },
  'try-run':() => tryPrompt('Построй ABC-анализ товаров по выручке'),
  'try-check':() => tryPrompt('Проверь сценарий продаж'),
  'try-question':() => tryPrompt('Проверь выгрузку на пропуски и дубликаты'),
  'try-detail':() => {
    if (stage === 'used' && state.sessions.some(item => item.id === 'seed-sales')) return openSession('seed-sales')
    write('stage','used')
    write('openChat','seed-sales')
    location.hash = ''
    location.reload()
  },
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
  'run-plan':() => runSteps(currentItem()),
  stop:() => {
    const item = currentItem()
    clearTimeout(item.timer)
    clearInterval(item.writer)
    // The work is done while the answer is being written: stopping just shows it whole.
    item.phase = item.phase === 'writing' ? item.writeFinal : 'stopped'
    render()
    $('#prompt')?.focus()
  },
  resume:() => runSteps(currentItem()),
  // The demo's Loginom «comes back» on the next check.
  'recheck-loginom':() => {
    state.loginomDown = false
    state.overlay = null
    toast('Loginom отвечает')
    render()
  },
  'retry-step':() => {
    const item = currentItem()
    state.loginomDown = false
    item.failAt = null
    item.decisions.push({at:item.step, choice:'retry'})
    runSteps(item)
    $('#prompt')?.focus()
  },
  'copy-error':() => copyText(`Loginom AI Agent: не удалось ${scriptOf(currentItem()).steps[currentItem().step].fail || 'выполнить шаг'}. Loginom не ответил за 30 с (${hostOf(state.settings.connection.url)}), 2 попытки.`),
  'try-failure':() => {
    state.failNext = true
    tryPrompt('Построй ABC-анализ товаров по выручке')
  },
  'open-instead':() => {
    currentItem().insteadOpen = true
    render()
    $('#instead-text')?.focus()
  },
  'cancel-edit':() => {
    state.editTurn = null
    state.draft = ''
    render()
  },
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
  'ask-package-edit':() => {
    const source = state.activePackage
    if (source.view === 'calculation') return startPackageEdit()
    newSession()
    chooseDraftPackage({name:source.name, where:packagePath(source), source:'loginom', item:source})
    state.draft = 'Проверь сценарий и покажи, что можно улучшить'
    render()
    $('#prompt')?.focus()
  },
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
  'confirm-replace-package':replacePackage,
  'restore-sales':() => {
    restoreSales()
    render()
  },
  'improve-from-check':() => {
    state.draft = 'Внеси эти улучшения'
    send()
  },
  'confirm-delete-chat':() => {
    const id = state.deleteId
    const project = sessionProjectOf(id)
    state.sessions = state.sessions.filter(item => item.id !== id)
    state.overlay = null
    toast('Разговор удалён')
    if (state.page === 'chat' && state.session === id) return projectById(project) ? openProject(project) : newSession()
    render()
  },
  'confirm-delete-project':() => {
    // As in ChatGPT, a project's chats go with it (owner's decision).
    const id = state.deleteId
    const gone = state.sessions.filter(item => item.project === id).map(item => item.id)
    const leave = (state.page === 'chat' && gone.includes(state.session)) || (state.page === 'project' && state.projectView === id)
    state.projects = state.projects.filter(item => item.id !== id)
    state.sessions = state.sessions.filter(item => item.project !== id)
    state.expanded = state.expanded.filter(item => item !== id)
    if (state.project === id) state.project = null
    state.overlay = null
    toast('Проект и его разговоры удалены')
    if (leave) return newSession()
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
  if (act === 'download') return downloadResult()
  if (act.startsWith('dest:')) {
    state.project = act.slice(5) || null
    render()
    return $('#prompt')?.focus()
  }
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
    state.settingsProjectId = project.id
    state.overlay = 'project-settings'
  }
  if (act === 'unmove') {
    chat.project = null
    if (state.session === chat.id) state.project = null
    toast('Разговор убран из проекта')
  }
  if (act.startsWith('move:')) {
    chat.project = act.slice(5)
    expandProject(chat.project)
    if (state.session === chat.id) state.project = chat.project
    toast(`Перенесено в «${projectById(chat.project).name}»`)
  }
  if (act === 'new-project-move') {
    state.moveAfterCreate = chat.id
    state.overlay = 'new-project'
  }
  render()
  if (menu.keyboard && !state.overlay) menuOpener(menu)?.focus()
}
app.addEventListener('click', event => {
  const opener = event.target.closest('[data-menu]')
  if (opener) {
    const [kind, id = ''] = opener.dataset.menu.split(':')
    const rect = opener.getBoundingClientRect()
    const where = opener.closest('.sidebar') ? 'panel' : opener.closest('.project-list') ? 'list' : 'page'
    const same = state.menu?.kind === kind && state.menu.id === id && state.menu.where === where
    state.menu = same ? null : {kind, id, where, x:rect.left, y:rect.bottom + 4, keyboard:!event.detail}
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
  // Clicking the chat that is already open keeps what the user is typing (and closes the search, if open).
  if (d.session) {
    if (state.page !== 'chat' || state.session !== d.session || state.review) return openSession(d.session)
    if (state.overlay) dismiss()
    return
  }
  if (d.openProject) return openProject(d.openProject)
  if (d.permit) return permit(d.permit)
  if (d.answer) return answerQuestion(d.answer)
  if (d.detail) {
    state.detail = d.detail
    write('detail', d.detail)
    return render()
  }
  if (d.change) return changeAction(d.change, !event.detail)
  if (d.expandTurn != null || d.stepDetail != null || d.copyPrompt != null || d.copyAnswer != null || d.editTurn != null || d.forkTurn != null) return feedAction(d)
  if (d.toggleProject) {
    state.expanded = state.expanded.includes(d.toggleProject) ? state.expanded.filter(id => id !== d.toggleProject) : [...state.expanded, d.toggleProject]
    render()
    // Opened from the keyboard, the folder keeps focus so the next Tab goes into its chats.
    if (!event.detail) document.querySelector(`.sidebar [data-toggle-project="${d.toggleProject}"]`)?.focus()
    return
  }
  if (d.showAll) {
    state.showAll = state.showAll.includes(d.showAll) ? state.showAll.filter(id => id !== d.showAll) : [...state.showAll, d.showAll]
    return render()
  }
  if (d.projectSettings) {
    state.settingsProjectId = d.projectSettings
    state.overlay = 'project-settings'
    return render()
  }
  if (d.projectTab) {
    state.projectTab = d.projectTab
    return render()
  }
  if (d.removeSource) {
    projectById(state.projectView).sources.splice(Number(d.removeSource),1)
    return render()
  }
  if (d.contour) {
    state.overlay = null
    return setContour(d.contour)
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
  if (d.node != null) {
    state.node = Number(d.node)
    render()
    return document.querySelector(`[data-node="${d.node}"]`)?.focus()
  }
  if (d.showBefore != null) {
    state.showBefore = d.showBefore === '1'
    state.node = null
    render()
    return document.querySelector(`[data-show-before="${d.showBefore}"]`)?.focus()
  }
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
    if (d.packageAction === 'improve' && (state.draftPackage || state.page === 'loginom')) return improveInChat(state.page === 'loginom' ? packageRef(state.activePackage) : state.draftPackage)
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
  if (event.target.id === 'chat-search') {
    $('#search-results').innerHTML = searchResults(event.target.value)
    return
  }
  if (['instead-text','answer-text'].includes(event.target.id)) {
    const item = currentItem()
    if (item) item.dockDraft = {...item.dockDraft, [event.target.id]:event.target.value}
    return
  }
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
  if (!['composer','project-form','rename-form','package-version-form','instead-form','answer-form'].includes(id)) return
  event.preventDefault()
  if (id === 'composer') return send()
  if (id === 'instead-form') {
    const text = new FormData(event.target).get('text').trim()
    return text ? permit('instead', text) : $('#instead-text')?.focus()
  }
  if (id === 'answer-form') return answerQuestion(new FormData(event.target).get('text'))
  if (id === 'package-version-form') return savePackageVersion(new FormData(event.target).get('version').trim())
  const name = new FormData(event.target).get('name').trim()
  if (!name) return
  if (id === 'rename-form') {
    state.sessions.find(x => x.id === state.renameId).title = name
    return dismiss()
  }
  const form = new FormData(event.target)
  if (state.overlay === 'project-settings') {
    Object.assign(projectById(state.settingsProjectId), {name, color:form.get('color'), instructions:form.get('instructions').trim()})
    return dismiss()
  }
  const project = {id:'p-' + Date.now(), name, color:form.get('color'), instructions:'', sources:[], pinned:false}
  state.projects.push(project)
  state.overlay = null
  const moved = state.sessions.find(item => item.id === state.moveAfterCreate)
  state.moveAfterCreate = null
  expandProject(project.id)
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
  if ((event.key.toLowerCase() === 'k' || event.code === 'KeyK') && (event.metaKey || event.ctrlKey) && !document.querySelector('dialog[open]')) {
    event.preventDefault()
    state.overlay = 'search'
    render()
    return
  }
  // In the search: Enter opens the first result, arrows walk the list.
  if (state.overlay === 'search' && ['Enter','ArrowDown','ArrowUp'].includes(event.key) && event.target.closest?.('#app-dialog')) {
    const hits = [...document.querySelectorAll('#search-results .search-hit')]
    if (event.key === 'Enter' && event.target.id === 'chat-search') {
      event.preventDefault()
      hits[0]?.click()
      return
    }
    if (event.key !== 'Enter') {
      event.preventDefault()
      const index = hits.indexOf(event.target)
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1
      ;(next < 0 ? $('#chat-search') : hits[Math.min(next, hits.length - 1)])?.focus()
      return
    }
  }
  if (event.key.toLowerCase() === 'b' && (event.metaKey || event.ctrlKey) && !document.querySelector('dialog[open]')) {
    event.preventDefault()
    actions.collapse()
  }
  if (state.menu && event.target.closest?.('.row-menu') && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
    event.preventDefault()
    const items = [...document.querySelectorAll('#row-menu button')]
    const index = items.indexOf(event.target)
    const next = {ArrowDown:index + 1, ArrowUp:index - 1, Home:0, End:items.length - 1}[event.key]
    items[(next + items.length) % items.length]?.focus()
    return
  }
  if (state.menu && (event.key === 'Escape' || (event.key === 'Tab' && event.target.closest?.('.row-menu')))) {
    event.preventDefault()
    const menu = state.menu
    state.menu = null
    render()
    menuOpener(menu)?.focus()
    return
  }
  if (event.key === 'Escape' && !peek && !document.querySelector('dialog[open]') && state.page === 'chat' && ['running','retrying','writing'].includes(currentItem()?.phase)) {
    actions.stop()
    return
  }
  if (event.key === 'Escape' && state.collapsed && !document.querySelector('dialog[open]')) {
    if (document.activeElement?.closest('.sidebar')) focusPage()
    if (peek) {
      peekHeld = pointerInPanel
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
  if (!open && state.collapsed && state.menu?.where === 'panel') {
    state.menu = null
    document.querySelector('#row-menu')?.remove()
    document.querySelector('.sidebar [aria-expanded="true"]')?.setAttribute('aria-expanded','false')
  }
}
function inPanel(target) {
  return Boolean(target.closest('.sidebar') || (state.menu?.where === 'panel' && target.closest('.row-menu')))
}
// After the user collapses the panel or presses Esc with the mouse still on it, it stays a rail until the
// mouse leaves; otherwise it would open again under the cursor right after the click. While render()
// swaps the DOM the pointer briefly lands on #app itself — that is not the mouse leaving.
// Not while a button is held (selecting text by dragging past the left edge); pointer events over a dialog
// say nothing about the panel either. The 90 ms delay lets a mouse cross the 60 px rail without opening it.
// When render() swaps the DOM the browser reports the resting mouse as entering the new elements; only a
// real move counts, so a menu opened from the keyboard is not closed by a mouse resting on the page.
let lastPoint = ''
document.addEventListener('pointermove', event => { lastPoint = event.clientX + ':' + event.clientY }, {passive:true})
document.addEventListener('pointerover', event => {
  const target = event.target
  const point = event.clientX + ':' + event.clientY
  if (point === lastPoint) return
  lastPoint = point
  if (event.pointerType !== 'mouse' || event.buttons || !state.collapsed || [app, document.body, document.documentElement].includes(target) || target.closest('dialog')) return
  const inside = inPanel(target)
  pointerInPanel = inside
  if (!inside) peekHeld = false
  if (peekHeld) return
  peekSidebar(inside)
})
// A choice made in the opened panel closes it, so the panel does not cover the page that just opened.
// Chosen from the keyboard, focus moves on to the page instead of falling back to the panel. Without a
// mouse (touch screens) a tap on the rail outside its icons opens it and a tap on the page closes it.
document.addEventListener('click', event => {
  if (!state.collapsed) return
  const inside = inPanel(event.target)
  if (!inside) return peek && setPeek(false)
  if (!event.target.closest('.sidebar button:not([data-menu])')) return setPeek(true)
  peekHeld = pointerInPanel
  setPeek(false)
  if (!event.detail && !document.querySelector('dialog[open]')) focusPage()
})
function focusPage() {
  ($('#prompt') || $('#main'))?.focus()
}
document.documentElement.addEventListener('pointerleave', () => { peekHeld = false; if (state.collapsed) peekSidebar(false) })
$('#announcements').addEventListener('click', event => {
  const id = event.target.closest('[data-toast-session]')?.dataset.toastSession
  if (!id) return
  $('#announcements').innerHTML = ''
  openSession(id)
})
addEventListener('popstate',() => { route(); state.overlay = null; render(true) })
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',() => { if (state.theme === 'system') render() })
// Seeds are finished conversations: every step done (the scripts are declared above this line).
for (const item of state.sessions) completeTurn(item)
render()
