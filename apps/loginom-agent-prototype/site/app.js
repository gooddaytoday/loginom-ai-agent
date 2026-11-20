import { editedPackageBase64 } from './edited-package.js'
import { icon } from './icons.js'
import { renderHub, bindHub, hubHasInstalled, openHubSolution, showHubType, showHubTab } from './hub.js'
import { renderSettings, bindSettings, ensureSettings, beforeSettingsLeave, availableModels } from './settings.js'
import { renderSolutions, bindSolutions, initSolutionDrafts } from './solutions.js'
import { renderCreate, renderModeration, bindOwn, trialBanner, trialResult, startFromSession, ownActionsGroup, demoOwn } from './create.js'
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
  runner:'Запуск действия', studio:'Создать своё', settings:'Настройки', review:'Что решить', moderation:'Консоль модерации',
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
const dateCondition = '«Дата» ≥ 01.01.2026 И «Дата» ≤ 31.10.2026'
const packageViews = {
  // «Продажи.lgp» as the check, the change card and «Как было» describe it: two branches, each with its own date filter.
  sales:[
    ['database','CSV продаж','Входные данные','Демонстрационный CSV · 2 400 строк'],
    ['layers','Фильтр по дате (ветка «Регионы»)','Преобразование','Оставляет продажи за выбранный период'],
    ['chart','Выручка по регионам','Расчёт','Сумма выручки по регионам'],
    ['layers','Фильтр по дате (ветка «Города»)','Преобразование','Тот же фильтр, что в ветке «Регионы»'],
    ['chart','Узел14','Расчёт','Сумма выручки по городам'],
    ['file','Результат','Выход','120 строк'],
  ],
  abc:[
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
  // 7th (В-67): the node's Loginom type and [setting or port, before, after] — the target product view; the parser reads
  // types, ports and links today, filter conditions and grouping fields need extending it (ux-spec, iteration 7);
  // links are shown on the receiving input, plus a filter's outputs. «Продажи.lgp» and its new version read the same rows.
  'sales-improve':[
    ['database','CSV продаж','Входные данные','Демонстрационный CSV · 2 400 строк',undefined,'',['Импорт из текстового файла',[
      ['Имя файла/URL','продажи.csv','продажи.csv'],['Разделитель столбцов','точка с запятой','точка с запятой']]]],
    ['layers','Фильтр по дате','Преобразование','Теперь стоит до разветвления и фильтрует один раз для обеих веток','mod','Фильтр по дате (ветка «Регионы»)',['Фильтр строк',[
      ['Имя','Фильтр по дате (ветка «Регионы»)','Фильтр по дате'],
      ['Условие',dateCondition,dateCondition],
      ['Вход «Входной источник данных»','← «CSV продаж»','← «CSV продаж»'],
      ['Выход «Соответствуют условию»','→ «Выручка по регионам»','→ «Проверка пустых значений»'],
      ['Выход «Не соответствуют условию»','не подключён','не подключён']]]],
    ['shield','Проверка пустых значений','Контроль','Новый узел: строки без цены или региона не идут в расчёт — они на выходе «Не соответствуют условию»','add','',['Фильтр строк',[
      ['Условие','','«Цена» не пустой И «Регион» не пустой'],
      ['Вход «Входной источник данных»','','← «Фильтр по дате»'],
      ['Выход «Соответствуют условию»','','→ «Выручка по регионам», «Выручка по городам»'],
      ['Выход «Не соответствуют условию»','','не подключён: строки без цены или региона, при проверочном запуске — 12']]]],
    ['chart','Выручка по регионам','Расчёт','Получает данные от узла «Проверка пустых значений»; расчёт не менялся','mod','Выручка по регионам',['Группировка',[
      ['Группа','Регион','Регион'],['Показатели','Выручка — сумма','Выручка — сумма'],
      ['Вход «Входной источник данных»','← «Фильтр по дате (ветка «Регионы»)»','← «Проверка пустых значений»']]]],
    ['layers','Фильтр по дате (ветка «Города»)','Преобразование','Удалён: дублировал фильтр в ветке «Регионы»','del','Фильтр по дате (ветка «Города»)',['Фильтр строк',[
      ['Условие',dateCondition,''],
      ['Вход «Входной источник данных»','← «CSV продаж»',''],
      ['Выход «Соответствуют условию»','→ «Узел14»',''],
      ['Выход «Не соответствуют условию»','не подключён','']]]],
    ['chart','Выручка по городам','Расчёт','Переименован и получает данные от узла «Проверка пустых значений»; расчёт не менялся','mod','Узел14',['Группировка',[
      ['Имя','Узел14','Выручка по городам'],
      ['Группа','Город','Город'],['Показатели','Выручка — сумма','Выручка — сумма'],
      ['Вход «Входной источник данных»','← «Фильтр по дате (ветка «Города»)»','← «Проверка пустых значений»']]]],
    ['file','Результат','Выход','120 строк — как в исходном пакете',undefined,'',['Объединение',[
      ['Вход «Главная таблица»','← «Выручка по регионам»','← «Выручка по регионам»'],
      ['Вход «Присоединяемая таблица»','← «Узел14»','← «Выручка по городам»']]]],
  ],
  'sales-v2':[
    ['database','CSV продаж','Входные данные','Демонстрационный CSV · 2 400 строк'],
    ['layers','Фильтр по дате','Преобразование','Один фильтр до разветвления'],
    ['shield','Проверка пустых значений','Контроль','Строки без цены или региона не идут в расчёт'],
    ['chart','Выручка по регионам','Расчёт','Сумма выручки по регионам'],
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
// Iteration 8: a follow-up edit kept «Фильтр по дате (ветка «Города»)», which «Города — неделя.lgp» takes results from.
// A copy, a saved version or a replaced original made with it carries keep:true; the views are the same otherwise.
const keptCityFilter = ['layers','Фильтр по дате (ветка «Города»)','Преобразование','Оставлен: на него ссылается «Города — неделя.lgp»; в этом пакете его результат больше не используется','mod','Фильтр по дате (ветка «Города»)',['Фильтр строк',[
  ['Условие',dateCondition,dateCondition],
  ['Вход «Входной источник данных»','← «CSV продаж»','← «CSV продаж»'],
  ['Выход «Соответствуют условию»','→ «Узел14»','не подключён: результат берёт «Города — неделя.lgp»'],
  ['Выход «Не соответствуют условию»','не подключён','не подключён']]]]
const keepPrompt = 'Не удаляй «Фильтр по дате (ветка «Города»)» — на него ссылается «Города — неделя.lgp»'
function viewNodes(view, keep) {
  const nodes = packageViews[view] || []
  if (!keep) return nodes
  if (view === 'sales-improve') return nodes.map(node => node[1] === keptCityFilter[1] ? keptCityFilter : node)
  if (view === 'sales-v2') return [...nodes.slice(0,4), ['layers',keptCityFilter[1],'Преобразование','Нужен для «Города — неделя.lgp»'], ...nodes.slice(4)]
  return nodes
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
  {id:'summary',name:'Сводка продаж.lgp',scope:'shared',folder:'',modified:'2026-11-09',size:'0,9 МБ',view:'abc'},
  ...Object.entries(demoFolders).flatMap(([key,rows]) => rows.map((row,index) => {
    const [name,modified,size] = row.split('|')
    const [scope,folder] = key.split('|')
    return {id:key + '#' + index, name:name + '.lgp', scope, folder, modified, size:size + ' МБ', view:'local'}
  })),
]
let peek = false, peekWanted = false, peekHeld = false, peekTimer = 0, pointerInPanel = false
const state = {
  page:'home', policy:read('policy',''), contour:read('policy','') ? 'closed' : read('contour','online'), theme:read('theme','light'),
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
// For evaluators' briefs (agent-review): a console line makes the free model spend its daily limit at the next task.
if (read('model-limit', false)) {
  state.failModel = true
  try { localStorage.removeItem('loginom-demo-model-limit') } catch {}
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
// Under the demo policy the user still has to sign in to the administrator's Loginom; a mode that does not allow
// the public stand parks the connection (the second ensureSettings).
if (stage === 'used' && state.policy !== 'set') {
  ensureSettings(state).connection.connected = true
  ensureSettings(state)
}

const api = {
  icon, render, toast, navigate, setContour, setTheme, useTemplate, runSolution, discuss, pinSolution, openMine, startTrial, runOwnAction,
}
// Iteration 6: own skills and actions (create.js).
function openMine() {
  showHubTab(state, 'mine')
  navigate('hub')
}
function startTrial(trial, prompt) {
  newSession()
  state.trialSkill = trial
  state.draft = prompt
  // The trial task names «Продажи.lgp»: the package is attached, as if chosen through «+».
  if (state.settings.connection.connected && prompt.includes('«Продажи.lgp»')) state.draftPackage = packageRef(serverPackages.find(entry => entry.id === 'sales'))
  render()
  $('#prompt')?.focus()
}
// An own action is a built-in action with saved parameters; the wizard opens with them filled in.
function runOwnAction(own) {
  delete state.solutions.runs[own.key]
  state.overlay = null
  // From «Что сделать с пакетом» the chosen package goes into the wizard, as with built-in actions.
  if (state.draftPackage) state.runnerPackage = state.draftPackage
  runSolution(own.solution, own.mode || 'review', ['home','chat'].includes(state.page) ? state.page : 'hub')
  state.ownRun = own
  render()
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
// keepReturn: settings opened from a task («Настроить Loginom») return to it after saving.
function navigate(page, keepReturn = false) {
  if (!Object.hasOwn(pages, page) || !canNavigate(page)) return
  if (page === 'settings' && !keepReturn) state.returnTo = null
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
function applyDemoPolicy(policy, tab) {
  if (state.policy !== policy) {
    // The user's own settings wait under the policy and come back when it is removed.
    if (!state.policy) state.userSettings = state.settings ? JSON.parse(JSON.stringify(state.settings)) : undefined
    state.settings = policy ? undefined : state.userSettings
    if (!policy) state.userSettings = undefined
    state.policy = policy
    write('policy',policy)
    state.contour = policy ? 'closed' : read('contour','online')
  }
  if (tab) settingsTab(tab)
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
  state.ownRun = null
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
  navigate('settings', true)
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
      <button class="icon-btn neutral search-btn" data-overlay="search" aria-label="Поиск" title="Поиск (Ctrl+K)">${icon('search',18)}</button>
    </div>
    <button class="btn new-session${state.page === 'home' ? ' current' : ''}" data-action="new">${icon('compose',17)}<span>Новый разговор</span><kbd>Ctrl N</kbd></button>
    ${navButton('hub','grid')}
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
  if (item.phase === 'failed') return item.modelError && !item.modelError.resolved ? '<i class="conn-dot warn" title="Модель не ответила — нужна ваша помощь"></i><span class="sr-only">— модель не ответила</span>' : '<i class="conn-dot warn" title="Шаг не выполнен — нужна ваша помощь"></i><span class="sr-only">— шаг не выполнен</span>'
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
// В-54: no logo in the top bar — it says where you are; the brand is on the start screen and in «Справка».
function topTitle() {
  if (state.page === 'home') return ''
  if (state.page === 'chat') return `<span class="crumb-current">${esc(state.sessions.find(item => item.id === state.session)?.title || 'Разговор')}</span>`
  if (state.page === 'project') return `<span class="crumb-current">${esc(projectById(state.projectView)?.name || 'Проект')}</span>`
  return `<span class="crumb-current">${pages[state.page]}</span>`
}
function header() {
  return `<header class="topbar">
    <div class="top-left">
      <button class="icon-btn mobile-menu" aria-label="Открыть меню" aria-expanded="${state.mobile}" data-action="menu">${icon('menu',20)}</button>
      ${state.page === 'chat' && projectById(sessionProject()) ? `<button class="crumb-project" data-open-project="${sessionProject()}">${icon('folder',16)}<span>${esc(projectById(sessionProject()).name)}</span></button>` : ''}
      ${topTitle()}
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
  const model = chatModel()
  // Where the data goes is said where the user decides to send it, not only in «Модели».
  const note = state.policy === 'broken' && !modelName ? `${icon('alert',14)}<span>Файл политики администратора с ошибкой: модели — только на этом компьютере.</span><button type="button" class="link-btn" data-settings="models">Что делать</button>`
    : modelName && model.kind === 'cloud' && (pkg || state.draftFiles.length) ? `${icon('globe',14)}<span>Модель в облаке: сообщение и то, что агент прочитает в приложенном, уйдут в «${esc(model.where)}».</span><button type="button" class="link-btn" data-settings="models">Модели</button>` : ''
  return `<form class="composer" id="composer">
    ${['home','chat','project'].includes(state.page) ? trialBanner(state) : ''}
    ${state.editTurn && state.editTurn.session === state.session && state.page === 'chat' ? `<div class="edit-banner">${icon('compose',15)}<span>Изменяете сообщение — ответы после него заменятся новыми${editCopyNote()}${state.importedPackages.some(entry => entry.savedVersion) || salesState().replaced ? '. Пакеты, уже сохранённые в Loginom, останутся как есть' : ''}</span><button type="button" class="link-btn" data-action="cancel-edit">Отмена</button></div>` : ''}
    ${pkg ? packageContext(pkg) : ''}
    ${state.draftFiles.length ? `<div class="attachment-list">${state.draftFiles.map((file,i) => `<span>${icon('file',14)} ${esc(file)} <button type="button" class="small-icon" aria-label="Убрать ${esc(file)}" data-remove-file="${i}">${icon('close',13)}</button></span>`).join('')}</div>` : ''}
    ${note ? `<div class="composer-note">${note}</div>` : ''}
    <textarea id="prompt" aria-label="Сообщение агенту" placeholder="${state.page === 'chat' && state.editTurn?.session === state.session ? 'Изменённое сообщение' : state.page === 'chat' && ['running','retrying'].includes(currentItem()?.phase) ? 'Поправка агенту — учтёт после текущего шага' : state.page === 'chat' ? 'Уточните задачу или задайте вопрос' : state.page === 'project' || projectById(state.project) ? esc(`Новый разговор в проекте «${projectById(state.page === 'project' ? state.projectView : state.project)?.name}»`) : esc(placeholder)}" rows="2">${esc(state.draft)}</textarea>
    <div class="composer-toolbar">
      <div class="composer-options">
        <button class="icon-btn neutral plus-btn" type="button" aria-label="Добавить: пакет, файл, каталог" title="Пакет из Loginom, файл с компьютера, каталог" data-overlay="plus">${icon('plus',18)}</button>
        ${state.page === 'home' && state.projects.length ? `<button class="filter-btn dest-chip" type="button" data-menu="dest:" aria-haspopup="menu" aria-expanded="${state.menu?.kind === 'dest'}" title="Где будет разговор">${icon('folder',15)} <span class="filter-label">${esc(projectById(state.project)?.name || 'Без проекта')}</span> ${icon('down',12)}</button>` : ''}
        ${state.settings.preferences.agentPicker ? `<button class="filter-btn mode-pick" type="button" data-overlay="agent-mode" title="Режим агента: ${state.mode}">${icon(state.mode === 'Планирование' ? 'layers' : 'spark',15)} <span class="filter-label">${state.mode}</span> ${icon('down',12)}</button>` : ''}
      </div>
      <div class="composer-options">
        ${loginomChip()}
        ${modelName ? `<button class="filter-btn composer-model" type="button" data-menu="model:" data-menu-up aria-haspopup="menu" aria-expanded="${state.menu?.kind === 'model' && !state.menu.id}" aria-label="Модель${state.page === 'chat' ? ' этого разговора' : ''}: ${esc(modelName)}" title="Модель${state.page === 'chat' ? ' этого разговора' : ''}: ${esc(modelName)}">${icon('cpu',15)} <span class="filter-label">${esc(modelName)}</span> ${icon('down',12)}</button>`
          : `<button class="filter-btn composer-model lgm-chip off" type="button" data-settings="models" title="Модель">${icon('cpu',15)} <span class="filter-label">Выберите модель</span> ${icon('down',12)}</button>`}
        ${state.page === 'chat' && ['running','retrying','writing'].includes(currentItem()?.phase) ? `<button class="stop-btn" type="button" data-action="stop" title="Остановить агента (Esc)">${icon('stop',14)}<span>Остановить</span></button>` : ''}
        <button class="send-btn" type="submit" ${state.draft.trim() ? '' : 'disabled'} aria-label="Отправить сообщение" title="Отправить сообщение">${icon('up',20)}</button>
      </div>
    </div>
  </form>`
}
// Iteration 8: OpenCode's «Revert» rolls back files on the computer, not Loginom. The app keeps a snapshot of a copy after
// each turn, so it can put the copy back as it was before the edited message — or delete a copy made after it.
function editCopyNote() {
  const item = currentItem()
  if (!item || state.editTurn?.session !== item.id) return ''
  const turns = [...(item.history || []), item]
  const from = state.editTurn.index
  const notes = [...new Set(turns.slice(from).filter(turn => turn.copy && !turn.forkOf && turn.step > 0).map(turn => turn.copy.name))].map(name => {
    const head = turns.findLast(turn => turn.copy?.name === name && !turn.forkOf && turn.phase === 'done')
    const made = turns.findIndex(turn => turn.copy?.name === name && !turn.forkOf) >= from
    const done = head && changeState(head)
    if (done === 'discarded') return `копия агента «${esc(name)}» уже удалена — так и останется`
    if (done === 'replaced') return `исходный «Продажи.lgp» останется заменённым${made ? '' : `, копия агента «${esc(name)}» вернётся к виду до этого сообщения`}`
    return made ? `копию агента «${esc(name)}» приложение удалит` : `копия агента «${esc(name)}» вернётся к виду до этого сообщения`
  })
  return notes.length ? '; ' + notes.join('; ') : ''
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
    <section class="starter" aria-label="Новый разговор"><div class="start-brand brand" aria-hidden="true"><picture><img class="brand-standard" src="assets/loginom-wordmark.svg" alt=""><img class="brand-inverse" src="assets/loginom-wordmark-light.png" alt=""></picture><span>AI Agent</span></div>${composer()}</section>
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
  const edit = item.kind === 'package-edit'
  const attached = edit ? (canUsePackageEdit(item) ? [item.source.name] : []) : item.files
  const created = edit ? (canUsePackageEdit(item) && item.workingPackage?.savedVersion ? [item.workingPackage.name] : []) : createdFiles(item)
  const fileList = (title, list) => list.length ? `<p class="review-label">${title}</p>${list.map(file => `<div class="review-entry">${icon('file',16)}${esc(file)}</div>`).join('')}` : ''
  return `<aside class="review-panel" aria-label="Проверка результатов">
    <div class="review-heading"><h2>Контекст разговора</h2><button class="icon-btn" data-action="review" aria-label="Закрыть панель">${icon('close',17)}</button></div>
    <div class="review-switch">${[['plan','План'],['files','Файлы'],['log','Журнал']].map(([id,label]) => `<button class="${active === id ? 'active':''}" data-review="${id}" aria-pressed="${active === id}">${label}</button>`).join('')}</div>
    ${active === 'plan' ? plan(item) : active === 'files' ? `<div class="review-stack">${fileList('Приложено', attached) + fileList('Создано', created) || '<p class="muted">Файлов пока нет.</p>'}</div>` : `<div class="review-stack">${journal(item)}</div>`}
    ${followedNow(item)}
  </aside>`
}
function plan(item) {
  if (item.kind === 'package-edit') {
    const completed = item.phase === 'saved' ? 3 : item.workingPackage ? 2 : item.phase === 'proposed' ? 1 : 0
    return `<ol class="run-plan">${['Предложить правку','Применить к черновику','Сохранить новую версию'].map((step,i) => `<li><span>${i < completed ? icon('check',14) : i+1}</span>${step}</li>`).join('')}</ol>`
  }
  return scriptOf(item).plan ? turnPlan(item) : '<p class="muted">Агент ответил сразу, без плана.</p>'
}
// The journal is the steps the feed shows, in order; nothing the agent did not do.
function journal(item) {
  if (item.kind === 'package-edit') return `<div class="review-entry">${icon('clock',16)} Запрос принят</div>${item.phase === 'saved' ? `<div class="review-entry">${icon('check',16)} Сохранена новая версия</div>` : ''}`
  const steps = scriptOf(item).steps.slice(0, item.step).map(step => stepText(step.done, item))
  return [...(item.rules && item.step > 0 ? [item.rules.step] : []), ...steps].map(text => `<div class="review-entry">${icon('check',16)} ${esc(text)}</div>`).join('') || `<div class="review-entry">${icon('clock',16)} Запрос принят</div>`
}
// Files the chat really made, in every turn: none for a check, the document, the saved package or report.
function createdFiles(item) {
  return [...(item.history || []), item].flatMap(turnFiles)
}
function turnFiles(item) {
  if (item.phase !== 'done') return []
  if (item.kind === 'document') return [stepText('{doc}', item)]
  if (item.kind === 'abc') return ['ABC-анализ.lgp']
  if (item.kind === 'quality') return ['Качество выгрузки.html']
  if (['improve','keep'].includes(item.kind)) return savedVersion(item) ? [savedVersion(item).name] : []
  return []
}
// What the agent follows in this chat: the general and project instructions always, a skill when it was applied.
function followedNow(item) {
  const project = projectById(item.project)
  const rows = [
    state.settings.instructions && 'Ваши инструкции — «Настройки» → «Инструкции»',
    project?.instructions && `Инструкции проекта «${project.name}»`,
    item.trial && `Навык «${item.trial.name}» — проба`,
    item.rules?.skill && `Навык «${item.rules.skill}» — применён в этом ответе`,
  ].filter(Boolean)
  return rows.length ? `<p class="review-label">Агент учитывает</p><div class="review-stack">${rows.map(text => `<div class="review-entry">${icon('book',16)} ${esc(text)}</div>`).join('')}</div>` : ''
}
function resultPackage(item) {
  return {
    id:'result-' + item.id, name:item.kind === 'abc' ? 'ABC-анализ.lgp' : item.kind === 'refactor' ? 'Продажи — улучшено.lgp' : 'Результат.lgp',
    scope:'personal', view:item.kind === 'quality' ? 'quality' : item.kind === 'abc' ? 'abc' : 'sales', isResult:true,
  }
}
// В-55…В-57: a chat without a project has its own visible folder; files follow the chat into a project.
function chatFiles(item) {
  const turns = [...(item.history || []), item]
  return turns.flatMap(turn => turn.kind === 'document' ? [(turn.files?.[0] || item.files?.[0] || 'Пакет.lgp').replace(/\.lgp$/i,'') + ' — описание.md']
    : turn.kind === 'quality' ? ['Качество выгрузки.html'] : [])
}
function chatFolder(item) {
  const project = projectById(item.project)
  if (project) return { label:'в папке проекта', path:'Документы → Loginom AI Agent → ' + project.name + (item.movedIn ? ' → ' + item.title : '') }
  const day = {'Сейчас':'18.11','Сегодня':'18.11','Вчера':'17.11','3 дня назад':'15.11'}[item.date] || item.date
  return { label:'в папке разговора', path:'Документы → Loginom AI Agent → Без проекта → ' + day + ' ' + item.title }
}
function filesWord(count) {
  const tail = count % 100
  if (tail > 10 && tail < 20) return 'файлов'
  return ['файлов','файл','файла','файла','файла','файлов','файлов','файлов','файлов','файлов'][count % 10]
}
// В-67: each finding of the check points at nodes of «Продажи.lgp» (indexes in its schema); after a replace — of the backup.
const salesFindings = [
  ['«Фильтр по дате» повторяется',' в двух ветках — достаточно одного до разветвления.',[1,3]],
  ['«Узел14»',' — по имени не понять, что он считает; это выручка по городам.',[4]],
  ['Нет проверки пустых значений',' перед расчётом — строки без цены или региона искажают итог.',[2,4]],
]
function showFinding(index, local = false) {
  const [title,text,nodes] = salesFindings[index]
  // Iteration 8: a file from the computer is read where it is (the parser works on a local .lgp), without Loginom.
  const target = local ? {id:'local-sales', name:'Продажи.lgp', scope:'personal', folder:'', view:'sales', localFile:true}
    : packageEntries().find(entry => entry.id === (salesState().replaced ? 'sales-backup' : 'sales'))
  if (!target) return toast('Замечания относятся к прежней версии «Продажи.lgp», а её в этом подключении Loginom нет', 'alert')
  openPackage(target, {pkg:target.id, view:target.view, nodes, text:title + text, session:state.session})
}
function result(item) {
  if (item.kind === 'skilltrial') return trialResult(item)
  if (['improve','keep'].includes(item.kind)) return changeCard(item)
  if (item.kind === 'more') return `<div class="answer-block"><p>Улучшения уже внесены в копию «${esc(item.about || 'Продажи — правка агента.lgp')}» — она в карточке выше. ${item.aboutKeep ? 'Скажите, что поменять ещё.' : `Скажите, что поменять ещё, например: «${esc(keepPrompt)}».`}</p>${item.aboutKeep ? '' : `<button class="btn" data-action="fill-keep">${icon('compose',15)} Подставить этот запрос</button>`}</div>`
  if (item.kind === 'nocopy') {
    const why = item.nocopy || {why:'none'}
    const said = {saved:`Изменения из копии «${esc(why.name)}» уже сохранены новой версией — эту копию я больше не правлю.`, replaced:`Копия «${esc(why.name)}» уже заменила исходный «Продажи.lgp» — эту копию я больше не правлю.`, discarded:`Изменения в копии «${esc(why.name)}» отменены.`, fork:`Копия «${esc(why.name)}» принадлежит разговору «${esc(why.title)}» — здесь я её не правлю.`, partial:`Прошлая правка копии «${esc(why.name)}» остановлена на середине — улучшения внесены не все.`, none:'Сейчас в этом разговоре нет копии пакета, которую я правлю.'}[why.why] || 'Сейчас в этом разговоре нет копии пакета, которую я правлю.'
    const next = why.why === 'partial' ? 'Сначала попросите «Внеси улучшения в сценарий продаж» — я доделаю её, потом можно попросить оставить узел.'
      : salesState().replaced ? 'Исходный «Продажи.lgp» уже заменён: чтобы править заново, верните прежнюю версию кнопкой в карточке правки.'
      : 'Чтобы поменять пакет, попросите «Внеси улучшения в сценарий продаж» — я начну новую копию, а потом можно попросить оставить узел.'
    return `<div class="answer-block"><p>${said} ${next}</p></div>`
  }
  if (item.kind === 'clean') return `<div class="answer-block"><h2>Замечаний нет</h2><p>Проверил «${esc(item.files?.[0] || 'Продажи.lgp')}»: повторов, непонятных имён и пропущенных проверок не нашёл. Пакет не менял.</p>${(item.files?.[0] || 'Продажи.lgp') === 'Продажи.lgp' && salesState().replaced ? `<p class="muted">«Продажи.lgp» уже заменён улучшенной версией. Прежняя версия сохранена как «Продажи — до правки.lgp».</p><button class="btn" data-action="restore-sales">${icon('refresh',15)} Вернуть прежнюю версию</button>` : ''}</div>`
  if (item.kind === 'refactor') return `<div class="answer-block"><h2>Нашёл ${item.rules ? 4 : 3} улучшения</h2><p>${item.local ? 'Файл «Продажи.lgp» с компьютера не менял' : 'Пакет «Продажи.lgp» не менял'}. Что можно сделать лучше:</p>
    <ol class="findings">${salesFindings.map(([title,text],i) => `<li><strong>${esc(title)}</strong>${esc(text)} <button class="link-btn finding-link" data-finding="${i}${item.local ? ':local' : ''}">${icon('flow',14)} Показать на схеме</button></li>`).join('')}${item.rules ? `<li><strong>В модуле нет заметки</strong> о том, что он делает и кто за него отвечает, — ${esc(item.rules.by)}.</li>` : ''}</ol>
    <div class="button-row"><button class="btn primary" data-action="improve-from-check">${icon('wand',15)} Внести улучшения</button><span class="muted">${item.local ? 'Агент загрузит копию в Loginom и изменит её; файл на компьютере не изменится.' : 'Агент изменит копию; исходный пакет изменится, только если вы решите его заменить.'}</span></div></div>`
  if (item.kind === 'chat' && item.web) return `<div class="answer-block"><p>Открывать сайты мне запрещено: ${item.web}. В разговоре это не разрешить.</p><p>По Loginom могу ответить по справке, которая встроена в приложение.</p></div>`
  if (item.kind === 'chat') return `<div class="answer-block"><p>Я помогаю работать в Loginom: собираю сценарии, разбираю и документирую пакеты, проверяю данные. Опишите задачу своими словами или выберите пакет через «+» — над полем появятся действия с ним.</p>${state.settings.connection.connected ? '' : '<p class="muted">Для работы с пакетами нужен Loginom — я предложу подключиться, когда он понадобится.</p>'}</div>`
  if (item.kind === 'document') return `<div class="answer-block"><h2>Пакет задокументирован</h2><p>Описаны назначение пакета, входные данные и каждый узел. Пакет не изменялся.</p>
    <dl class="result-metrics"><div><dt>Узлов описано</dt><dd>12</dd></div><div><dt>Входные данные</dt><dd>2 таблицы</dd></div><div><dt>Изменено</dt><dd>ничего</dd></div></dl>
    <div class="artifact-card"><span class="glyph green">${icon('file',19)}</span><span><strong>${esc((item.files[0] || 'Пакет.lgp').replace(/\.lgp$/i,''))} — описание.md</strong><small>${chatFolder(item).label.replace(/^в/,'В')}</small></span><button class="btn quiet" data-action="open-chat-folder">Открыть папку</button><button class="btn" data-action="download-result">Скачать ${icon('download',14)}</button></div></div>`
  const info = item.kind === 'quality'
    ? ['Проверка данных завершена','Обнаружены 12 пропусков и 3 дубликата. В отчёте отмечены столбцы, которые нужно проверить перед загрузкой.',[['Строки','2 400'],['Пропуски','12'],['Дубликаты','3']]]
    : item.kind === 'refactor'
    ? ['Нашёл 3 улучшения','Пакет не менял. Что можно сделать лучше:',[['Проверено узлов','6'],['Замечаний','3'],['Пакет','не изменён']]]
    : ['Сценарий ABC-анализа собран','Товары распределены по трём группам по накопленной доле выручки. Итоговая таблица и шаги сценария доступны в результатах.',[['Группа A','15 товаров'],['Группа B','28 товаров'],['Группа C','77 товаров']]]
  return `<div class="answer-block"><h2>${info[0]}</h2><p>${info[1]}</p>
    <dl class="result-metrics">${info[2].map(([key,value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>
    ${item.kind === 'quality' ? `<div class="artifact-card"><span class="glyph green">${icon('file',19)}</span><span><strong>Качество выгрузки.html</strong><small>Отчёт ${chatFolder(item).label}</small></span><button class="btn quiet" data-action="open-chat-folder">Открыть папку</button><button class="btn" data-action="download-result">Скачать CSV ${icon('download',14)}</button></div>`
      : `<div class="artifact-card"><span class="glyph red">${icon('flow',19)}</span><span><strong>${resultPackage(item).name}</strong><small>Пакет в ${esc(packageFolder('personal'))}</small></span><button class="btn" data-action="open-result-package">Открыть ${icon('external',14)}</button></div>`}
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
// The card's state: replaced (by this card) > saved (if the version still exists) > discarded > draft.
function changeState(turn) {
  if (salesState().replaced && turn.change?.replaced) return 'replaced'
  if (savedVersion(turn)) return 'saved'
  return turn.change?.discarded ? 'discarded' : 'draft'
}
// The scripted improvements exist only in the original «Продажи.lgp»; any other package or a replaced one has none.
function improvable(name, local = false) {
  return (name || 'Продажи.lgp') === 'Продажи.lgp' && (local || !salesState().replaced)
}
// What the agent changed in its working copy, as in Codex's «Edited file +2 −2» card: one row per node.
// 4th: the node in the copy whose settings and ports «Настройки и связи» shows before → after (В-67).
const packageChanges = [
  ['mod','Фильтр по дате','перенесён из ветки «Регионы» до разветвления — теперь один на обе ветки','Фильтр по дате'],
  ['add','Проверка пустых значений','новый узел между «Фильтр по дате» и расчётами: строки без цены или региона в расчёт не идут','Проверка пустых значений'],
  ['mod','Выручка по регионам','получает данные от узла «Проверка пустых значений»; расчёт не менялся','Выручка по регионам'],
  ['del','Фильтр по дате (ветка «Города»)','удалён — дублировал фильтр в ветке «Регионы»','Фильтр по дате (ветка «Города»)'],
  ['mod','Узел14 → «Выручка по городам»','переименован и получает данные от узла «Проверка пустых значений»','Выручка по городам'],
]
function changeRows(keep) {
  return keep ? packageChanges.map(row => row[0] === 'del' ? ['mod',keptCityFilter[1],'оставлен: на него ссылается «Города — неделя.lgp»; в этом пакете его результат больше не используется',keptCityFilter[1]] : row) : packageChanges
}
// Iteration 8: edits in a row go to one copy while it is a draft — the agent opens the copy it made, not the original.
// The copy's last turn holds its state and buttons; earlier cards say the edit went on. A fork's cards stay with the
// conversation the copy belongs to.
function copyChain(item, at) {
  const turns = [...(item.history || []), item]
  const name = turns[at]?.copy?.name
  return turns.flatMap((turn, index) => name && turn.copy?.name === name && !turn.forkOf && (inChain(turn) || index === at) ? [index] : [])
}
function chainHead(item, at) {
  return copyChain(item, at).at(-1) ?? at
}
// What a card shows: the replaced original or the saved version as they were written, otherwise the copy now.
function cardKeep(item, at) {
  const turn = [...(item.history || []), item][at]
  const current = turn && changeState(turn)
  if (current === 'replaced') return Boolean(serverPackages.find(entry => entry.id === 'sales').keep)
  if (current === 'saved') return Boolean(savedVersion(turn)?.keep)
  return chainKeep(item, at)
}
function chainKeep(item, at) {
  const turns = [...(item.history || []), item]
  return copyChain(item, at).some(index => turns[index].kind === 'keep' && turns[index].phase === 'done')
}
// A turn holds a card of its copy once it finished; a running one takes over (the earlier cards lose their buttons).
// A stopped or failed one leaves the copy partly changed but no card.
function inChain(turn) {
  return turn.phase === 'done' || ['running','retrying','permission','question','writing'].includes(turn.phase)
}
// The copy a follow-up edit continues (В-73): the conversation's last copy the agent started, while it is a draft.
// partial: the turn that last changed it stopped before its card.
function draftCopy(turns) {
  const at = turns.findLastIndex(turn => turn.copy && !turn.forkOf && turn.step > 0)
  if (at < 0) return null
  const name = turns[at].copy.name
  const own = turn => turn.copy?.name === name && !turn.forkOf
  const head = turns.findLastIndex(turn => own(turn) && turn.phase === 'done')
  if (head >= 0 && changeState(turns[head]) !== 'draft') return null
  return {copy:turns[at].copy, turn:turns[at], partial:head < at, keep:turns.some(turn => own(turn) && turn.kind === 'keep' && turn.phase === 'done')}
}
// A stopped edit cannot go on once the user did something with its copy (saved, replaced, discarded) meanwhile.
function copySettled(item) {
  if (!item?.copy || item.forkOf) return null
  const head = (item.history || []).findLast(turn => turn.copy?.name === item.copy.name && !turn.forkOf && turn.phase === 'done')
  const done = head && changeState(head)
  return done && done !== 'draft' ? done : null
}
function settledNote(done) {
  return `Копию вы уже ${{saved:'сохранили новой версией', replaced:'использовали для замены исходного', discarded:'отменили'}[done]} — этот ответ её не продолжит. Попросите новую правку.`
}
function noCopyReason(turns) {
  const last = turns.findLast(turn => turn.copy && turn.step > 0)
  if (!last) return {why:'none'}
  if (last.forkOf) return {why:'fork', name:last.copy.name, title:state.sessions.find(entry => entry.id === last.forkOf.session)?.title || last.forkOf.title}
  const head = turns.findLast(turn => turn.copy?.name === last.copy.name && !turn.forkOf && turn.phase === 'done')
  return {why:head ? changeState(head) : 'none', name:last.copy.name}
}
// «Изменить» drops the copy's last turns. What the user did with the copy — saved it, replaced the original, discarded
// it — happened in Loginom and stays; the copy's new last card takes that state over.
function carryCopyState(turns, from) {
  for (const name of new Set(turns.slice(from).filter(turn => turn.copy && !turn.forkOf).map(turn => turn.copy.name))) {
    const own = turn => turn.copy?.name === name && !turn.forkOf && turn.phase === 'done'
    const gone = turns.slice(from).findLast(own)
    const stays = turns.slice(0, from).findLast(own)
    if (gone && stays && changeState(gone) !== 'draft') stays.change = {...gone.change}
  }
}
function changeCard(turn) {
  const at = turn.index
  const item = currentItem()
  const local = turn.local
  const owner = turn.forkOf && state.sessions.find(entry => entry.id === turn.forkOf.session)
  if (turn.forkOf) return `<div class="answer-block change-block"><h2>Изменил копию «Продажи.lgp»</h2><p>${owner ? `Эта правка сделана в разговоре «${esc(owner.title)}»: копия «${esc(turn.copy.name)}» принадлежит ему — сохранить её, ${local ? 'скачать' : 'заменить исходный'} или отменить изменения можно там.`
      : `Эта правка сделана в разговоре «${esc(turn.forkOf.title)}», которого больше нет. Копия «${esc(turn.copy.name)}» осталась в «Копии агента», если её не удалили вместе с ним.`}</p>
    ${owner ? `<div class="change-actions"><button class="btn" data-session="${esc(owner.id)}">${icon('message',15)} Открыть разговор</button></div>` : ''}</div>`
  const head = item ? chainHead(item, at) : at
  const current = head === at ? changeState(turn) : 'continued'
  const saved = savedVersion(turn)
  // Rows show what is in the copy, the saved version or the replaced original.
  const keep = head === at && item ? cardKeep(item, at) : false
  const rows = changeRows(keep)
  // Another conversation already replaced the original with its copy: this one can only be saved as a new version.
  const elsewhere = current === 'draft' && !local && salesState().replaced
  const next = proposedVersionName(serverPackages.find(entry => entry.id === 'sales'))
  const counts = [['add','новый'],['mod','изменено'],['del','удалён']].map(([kind,label]) => [kind, rows.filter(([type]) => type === kind).length, label])
  const where = local ? 'Файл «Продажи.lgp» на компьютере не менялся' : '«Продажи.lgp» в Loginom не менялся'
  const status = {
    continued:`Правка продолжена ниже: следующий ответ изменил ту же копию «${esc(agentCopy(turn).name)}». Что с ней делать — в последней карточке.`,
    draft:elsewhere ? `Изменения — в копии «${esc(agentCopy(turn).name)}» в папке «Копии агента». Исходный «Продажи.lgp» уже заменён в другом разговоре — эти изменения можно сохранить новой версией рядом с ним.`
      : `${turn.kind === 'keep' ? 'Изменения этого и прошлых ответов' : 'Изменения'} — в копии «${esc(agentCopy(turn).name)}» в папке «Копии агента». ${where}: ${local ? 'скачайте изменённый пакет на компьютер или сохраните его в Loginom.' : 'сохраните изменения новой версией рядом с ним или замените исходный.'}`,
    saved:local ? `Сохранено в Loginom: «${esc(saved?.name || '')}» в ${esc(packageFolder('personal'))}. Файл на компьютере не менялся.` : `Сохранено новой версией «${esc(saved?.name || '')}» в ${esc(packageFolder('personal'))}. Исходный «Продажи.lgp» не изменён.`,
    replaced:'Исходный «Продажи.lgp» в Loginom заменён этими изменениями. Прежняя версия сохранена как «Продажи — до правки.lgp» — её можно вернуть.',
    discarded:`Изменения отменены: копия удалена из Loginom, ${local ? 'файл на компьютере' : '«Продажи.lgp»'} не менялся. Приложение хранит снимок копии в этом разговоре — изменения можно вернуть.`,
  }[current] + (turn.change?.downloaded && current !== 'discarded' ? ` Скачано на компьютер: «${esc(turn.change.downloaded)}».` : '')
  const view = `<button class="btn" data-change="view:${at}" title="Схема с отметками агента: что добавлено, изменено, удалено">${icon('flow',15)} Посмотреть на схеме</button>`
  const download = `<button class="btn${current === 'draft' ? ' primary' : ''}" data-change="download:${at}">${icon('download',15)} Скачать на компьютер…</button>`
  const actions = {
    continued:'',
    draft:local ? `${download}<button class="btn" data-change="save:${at}">${icon('plus',15)} Сохранить в Loginom</button>${view}${loginomButton(`copy:${state.session}:${at}`)}<button class="link-btn discard-link" data-change="discard:${at}">Отменить изменения</button>`
      : `<button class="btn primary" data-change="save:${at}">${icon('plus',15)} Сохранить новой версией</button>${view}${loginomButton(`copy:${state.session}:${at}`)}${elsewhere ? '' : `<button class="btn quiet" data-change="replace:${at}">Заменить исходный…</button>`}<button class="link-btn discard-link" data-change="discard:${at}">Отменить изменения</button>`,
    saved:`<button class="btn" data-change="open:${at}">${icon('folder',15)} Открыть «${esc(saved?.name || '')}»</button>${view}${loginomButton(saved?.id)}${local ? download : `<button class="btn quiet" data-change="replace:${at}">Заменить исходный…</button>`}<button class="link-btn discard-link" data-change="unsave:${at}">${local ? 'Удалить из Loginom' : 'Удалить новую версию'}</button>`,
    replaced:`<button class="btn" data-change="open:${at}">${icon('folder',15)} Открыть «Продажи.lgp»</button>${view}${loginomButton('sales')}<button class="link-btn discard-link" data-change="restore:${at}">Вернуть прежнюю версию</button>`,
    discarded:`<button class="link-btn" data-change="undiscard:${at}">Вернуть изменения</button>`,
  }[current]
  const title = current === 'discarded' ? 'Изменения отменены' : `Изменил копию «Продажи.lgp»${local ? ' с компьютера' : ''}${turn.kind === 'keep' ? ' ещё раз' : ''}`
  return `<div class="answer-block change-block"><h2>${title}</h2><p>${status}</p>
    ${current === 'discarded' ? '' : `<div class="change-card${['draft','continued'].includes(current) ? '' : ' is-' + current}">
      <div class="change-head">${icon('flow',17)}<strong>${esc(current === 'saved' ? saved.name : ['draft','continued'].includes(current) ? agentCopy(turn).name : 'Продажи.lgp')}</strong><span class="badge">${{draft:'копия агента', continued:'продолжено ниже', saved:local ? 'в Loginom' : 'новая версия', replaced:'заменён в Loginom'}[current]}</span><span class="change-counts">${counts.filter(([,count]) => count).map(([kind,count,label]) => `<b class="c-${kind}">${{add:'+',mod:'~',del:'−'}[kind]}${count} ${label}</b>`).join('')}</span></div>
      ${turn.kind === 'keep' ? `<p class="change-scope">Вся копия против исходного «Продажи.lgp»; этот ответ изменил одну строку — она отмечена.</p>` : ''}
      <ul class="change-list">${rows.map(([kind,name,what,node]) => `<li class="c-${kind}${turn.kind === 'keep' && node === keptCityFilter[1] ? ' is-latest' : ''}"><span class="mark" aria-label="${{add:'добавлен',mod:'изменён',del:'удалён'}[kind]}">${{add:'+',mod:'~',del:'−'}[kind]}</span><div><strong>${esc(name)}</strong>${turn.kind === 'keep' && node === keptCityFilter[1] ? ' <span class="badge latest">в этом ответе</span>' : ''} — ${esc(what)}<details class="change-facts" data-facts="${esc(state.session + ':' + at + ':' + node)}"${state.openFacts?.has(state.session + ':' + at + ':' + node) ? ' open' : ''}><summary>Настройки и связи</summary>${nodeFactsHtml(nodeFacts('sales-improve',node,keep),'diff')}</details></div></li>`).join('')}</ul>
      <p class="change-check">${icon('check',14)} Агент сверил копию с исходным запуском на данных: в результате 120 строк, как раньше; 12 строк без цены или региона в расчёт больше не попадают</p>
    </div>`}
    <div class="change-actions">${actions}</div>
    ${current === 'draft' ? `<p class="change-note">${local ? `В Loginom — как «${esc(next)}» в ${esc(packageFolder('personal'))}; на компьютер — куда выберете.` : `Новая версия появится рядом с исходным: ${esc(packageFolder('personal'))}/${esc(next)}`}</p>` : ''}
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
    {plan:2, icon:'download', ask:'permission', live:'Сохраняю пакет в Loginom', done:'Сохранил «ABC-анализ.lgp» в {home}', short:'сохранил «ABC-анализ.lgp»', detail:'Новый пакет; другие пакеты не изменены', time:3},
  ], permission:{title:'Сохранить новый пакет в Loginom?', text:'Агент создаст пакет «ABC-анализ.lgp» в вашей папке Loginom. Другие пакеты не изменятся.', args:[['Пакет','ABC-анализ.lgp'],['Папка','{home}'],['Изменится','появится новый пакет']], trace:'сохранить «ABC-анализ.lgp» в {home}', scope:'сохранять новые пакеты в {home}', denied:'Хорошо, сохранять не стал. Сценарий собран и проверен — он остался в этом разговоре. Скажите, если сохранить в другую папку.'}},
  quality:{plan:['Прочитать данные','Найти пропуски и дубликаты','Составить отчёт'], steps:[
    {plan:0, icon:'database', live:'Читаю таблицу «sales-demo.csv»', done:'Прочитал таблицу «sales-demo.csv»', short:'прочитал таблицу', detail:'2 400 строк, 6 столбцов', time:3},
    {plan:1, icon:'shield', live:'Ищу пропуски', done:'Нашёл 12 пропусков в 2 столбцах', short:'нашёл 12 пропусков', detail:'регион — 9, цена — 3', time:6},
    {plan:1, think:[4,'Дубликатом можно считать и полную копию строки, и повтор продажи с другой ценой. От этого зависит результат — лучше спросить.'], icon:'shield', ask:'question', live:'Ищу дубликаты', done:'Нашёл 3 дубликата', short:'нашёл 3 дубликата', detail:'Правило: {answer}', time:5},
    {plan:2, icon:'file', live:'Составляю отчёт', done:'Составил отчёт «Качество выгрузки.html»', short:'составил отчёт', detail:'{folder}', time:4},
  ], question:{text:'Какие строки считать дубликатами?', options:[['Полное совпадение строки','Все столбцы одинаковые'],['Совпадение товара и даты','Одна продажа записана дважды, например с разной ценой'],['Совпадение номера документа','Если в выгрузке есть номер документа']]}},
  clean:{plan:['Открыть пакет','Проверить узлы'], steps:[
    {plan:0, icon:'flow', live:'Открываю «{pkg}»', done:'Открыл «{pkg}» только для чтения', short:'открыл пакет', time:2},
    {plan:1, icon:'layers', live:'Проверяю узлы', done:'Проверил узлы «{pkg}»', short:'проверил узлы', time:9},
  ]},
  refactor:{plan:['Открыть пакет','Проверить узлы','Собрать замечания'], steps:[
    {plan:0, icon:'flow', live:'Открываю «Продажи.lgp»', done:'Открыл «Продажи.lgp» только для чтения', short:'открыл пакет', time:2},
    {plan:1, think:[6,'«Фильтр по дате» стоит отдельно в двух ветках — его можно поставить один раз до разветвления. «Узел14» по имени не понять. Перед расчётом нет проверки пустых значений.'], icon:'layers', live:'Проверяю узлы', done:'Проверил 6 узлов', short:'проверил 6 узлов', detail:'Повтор «Фильтра по дате», непонятное имя «Узел14», нет проверки пустых значений', time:14},
    {plan:2, icon:'file', live:'Собираю замечания', done:'Собрал {count} замечания', short:'собрал {count} замечания', time:3},
  ]},
  // Changes go to a working copy; the package in Loginom changes only when the user saves (iteration 4).
  improve:{plan:['Открыть копию','Внести изменения','Сверить результат'], steps:[
    {plan:0, icon:'flow', live:'Открываю копию «Продажи.lgp»', done:'Открыл копию «Продажи.lgp» для правки', short:'открыл копию пакета', detail:'Исходный пакет не меняется — вы решите, что делать с изменениями', time:2},
    {plan:1, icon:'layers', live:'Переношу «Фильтр по дате»', done:'Вынес «Фильтр по дате» до разветвления', short:'вынес фильтр', detail:'Раньше он стоял отдельно в каждой ветке', time:6, think:[4,'Фильтр одинаковый в обеих ветках: поставлю его один раз перед разветвлением, второй удалю.']},
    {plan:1, icon:'close', live:'Удаляю повтор фильтра', done:'Удалил повторный «Фильтр по дате»', short:'удалил повтор', detail:'Он дублировал первый', time:2},
    {plan:1, icon:'compose', live:'Переименовываю узел', done:'Переименовал «Узел14» → «Выручка по городам»', short:'переименовал узел', time:2},
    {plan:1, icon:'shield', live:'Добавляю проверку пустых значений', done:'Добавил узел «Проверка пустых значений»', short:'добавил проверку', detail:'Поставил между «Фильтр по дате» и расчётами: строки без цены или региона в расчёт не идут', time:7},
    {plan:2, icon:'check', live:'Сверяю результат с исходным пакетом', done:'Сверил результат с исходным пакетом', short:'сверил результат', detail:'В результате 120 строк, как в исходном; 12 строк без цены или региона в расчёт больше не попадают. Выгрузок в пакете нет — запуск ничего не записал', time:9},
  ]},
  // Iteration 8: a follow-up edit opens the copy the previous one made — the original is not touched again.
  keep:{plan:['Открыть копию','Вернуть узел','Сверить результат'], steps:[
    {plan:0, icon:'flow', live:'Открываю копию «{copy}»', done:'Открыл копию «{copy}» — ту же, что правил раньше', short:'открыл ту же копию', detail:'Исходный пакет не меняется; прошлые изменения в копии остаются', time:2},
    {plan:1, icon:'layers', live:'Возвращаю «Фильтр по дате (ветка «Города»)»', done:'Вернул «Фильтр по дате (ветка «Города»)» как в исходном', short:'вернул узел', detail:'На узел ссылается «Города — неделя.lgp». «Выручка по городам» по-прежнему получает данные от «Проверка пустых значений»', time:5, think:[3,'Узел нужен только для ссылки из «Города — неделя.lgp»: верну его с тем же условием и входом, а «Выручка по городам» пусть берёт данные после проверки.']},
    {plan:2, icon:'check', live:'Сверяю результат с исходным пакетом', done:'Сверил результат с исходным пакетом', short:'сверил результат', detail:'В результате 120 строк, как в исходном; выход «Фильтр по дате (ветка «Города»)» — те же строки, что раньше', time:8},
  ]},
  more:{steps:[]},
  nocopy:{steps:[]},
  document:{plan:['Прочитать пакет','Описать узлы','Собрать документ'], steps:[
    {plan:0, icon:'flow', live:'Читаю пакет', done:'Прочитал пакет «{pkg}»: 12 узлов, 3 подмодели', short:'прочитал пакет', time:3},
    {plan:1, icon:'book', live:'Ищу описания узлов в справке Loginom', done:'Нашёл в справке Loginom описания 9 типов узлов', short:'нашёл описания в справке', time:5},
    {plan:2, icon:'file', live:'Пишу документ', done:'Написал «{doc}»', short:'написал описание', detail:'{folder}', time:12},
  ]},
  // Iteration 6: trying a skill.
  skilltrial:{plan:['Прочитать навык','Открыть пакет','Сверить с навыком'], steps:[
    {plan:0, icon:'book', live:'Читаю навык «{skill}»', done:'Применил навык «{skill}»', short:'применил навык', detail:'Проба навыка в этом разговоре', time:2},
    {plan:1, icon:'flow', live:'Открываю «Продажи.lgp»', done:'Открыл «Продажи.lgp» только для чтения', short:'открыл пакет', time:2},
    {plan:2, icon:'check', live:'Сверяю узлы с правилами навыка', done:'Сверил узлы с правилами навыка: 3 расхождения', short:'сверил с навыком', time:5},
  ]},
  chat:{steps:[]},
}
// Rules the agent follows show in the check itself: instructions (the project's, then the general ones, В-65) are read in every chat,
// an enabled skill applies itself when the task fits «Когда агент его применяет». The prototype knows one set of rules.
function appliedRules(projectId) {
  const hasRules = text => /узл/i.test(text || '') && /назыв/i.test(text || '')
  const project = projectById(projectId)
  if (hasRules(project?.instructions)) return {step:`Учёл инструкции проекта «${project.name}»`, short:'учёл инструкции проекта', detail:'Агент читает их в каждом разговоре проекта', by:'по инструкциям проекта'}
  if (hasRules(state.settings.instructions)) return {step:'Учёл ваши инструкции для агента', short:'учёл ваши инструкции', detail:'«Настройки» → «Инструкции»: агент следует им во всех разговорах', by:'по вашим инструкциям'}
  const skill = state.own?.items.find(entry => entry.type === 'skill' && entry.status === 'on' && hasRules(entry.body))
  if (skill) return {step:`Применил навык «${skill.name}»`, short:`применил навык «${skill.name}»`, skill:skill.name, detail:'Навык включён — агент выбрал его сам по строке «Когда агент его применяет»', by:`по навыку «${skill.name}»`}
  return null
}
// A package from the computer: the first step uploads the agent's own copy, the rest is the same edit.
scripts.improveLocal = {...scripts.improve, steps:[
  {plan:0, icon:'upload', live:'Загружаю копию «{pkg}» с компьютера в Loginom', done:'Загрузил копию «{pkg}» с компьютера в «Копии агента»', short:'загрузил копию пакета', detail:'Файл на компьютере не меняется — вы решите, куда сохранить изменённый пакет', time:4},
  ...scripts.improve.steps.slice(1)]}
function scriptOf(turn) {
  return turn.kind === 'improve' && turn.local ? scripts.improveLocal : scripts[turn.kind] || scripts.chat
}
function followed(text, turn) {
  if (!turn.instruction) return text
  const how = ` — по вашему указанию: «${turn.instruction}»`
  return / в \/\S+$/.test(atHome(text)) ? atHome(text).replace(/ в \/\S+$/, how) : atHome(text) + how
}
// Script texts name the personal Loginom folder as {home}: it follows the user who connected.
function atHome(text) {
  return text.replaceAll('{home}', packageFolder('personal'))
}
function stepText(text, turn) {
  const pkg = (turn.files?.[0] || 'Продажи.lgp')
  return text.replaceAll('{folder}', chatFolder(state.sessions.find(item => item.id === state.session) || turn).label.replace(/^в/,'В')).replaceAll('{skill}', turn.trial?.name || '').replaceAll('{pkg}', pkg).replace('{doc}', pkg.replace(/\.lgp$/i,'') + ' — описание.md').replace('{answer}', turn.answer || '').replaceAll('{home}', packageFolder('personal')).replace('{count}', turn.rules ? 4 : 3).replaceAll('{copy}', turn.copy?.name || '')
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
    if (item.modelFailAt === item.step) return modelFailed(item)
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
// Iteration 8: the model stops the turn. OpenCode 2 retries a busy model by itself (429, overload, 5xx: up to 10 tries,
// about 1,5 min; no network: up to an hour) — the feed shows «повторю через N с». A spent limit, a wrong key or an
// unknown model is not retried: the turn fails. The demo's free model spends its daily limit.
function modelFailed(item) {
  const model = chatModel(item)
  const kind = model?.source === 'free' ? 'free-limit' : model?.kind === 'cloud' ? 'quota' : 'unreachable'
  item.modelError = {at:item.step, kind, model:model?.name || 'модель', where:model?.where || '', blocked:kind !== 'unreachable'}
  if (kind === 'free-limit') state.freeLimited = true
  item.modelFailAt = null
  item.phase = 'failed'
  render()
  if (state.session !== item.id || state.page !== 'chat') toast(`«${item.title}»: модель не ответила`, 'alert', item.id)
}
function modelErrorText(error) {
  return {
    'free-limit':['Закончился дневной лимит бесплатной модели', `Бесплатных сообщений модели «${error.model}» на сегодня больше нет; лимит обновится в 03:00.`],
    quota:['У модели закончился лимит', `Сервис «${error.where}» отказал: по вашему ключу закончились средства или лимит.`],
    unreachable:['Модель не отвечает', `«${error.model}» (${error.where}) не ответила: приложение повторяло запрос и не дождалось ответа.`],
  }[error.kind]
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
  Object.assign(item, {step:0, decisions:[], cleared:[], steer:[], answer:null, expanded:false, instruction:'', errors:[], failAt:state.failNext && !['chat','more','nocopy'].includes(item.kind) ? 1 : null,
    modelFailAt:state.failModel && !['chat','more','nocopy'].includes(item.kind) ? 1 : null, modelError:null})
  state.failNext = false
  state.failModel = false
  // The free model whose daily limit the demo spent stops any turn at once until the page is reloaded («обновится в 03:00»).
  if (state.freeLimited && chatModel(item)?.source === 'free') return modelFailed(item)
  if (['chat','more','nocopy'].includes(item.kind)) return writeAnswer(item, 'answer')
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
  if (turn.phase === 'failed' && turn.modelError && !turn.modelError.resolved) {
    const [title, reason] = modelErrorText(turn.modelError)
    const others = availableModels(state).filter(model => model.name !== turn.modelError.model && !(state.freeLimited && model.source === 'free'))
    return `<div class="answer-block failed" role="alert"><h2>${icon('alert',18)} Ход остановлен: ${esc(title.toLocaleLowerCase('ru'))}</h2><p>${esc(reason)} ${turn.modelError.at ? 'Сделанные шаги выше остались в разговоре: если продолжить, агент начнёт с того же места.' : 'Агент ещё ничего не успел сделать.'}</p>
      <p>${others.length ? 'Продолжить можно с другой моделью — она увидит весь разговор.' : state.policy === 'set' ? 'Другой модели нет: модели задаёт администратор вашей организации — обратитесь к нему.' : 'Другой модели в этом режиме сети нет: подключите её в «Модели» — облачный сервис по ключу или свою модель по адресу.'}${turn.modelError.kind === 'free-limit' ? ' Или дождитесь обновления лимита.' : turn.modelError.blocked ? '' : ' Или продолжите с этой же, когда она заработает.'}</p>
      ${live && copySettled(currentItem()) ? `<p class="muted">${esc(settledNote(copySettled(currentItem())))}</p>` : live ? `<div class="button-row">${others.length ? `<button class="btn primary" type="button" data-menu="model:continue" data-menu-up aria-haspopup="menu" aria-expanded="${state.menu?.kind === 'model' && state.menu.id === 'continue'}">${icon('play',15)} Продолжить с другой моделью ${icon('down',12)}</button>` : state.policy === 'set' ? '' : `<button class="btn primary" data-settings="models">${icon('cpu',15)} Подключить модель</button>`}${turn.modelError.blocked ? '' : `<button class="btn" data-action="continue-turn">${icon('refresh',15)} Продолжить с этой же</button>`}<button class="link-btn" data-action="copy-error">${icon('copy',14)} Скопировать текст ошибки</button></div>` : ''}</div>`
  }
  if (turn.phase === 'failed') return `<div class="answer-block failed" role="alert"><h2>${icon('alert',18)} Не удалось ${esc(scriptOf(turn).steps[turn.step].fail || 'выполнить шаг')}</h2><p>Loginom (${esc(hostOf(state.settings.connection.url))}) дважды не ответил за 30 секунд. Сделанные шаги выше сохранены.</p><p>Что сделать: проверьте, открывается ли Loginom в браузере. Если нет — он выключен или недоступна сеть, обратитесь к администратору. Когда Loginom заработает, нажмите «Повторить шаг».</p>${live ? `<div class="button-row"><button class="btn primary" data-action="retry-step">${icon('refresh',15)} Повторить шаг</button><button class="btn" data-overlay="loginom-status">Проверить подключение</button><button class="link-btn" data-action="copy-error">${icon('copy',14)} Скопировать текст ошибки</button></div>` : ''}</div>`
  if (turn.phase === 'writing') {
    const text = turn.writeText || '', title = turn.writeTitle || 0
    return `<div class="answer-block answer-stream">${title ? `<h2>${esc(text.slice(0, Math.min(turn.written, title)))}</h2>` : ''}<p>${esc(text.slice(title, Math.max(title, turn.written)))}<span class="stream-caret" aria-hidden="true"></span></p></div>`
  }
  if (turn.phase === 'stopped') return `<div class="answer-block"><p>${turn.step ? 'Остановлено по вашей команде. Сделанные шаги не отменяются — они перечислены выше.' : 'Остановлено по вашей команде до первого шага.'}</p>${live && copySettled(currentItem()) ? `<p class="muted">${esc(settledNote(copySettled(currentItem())))}</p>` : live ? `<button class="btn" data-action="resume">${icon('play',15)} Продолжить</button>` : ''}</div>`
  if (turn.phase === 'interrupted') return `<div class="answer-block"><p class="muted">${turn.step ? 'Не закончено — вы отправили новое сообщение. Сделанные шаги выше.' : 'Не начато — вы отправили новое сообщение.'}</p></div>`
  const steer = turn.steer?.length ? `<p class="steer-note">Учёл вашу поправку: «${esc(turn.steer.at(-1).text)}». <span class="muted">В прототипе цифры не меняются.</span></p>` : ''
  return steer + result(turn)
}
function turnSteps(turn, live, turnIndex) {
  const script = scriptOf(turn)
  const detailed = state.detail === 'full'
  const rows = []
  if (turn.rules && turn.step > 0) rows.push(`<li class="step done">${icon('book',15)}<span>${esc(turn.rules.step)}<small>${esc(turn.rules.detail)}</small></span></li>`)
  const errorRows = at => (turn.errors || []).filter(entry => entry.at === at).forEach(entry => rows.push(`<li class="step error">${icon('alert',15)}<span>Не удалось ${esc(script.steps[at].fail || 'выполнить шаг')}<small>Loginom не ответил за 30 с · попытка ${entry.attempt} из 2</small></span></li>`))
  script.steps.slice(0, turn.step).forEach((step, index) => {
    errorRows(index)
    for (const decision of (turn.decisions || []).filter(entry => entry.at === index && entry.choice === 'retry')) rows.push(`<li class="step-trace">${icon('refresh',14)}<span>Вы повторили шаг</span></li>`)
    if (turn.modelError?.at === index) rows.push(modelErrorRow(turn))
    for (const decision of (turn.decisions || []).filter(entry => entry.at === index && entry.choice === 'continue')) rows.push(`<li class="step-trace">${icon('play',14)}<span>Вы продолжили с моделью «${esc(decision.model)}»</span></li>`)
    for (const decision of (turn.decisions || []).filter(entry => entry.at === index && !['retry','continue'].includes(entry.choice))) rows.push(decision.choice === 'instead'
      ? `<li class="step-trace steer">${icon('message',14)}<span>Вы попросили иначе: «${esc(decision.text)}»</span></li>`
      : `<li class="step-trace">${icon('check',14)}<span>${{session:'Вы разрешили в этом разговоре', auto:'Разрешено ранее в этом разговоре', once:'Вы разрешили один раз'}[decision.choice]}: ${esc(followed(script.permission.trace, turn))}</span></li>`)
    if (step.ask === 'question') rows.push(`<li class="step-trace">${icon('help',14)}<span>${esc(script.question.text)} — <strong>${esc(turn.answer || '')}</strong></span></li>`)
    if (detailed && step.think) rows.push(`<li class="step think">${icon('spark',14)}<span>Думал ${step.think[0]} с<small>${esc(step.think[1])}</small></span></li>`)
    rows.push(`<li class="step done">${icon(step.icon,15)}<span>${esc(step.ask === 'permission' ? followed(stepText(step.done, turn), turn) : stepText(step.done, turn))}${step.detail && (detailed || turn.open?.includes(index)) ? `<small>${esc(stepText(step.detail, turn))}</small>` : ''}</span>${step.detail && !detailed ? `<button class="small-icon step-more" data-step-detail="${turnIndex}:${index}" aria-label="${turn.open?.includes(index) ? 'Скрыть' : 'Показать'} подробности шага" aria-expanded="${Boolean(turn.open?.includes(index))}">${icon('more',14)}</button>` : ''}</li>`)
    ;(turn.steer || []).filter(entry => entry.at === index + 1).forEach(entry => rows.push(`<li class="step-trace steer">${icon('message',14)}<span>Ваша поправка: «${esc(entry.text)}»</span></li>`))
  })
  const denied = turn.decisions?.find(entry => entry.choice === 'deny')
  if (denied) rows.push(`<li class="step-trace denied">${icon('close',14)}<span>Вы отклонили: ${esc(atHome(script.permission.trace))}</span></li>`)
  errorRows(turn.step)
  if (turn.modelError?.at === turn.step && turn.step < script.steps.length) rows.push(modelErrorRow(turn))
  for (const decision of (turn.decisions || []).filter(entry => entry.at === turn.step && entry.choice === 'continue' && turn.step < script.steps.length)) rows.push(`<li class="step-trace">${icon('play',14)}<span>Вы продолжили с моделью «${esc(decision.model)}»</span></li>`)
  ;(turn.steer || []).filter(entry => entry.at > turn.step).forEach(entry => rows.push(`<li class="step-trace steer">${icon('message',14)}<span>Ваша поправка: «${esc(entry.text)}» — ${turn.phase === 'running' ? 'учту после текущего шага' : turn.phase === 'retrying' ? 'учту после повтора шага' : 'учту, когда продолжите'}</span></li>`))
  if (live && turn.phase === 'retrying') rows.push(`<li class="step live" role="status"><span class="spinner"></span><span>Повторю через ${turn.retryIn} с…</span></li>`)
  if (live && turn.phase === 'running') rows.push(`<li class="step live" role="status"><span class="spinner"></span><span>${esc(stepText(script.steps[turn.step].live, turn))}…</span></li>`)
  if (live && ['permission','question'].includes(turn.phase)) rows.push(`<li class="step waiting">${icon('alert',15)}<span>${turn.phase === 'permission' ? 'Жду вашего разрешения — внизу' : 'Жду вашего ответа — внизу'}</span></li>`)
  return `<ol class="turn-steps">${rows.join('')}</ol>`
}
// The models that answered in a turn: the one it started with and any it was continued with.
function turnModels(turn) {
  return [...new Set([turn?.modelName, ...(turn?.decisions || []).filter(entry => entry.choice === 'continue').map(entry => entry.model)].filter(Boolean))]
}
function modelErrorRow(turn) {
  return `<li class="step error">${icon('alert',15)}<span>Модель «${esc(turn.modelError.model)}» не ответила<small>${esc(modelErrorText(turn.modelError)[0])} · ход остановлен</small></span></li>`
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
  const objects = [...(turn.rules ? [turn.rules.short] : []), ...script.steps.slice(0, turn.step).map(step => stepText(step.short, turn)), ...((turn.errors || []).some(entry => entry.at < turn.step) ? ['повторил шаг после сбоя Loginom'] : []), ...(turn.modelError?.resolved ? [(turn.decisions || []).some(entry => entry.choice === 'continue' && entry.model !== turn.modelError.model) ? 'продолжил с другой моделью после остановки' : 'продолжил после остановки модели'] : [])]
  const unresolved = (turn.errors || []).some(entry => entry.at >= turn.step) || Boolean(turn.modelError && !turn.modelError.resolved)
  const before = index ? turnModels([...(item.history || []), item][index - 1]).at(-1) : null
  const switched = before && turn.modelName && before !== turn.modelName
  const summary = (finished || turn.phase === 'writing') && hasSteps && brief && !turn.expanded && !unresolved
  return `<div class="turn">
    ${switched ? `<p class="feed-notice">${icon('cpu',14)} Дальше отвечает «${esc(turn.modelName)}» — ${{switched:'модель сменили в поле ввода', back:'модель разговора снова доступна в этом режиме сети'}[turn.modelNote] || `«${esc(turn.model)}» недоступна в этом режиме сети, отвечает модель по умолчанию`}</p>` : ''}
    <div class="user-turn"><div class="user-message">${esc(turn.prompt)}${turn.files?.length ? `<div class="message-files">${turn.files.map(file => `<span>${icon('file',14)}${esc(file)}</span>`).join('')}</div>` : ''}</div>
      <div class="msg-actions"><button class="msg-act" data-copy-prompt="${index}">${icon('copy',14)}<span>Копировать</span></button><button class="msg-act" data-edit-turn="${index}" ${live && !['done','answer','denied','stopped','interrupted','failed','connect'].includes(turn.phase) ? 'disabled' : ''}>${icon('compose',14)}<span>Изменить</span></button><button class="msg-act" data-fork-turn="${index}" ${live && !['done','answer','denied','stopped','interrupted','failed'].includes(turn.phase) ? 'disabled' : ''}>${icon('branch',14)}<span>Ответвить</span></button></div></div>
    <div class="agent-message"><span class="agent-avatar"><img src="assets/loginom.png" alt="" width="31" height="31"></span><div class="agent-body"><strong class="agent-caption">Loginom AI Agent</strong>
      ${turn.phase === 'connect' ? `<div class="answer-block"><h2>Для этой задачи нужен Loginom</h2><p>Я буду строить и проверять сценарий в Loginom. Подключитесь — и я продолжу.</p>${connectCard()}</div>` : ''}
      ${turn.phase === 'plan' ? `<div class="answer-block"><h2>План работы</h2><p>Проверьте шаги — и я начну.</p>${turnPlan(turn)}<button class="btn primary" data-action="run-plan">Выполнить ${icon('arrow',16)}</button></div>` : ''}
      ${live && ['running','retrying','permission','question'].includes(turn.phase) && script.plan ? turnPlan(turn) : ''}
      ${summary ? `<button class="turn-summary" data-expand-turn="${index}" aria-expanded="false">${icon('chevron',14)}<span>Работал ${turnTime(turn)} · ${esc(objects.join(', '))}</span></button>` : ''}
      ${hasSteps && !summary ? `${finished && brief && !unresolved ? `<button class="turn-summary open" data-expand-turn="${index}" aria-expanded="true">${icon('chevron',14)}<span>Работал ${turnTime(turn)}</span></button>` : finished && turn.step ? `<p class="turn-time">Работал ${turnTime(turn)}</p>` : ''}${turnSteps(turn, live, index)}` : ''}
      ${finished || turn.phase === 'writing' ? turnAnswer({...turn, id:item.id + '-' + index, index}, live) : ''}
      ${finished ? `<div class="msg-actions agent-actions"><button class="msg-act" data-copy-answer="${index}">${icon('copy',14)}<span>Копировать</span></button><span class="turn-meta">${esc([hasSteps && turn.step ? turnTime(turn) : '', turnModels(turn).join(' → ')].filter(Boolean).join(' · '))}</span></div>` : ''}
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
      <dl class="dock-args">${ask.args.map(([key,value]) => `<div><dt>${key}</dt><dd>${esc(item.instruction && key === 'Папка' ? 'по вашему указанию' : atHome(value))}</dd></div>`).join('')}${item.instruction ? `<div class="dock-instruction"><dt>Ваше указание</dt><dd>«${esc(item.instruction)}»</dd></div>` : ''}</dl>
      <div class="dock-actions"><button class="btn primary" data-permit="once">Разрешить один раз</button><button class="btn" data-permit="session" aria-describedby="dock-scope">Разрешать в этом разговоре</button><button class="btn" data-permit="deny">Отклонить</button></div>
      <p class="dock-scope" id="dock-scope">«В этом разговоре» — больше не спрашивать только об одном: ${esc(atHome(ask.scope))}.</p>
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
  if (state.contour === 'closed') {
    const text = state.policy === 'set' ? `Адрес задал администратор: ${esc(hostOf(c.url))}. Введите пользователя и пароль.`
      : state.policy === 'broken' ? 'Файл политики администратора с ошибкой, приложение работает без сети: подключиться можно только к Loginom на этом компьютере.'
      : 'В закрытом контуре публичный стенд недоступен. Укажите адрес Loginom вашей организации.'
    return `<div class="connect-card"><span class="glyph red">${icon('lock',19)}</span><div><strong>Подключиться к Loginom</strong>
    <p class="muted">${text}</p>
    <div class="button-row"><button class="btn primary" data-settings="loginom">${state.policy === 'set' ? 'Войти' : 'Указать адрес'}</button></div></div></div>`
  }
  const stand = hostOf(c.url) === 'app.loginom.ai'
  return `<div class="connect-card"><span class="glyph red">${icon('external',19)}</span><div>
    <strong>Подключиться к Loginom</strong>
    <dl><div><dt>Адрес</dt><dd>${esc(hostOf(c.url))}</dd></div><div><dt>Пользователь</dt><dd>${esc(c.username)}</dd></div></dl>
    <p class="muted">${stand ? 'Публичный стенд Loginom — чтобы попробовать, пароль не нужен. Для сервера вашей компании — «Свой сервер Loginom».' : c.empty || !c.hasPassword ? 'Пароль не нужен.' : 'Пароль сохранён.'}</p>
    <div class="button-row"><button class="btn primary" data-action="connect-loginom" ${state.connecting ? 'disabled' : ''}>${state.connecting ? '<span class="spinner"></span> Подключаюсь…' : stand ? 'Подключить публичный стенд' : 'Подключить'}</button><button class="btn${stand ? '' : ' quiet'}" data-settings="loginom">${stand ? 'Свой сервер Loginom' : 'Изменить'}</button></div>
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
function openPackage(item, focus = null) {
  state.activePackage = item
  state.focus = focus
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
    ${ownActionsGroup(state)}
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
// В-67: a node's facts as the product is to show them (see the comment on 'sales-improve'). «Продажи.lgp» (and its backup) is the «before» of the agent's
// copy, the replaced version is its «after»; other demo packages have no facts.
function nodeFacts(view, title, keep) {
  const node = viewNodes('sales-improve', keep).find(([, name, , , status, before]) =>
    view === 'sales' ? status !== 'add' && (before || name) === title : view === 'sales-v2' ? status !== 'del' && name === title : name === title)
  return ['sales','sales-v2','sales-improve'].includes(view) ? node?.[6] : undefined
}
function nodeFactsHtml(facts, mode) {
  if (!facts) return ''
  const [type, rows] = facts
  if (mode !== 'diff') return `<dl class="node-facts"><div><dt>Узел Loginom</dt><dd>${esc(type)}</dd></div>${rows.map(([label,before,after]) => label !== 'Имя' && (mode === 'before' ? before : after)
    ? `<div><dt>${esc(label)}</dt><dd>${esc(mode === 'before' ? before : after)}</dd></div>` : '').join('')}</dl>`
  return `<table class="facts-diff"><caption>Узел Loginom: ${esc(type)}</caption><thead><tr><th scope="col">Настройка или порт</th><th scope="col">Было</th><th scope="col">Стало</th></tr></thead>
    <tbody>${rows.map(([label,before,after]) => `<tr${before === after ? ' class="same"' : ''}><th scope="row">${esc(label)}</th>${before === after
      ? `<td colspan="2">${esc(before)} <span class="muted">· не менялось</span></td>` : `<td class="was" data-label="Было">${esc(before || '—')}</td><td class="now" data-label="Стало">${esc(after || '—')}</td>`}</tr>`).join('')}</tbody></table>`
}
// The working copy on the schema: added, changed and removed nodes marked; a selected node shows before → after.
function changedPackage(item) {
  // The page can outlive its card (browser Back after a follow-up edit): it shows the copy's last card.
  const chat = state.sessions.find(entry => entry.id === item.changeOf?.session)
  const at = chat ? chainHead(chat, item.changeOf.at) : item.changeOf?.at
  const turn = chat && [...(chat.history || []), chat][at]
  const nodes = viewNodes('sales-improve', chat ? cardKeep(chat, at) : item.keep)
  const showBefore = state.showBefore
  const shown = showBefore ? nodes.filter(node => node[4] !== 'add') : nodes
  const current = turn ? changeState(turn) : 'draft'
  const node = Number.isInteger(state.node) ? shown[state.node] : null
  const mark = {add:'Новый', mod:'Изменён', del:'Удалён'}
  const inLoginom = turn ? loginomButton({draft:`copy:${item.changeOf.session}:${at}`, saved:savedVersion(turn)?.id, replaced:'sales'}[current]) : ''
  const local = turn?.local
  const elsewhere = current === 'draft' && !local && salesState().replaced
  return `<div class="native-page packages-page">
    <div class="native-heading"><div><p class="eyebrow">Loginom · копия агента</p><h1>Изменения в «Продажи.lgp»${local ? ' с компьютера' : ''}</h1><p>${{draft:local ? 'Так будет выглядеть пакет с изменениями. Файл «Продажи.lgp» на компьютере не менялся.' : elsewhere ? 'Так будет выглядеть пакет с изменениями. Исходный «Продажи.lgp» уже заменён в другом разговоре — эти изменения можно сохранить новой версией.' : 'Так будет выглядеть пакет с изменениями. Исходный «Продажи.lgp» в Loginom пока не менялся.', saved:local ? 'Изменения сохранены в Loginom; файл на компьютере не менялся.' : 'Изменения сохранены новой версией рядом с исходным; «Продажи.lgp» не менялся.', replaced:'Исходный «Продажи.lgp» в Loginom уже заменён этими изменениями; прежняя версия — «Продажи — до правки.lgp».', discarded:'Изменения отменены; «Продажи.lgp» не менялся.'}[current]}</p></div></div>
    <section class="package-frame"><div class="package-top"><span class="glyph red">${icon('flow',21)}</span><div><strong tabindex="-1">Продажи.lgp</strong><small>${{draft:`Копия агента · ${esc(turn ? agentCopy(turn).folder + '/' + agentCopy(turn).name : '')}`, saved:'Копия · сохранена новой версией', replaced:'Заменил исходный в Loginom', discarded:'Изменения отменены'}[current]}</small></div>
      <div class="detail-toggle" role="group" aria-label="Что показать"><button data-show-before="0" aria-pressed="${!showBefore}">Изменения</button><button data-show-before="1" aria-pressed="${Boolean(showBefore)}">Как было</button></div></div>
    <div class="change-legend"><span class="c-add">+ новый</span><span class="c-mod">~ изменён</span><span class="c-del">− удалён</span></div>
    <div class="package-canvas diff-canvas" aria-label="Схема пакета с изменениями">${shown.map(([glyph,title,kind,detail,status,before],i) => `${i ? '<span class="canvas-connector"></span>':''}<button class="canvas-node ${state.node === i ? 'active':''} ${status && !showBefore ? 'is-' + status : ''}" data-node="${i}" aria-pressed="${state.node === i}">${status && !showBefore ? `<span class="node-mark">${mark[status]}</span>` : ''}<span class="glyph ${{database:'blue',chart:'red',file:'green',shield:'green',flow:'red'}[glyph] || 'violet'}">${icon(glyph,22)}</span><strong>${showBefore && before ? before : title}</strong><small>${kind}</small></button>`).join('')}</div>
    <div class="package-foot" role="status">${node ? (node[4] && !showBefore ? `<strong>${mark[node[4]]}: ${esc(node[1])}.</strong> ${esc(node[3])}${nodeFactsHtml(node[6],'diff')}`
      : esc(node[2] + (showBefore && node[4] === 'mod' ? ' — до изменений' : '')) + nodeFactsHtml(node[6], showBefore ? 'before' : 'after')) : 'Выберите узел, чтобы увидеть, что в нём изменилось.'}</div>
    <div class="package-save-bar">
      ${current === 'draft' ? (local ? `<button class="btn primary" data-change="download:${at}">${icon('download',15)} Скачать на компьютер…</button><button class="btn" data-change="save:${at}">${icon('plus',15)} Сохранить в Loginom</button>${inLoginom}<button class="link-btn discard-link" data-change="discard:${at}">Отменить изменения</button>`
        : `<button class="btn primary" data-change="save:${at}">${icon('plus',15)} Сохранить новой версией</button>${inLoginom}${elsewhere ? '' : `<button class="btn quiet" data-change="replace:${at}">Заменить исходный…</button>`}<button class="link-btn discard-link" data-change="discard:${at}">Отменить изменения</button>`) : inLoginom}
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
  const nodes = viewNodes(item.view, item.keep)
  const isCalculation = item.view === 'calculation'
  const dirty = hasPackageEdits(item)
  const canDownload = dirty || Boolean(item.savedVersion)
  const focus = state.focus?.pkg === item.id && state.focus.view === item.view ? state.focus : null
  const node = Number.isInteger(state.node) ? nodes[state.node] : null
  return `<div class="native-page packages-page">
    <div class="native-heading"><div><p class="eyebrow">Loginom</p><h1>Пакеты</h1><p>Откройте пакет, чтобы посмотреть схему, задокументировать, проверить или улучшить его.</p></div><div class="button-row"><button class="btn primary" data-action="package-server">${icon('folder',17)} Из Loginom</button><button class="btn" data-action="package-computer">${icon('upload',17)} С компьютера</button></div></div>
    <section class="package-frame"><div class="package-top"><span class="glyph red">${icon('flow',21)}</span><div><strong tabindex="-1">${esc(item.name)}</strong><small>${item.localFile ? 'Файл на компьютере · схема прочитана из файла, Loginom не нужен' : item.isDraft ? 'Рабочий черновик в разговоре' : `${esc(packagePath(item))} · ${item.id === 'sales' && salesState().replaced ? 'заменён в разговоре; прежняя версия — «Продажи — до правки.lgp»' : item.savedVersion ? 'новая версия' : item.isResult ? 'результат разговора' : item.localCopy ? 'копия с компьютера' : 'хранилище Loginom'}`}</small></div><span class="badge">Учебная схема</span>${item.isDraft || item.localFile ? '' : loginomButton(item.id)}</div>
    <div class="package-canvas${focus ? ' focus-canvas' : ''}" aria-label="Схема пакета">${nodes.map(([glyph,title,detail],i) => `${i ? '<span class="canvas-connector"></span>':''}<button class="canvas-node ${state.node === i ? 'active':''}${focus?.nodes.includes(i) ? ' is-focus' : ''}" data-node="${i}">${focus?.nodes.includes(i) ? '<span class="node-mark">Замечание</span>' : ''}<span class="glyph ${{database:'blue',chart:'red',file:'green',shield:'green',flow:'red'}[glyph] || 'violet'}">${icon(glyph,22)}</span><strong>${title}</strong><small>${detail}</small></button>`).join('')}</div>
    ${isCalculation && state.node === 1 ? calculationInspector(canDownload,item.id === editablePackage.id) : `<div class="package-foot">${focus ? `<p class="focus-note"><strong>Замечание агента:</strong> ${esc(focus.text)} <button class="link-btn" data-session="${focus.session}">${icon('message',15)} Вернуться к разговору</button></p>` : ''}${node ? `<strong>${esc(node[1])}.</strong> ${esc(node[3])}` + nodeFactsHtml(nodeFacts(item.view, node[1], item.keep), item.view === 'sales' ? 'before' : 'after') : focus ? '' : 'Выберите узел, чтобы увидеть сведения.'}</div>`}
    <div class="package-save-bar">
      ${isCalculation ? `<span class="package-save-status${dirty ? ' dirty' : ''}" role="status">${icon(dirty ? 'circle' : 'check',15)} ${dirty ? 'Есть несохранённые изменения' : item.savedVersion ? 'Сохранено в Loginom · демо' : 'Исходная версия'}</span>`
        : ''}
      ${isCalculation ? packageOutputButtons(dirty,canDownload) : ''}
      ${item.id === 'sales' && salesState().replaced ? `<button class="btn" data-action="restore-sales">${icon('refresh',15)} Вернуть прежнюю версию</button>` : ''}
      ${item.editSessionId ? `<button class="link-btn" data-session="${item.editSessionId}">${icon('message',16)} Вернуться к разговору</button>`
        : !item.savedVersion && !dirty && !item.localFile ? `<button class="btn package-chat-cta" data-action="ask-package-edit">${icon('message',16)} Изменить с агентом</button>` : ''}
    </div></section>
    ${item.isDraft || item.localFile ? '' : `<div class="section-bar package-section"><h2>Что сделать с пакетом</h2><button class="link-btn" data-action="catalog-actions">Ещё действия в каталоге ${icon('arrow',16)}</button></div>
    <div class="action-grid">${Object.entries(packageActions).filter(([id,action]) => !action.noPackage && (hubHasInstalled(state,action.solution) || state.pinnedActions.includes(id))).map(([id,action]) => actionTile(id,action)).join('')}</div>`}
  </div>`
}
// Owner review page for iteration 2: variants to compare, what to try, what changed.
// Owner review page: iteration 4 (a package in the conversation) — what to try, questions with a recommendation.
function review() {
  const look = [
    ['Правка ещё раз','Отправьте «Внеси улучшения в сценарий продаж», в карточке — «Заменить исходный…»: у «Города — неделя.lgp» — «Попросить агента оставить узел». Агент продолжит ту же копию: новая карточка показывает всю копию, прежняя — «продолжено ниже»; в окне замены обе ссылки теперь работают.',[['try-improve','Начать']]],
    ['Пакет с компьютера','Начнётся разговор с учебным файлом «Продажи.lgp» с компьютера — отправьте запрос. Агент загрузит свою копию в Loginom; в карточке — «Скачать на компьютер…» и «Сохранить в Loginom». «Заменить исходный» нет: исходный — файл на компьютере, агент его не трогает.',[['try-local-improve','Начать']]],
    ['Модель остановила ход','На втором шаге у бесплатной модели кончится дневной лимит. Блок говорит, что случилось и что сделано; «Продолжить с другой моделью» — модели этого режима сети, или «Подключить модель», если другой нет. Модель в поле ввода — теперь модель этого разговора: нажмите её, чтобы сменить.',[['try-model-failure','Начать']]],
    ['Копии при удалении','В разговоре, где агент правил пакет, «…» → «Удалить»: вместе с разговором можно удалить и его копии в Loginom (отмечено). «Изменить» у сообщения, после которого агент правил копию, — плашка скажет, что станет с копией.',[['try-improve','Начать']]],
    ['Консоль модерации','Только для прототипа: служебный экран Loginom. Одобрить, вернуть с замечанием, отозвать — статус сразу виден автору в «Моих».',[['own-moderation','Открыть']]],
    ['Сайт каталога','hub.loginom.ai для администратора: посмотреть, что внутри навыка, скачать один или архивом. Скачанный архив можно поставить в прототип: «Каталог» → «Импорт из файла».',[['open-hub-site','Открыть']]],
  ]
  // Open owner questions, each with a recommended variant; empty when everything is decided.
  const questions = []
  const changed = [
    'Итерация 8 — сбои и повторы. Модель остановила ход: блок с причиной простыми словами, «Продолжить с другой моделью» или «Подключить модель»; в ленте — «Модель не ответила» и «Вы продолжили с моделью…», у ответа — какие модели работали. Модель в поле ввода — модель этого разговора (как в OpenCode 2), выбор из моделей этого режима сети.',
    'Итерация 8: вторая правка продолжает ту же копию; из окна замены — «Попросить агента оставить узел». Пакет с компьютера: копия агента в «Копии агента», «Скачать на компьютер…» и «Сохранить в Loginom»; у замечаний проверки — схема самого файла, без Loginom. При удалении разговора или проекта — «Удалить и копии агента в Loginom»; «Изменить» говорит, что станет с копией; в ветке («Ответвить») карточки правки ведут в исходный разговор.',
    'По вашему замечанию (В-72): «Посмотреть в Loginom» — в карточке правки, на схеме изменений, в окне замены и на странице пакета. Копия, которую правит агент, лежит в Loginom в папке «Копии агента», её тоже можно открыть. Проверено на стенде: пока пакет открыт в Loginom, заменить его нельзя — окно замены об этом говорит; окно Loginom открывается минуту-две.',
    'Итерация 7 (В-67): у замечаний проверки — «Показать на схеме»; выбранный узел «Продажи.lgp» показывает тип, основные настройки и связи; в карточке правки — «Настройки и связи» до и после; перед заменой исходного — какие пакеты ссылаются на него и есть ли в копии их узлы.',
    'По оценке администраторами (задание 3): над полем ввода сказано, что данные уйдут в облачную модель, если к сообщению что-то приложено; при ошибке в политике — причина там же; полоса каталога и тексты запретов зависят от того, действует ли политика; на «открой сайт» при запрете агент отвечает, кто запретил; в закрытом контуре навык отдают только через «Передать администратору…».',
    'По оценке экспертами (задание 2): «Контекст» показывает план, файлы и шаги этого ответа и что агент учитывает; схема «Продажи» совпадает с проверкой; замена исходного относится к своей карточке; поиск находит разговор по файлу; «Подключить публичный стенд» и «Свой сервер Loginom».',
    'По первым оценкам агентами: «Улучшить» правит копию; папка Loginom — по логину; у документа полный путь и имя «… — описание.docx»; запуск очищает поле ввода; в проверке видно «Применил навык» или «Учёл инструкции проекта»; адрес сервера в уведомлении о подключении.',
    '«Создать своё» в каталоге: навык — из разговора, с нуля или из файла; своё действие на основе встроенного.',
    'Карточка навыка: «Сможет / Не сможет»; навык из файла помечен «Не проверен Loginom» и включается после согласия (В-41). Программы в навыке не принимаются (В-37).',
    'Перед сохранением и отправкой приложение находит пути, имена файлов, фамилии, почту и пароли — их можно убрать одной кнопкой.',
    '«Попробовать» — отдельный разговор с навыком; «Мои» в каталоге — черновики, включение, публикация, файл, удаление.',
    'Публикация (В-38, В-39): что получат другие с каждой отметкой, описание для каталога, почта; проверки; что уйдёт и что нет; квитанция и статусы. Выбора лицензии нет — одно правило для всех.',
    'Консоль модерации (только для прототипа) — очередь, автоматические проверки, текст, решения; старый экран «Создать навык» убран.',
  ]
  const later = [
    'Публикация, шаг 2 — сервис со входом по почте и историей версий; сейчас показан шаг 1.',
    'Отозванная версия у тех, кто её установил: в прототипе описано словами, без экрана.',
    'Журнал действий агента — в прототипе только строка в «Диагностике», без просмотра и выгрузки.',
    'Повтор при занятой модели («повторю через N с») и сжатие длинного разговора — описаны в спецификации, в прототипе не показаны.',
    'Свои навыки и действия живут до перезагрузки страницы.',
  ]
  const chosen = [
    'По итерации 8: <strong>правки подряд продолжают черновик копии агента</strong>; новая копия — после «Сохранить», «Заменить» или «Отменить изменения» (В-73). <strong>Родные страницы настроек OpenCode 2</strong> — «Проекты», «Рабочие пространства», «Экспериментальное», «Расширения» — в продукте спрятаны (В-74).',
    '<strong>«Посмотреть в Loginom»</strong> — там, где решается, что делать с пакетом: увидеть его в самом Loginom и решить по нему (В-72).',
    'По оценкам экспертами и администраторами: <strong>следующая итерация — глубина Loginom</strong>: замечание ведёт к узлу на схеме, в правке — настройки и порты «было / стало», перед заменой — узлы-ссылки из других пакетов (В-67). <strong>«Терминал»</strong> остаётся у пользователя в «Разрешениях» (В-68). <strong>«Разрешения»</strong> — только про то, что агент делает сам; ваши кнопки работают по правам учётной записи Loginom, а запрет администратора держит сервер продукта, в том числе в разговоре (В-69). <strong>Политика</strong> ограничивает источник того, что ставится; свои навыки не запрещает (В-70). <strong>Журнал действий агента</strong> — в этапе F, в «Диагностике» — строка о нём (В-71).',
    'По первым оценкам агентами: <strong>«Инструкции для агента» в «Настройках»</strong> — для всех разговоров, рядом с инструкциями проекта; навык — для приёмов под задачу (В-65). <strong>«Режим работы» теперь «Сеть»</strong> (В-66).',
    'Итерация 5 (настройки и закрытый контур): разрешения по умолчанию, терминал только «один раз», бесплатные модели OpenCode с пометкой, ошибка в файле политики — работа на этом компьютере (В-30…В-33).',
    'Проект — папка, которую приложение создаёт само; «Удалить проект» удаляет и папку (В-29).',
    'Итерация 4 (пакет в разговоре): сохранение новой версией, замена исходного — с подтверждением и копией; «Улучшить» ведёт в разговор (В-25…В-28).',
    'Итерации 2–3: оболочка, лента разговора (В-15…В-24).',
  ]
  const decided6 = [
    '<strong>Статус публикации</strong> — по квитанции; почта подтверждается один раз, ответ приходит и письмом (В-42).',
    '<strong>Перед «Проверено Loginom»</strong> — четыре пункта проверки; без всех — только «Сообщество» (В-43).',
    '<strong>Своё действие</strong> — пока на основе «Документировать» и «Проверить сценарий» (В-44).',
    '<strong>Навык из файла</strong> — как навык сообщества: работает и в Loginom после согласия (В-45). Опубликовать его можно, отметив «Я автор или автор разрешил».',
    '<strong>Названия в каталоге</strong> — Действие · Навык · Готовый сценарий · Подключение (В-48). <strong>Тексты для сообщества</strong> — «Сделал другой пользователь, Loginom это не проверял. Агент будет следовать указаниям навыка, в том числе в Loginom…»; отметка «Понимаю: Loginom это не проверял, а агент будет следовать указаниям навыка. Результат проверю сам» (В-49).',
    '<strong>Закрытый контур</strong> — администратор скачивает навыки на сайте каталога и передаёт файлом или архивом; сборщика в приложении нет (В-51). Навыки «Сообщество» пускает сам администратор (В-50).',
    '<strong>Разговоры без проекта</strong> — у каждого своя видимая папка «Документы → Loginom AI Agent → Без проекта → дата и название»; при переносе в проект файлы переезжают в подпапку проекта; при удалении папка остаётся, если не отметить «Удалить и папку разговора» (В-55…В-57).',
    '<strong>Сессия Loginom для окна выбора пакета</strong> — короткая, по требованию: вошли, прочитали папку, вышли; при исчерпанном лимите — «Сейчас заняты все сессии Loginom вашей организации» и «Недавние» или файл с компьютера (В-46).',
  ]
  const hubDecided = [
    '<strong>Навыки и работа в Loginom</strong> — работают все: свои, «Проверено Loginom» и «Сообщество»; навык сообщества — если вы установили его, согласившись, что Loginom его не проверял (В-36, В-41). <strong>Навык — только текст</strong> (В-37).',
    '<strong>Ключи подписи</strong> — корневых два, хватает одного, основной у вас; ключ «Проверено Loginom» — у проверяющего, не на сервере; раз в год ключи переподписываются (В-58).',
    '<strong>Что публикуют другие</strong> — Навык и Действие; Готовый сценарий и Подключение — только от Loginom (В-59).',
    '<strong>Файл каталога для закрытого контура</strong> действует 180 дней: потом установленное работает, а ставить и обновлять из него нельзя; за 30 дней — предупреждение (В-60).',
    '<strong>Каталог организации</strong> — свой подписанный, с отметкой «Организация», после публичного каталога (В-61).',
    '<strong>Навык из файла в закрытом контуре</strong> — как «Сообщество»: только если разрешил администратор (В-62).',
    '<strong>Отдельного сайта Hub нет</strong>: каталог — подписанные файлы, публикация — из приложения, сначала на проверку сотруднику (В-38); вход автора по почте (В-39); поддомен loginom.ai (В-40).',
  ]
  return `<div class="native-page review-page">
    <div class="native-heading"><div><p class="eyebrow">Прототип · итерация 8 — сбои и повторы</p><h1>Что решить</h1><p>Новое — что происходит, когда что-то идёт не по плану: модель остановила ход, правку нужно поправить, пакет пришёл с компьютера, разговор удаляют вместе с копиями агента. Около 5 минут. Открытых вопросов нет — решения ниже.</p></div></div>
    <h2 class="rv-heading">Посмотреть</h2>
    <div class="rv-grid">${look.map(([title,text,buttons],index) => `<article class="rv-card"><span class="rv-num">${'АБВГДЕЖ'[index]}</span><h3>${title}</h3><p>${text}</p><div class="button-row">${buttons.map(([target,label],i) => `<button class="btn${i ? ' quiet' : ''}" data-action="${target}">${label}${i ? '' : ' ' + icon('arrow',15)}</button>`).join('')}</div></article>`).join('')}</div>
    ${questions.length ? `<h2 class="rv-heading">Вопросы</h2><ul class="rv-questions">${questions.map(text => `<li>${text}</li>`).join('')}</ul>` : ''}
    <h2 class="rv-heading">Решено по итерации 6</h2>
    <ul class="rv-changes">${decided6.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Что изменилось</h2>
    <ul class="rv-changes">${changed.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Пока не показано</h2>
    <ul class="rv-changes">${later.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Решено по Hub</h2>
    <ul class="rv-changes">${hubDecided.map(text => `<li>${text}</li>`).join('')}</ul>
    <h2 class="rv-heading">Решено раньше</h2>
    <ul class="rv-changes">${chosen.map(text => `<li>${text}</li>`).join('')}</ul>
    <p class="rv-lead">Только для прототипа: демо-политика администратора из итерации 5 — <button class="link-btn" data-action="policy-set">включить</button> · <button class="link-btn" data-action="policy-clear">убрать</button>.</p>
  </div>`
}
function searchResults(query) {
  const q = query.trim().toLowerCase()
  const has = text => String(text || '').toLowerCase().includes(q)
  const projects = q ? state.projects.filter(item => has(item.name)) : []
  // A match in the title comes first, then in the project name, then in the request text; newest first within each.
  const rank = item => has(item.title) ? 0 : has(projectById(item.project)?.name) ? 1 : 2
  const chats = state.sessions.filter(item => !q || has(item.title) || has(item.prompt) || has(projectById(item.project)?.name) || [...(item.files || []), ...createdFiles(item)].some(has)).sort((a, b) => q ? rank(a) - rank(b) : 0).slice(0, q ? 20 : 8)
  if (!projects.length && !chats.length) return `<p class="search-empty">${q ? 'Ничего не нашлось. Поиск идёт по названиям проектов и разговоров, тексту запросов и именам файлов в разговорах.' : 'Разговоров пока нет.'}</p>`
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
    <p class="field-hint">Агент следует им во всех разговорах проекта — вместе с общими из «Настройки» → «Инструкции».</p>` : '<p class="field-hint">Инструкции и источники добавите на странице проекта.</p>'}
    <div class="button-row"><button class="btn primary">${project ? 'Сохранить' : 'Создать проект'}</button></div>
  </form>`
}
// В-57: deleting a chat keeps its folder unless the user ticks the box.
function deleteChatFiles() {
  const chat = state.sessions.find(item => item.id === state.deleteId)
  const files = chat ? chatFiles(chat).length : 0
  const folder = !files ? '' : projectById(chat.project) ? `<p class="dialog-desc">Файлы разговора (${files}) останутся в папке проекта.</p>`
    : `<label class="delete-folder"><input type="checkbox" id="delete-chat-folder"> Удалить и папку разговора (${files} ${filesWord(files)})</label><p class="dialog-desc muted">Иначе папка «${esc(chatFolder(chat).path)}» останется.</p>`
  return folder + copiesBox(chat ? liveCopies(chat) : [], 'delete-chat-copies')
}
// Iteration 8: the agent's copies a conversation still has in Loginom — one per copy, unless the user discarded it.
function liveCopies(chat) {
  const turns = [...(chat.history || []), chat]
  return [...new Set(turns.filter(turn => turn.copy && !turn.forkOf && turn.step > 0).map(turn => turn.copy.name))].filter(name => {
    const head = turns.findLast(turn => turn.copy?.name === name && !turn.forkOf && turn.phase === 'done')
    return !head || changeState(head) !== 'discarded'
  })
}
// Deleting a conversation offers to delete its copies too (ticked): they are the agent's drafts, nobody else's.
function copiesBox(copies, id) {
  if (!copies.length) return ''
  return `<label class="delete-folder"><input type="checkbox" id="${id}" checked> Удалить и копии агента в Loginom (${copies.length})</label>
    <p class="dialog-desc muted">${copies.map(name => '«' + esc(name) + '»').join(', ')} — в «${esc(packageFolder('personal'))}/Копии агента». Сохранённые новые версии и заменённый исходный останутся.${state.settings.connection.connected ? '' : ' Loginom сейчас не подключён — копии удалятся при следующем подключении.'}</p>`
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
    : menu.kind === 'model' ? modelMenu(menu)
    : [item('dest:', projectById(state.project) ? 'circle' : 'check', 'Без проекта'), ...state.projects.map(entry => `<button role="menuitem" data-menu-act="dest:${entry.id}"><span class="pc-${entry.color}">${icon(entry.id === state.project ? 'check' : 'folder',16)}</span><span>${esc(entry.name)}</span></button>`)]
  return `<div class="row-menu${menu.kind === 'model' ? ' model-menu' : ''}" id="row-menu" role="menu" aria-label="${menu.kind === 'model' ? 'Модель' : 'Действия'}">${items.join('')}</div>`
}
// The models this network mode allows, the conversation's one checked; after a stop — the one that failed is not offered.
function modelMenu(menu) {
  const failed = menu.id === 'continue' ? currentItem()?.modelError : null
  const current = currentModel()
  const rows = availableModels(state).map((model, index) => [model, index]).filter(([model]) => !(failed && (model.name === failed.model || (state.freeLimited && model.source === 'free'))))
  return [...rows.map(([model, index]) => {
    const limited = state.freeLimited && model.source === 'free'
    return `<button role="menuitemradio" aria-checked="${model.name === current && !failed}" data-menu-act="model:${index}">${icon(model.name === current && !failed ? 'check' : 'cpu',16)}<span>${esc(model.name)}<small>${limited ? 'лимит на сегодня исчерпан — обновится в 03:00' : esc(model.where) + (model.kind === 'cloud' ? ' — данные уйдут туда' : '')}</small></span></button>`
  }),
    `<button role="menuitem" data-menu-act="models-settings">${icon('settings',16)}<span>Настроить модели…</span></button>`]
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
    'replace-package': ['Заменить исходный пакет?', kind === 'replace-package' ? `<p class="dialog-desc">Пакет «Продажи.lgp» в ${esc(packageFolder('personal'))} будет перезаписан ${replaceSource().what}. Перед этим сохранится прежняя версия как «Продажи — до правки.lgp» — её можно будет вернуть.</p>${replaceRefs()}<p class="dialog-desc">Не проверено: пакеты в папках, к которым у вас нет доступа; подходит ли номер версии пакета к ссылкам — Loginom его сверяет; расписание запусков и кто сейчас открыл пакет — это знает только сервер Loginom. Если «Продажи.lgp» сейчас открыт в Loginom — у коллеги или у вас в окне Loginom, — заменить не получится, пока его не закроют: Loginom держит открытый пакет занятым. Запуски по расписанию после замены пойдут по изменённой версии.</p><div class="button-row"><button class="btn danger" data-action="confirm-replace-package">Заменить исходный</button>${loginomButton(replaceSource().target, replaceSource().label)}<button class="btn" data-action="dismiss">Отмена</button></div>` : ''],
    'loginom-window': ['Окно Loginom', kind === 'loginom-window' ? loginomWindow() : ''],
    'download-copy': ['Скачать на компьютер', kind === 'download-copy' ? downloadCopyDialog() : ''],
    'delete-chat': ['Удалить разговор?', kind === 'delete-chat' ? `<p class="dialog-desc">«${esc(state.sessions.find(item => item.id === state.deleteId)?.title)}» удалится насовсем.</p>${deleteChatFiles()}<div class="button-row"><button class="btn danger" data-action="confirm-delete-chat">Удалить</button><button class="btn" data-action="dismiss">Отмена</button></div>` : ''],
    'delete-project': ['Удалить проект?', kind === 'delete-project' ? `<p class="dialog-desc">Проект «${esc(projectById(state.deleteId)?.name)}» удалится насовсем вместе с разговорами (${state.sessions.filter(item => item.project === state.deleteId).length}) и папкой проекта: инструкциями, источниками и файлами, которые сделал агент.</p>${copiesBox(state.sessions.filter(item => item.project === state.deleteId).flatMap(liveCopies), 'delete-project-copies')}<div class="button-row"><button class="btn danger" data-action="confirm-delete-project">Удалить проект</button><button class="btn" data-action="dismiss">Отмена</button></div>` : ''],
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
    case 'runner': return renderSolutions(state)
    case 'studio': return renderCreate(state)
    case 'moderation': return renderModeration(state)
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
    state.focus = null
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
    state.focus = null
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
    // Render may scroll the feed (it follows the agent): take the opener where it is now.
    const rect = menuOpener(state.menu)?.getBoundingClientRect()
    const x = rect ? rect.left : state.menu.x
    const y = rect ? (state.menu.up ? rect.top - 4 : rect.bottom + 4) : state.menu.y
    menu.style.left = Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8)) + 'px'
    menu.style.top = Math.max(8, Math.min(state.menu.up ? y - menu.offsetHeight : y, innerHeight - menu.offsetHeight - 8)) + 'px'
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
  if (state.page === 'settings') bindSettings(app,state,api)
  if (state.page === 'runner') bindSolutions(app,state,api)
  bindOwn(app,state,api)
}
function dismiss() {
  if (state.overlay === 'loginom-window') {
    const opened = state.loginomView
    state.overlay = opened?.back || null
    state.loginomView = null
    render()
    // The same button can sit in the card behind the dialog it returns to; the dialog's one takes focus.
    const opener = `[data-loginom="${CSS.escape(opened?.target || '')}"]`
    return (document.querySelector('#app-dialog ' + opener) || document.querySelector(opener))?.focus()
  }
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
function currentModel(item = state.page === 'chat' ? currentItem() : null) {
  return chatModel(item)?.name || ''
}
// Iteration 8: the model belongs to the conversation, as in OpenCode 2 (`session.switchModel`, «for subsequent provider
// turns»); «Модель по умолчанию» is for new ones. A model this network mode does not allow falls back to the default.
function chatModel(item = state.page === 'chat' ? currentItem() : null) {
  const list = availableModels(state)
  const wanted = item ? item.model : state.page === 'chat' ? null : state.nextModel
  const model = list.find(entry => entry.name === wanted) || state.settings?.model
  if (!model?.name || (state.contour === 'closed' && model.kind === 'cloud')) return null
  return model
}
function chooseModel(index) {
  const model = availableModels(state)[index]
  if (!model) return
  const item = state.page === 'chat' ? currentItem() : null
  if (item) Object.assign(item, {model:model.name, modelSwitched:true})
  else state.nextModel = model.name
  toast(`${item ? 'В этом разговоре дальше отвечает' : 'Новый разговор начнёт'} «${model.name}»${model.kind === 'cloud' ? ` — данные разговора уйдут в «${model.where}»` : ''}`)
  render()
  $('#prompt')?.focus()
}
// After the model stopped a turn: switch the conversation's model and continue from the same step. In OpenCode 2 this is
// `session.switchModel` and a new prompt; the product's feed shows that prompt as this trace (prompt metadata).
function continueTurn(index) {
  const item = currentItem()
  const model = index === null ? chatModel(item) : availableModels(state)[index]
  if (!item || !item.modelError || !model) return
  if (copySettled(item)) return toast(settledNote(copySettled(item)), 'alert')
  item.model = model.name
  item.decisions.push({at:item.step, choice:'continue', model:model.name})
  item.modelError.resolved = true
  item.modelFailAt = null
  runSteps(item)
  $('#prompt')?.focus()
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
  // The reason is fixed when asked: a later change of the network or permissions does not rewrite old answers.
  const web = !withPackage && /(?:открой|открыть|зайди|прочитай|найди|поищи)[^.?!]{0,40}(?:сайт|интернет|https?:\/\/)/i.test(prompt)
    && (state.contour === 'closed' || state.settings.permissions.web === 'deny')
    && (state.contour !== 'closed' ? 'так стоит в «Настройки» → «Разрешения»' : state.policy === 'set' ? 'так решил администратор вашей организации' : state.policy === 'broken' ? 'файл политики администратора с ошибкой, приложение работает без сети' : 'включён закрытый контур')
  // Mock routing by task words; «что можно сделать лучше?» asks for a review, not a change («улучшения» is a change).
  let kind = web ? 'chat' : /документ|описан|опиши/i.test(prompt) && withPackage ? 'document'
    : /дубликат|пропуск|выгрузк/i.test(prompt) ? 'quality' : /провер|оптимиз|(?<![а-яё])лучше/i.test(prompt) ? 'refactor'
    : /внеси|улучш|объедин|исправ|переимен|измени|доработ|поправ/i.test(prompt) ? 'improve'
    : /abc|сценари|loginom|пакет|узл|данн|таблиц|lgp/i.test(prompt) || withPackage ? 'abc'
    // A follow-up without a task word continues the previous task («Собери такой же для регионов»); a question is answered.
    // An edit or an answer about the copy is not repeated by «Спасибо».
    : old && !['chat','improve','keep','more','nocopy'].includes(old.kind) && !/\?\s*$/.test(prompt) ? old.kind : 'chat'
  // A package from the computer: the agent uploads its own copy to Loginom; the file itself never changes.
  const local = state.draftPackage ? state.draftPackage.source === 'local' : Boolean(old?.local)
  if (['refactor','improve'].includes(kind) && !improvable(state.draftPackage?.name || (old ? old.files?.[0] : ''), local)) kind = 'clean'
  // Iteration 8: while the last copy is a draft, a follow-up edit goes on in it (mock: keeping the city filter);
  // another «improve» has nothing left from the check.
  const editAt = old && state.editTurn?.session === old.id ? state.editTurn.index : null
  const earlier = old ? [...(old.history || []), turnSnapshot(old)] : []
  const kept = editAt === null ? earlier : earlier.slice(0, editAt)
  if (editAt !== null) carryCopyState(earlier, editAt)
  const draft = !web && !state.draftPackage ? draftCopy(kept) : null
  // A request, not a question that names the node.
  const keepAsk = /не удаля|оставь|оставить|верни|вернуть/i.test(prompt) && /фильтр|узел|узл/i.test(prompt) && !/\?\s*$/.test(prompt)
  if (draft && keepAsk && !draft.partial) kind = 'keep'
  else if (draft && kind === 'improve' && !draft.partial) kind = 'more'
  // Asked to keep the node with no copy to change: the copy was saved, replaced, discarded, belongs to another chat or
  // was left half-done by a stopped edit.
  else if (keepAsk && !state.draftPackage && (!draft || draft.partial)) kind = 'nocopy'
  // The trial applies to the trial task; another request is answered as usual.
  const trialTurn = state.trialSkill && !old && prompt === state.trialSkill.prompt
  if (trialTurn) kind = state.trialSkill.kind
  // Questions need no Loginom; documenting a file from the computer neither. The rest asks to connect.
  // Iteration 8: checking a file from the computer reads it where it is, like documenting.
  const needsLoginom = !['chat','more','nocopy'].includes(kind) && !(['document','refactor','clean'].includes(kind) && local)
  const phase = needsLoginom && !state.settings.connection.connected ? 'connect' : 'starting'
  if (old) {
    clearTimeout(old.timer)
    clearInterval(old.writer)
  }
  // «Изменить» on a message: the turns from it on are replaced by the new request.
  const next = {
    id: old?.id ?? 'session-' + Date.now(), date:'Сейчас', title:old?.title || state.templateTitle || (prompt.length > 56 ? prompt.slice(0,57).replace(/\s+\S*$/,'') + '…' : prompt),
    kind, phase,
    files:[...(state.draftPackage ? [state.draftPackage.name] : []), ...state.draftFiles], prompt,
    project:old ? old.project : state.page === 'project' ? state.projectView : projectById(state.project) ? state.project : null,
    history:kept, allowed:[...(old?.allowed || [])],
    step:0, decisions:[], cleared:[], steer:[], web, local,
    // The conversation keeps the model it started with (OpenCode 2: the session's model), not the current default.
    model:old ? old.model || old.modelName : state.nextModel || currentModel(null),
  }
  next.modelName = currentModel(next)
  // Why the model differs from the previous turn's, if it does: switched in the input, not allowed in this network
  // mode (the default answers), or allowed again.
  next.modelNote = old?.modelSwitched ? 'switched' : next.modelName === next.model ? 'back' : 'fallback'
  if (!old) state.nextModel = null
  state.editTurn = null
  if (trialTurn) next.trial = state.trialSkill
  if (!trialTurn && kind === 'refactor') next.rules = appliedRules(next.project)
  // В-73: a stopped edit left a partial copy — the next edit finishes it in the same copy.
  if (kind === 'improve') next.copy = draft?.partial ? draft.copy : newAgentCopy()
  if (kind === 'keep') next.copy = draft.copy
  if (['keep','more'].includes(kind)) Object.assign(next, {files:draft.turn.files, local:draft.turn.local, about:draft.copy.name, aboutKeep:draft.keep})
  if (kind === 'nocopy') next.nocopy = draft?.partial ? {why:'partial', name:draft.copy.name} : noCopyReason(kept)
  if (!old) state.trialSkill = null
  // Examples stop showing once the user has started three conversations of their own.
  if (!old && !state.templateTitle) state.progress.ownChats++
  if (state.draftPackage && !trialTurn) state.progress.packages = true
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
  // A card the edit went on from has no buttons; the schema and dialogs opened from it act on the copy's last turn.
  const head = chainHead(item, Number(at))
  const turn = turns[head]
  const keep = cardKeep(item, head)
  if (!turn || turn.forkOf) return
  turn.change = turn.change || {}
  if (act === 'view') return openPackage({id:'draft-' + item.id + '-' + head, name:'Продажи.lgp', scope:'personal', folder:'', view:'sales-improve', keep, isDraft:true, project:item.project, changeOf:{session:item.id, at:head}})
  if (act === 'download') {
    state.downloadTurn = {session:item.id, at:head}
    state.overlay = 'download-copy'
    return render()
  }
  if (act === 'open') return openPackage(changeState(turn) === 'saved' ? savedVersion(turn) : serverPackages.find(entry => entry.id === 'sales'))
  if (act === 'replace') {
    if (salesState().replaced) return toast('Исходный пакет уже заменён')
    state.replaceTurn = {session:item.id, at:head}
    state.overlay = 'replace-package'
    return render()
  }
  if (act === 'save') {
    // Saved from the schema: show what was saved, not «Как было».
    state.showBefore = false
    const name = proposedVersionName(serverPackages.find(entry => entry.id === 'sales'))
    const saved = {id:'version-' + Date.now(), name, scope:'personal', folder:'', modified:new Date().toISOString().slice(0,10), size:'1,2 МБ', view:'sales-v2', keep, savedVersion:true, editSessionId:item.id}
    state.importedPackages.push(saved)
    turn.change = {savedId:saved.id, downloaded:turn.change.downloaded}
    toast(`Сохранено: «${name}» в ${packageFolder('personal')}`)
  }
  if (act === 'unsave') {
    state.importedPackages = state.importedPackages.filter(entry => entry.id !== turn.change.savedId)
    turn.change = {downloaded:turn.change.downloaded}
    toast('Новая версия удалена из Loginom — изменения снова в копии')
  }
  if (act === 'discard') turn.change = {discarded:true}
  if (act === 'undiscard') turn.change = {}
  if (act === 'restore') restoreSales()
  render()
  // From the keyboard, focus stays in the card (or the schema's bar) instead of falling to the page.
  if (keyboard) (document.querySelector(`.turn [data-change$=":${head}"]`) || document.querySelector('.package-save-bar button'))?.focus()
}
function restoreSales() {
  const original = serverPackages.find(entry => entry.id === 'sales')
  original.view = 'sales'
  original.keep = false
  original.modified = '2026-11-16'
  state.importedPackages = state.importedPackages.filter(entry => entry.id !== 'sales-backup')
  state.sessions.flatMap(entry => [...(entry.history || []), entry]).forEach(turn => { if (turn.change) delete turn.change.replaced })
  toast('Вернул прежнюю версию «Продажи.lgp»')
}
// В-67: before a replace — which packages in the folders the user can read refer to «Продажи.lgp», and what the copy
// does to the node each one takes results from. Mechanism: References.xml and reference nodes of those packages, read
// through Loginom file access; how a reference node stores its target (name or id) is to be checked on real packages.
function replaceRefs() {
  if (!state.settings.connection.connected) return '<p class="dialog-desc">Ссылки из других пакетов не проверены: Loginom не подключён.</p>'
  // Iteration 8: the follow-up edit that kept the city filter turns the broken link into a working one.
  const chat = state.replaceTurn && state.sessions.find(item => item.id === state.replaceTurn.session)
  const turn = chat && turnAt(chat.id, state.replaceTurn.at)
  const saved = turn && changeState(turn) === 'saved' && savedVersion(turn)
  const keep = saved ? Boolean(saved.keep) : chat ? chainKeep(chat, state.replaceTurn.at) : false
  return `<div class="replace-refs"><strong>Ссылки из других пакетов</strong><p>Среди 14 пакетов в папках Loginom, которые вам доступны, на «Продажи.lgp» ссылаются два:</p><ul>
    <li>${icon('flow',15)}<span><b>«Отчёт директору.lgp»</b> · ${esc(packageFolder('shared'))} — узел-ссылка на узел «Выручка по регионам». Этот узел и его выход в копии есть. Цифры изменятся: строки без цены или региона в расчёт больше не попадают.</span></li>
    ${keep ? `<li>${icon('flow',15)}<span><b>«Города — неделя.lgp»</b> · ${esc(packageFolder('personal'))} — узел-ссылка на узел «Фильтр по дате (ветка «Города»)». Этот узел в копии оставлен: условие и вход те же, данные для ссылки не изменятся.</span></li>`
      : `<li class="bad">${icon('alert',15)}<span><b>«Города — неделя.lgp»</b> · ${esc(packageFolder('personal'))} — узел-ссылка на узел «Фильтр по дате (ветка «Города»)». В копии этого узла нет — ссылаться будет не на что.</span></li>`}</ul>
    ${keep ? '' : saved ? '<p>Если «Города — неделя.lgp» нужен, не заменяйте исходный: новая версия уже сохранена рядом с ним, исходный останется как есть.</p>'
      : `<p>Если «Города — неделя.lgp» нужен, попросите агента оставить этот узел или сохраните изменения новой версией: исходный останется как есть.</p><div class="button-row"><button class="btn" data-action="ask-keep">${icon('message',15)} Попросить агента оставить узел</button></div>`}</div>`
}
// В-72: the agent's copy is a package in Loginom («Копии агента»), so it can be looked at in Loginom itself, like any
// other. In the product the button opens a separate Loginom window (not the conversation's agent browser, which is
// signed out after the answer), signs in with this connection and opens the package by its path; while open, the
// window takes one Loginom session. Editing a copy instead of the original needs a change to the agent's skill (ux-spec,
// iteration 7). The prototype shows the package's nodes instead. Checked on the stand (Loginom 7.4.2, 19.11.2026): a package
// open in another session opens read-only («Сохранить» disabled, «Сохранить как…» works); overwriting a package open
// elsewhere fails («Этот файл уже используется другим процессом»); the window must close the package before signing out.
// Each improvement turn has its own copy, named when the turn starts; the number never repeats.
function newAgentCopy() {
  state.copyCount = (state.copyCount || 0) + 1
  return {name:'Продажи — правка агента' + (state.copyCount > 1 ? ' ' + state.copyCount : '') + '.lgp', folder:packageFolder('personal') + '/Копии агента'}
}
function agentCopy(turn, keep = false) {
  return {...(turn?.copy || {name:'Продажи — правка агента.lgp', folder:packageFolder('personal') + '/Копии агента'}), view:'sales-v2', keep, copy:true}
}
function turnAt(session, at) {
  const item = state.sessions.find(entry => entry.id === session)
  return item && [...(item.history || []), item][at]
}
// What «Заменить исходный» writes over the original: the saved new version, or the agent's copy.
function replaceSource() {
  const turn = state.replaceTurn && turnAt(state.replaceTurn.session, state.replaceTurn.at)
  const saved = turn && changeState(turn) === 'saved' && savedVersion(turn)
  if (saved) return {target:saved.id, what:`новой версией «${esc(saved.name)}»`, label:'Посмотреть новую версию в Loginom'}
  return {target:state.replaceTurn ? `copy:${state.replaceTurn.session}:${state.replaceTurn.at}` : '', what:`копией агента «${esc(agentCopy(turn).name)}»`, label:'Посмотреть копию в Loginom'}
}
function loginomButton(target, label = 'Посмотреть в Loginom') {
  return target && state.settings.connection.connected && !state.loginomDown ? `<button class="btn" data-loginom="${esc(target)}" title="Открыть пакет в самом Loginom, без отметок агента">${icon('external',15)} ${label}</button>` : ''
}
function viewInLoginom(target) {
  const [kind, session, at] = target.split(':')
  // A package outside the lists (a conversation's result) opens from its own page; a deleted one is gone.
  const chat = state.sessions.find(item => item.id === session)
  const entry = kind === 'copy' ? chat && agentCopy(turnAt(session, Number(at)), chainKeep(chat, Number(at))) : packageEntries().find(item => item.id === target) || (state.activePackage?.isResult && state.activePackage.id === target ? state.activePackage : null)
  if (!entry) return toast('Этого пакета в Loginom уже нет', 'alert')
  state.loginomView = {target, name:entry.name, path:entry.copy ? entry.folder : packagePath(entry), view:entry.view, keep:Boolean(entry.keep), copy:Boolean(entry.copy), back:state.overlay === 'replace-package' ? 'replace-package' : null}
  state.overlay = 'loginom-window'
  render()
}
// Iteration 8: a package from the computer is never written by the agent; the user saves the result where they want.
// Mechanism: the app downloads the copy from Loginom's file storage — to be made for .lgp (today only data files are
// downloaded, `executor.mjs`), then the system save dialog (Electron `dialog.showSaveDialog`).
function downloadName() {
  const turn = state.downloadTurn && turnAt(state.downloadTurn.session, state.downloadTurn.at)
  const saved = turn && changeState(turn) === 'saved' && savedVersion(turn)
  return saved ? saved.name : 'Продажи — v2.lgp'
}
function downloadCopyDialog() {
  const turn = state.downloadTurn && turnAt(state.downloadTurn.session, state.downloadTurn.at)
  return `<p class="dialog-desc">Откроется окно сохранения вашей системы: папка, где лежит «Продажи.lgp», имя «${esc(downloadName())}». Чтобы заменить сам файл на компьютере, выберите «Продажи.lgp» — система спросит, заменить ли его.</p>
    <p class="dialog-desc muted">Приложение скачает из Loginom копию «${esc(turn?.copy?.name || '')}» — то, что показывает карточка. Прототип: файл не сохраняется.</p>
    <div class="button-row package-picker-actions"><button class="btn quiet" data-action="dismiss">Отмена</button><button class="btn primary" data-action="confirm-download-copy">${icon('download',15)} Сохранить</button></div>`
}
function loginomWindow() {
  const view = state.loginomView
  return `<p class="dialog-desc">Здесь откроется окно Loginom с этим пакетом — таким, какой он сейчас в Loginom, без отметок агента. В нём можно открыть узлы, посмотреть данные и запустить пакет. Открывается не сразу: вход в Loginom и открытие пакета могут занять минуту-две. Пока окно открыто, оно занимает одну сессию Loginom.</p>
    <div class="loginom-window"><div class="lw-bar">${icon('flow',15)}<code>${esc(view.path + '/' + view.name)}</code></div>
      <ol class="lw-nodes">${viewNodes(view.view, view.keep).map(([glyph,title,kind]) => `<li><span class="glyph ${{database:'blue',chart:'red',file:'green',shield:'green',flow:'red'}[glyph] || 'violet'}">${icon(glyph,16)}</span><span><strong>${esc(title)}</strong><small>${esc(nodeFacts(view.view, title, view.keep)?.[0] || kind)}</small></span></li>`).join('')}</ol>
      <p class="lw-note">Прототип: вместо Loginom — список узлов пакета.</p></div>
    <p class="dialog-desc">${view.copy ? 'Копию можно поменять и здесь. Если вы её сохраните, приложение это заметит: «было / стало» пересчитается, а сверка агента будет помечена как устаревшая. Пока окно открыто, копия занята им: агент сможет сохранить её только новой версией.' : 'Пока пакет открыт здесь, он занят этим окном: заменить его из разговора не получится, пока окно не закрыто.'}</p>
    <div class="button-row"><button class="btn primary" data-action="dismiss">${view.back ? 'Вернуться к замене' : 'Закрыть'}</button></div>`
}
// Replacing the original is a separate, explicit step: the agent keeps a backup first.
function replacePackage() {
  const item = state.sessions.find(entry => entry.id === state.replaceTurn?.session)
  if (!item || salesState().replaced) return dismiss()
  const original = serverPackages.find(entry => entry.id === 'sales')
  state.importedPackages.push({...original, id:'sales-backup', name:'Продажи — до правки.lgp', view:'sales'})
  const turn = [...(item.history || []), item][state.replaceTurn.at]
  const saved = changeState(turn) === 'saved' && savedVersion(turn)
  turn.change = {...turn.change, replaced:true}
  original.view = 'sales-v2'
  original.keep = saved ? Boolean(saved.keep) : chainKeep(item, state.replaceTurn.at)
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
  // Iteration 8: a copy the agent made stays with this conversation; the fork shows its cards with a link here.
  const owned = turn => turn.copy && !turn.forkOf ? {...turn, forkOf:{session:item.id, title:item.title}} : turn
  const fork = {...owned(turnSnapshot(base)), id:'session-' + Date.now(), date:'Сейчас', title:'Ветка: ' + item.title, project:item.project, model:item.model,
    history:turns.slice(0, index).map(turn => owned(turn === item ? turnSnapshot(item) : structuredClone(turn))), allowed:[]}
  state.sessions = [fork, ...state.sessions]
  openSession(fork.id)
  toast('Создан новый разговор с историей до этого места')
}
function turnSnapshot(item) {
  // A copy, not shared references: a fork's decisions must not show up in the original.
  return structuredClone({instruction:item.instruction, prompt:item.prompt, files:item.files, kind:item.kind, phase:item.phase === 'writing' ? item.writeFinal : ['running','retrying','permission','question','plan','connect','starting'].includes(item.phase) ? 'interrupted' : item.phase,
    step:item.step, decisions:item.decisions || [], answer:item.answer, steer:item.steer || [], cleared:item.cleared || [], allowed:item.allowed || [], errors:item.errors || [], change:item.change, copy:item.copy, rules:item.rules, web:item.web, local:item.local, about:item.about, aboutKeep:item.aboutKeep, nocopy:item.nocopy, modelNote:item.modelNote, forkOf:item.forkOf, model:item.model, modelName:item.modelName, modelError:item.modelError})
}
function connectLoginom() {
  if (state.connecting) return
  state.connecting = true
  render()
  setTimeout(() => {
    state.connecting = false
    ensureSettings(state).connection.connected = true
    toast('Loginom подключён: ' + hostOf(state.settings.connection.url))
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
    document:'Узел,Что делает\nCSV продаж,Загружает продажи\nФильтр по дате (ветка «Регионы»),Оставляет продажи за период\nВыручка по регионам,Считает выручку по регионам\nФильтр по дате (ветка «Города»),Оставляет продажи за период\nУзел14,Считает выручку по городам\nРезультат,Выгружает таблицу\n',
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
  'stage-new':() => { write('stage','new'); write('collapsed',false); write('contour','online'); write('policy',''); location.hash = ''; location.reload() },
  // Demo of the administrator's machine policy: it is set outside the app, so the switch lives on «Что решить».
  'own-chat':() => demoOwn(state, api, 'chat'),
  'own-trial':() => demoOwn(state, api, 'trial'),
  'own-file':() => demoOwn(state, api, 'file'),
  'own-mine':() => demoOwn(state, api, 'mine'),
  'own-moderation':() => demoOwn(state, api, 'moderation'),
  'own-action':() => demoOwn(state, api, 'action'),
  'open-hub-site':() => { location.href = 'hub-site/' },
  'policy-set':() => applyDemoPolicy('set', 'contour'),
  'policy-broken':() => applyDemoPolicy('broken', 'contour'),
  'policy-clear':() => applyDemoPolicy('', 'contour'),
  'try-own-loginom':() => applyDemoPolicy('', 'loginom'),
  'try-closed':() => { applyDemoPolicy('', null); settingsTab('contour') },
  'try-own-model':() => applyDemoPolicy('', 'models'),
  'try-permissions':() => applyDemoPolicy('', 'permissions'),
  'try-diagnostics':() => applyDemoPolicy('', 'diagnostics'),
  'try-run':() => tryPrompt('Построй ABC-анализ товаров по выручке'),
  'try-check':() => tryPrompt('Проверь сценарий продаж'),
  'try-improve':() => tryPrompt('Внеси улучшения в сценарий продаж'),
  'try-local-improve':() => {
    tryPrompt('Внеси улучшения в этот пакет')
    chooseDraftPackage({name:'Продажи.lgp', where:'Учебный файл · на компьютере', source:'local'})
  },
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
  resume:() => copySettled(currentItem()) ? toast(settledNote(copySettled(currentItem())), 'alert') : runSteps(currentItem()),
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
  'copy-error':() => currentItem()?.modelError && !currentItem().modelError.resolved ? copyText(`Loginom AI Agent: модель «${currentItem().modelError.model}» не ответила — ${modelErrorText(currentItem().modelError).join('. ')}`) : copyText(`Loginom AI Agent: не удалось ${scriptOf(currentItem()).steps[currentItem().step].fail || 'выполнить шаг'}. Loginom не ответил за 30 с (${hostOf(state.settings.connection.url)}), 2 попытки.`),
  'continue-turn':() => continueTurn(null),
  'try-model-failure':() => {
    state.failModel = true
    tryPrompt('Построй ABC-анализ товаров по выручке')
  },
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
  'open-chat-folder':() => {
    const item = state.sessions.find(entry => entry.id === state.session)
    if (item) toast('Откроется папка: ' + chatFolder(item).path)
  },
  'edit-package-example':() => {
    state.activePackage = editablePackage
    state.focus = null
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
    const node = Number.isInteger(state.node) ? viewNodes(source.view, source.keep)[state.node]?.[1] : null
    chooseDraftPackage({name:source.name, where:packagePath(source), source:'loginom', item:source})
    state.draft = node ? `Проверь узел «${node}» и покажи, что можно улучшить` : 'Проверь сценарий и покажи, что можно улучшить'
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
    startFromSession(state, session)
    navigate('studio')
  },
  'confirm-replace-package':replacePackage,
  'restore-sales':() => {
    restoreSales()
    render()
  },
  // From the replace dialog: back to the conversation with the request in the input, so the user sees what goes.
  'confirm-download-copy':() => {
    const turn = state.downloadTurn && turnAt(state.downloadTurn.session, state.downloadTurn.at)
    if (!turn) return dismiss()
    const name = downloadName()
    turn.change = {...turn.change, downloaded:name}
    state.overlay = null
    toast(`Сохранено на компьютер: «${name}»`)
    render()
    ;(document.querySelector(`.turn [data-change="download:${state.downloadTurn.at}"]`) || document.querySelector('.package-save-bar [data-change^="download:"]'))?.focus()
  },
  'fill-keep':() => {
    state.draft = keepPrompt
    render()
    $('#prompt')?.focus()
  },
  'ask-keep':() => {
    const session = state.replaceTurn?.session
    state.overlay = null
    if (session && (state.page !== 'chat' || state.session !== session)) openSession(session)
    state.draft = keepPrompt
    render()
    $('#prompt')?.focus()
  },
  'improve-from-check':() => {
    state.draft = 'Внеси эти улучшения'
    send()
  },
  'confirm-delete-chat':() => {
    const id = state.deleteId
    const project = sessionProjectOf(id)
    const withFolder = Boolean($('#delete-chat-folder')?.checked)
    const copies = $('#delete-chat-copies') ? ($('#delete-chat-copies').checked ? ', копии агента — тоже' : '; копии агента остались в Loginom') : ''
    state.sessions = state.sessions.filter(item => item.id !== id)
    state.overlay = null
    toast((withFolder ? 'Разговор и его папка удалены' : 'Разговор удалён') + copies)
    if (state.page === 'chat' && state.session === id) return projectById(project) ? openProject(project) : newSession()
    render()
  },
  'confirm-delete-project':() => {
    // As in ChatGPT, a project's chats go with it (owner's decision).
    const id = state.deleteId
    const gone = state.sessions.filter(item => item.project === id).map(item => item.id)
    const copies = $('#delete-project-copies') ? ($('#delete-project-copies').checked ? ', копии агента — тоже' : '; копии агента остались в Loginom') : ''
    const leave = (state.page === 'chat' && gone.includes(state.session)) || (state.page === 'project' && state.projectView === id)
    state.projects = state.projects.filter(item => item.id !== id)
    state.sessions = state.sessions.filter(item => item.project !== id)
    state.expanded = state.expanded.filter(item => item !== id)
    if (state.project === id) state.project = null
    state.overlay = null
    toast('Проект и его разговоры удалены' + copies)
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
  if (act.startsWith('model:')) return menu.id === 'continue' ? continueTurn(Number(act.slice(6))) : chooseModel(Number(act.slice(6)))
  if (act === 'models-settings') return settingsTab('models')
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
    const files = chatFiles(chat).length
    chat.project = null
    chat.movedIn = false
    if (state.session === chat.id) state.project = null
    toast(files ? 'Разговор убран из проекта; его файлы остались в папке проекта' : 'Разговор убран из проекта')
  }
  if (act.startsWith('move:')) {
    const files = chat.project ? 0 : chatFiles(chat).length
    chat.project = act.slice(5)
    chat.movedIn = true
    expandProject(chat.project)
    if (state.session === chat.id) state.project = chat.project
    toast(files ? `Перенесён в «${projectById(chat.project).name}» вместе с файлами (${files})` : `Перенесён в «${projectById(chat.project).name}»`)
  }
  if (act === 'new-project-move') {
    state.moveAfterCreate = chat.id
    state.overlay = 'new-project'
  }
  render()
  if (menu.keyboard && !state.overlay) menuOpener(menu)?.focus()
}
// «Настройки и связи» in the change card stays open across redraws (В-67); «toggle» does not bubble, so capture it.
app.addEventListener('toggle', event => {
  const key = event.target.dataset?.facts
  if (!key) return
  state.openFacts ??= new Set()
  if (event.target.open) state.openFacts.add(key)
  else state.openFacts.delete(key)
}, true)
app.addEventListener('click', event => {
  const opener = event.target.closest('[data-menu]')
  if (opener) {
    const [kind, id = ''] = opener.dataset.menu.split(':')
    const rect = opener.getBoundingClientRect()
    const where = opener.closest('.sidebar') ? 'panel' : opener.closest('.project-list') ? 'list' : 'page'
    const same = state.menu?.kind === kind && state.menu.id === id && state.menu.where === where
    const up = opener.hasAttribute('data-menu-up')
    state.menu = same ? null : {kind, id, where, up, x:rect.left, y:up ? rect.top - 4 : rect.bottom + 4, keyboard:!event.detail}
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
  if (d.loginom) return viewInLoginom(d.loginom)
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
  if (d.finding != null) return showFinding(Number(d.finding.split(':')[0]), d.finding.endsWith(':local'))
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
