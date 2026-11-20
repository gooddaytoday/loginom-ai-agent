import { byId, tierBadge } from './catalog.js';
import { icon } from './icons.js';

const titles = {
  document: ['Документировать пакет', 'Агент опишет назначение сценария, его узлы и потоки данных. Пакет не меняется.'],
  'refactor:review': ['Проверить сценарий', 'Агент найдёт повторяющиеся преобразования, неясные названия и лишние узлы. Пакет не меняется.'],
  'refactor:copy': ['Улучшить сценарий', 'Агент предложит правки и соберёт улучшенную копию. Исходный пакет остаётся как был.'],
  regression: ['Проверить на эталоне', 'Агент запустит копию сценария на тестовых данных и сравнит результат с утверждённым эталоном.'],
  tournament: ['Сравнить варианты', 'Агент сверит результаты двух версий сценария и замерит, какая работает быстрее.'],
  migration: ['Перенести SQL в Loginom', 'Агент соберёт сценарий по SQL-запросу и сверит результат на тестовой выборке.'],
};
const steps = [['params','Параметры'],['access','Доступ'],['running','Выполнение'],['result','Результат']];
const outcomes = [
  ['success','Готово'],['inconclusive','Не подтверждено'],['recovery','Нужна проверка'],['failed','Не удалось'],
];
// The personal folder follows the Loginom user and holds the same packages as «Открыть из Loginom».
let homeFolder = '/user';
// Run 3 of the agent review: the wizard and the conversation tell the same about «Продажи.lgp» (6 nodes, 3 findings)
// and follow the same rules from «Инструкции» (the conversation's mock reads them the same way, app.js appliedRules).
let rulesFollowed = false;
const nodeCount = name => name === 'Продажи.lgp' ? 6 : 14;
function demoPackages() {
  return [
    {name:'Продажи.lgp', where:'Loginom · ' + homeFolder, source:'loginom'},
    {name:'Качество данных.lgp', where:'Loginom · ' + homeFolder, source:'loginom'},
    {name:'Сводка продаж.lgp', where:'Loginom · /Общие/Аналитика', source:'loginom'},
    {name:'Мой сценарий.lgp', where:'На компьютере · Документы', source:'local'},
  ];
}
const sqlExample = 'SELECT city, SUM(amount) AS revenue\nFROM sales\nWHERE amount IS NOT NULL\nGROUP BY city;';

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
}

function getState(state) {
  homeFolder = '/' + (state.settings?.connection?.username || 'analyst');
  const rules = (state.settings?.instructions || '') + ' ' + (state.projects?.find(project => project.id === state.project)?.instructions || '');
  rulesFollowed = /узл/i.test(rules) && /назыв/i.test(rules);
  state.solutions ??= {};
  state.solutions.runs ??= {};
  return state.solutions;
}

function runKey(state) {
  const id = byId(state.solution)?.runner ? state.solution : 'document';
  return id === 'refactor' ? 'refactor:' + (state.solutionMode === 'copy' ? 'copy' : 'review') : id;
}

function packageChoices(run) {
  const bound = run.boundPackage;
  const examples = demoPackages();
  // The chosen package wins over an example with the same name: «Продажи.lgp» from the computer is not the server's one.
  return bound ? [bound, ...examples.filter(item => item.name !== bound.name)] : examples;
}

function select(name, label, choices, selected, hint = '') {
  return `<label class="sl-field"><span>${label}</span><select name="${name}">${choices.map(choice => {
    const [value,text] = Array.isArray(choice) ? choice : [choice,choice];
    return `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(text)}</option>`;
  }).join('')}</select>${hint ? `<small>${hint}</small>` : ''}</label>`;
}

// Compact segmented choice: one row of options, the hint of the selected one below.
function radios(name, label, choices, selected) {
  const hint = choices.find(([value]) => value === selected)?.[2] ?? '';
  return `<fieldset class="sl-seg"><legend>${label}</legend><div class="sl-seg-row">${choices.map(([value,text]) =>
    `<label><input type="radio" name="${name}" value="${value}" ${value === selected ? 'checked' : ''}><span>${text}</span></label>`).join('')}</div>${hint ? `<small>${hint}</small>` : ''}</fieldset>`;
}

function checks(name, label, choices, selected) {
  const hint = choices.filter(([value]) => selected.includes(value)).map(([,text,why]) => `${text} — ${why.toLowerCase()}`).join('; ');
  return `<fieldset class="sl-seg sl-multi"><legend>${label}</legend><div class="sl-seg-row">${choices.map(([value,text]) =>
    `<label><input type="checkbox" name="${name}" value="${value}" ${selected.includes(value) ? 'checked' : ''}><span>${selected.includes(value) ? '✓ ' : ''}${text}</span></label>`).join('')}</div><small>${hint || 'Отметьте один или несколько форматов'}</small></fieldset>`;
}

function note(text, tone = '') {
  return `<div class="sl-note ${tone ? `sl-note-${tone}` : ''}" role="status">${text}</div>`;
}

function packageField(run, name = 'package', label = 'Пакет Loginom') {
  return select(name, label, packageChoices(run).map(item => [item.name, `${item.name} — ${item.where}`]), run.values[name]);
}

function renderFields(key, run) {
  const values = run.values;
  const data = select('data', 'Тестовые данные', ['sales_sample.csv','sales_edge_cases.csv'], values.data);
  if (key === 'document') return packageField(run) +
    checks('formats','Формат документа',docFormats,values.formats) +
    radios('depth','Содержание',[['short','Кратко','Назначение и основные шаги'],['full','Подробно','Каждый узел и поток данных'],['custom','Своё','Агент напишет документ по вашему описанию']],values.depth) +
    (values.depth === 'custom' ? `<label class="sl-field"><span>Какая документация нужна</span><textarea name="custom" rows="4" required placeholder="Например: инструкция для бизнес-пользователя — что подать на вход, как запустить, как читать результат; без технических деталей узлов">${escape(values.custom)}</textarea><small>Агент учтёт описание вместо стандартной структуры документа.</small></label>` : '');
  if (key.startsWith('refactor')) return packageField(run) +
    select('goal','На что обратить внимание',['Понятность структуры','Повторяющиеся преобразования','Названия и организация'],values.goal) +
    (key === 'refactor:copy' ? `<label class="sl-field"><span>Имя улучшенной копии</span><input name="target" value="${escape(values.target)}" required pattern=".+\\.lgp"><small>Копия появится рядом с исходным пакетом.</small></label>` : '');
  if (key === 'regression') return packageField(run) + data +
    select('baseline','Эталон результата',[['sales_expected.csv','sales_expected.csv · утверждён 10.11'],['missing','Эталона пока нет']],values.baseline) +
    (values.baseline === 'missing' ? note(run.baselineDraft ? '<strong>Черновик эталона создан.</strong> Сравнение станет доступно, когда вы его утвердите.' : '<strong>Для сравнения нужен утверждённый эталон.</strong> Агент может подготовить черновик по текущему результату — вы проверите и утвердите его.', 'warn') : '') +
    `<label class="sl-field"><span>Допустимое отклонение чисел</span><input type="number" name="tolerance" min="0" step="any" required value="${escape(values.tolerance)}"></label>`;
  if (key === 'migration') return `<label class="sl-field"><span>SQL-запрос</span><textarea class="sl-code" name="sql" required rows="5" spellcheck="false">${escape(values.sql)}</textarea><small>В демонстрации поддержаны SELECT, WHERE и GROUP BY.</small></label>${data}
    <label class="sl-field"><span>Имя нового пакета</span><input name="target" value="${escape(values.target)}" required pattern=".+\\.lgp"></label>`;
  return packageField(run,'package','Первый вариант') + packageField(run,'second','Второй вариант') + data +
    select('repeats','Сколько раз замерить время',['5','10'],values.repeats);
}

function chosenPackage(run, name = 'package') {
  return packageChoices(run).find(item => item.name === run.values[name]) || demoPackages()[0];
}

// What the run is allowed to do, in the words of the real profiles:
// package-docs — local .lgp, built-in Loginom Help, write in the project folder; no Loginom, browser, shell or web;
// loginom-automation — works in Loginom through the browser under the user's account, gated per action by the runner.
// `pre` is what the application itself does before the agent starts; `data` is what goes to the model.
function accessFor(key, run, project) {
  const pkg = chosenPackage(run);
  const name = pkg.name;
  const folder = `папке «${runFolder(key, project)}»`;
  const report = `отчёт в ${folder}`;
  const runsScenario = 'При запуске сценария выполняются и его выгрузки — например, в файл или базу данных. Если это нежелательно, используйте копию сценария без выгрузок.';
  const noWeb = 'Открывать сайты в интернете';
  if (key === 'document') return {
    pre: pkg.source === 'loginom' ? [`Скачает «${name}» из вашей папки Loginom в ${folder.replace(/^папке/, 'папку')}: документирование работает только с файлом на компьютере`] : [],
    can: [`Прочитать файл «${name}»`, 'Пользоваться встроенной справкой Loginom', `Создать ${docNames(run).length > 1 ? 'документы' : 'документ'} ${docNames(run).map(file => `«${file}»`).join(', ')} в ${pkg.source === 'loginom' ? 'той же папке' : folder}`],
    cannot: ['Изменить пакет — он только читается', 'Подключаться к Loginom и открывать браузер', 'Запускать программы на компьютере', noWeb],
    data: run.values.depth === 'custom' ? 'структура пакета, настройки узлов и ваше описание документации' : 'структура пакета и настройки узлов',
  };
  if (key === 'refactor:review') return pkg.source === 'local' ? {
    pre: [],
    can: [`Прочитать файл «${name}» на этом компьютере`, 'Читать настройки узлов', `Создать ${report}`],
    cannot: ['Менять файл и загружать его в Loginom', 'Подключаться к Loginom и открывать браузер', 'Запускать сценарий', noWeb],
    data: 'настройки узлов',
  } : {
    pre: [],
    can: [`Открыть «${name}» в Loginom под вашей учётной записью`, 'Читать настройки узлов', `Создать ${report}`],
    cannot: ['Менять узлы и сохранять пакеты', 'Запускать сценарий', noWeb],
    data: 'настройки узлов',
  };
  if (key === 'refactor:copy') return {
    pre: [],
    can: [`Открыть «${name}» в Loginom под вашей учётной записью`, 'Менять узлы в открытом пакете и запускать их для проверки', `Сохранить результат новым пакетом «${run.values.target}» рядом с исходным`],
    cannot: [`Сохранить изменения поверх «${name}»`, 'Удалять пакеты', noWeb],
    warn: runsScenario,
    data: 'настройки узлов и первые строки данных на выходах узлов',
  };
  if (key === 'regression') return {
    pre: [],
    can: [`Открыть «${name}» в Loginom под вашей учётной записью`, `Запустить сценарий на данных ${run.values.data}`, `Прочитать эталон ${run.values.baseline}`, `Создать ${report}`],
    cannot: ['Менять и сохранять пакет', 'Менять эталон', noWeb],
    warn: runsScenario,
    data: 'итоговые цифры сравнения (не все строки данных)',
  };
  if (key === 'tournament') return {
    pre: [],
    can: [`Открыть «${name}» и «${run.values.second}» в Loginom под вашей учётной записью`, `Запустить каждый сценарий ${run.values.repeats} раз на данных ${run.values.data}`, `Создать ${report}`],
    cannot: ['Менять и сохранять пакеты', noWeb],
    warn: runsScenario,
    data: 'итоговые цифры сравнения и время выполнения',
  };
  return {
    pre: [],
    can: [`Создать новый пакет «${run.values.target}» в вашей папке Loginom под вашей учётной записью`, `Запустить его на данных ${run.values.data}`, `Создать ${report}`],
    cannot: ['Подключаться к вашей базе данных — SQL-запрос только читается', 'Менять другие пакеты', noWeb],
    data: 'текст SQL-запроса и первые строки результата',
  };
}

const docFormats = [['pdf','PDF','Для чтения и печати'],['docx','Word','Можно редактировать'],['md','Markdown','Для базы знаний']];
// One document per chosen format, in the order of the list.
function docNames(run) {
  const base = chosenPackage(run).name.replace(/\.lgp$/,'');
  return docFormats.filter(([value]) => run.values.formats.includes(value)).map(([value]) => `${base} — описание.${value}`);
}
// В-55: a run is a conversation, so its files go to that conversation's folder, as in chat.
function runFolder(key, project) {
  return 'Документы → Loginom AI Agent → ' + (project || 'Без проекта → ' + new Date().toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit'}) + ' ' + titles[key][0]);
}

// No fallback: without a model the run does not start, as a message does not send (В-10).
function modelLine(state) {
  const model = state.settings?.model;
  if (!model) return [];
  const where = {local:'работает на этом компьютере', intranet:'работает во внутренней сети', cloud:`облачный сервис ${model.source === 'free' ? 'OpenCode' : model.where} — данные уйдут в интернет`}[model.kind] || '';
  return [model.name, where, model.kind === 'cloud'];
}

// Only actions that save something in Loginom can end with an uncertain effect that needs a state check.
function changesSomething(key) {
  return key === 'refactor:copy' || key === 'migration';
}

function stepper(current) {
  const index = steps.findIndex(([id]) => id === current);
  return `<ol class="sl-stepper" aria-label="Шаги запуска">${steps.map(([id,label],i) =>
    `<li class="${i < index ? 'is-done' : i === index ? 'is-current' : ''}"${i === index ? ' aria-current="step"' : ''}><span>${i < index ? '✓' : i+1}</span>${label}</li>`).join('')}</ol>`;
}

function logFor(key, run) {
  const pkg = chosenPackage(run);
  const lines = {
    document: [`Прочитан файл «${pkg.name}»: ${nodeCount(pkg.name)} узлов${pkg.name === 'Продажи.lgp' ? '' : ', 3 подмодели'}`, 'Справка Loginom: найдены описания 9 типов узлов', run.values.depth === 'custom' ? 'Написан черновик по вашему описанию' : 'Написан черновик документа', `Созданы файлы: ${docNames(run).join(', ')}`],
    'refactor:review': [pkg.source === 'local' ? `Прочитан файл «${pkg.name}» на компьютере` : `Открыта копия «${pkg.name}» только для чтения`, `Прочитаны настройки ${nodeCount(pkg.name)} узлов${run.values.rules ? ', учтены ваши инструкции' : ''}`, `Найдено ${reportData(key, run.values, pkg).rows.length} улучшения`, 'Отчёт сохранён в папку проекта'],
    'refactor:copy': [`Открыта копия «${pkg.name}»`, 'Объединены фильтры в узлах 04 и 08', 'Переименован узел 14', `Копия сохранена как «${run.values.target}»`],
    regression: ['Подготовлена тестовая копия', `Запуск на ${run.values.data}: 245 строк`, 'Сравнение с эталоном: 3 проверки', 'Отчёт сохранён'],
    tournament: ['Подготовлены копии двух вариантов', 'Результаты совпали по значениям и типам', `Выполнено ${run.values.repeats} замеров`, 'Отчёт сохранён'],
    migration: ['Разобран SQL-запрос', `Собран пакет «${run.values.target}»: 3 узла`, 'Сверка на выборке: совпадает', 'Отчёт сохранён'],
  }[key];
  return lines.slice(0, run.stage + (run.step === 'result' ? 1 : 0));
}

function reportData(key, values, pkg = {}) {
  if (key === 'document') return {
    summary: values.depth === 'custom' ? `Документ составлен по вашему описанию: «${values.custom.trim().slice(0,120)}${values.custom.trim().length > 120 ? '…' : ''}».` : `Документ описывает назначение сценария, ${nodeCount(pkg.name)} узлов и потоки данных между ними${pkg.name === 'Продажи.lgp' ? '' : ', три подмодели'}.`,
    checks: [values.depth === 'custom' ? 'Документ составлен по вашему описанию' : `Описаны ${nodeCount(pkg.name)} из ${nodeCount(pkg.name)} узлов`, values.formats.length > 1 ? `Сохранены и открываются все ${values.formats.length} файла` : 'Документ сохранён и открывается', 'Исходный пакет не изменён'],
    columns:['Раздел','Что внутри'], rows:[['Назначение','Что делает сценарий и для кого'],['Модули','Подмодели «Очистка», «Расчёт», «Выгрузка»'],['Потоки данных','Откуда берутся и куда уходят данные'],['Заметки','Комментарии автора из пакета']],
  };
  if (key === 'refactor:review') {
    // «Продажи.lgp»: the same three findings as the check in the conversation, plus the module note under the rules.
    const sales = pkg.name === 'Продажи.lgp'
    const rows = sales ? [['Повторяющийся фильтр','«Фильтр по дате» в ветках «Регионы» и «Города»','Один фильтр до разветвления'],['Неясное название','«Узел14»','Назвать по смыслу: «Выручка по городам»'],['Нет проверки пустых значений','Перед «Выручка по регионам» и «Узел14»','Строки без цены или региона — до расчёта']]
      : [['Повторяющийся фильтр','Узлы 04 и 08','Объединить фильтрацию в одном узле'],['Неясное название','Узел 14','Назвать по смыслу']]
    if (values.rules) rows.push(['Нет заметки в модуле — по вашим инструкциям','Модуль целиком','Заметка: что делает и кто отвечает'])
    return {
      summary: `Найдены ${rows.length === 2 ? 'два места' : rows.length === 3 ? 'три места' : 'четыре места'} для улучшения. Пакет не изменялся.${values.rules ? ' Учтены ваши инструкции для агента.' : ''}`,
      checks: [`Прочитаны ${nodeCount(pkg.name)} из ${nodeCount(pkg.name)} узлов`, 'Исходный пакет не изменён'],
      columns:['Наблюдение','Где','Что можно сделать'], rows,
    };
  }
  if (key === 'refactor:copy') return {
    summary: `Улучшенная копия сохранена как «${values.target}». Результат на тестовой выборке совпадает с исходным.`,
    checks: ['Копия сохранена в Loginom и открывается заново', 'Результат копии совпадает с исходным на выборке', 'Исходный пакет не изменён'],
    columns:['Изменение','Где','Зачем'], rows:[['Объединены фильтры','Узлы 04 и 08','Меньше повторов'],['Переименован узел','Узел 14','Понятнее назначение']],
  };
  if (key === 'regression') {
    const within = Number(values.tolerance) >= 50;
    return {
      summary: within ? 'Все три проверки прошли.' : 'Две проверки совпали с эталоном, сумма выручки вышла за допуск.',
      checks: ['Запуск на тестовых данных завершён', 'Эталон прочитан без изменений'],
      columns:['Проверка','Ожидание','Факт','Итог'], rows:[['Поля','Город, выручка','Город, выручка','PASS'],['Число строк','245','245','PASS'],['Сумма выручки','4 230 000,00','4 229 950,00',within ? 'PASS' : 'FAIL']],
    };
  }
  if (key === 'migration') return {
    summary: `Собран пакет «${values.target}». Совпадение проверено на одной тестовой выборке.`,
    checks: ['Пакет сохранён в Loginom', 'Результат совпал с SQL на выборке'],
    columns:['Операция SQL','Узел Loginom'], rows:[['FROM','Импорт данных'],['WHERE','Фильтр строк'],['GROUP BY','Группировка']],
  };
  return {
    summary:'Результаты совпали. Второй вариант быстрее на 31 %.',
    checks: ['Оба варианта выполнены на одних данных', 'Исходные пакеты не изменены'],
    columns:['Критерий','Первый','Второй'], rows:[['Значения и типы','Совпали','Совпали'],['Медиана, мс','1 830','1 260'],['Замеров',values.repeats,values.repeats]],
  };
}

const outcomeView = {
  success: ['ok','check','Готово'],
  inconclusive: ['warn','alert','Результат не подтверждён'],
  recovery: ['danger','alert','Нужно проверить состояние'],
  failed: ['danger','close','Не удалось'],
  cancelled: ['warn','stop','Запуск остановлен'],
};

function outcomeText(key, run) {
  const pkg = chosenPackage(run);
  return {
    success: reportData(key,run.values,chosenPackage(run)).summary,
    inconclusive: 'Агент сообщил о завершении, но приложение не нашло подтверждения, что результат сохранён. Проверьте файлы или запустите ещё раз.',
    recovery: `Связь с Loginom прервалась во время сохранения. Действие могло выполниться. Не запускайте повторно, пока не проверите «${pkg.name}» в Loginom.`,
    failed: pkg.source === 'local' ? `Не удалось разобрать «${pkg.name}»: файл повреждён или это не пакет Loginom. Ничего не изменено — можно запустить ещё раз.` : 'Loginom не ответил при открытии пакета. Ничего не изменено — можно запустить ещё раз.',
    cancelled: 'Агент остановлен. Уже выполненные действия не отменяются — они перечислены в подробностях.',
  }[run.outcome];
}

function resultFiles(key, run) {
  if (key === 'document') return docNames(run).map(file => [file, run.folder]);
  if (key === 'refactor:copy' || key === 'migration') return [[run.values.target, 'Ваша папка Loginom, рядом с исходным']];
  return [['Отчёт.html', run.folder]];
}

function renderResult(key, run) {
  const data = reportData(key, run.values, chosenPackage(run));
  const ok = run.outcome === 'success';
  const [tone, glyph, title] = outcomeView[run.outcome];
  const files = resultFiles(key, run);
  const checks = ok ? data.checks.map(text => ['ok', text]) : [['ok', 'Исходный пакет не изменён'],
    ...(run.outcome === 'inconclusive' ? [['warn', 'Сохранение результата не подтверждено']] : []),
    ...(run.outcome === 'recovery' ? [['danger', 'Неизвестно, сохранилась ли копия в Loginom']] : [])];
  const findings = ok && key !== 'document';
  return `<section class="sl-result sl-tone-${tone}" role="status">
      <header><span class="sl-result-icon">${icon(glyph,20)}</span><div><h2>${title}</h2><p>${escape(outcomeText(key, run))}</p></div></header>
      ${ok ? files.map(([file, place]) => `<div class="sl-file">${icon('file',20)}<span><strong>${escape(file)}</strong><small>${place}</small><small>В демо файл не создаётся; в приложении «Открыть» покажет его в программе по умолчанию.</small></span><button type="button" class="btn primary" data-sl-action="open-file">Открыть</button></div>`).join('') : ''}
      <div class="sl-checks-row"><span class="sl-checks-title">Проверено приложением:</span>${checks.map(([cls,text]) => `<span class="sl-check sl-check-${cls}">${cls === 'ok' ? '✓' : '!'} ${escape(text)}</span>`).join('')}</div>
    </section>
    ${findings ? `<section class="sl-panel sl-findings"><h2>${key === 'regression' ? 'Проверки' : key === 'tournament' ? 'Сравнение' : key === 'migration' ? 'Соответствие SQL и узлов' : 'Что нашёл агент'}</h2>
      <div class="sl-table"><table><thead><tr>${data.columns.map(label => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead>
      <tbody>${data.rows.map(row => `<tr>${row.map(cell => `<td ${['PASS','FAIL'].includes(cell) ? `class="sl-${cell.toLowerCase()}"` : ''}>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : ''}
    <div class="sl-actions sl-result-actions">
      <button type="button" class="btn" data-sl-action="discuss">${icon('message',16)} Обсудить в чате</button>
      ${run.outcome === 'recovery' ? '<button type="button" class="btn primary" data-sl-action="check-state">Проверить состояние</button>' : ''}
      <button type="button" class="btn quiet" data-sl-action="again" ${run.outcome === 'recovery' ? 'disabled title="Сначала проверьте состояние пакета"' : ''}>${icon('refresh',16)} Запустить ещё раз</button>
    </div>`;
}

function details(key, run) {
  const lines = logFor(key, run);
  return `<details class="sl-details" ${run.details ? 'open' : ''}><summary data-sl-action="toggle-details">Подробности: что делал агент</summary>
    <ol>${lines.map(line => `<li>${escape(line)}</li>`).join('') || '<li>Ещё ничего не сделано</li>'}</ol>
    <button type="button" class="link-btn" data-sl-action="open-session">Открыть полный разговор →</button></details>`;
}

function renderRunner(state, model) {
  const key = runKey(state);
  const id = key.split(':')[0];
  const item = byId(id);
  // An own action (iteration 6) is this wizard with saved parameters filled in.
  const own = state.ownRun?.key === key ? state.ownRun : null;
  const [title, description] = own ? [own.name, `Своё действие на основе «${own.baseTitle}». Параметры подставлены из него; для этого запуска их можно изменить.`] : titles[key];
  const run = model.runs[key] ??= { values: {
    package:'Продажи.lgp', second:'Сводка продаж.lgp', formats:['pdf'], depth:'full', custom:'', goal:'Понятность структуры',
    target:'Продажи — улучшено.lgp', data:'sales_sample.csv', baseline:'sales_expected.csv', tolerance:'0.01',
    sql:sqlExample, repeats:'5',
  }, step:'params', stage:0, outcome:'success', demoOutcome:'success' };
  if (own && run.ownApplied !== own.name && run.step === 'params') {
    Object.assign(run.values, own.values);
    run.ownApplied = own.name;
  }
  // Seeing the result clears the «Готово — открыть результат» line in the sidebar.
  if (run.step === 'result') run.unseen = false;
  if (state.runnerPackage && (run.boundPackage?.name !== state.runnerPackage.name || run.boundPackage?.source !== state.runnerPackage.source) && run.step !== 'running') {
    run.boundPackage = state.runnerPackage;
    run.values.package = state.runnerPackage.name;
    run.values.target = state.runnerPackage.name.replace(/\.lgp$/,'') + ' — улучшено.lgp';
    run.step = 'params';
  }
  const back = {loginom:['loginom','← Пакеты'], home:['home','← Новый разговор'], chat:['chat','← Разговор']}[state.runnerFrom] || ['hub','← Каталог'];
  const blocked = key === 'regression' && run.values.baseline === 'missing';
  const access = accessFor(key, run, state.projects.find(item => item.id === state.project)?.name);
  let body = '';
  if (run.step === 'params') body = `<section class="sl-panel"><form class="sl-form" data-sl-form="run">${run.error ? note(escape(run.error),'warn') : ''}${renderFields(key, run)}
    <div class="sl-actions">${blocked ? `<button type="button" class="btn" data-sl-action="baseline-draft" ${run.baselineDraft ? 'disabled' : ''}>Подготовить черновик эталона</button>` : '<button type="submit" class="btn primary">Далее: доступ</button>'}</div></form></section>`;
  if (run.step === 'access') {
    const [modelName, modelWhere, cloud] = modelLine(state);
    body = `<section class="sl-panel sl-access">
      <p class="sl-access-lead">Проверьте, что произойдёт при запуске. Разрешения действуют только на этот запуск.</p>
      ${access.pre.length ? `<div class="sl-pre">${icon('download',17)}<div><strong>Сначала приложение</strong>${access.pre.map(text => `<p>${escape(text)}</p>`).join('')}</div></div>` : ''}
      <div class="sl-perms"><div><h3>✓ Агент сможет</h3><ul>${access.can.map(text => `<li>${escape(text)}</li>`).join('')}</ul></div>
      <div><h3>✕ Агент не сможет</h3><ul>${access.cannot.map(text => `<li>${escape(text)}</li>`).join('')}</ul></div></div>
      ${access.warn ? `<div class="sl-note sl-note-warn">${icon('alert',16)} ${escape(access.warn)}</div>` : ''}
      ${modelName ? `<div class="sl-data${cloud ? ' sl-data-cloud' : ''}">${icon('cpu',17)}<p><strong>Что увидит модель:</strong> ${escape(access.data)}. Модель «${escape(modelName)}» — ${escape(modelWhere)}.</p></div>`
        : `<div class="sl-note sl-note-warn">${icon('alert',16)} Модель не выбрана — без неё действие не запустится. <button type="button" class="btn quiet" data-settings="providers">Выбрать модель</button></div>`}
      <div class="sl-actions"><button type="button" class="btn primary" data-sl-action="start" ${modelName ? '' : 'disabled'}>Разрешить и запустить</button><button type="button" class="btn quiet" data-sl-action="to-params">Назад</button></div></section>
      <fieldset class="sl-demo"><legend>Только для прототипа: чем закончится запуск</legend>${outcomes.filter(([value]) => value !== 'recovery' || changesSomething(key)).map(([value,label]) => `<label><input type="radio" name="demo-outcome" value="${value}" ${run.demoOutcome === value ? 'checked' : ''}> ${label}</label>`).join('')}</fieldset>`;
  }
  if (run.step === 'running') body = `<section class="sl-panel"><ol class="sl-stages" aria-live="polite">${item.stages.map((stage,index) => `<li class="${index < run.stage ? 'is-done' : index === run.stage ? 'is-current' : ''}"><span class="sl-stage-mark" aria-hidden="true">${index < run.stage ? '✓' : index+1}</span><span>${stage}</span><small>${index < run.stage ? 'Готово' : index === run.stage ? 'Идёт' : 'Ожидает'}</small></li>`).join('')}</ol>
      ${details(key, run)}
      <div class="sl-actions"><button type="button" class="btn" data-sl-action="stop">Остановить</button><small class="muted">Остановка прерывает агента, но не отменяет уже сделанное.</small></div></section>`;
  if (run.step === 'result') body = renderResult(key, run) + details(key, run);
  return `<div class="sl-page sl-runner"><button type="button" class="sl-back-link" data-sl-action="back" data-sl-back="${back[0]}">${back[1]}</button>
    <header class="sl-heading"><h1>${title}</h1><p>${description}</p><p class="sl-meta">${own ? `Своё действие · на основе «${escape(own.baseTitle)}»` : `${tierBadge(item)} ${escape(item.product || item.title)} · версия ${item.version}`}</p></header>
    ${stepper(run.step)}${body}</div>`;
}

export function initSolutionDrafts(state) {
  getState(state);
}

export function renderSolutions(state) {
  return renderRunner(state, getState(state));
}

function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)], { type:'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}

function validateRun(key, values) {
  if (key === 'document' && !values.formats.length) return 'Отметьте хотя бы один формат документа.';
  if (key === 'document' && values.depth === 'custom' && !values.custom.trim()) return 'Опишите, какая документация нужна.';
  if (key === 'regression' && values.baseline === 'missing') return 'Нужен утверждённый эталон.';
  if (key === 'tournament' && values.package === values.second) return 'Выберите два разных пакета.';
  if (key === 'migration' && (!/^\s*SELECT\b[^;]*\bFROM\b[^;]+;?\s*$/i.test(values.sql) || /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|JOIN|UNION|OVER)\b/i.test(values.sql))) return 'Для этого примера используйте SELECT, WHERE и GROUP BY. Для других операций потребуется адаптация.';
  if ((key === 'refactor:copy' || key === 'migration') && !/\.lgp$/i.test(values.target)) return 'Имя пакета должно оканчиваться на .lgp.';
  return '';
}

export function bindSolutions(root,state,api) {
  const panel = root.querySelector('.sl-page');
  if (!panel) return;
  const model = getState(state);
  const key = runKey(state);
  const item = byId(key.split(':')[0]);
  const run = model.runs[key];
  panel.addEventListener('input', event => {
    const input = event.target;
    const form = input.closest('[data-sl-form]');
    if (!form || !input.name || input.type === 'file') return;
    if (input.type !== 'checkbox') run.values[input.name] = input.value;
  });
  panel.addEventListener('change', async event => {
    if (event.target.name === 'demo-outcome') { run.demoOutcome = event.target.value; return; }
    if (event.target.type === 'radio' && event.target.closest('[data-sl-form="run"]')) {
      run.values[event.target.name] = event.target.value;
      run.error = '';
      api.render();
      // «Своё» opens the description field: the cursor goes straight into it.
      if (event.target.value === 'custom') panel.ownerDocument.querySelector('textarea[name="custom"]')?.focus();
      return;
    }
    if (event.target.type === 'checkbox' && event.target.closest('[data-sl-form="run"]')) {
      run.values[event.target.name] = [...event.target.form.querySelectorAll(`input[name="${event.target.name}"]:checked`)].map(input => input.value);
      run.error = '';
      api.render();
      panel.ownerDocument.querySelector(`input[name="${event.target.name}"][value="${event.target.value}"]`)?.focus();
      return;
    }
    if (event.target.name === 'baseline') { run.values.baseline = event.target.value; api.render(); return; }
  });
  panel.addEventListener('submit', event => {
    event.preventDefault();
    run.error = validateRun(key,run.values);
    if (!run.error) run.step = 'access';
    api.render(true);
  });
  panel.addEventListener('click', event => {
    const button = event.target.closest('button, summary');
    if (!button) return;
    switch (button.dataset.slAction) {
      case 'back': api.navigate(button.dataset.slBack); return;
      case 'baseline-draft': run.baselineDraft = true; api.render(); return;
      case 'to-params': run.step = 'params'; api.render(true); return;
      case 'again': run.step = 'params'; run.stage = 0; run.details = false; api.render(true); return;
      case 'check-state': run.outcome = 'success'; api.toast('Копия найдена в Loginom и открывается — результат подтверждён'); api.render(); return;
      case 'toggle-details': event.preventDefault(); run.details = !run.details; api.render(); return;
      case 'open-session': api.toast('В приложении откроется разговор этого запуска со всеми шагами агента'); return;
      case 'open-file': api.toast('В приложении файл откроется в программе по умолчанию. В демо файла нет'); return;
      // Run 3: a failed run is discussed as failed, with only the files the result lists.
      case 'discuss': {
        const ok = run.outcome === 'success';
        const pkg = chosenPackage(run);
        api.discuss(titles[key][0] + ' · ' + run.values.package, 'Разберём результат запуска «' + titles[key][0] + '»: ' + (ok ? reportData(key, run.values, pkg).summary : outcomeView[run.outcome][2] + '. ' + outcomeText(key, run)) + ' Что стоит сделать дальше?', ok ? resultFiles(key, run).map(([file]) => file) : [], pkg.source && key !== 'migration' ? {name:pkg.name, where:pkg.where, source:pkg.source} : null);
        return;
      }
      case 'stop': clearInterval(run.timer); run.step = 'result'; run.outcome = 'cancelled'; api.render(); return;
      case 'start': {
        run.step = 'running';
        // The rules in «Инструкции» are taken when the run starts: a later change does not rewrite this result.
        run.values.rules = rulesFollowed;
        run.folder = runFolder(key, state.projects.find(entry => entry.id === state.project)?.name);
        // A run started from «Что сделать с пакетом» took the package and the request, as sending a message does:
        // a new conversation starts empty. A draft left on another screen stays.
        if (state.draftPackage && state.runnerPackage?.name === state.draftPackage.name) {
          state.draft = '';
          state.draftPackage = null;
          state.draftFiles = [];
        }
        run.stage = 0;
        run.details = false;
        const finalStage = item.stages.length;
        run.timer = setInterval(() => {
          run.stage += 1;
          const failAt = run.demoOutcome === 'failed' ? 1 : run.demoOutcome === 'recovery' ? 3 : finalStage;
          if (run.stage >= failAt) {
            clearInterval(run.timer);
            run.step = 'result';
            run.outcome = run.demoOutcome;
            if (state.page !== 'runner' || runKey(state) !== key) {
              run.unseen = true;
              api.toast(titles[key][0] + (run.outcome === 'success' ? ': готово' : ': нужно посмотреть результат'));
            }
            run.stage = Math.min(run.stage, finalStage) - 1;
          }
          // Off the runner page, re-render once at the end so the «Выполняется» card disappears.
          if ((state.page === 'runner' && runKey(state) === key) || run.step === 'result') api.render();
        }, 700);
        api.render(true);
        return;
      }
      case 'download-report': download(`${key.replace(':','-')}-demo-report.json`,{is_demo:true,real_execution:false,solution:item.product || item.title,version:item.version,tier:item.tier,parameters:run.values,outcome:run.outcome,checks:reportData(key,run.values,chosenPackage(run)).checks}); return;
    }
  });
}
