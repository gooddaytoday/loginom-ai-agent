import { byId, tiers, tierBadge } from './catalog.js';

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
const demoPackages = [
  {name:'Продажи.lgp', where:'Loginom · /analyst', source:'loginom'},
  {name:'Сводка продаж.lgp', where:'Loginom · /Общие/Аналитика', source:'loginom'},
  {name:'Мой сценарий.lgp', where:'На компьютере · Документы', source:'local'},
];
const draftKey = 'loginom-prototype-local-solutions';
const sqlExample = 'SELECT city, SUM(amount) AS revenue\nFROM sales\nWHERE amount IS NOT NULL\nGROUP BY city;';
const authorDefaults = { title:'Контроль качества данных', description:'Проверяет пропуски и дубликаты в таблице и формирует отчёт.', scope:'Личная библиотека', method:'manual', id:'' };

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
}

function savedDrafts() {
  try {
    const saved = JSON.parse(localStorage.getItem(draftKey) || '[]');
    return Array.isArray(saved) ? saved.filter(item => item && typeof item.title === 'string' && typeof item.id === 'string') : [];
  } catch {
    return [];
  }
}

function getState(state) {
  state.solutions ??= {};
  state.solutions.runs ??= {};
  state.solutions.drafts ??= savedDrafts();
  state.solutions.author ??= { ...authorDefaults };
  return state.solutions;
}

function runKey(state) {
  const id = byId(state.solution)?.runner ? state.solution : 'document';
  return id === 'refactor' ? 'refactor:' + (state.solutionMode === 'copy' ? 'copy' : 'review') : id;
}

function packageChoices(run) {
  const bound = run.boundPackage;
  return bound && !demoPackages.some(item => item.name === bound.name) ? [bound,...demoPackages] : demoPackages;
}

function select(name, label, choices, selected, hint = '') {
  return `<label class="sl-field"><span>${label}</span><select name="${name}">${choices.map(choice => {
    const [value,text] = Array.isArray(choice) ? choice : [choice,choice];
    return `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(text)}</option>`;
  }).join('')}</select>${hint ? `<small>${hint}</small>` : ''}</label>`;
}

function radios(name, label, choices, selected) {
  return `<fieldset class="sl-field sl-radios"><legend>${label}</legend>${choices.map(([value,text,hint]) =>
    `<label><input type="radio" name="${name}" value="${value}" ${value === selected ? 'checked' : ''}><span><strong>${text}</strong>${hint ? `<small>${hint}</small>` : ''}</span></label>`).join('')}</fieldset>`;
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
    radios('format','Формат документа',[['pdf','PDF','Для чтения и печати'],['docx','Word','Можно редактировать'],['md','Markdown','Для базы знаний']],values.format) +
    radios('depth','Подробность',[['short','Кратко','Назначение и основные шаги'],['full','Подробно','Каждый узел и поток данных']],values.depth);
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
  return packageChoices(run).find(item => item.name === run.values[name]) || demoPackages[0];
}

function accessFor(key, run) {
  const item = byId(key.split(':')[0]);
  const pkg = chosenPackage(run);
  const can = [];
  const cannot = [...item.cannot];
  if (key === 'document') {
    // package-docs reads only a local .lgp: for a Loginom package the app (not the agent) fetches a copy first.
    can.push(`Прочитать копию «${pkg.name}»${pkg.source === 'loginom' ? ' — приложение заранее скачает её из Loginom' : ''}`,
      `Сохранить документ «${pkg.name.replace(/\.lgp$/,'')} — описание.${run.values.format === 'md' ? 'md' : run.values.format}» в папку проекта`);
  } else if (key === 'refactor:review') {
    can.push(`Открыть копию «${pkg.name}» в Loginom только для чтения`, 'Прочитать настройки узлов');
  } else if (key === 'refactor:copy') {
    can.push(`Открыть копию «${pkg.name}» в Loginom`, 'Изменять узлы в копии', `Сохранить копию как «${run.values.target}»`);
  } else if (key === 'regression') {
    can.push(`Запустить копию «${pkg.name}» на ${run.values.data}`, `Прочитать эталон ${run.values.baseline}`);
  } else if (key === 'tournament') {
    can.push(`Запустить копии «${pkg.name}» и «${run.values.second}» на ${run.values.data}`, 'Замерить время выполнения');
  } else {
    can.push(`Создать пакет «${run.values.target}» в вашей папке Loginom`, `Запустить его на ${run.values.data}`);
  }
  return {can, cannot};
}

function stepper(current) {
  const index = steps.findIndex(([id]) => id === current);
  return `<ol class="sl-stepper" aria-label="Шаги запуска">${steps.map(([id,label],i) =>
    `<li class="${i < index ? 'is-done' : i === index ? 'is-current' : ''}"${i === index ? ' aria-current="step"' : ''}><span>${i < index ? '✓' : i+1}</span>${label}</li>`).join('')}</ol>`;
}

function logFor(key, run) {
  const pkg = chosenPackage(run);
  const lines = {
    document: [`Получена копия «${pkg.name}»`, 'Прочитана структура: 14 узлов, 3 подмодели', 'Справка Loginom: описаны 9 типов узлов', 'Собран документ, 11 страниц'],
    'refactor:review': [`Открыта копия «${pkg.name}» только для чтения`, 'Прочитаны настройки 12 узлов', 'Найдено 2 улучшения', 'Отчёт сохранён в папку проекта'],
    'refactor:copy': [`Открыта копия «${pkg.name}»`, 'Объединены фильтры в узлах 04 и 08', 'Переименован узел 14', `Копия сохранена как «${run.values.target}»`],
    regression: ['Подготовлена тестовая копия', `Запуск на ${run.values.data}: 245 строк`, 'Сравнение с эталоном: 3 проверки', 'Отчёт сохранён'],
    tournament: ['Подготовлены копии двух вариантов', 'Результаты совпали по значениям и типам', `Выполнено ${run.values.repeats} замеров`, 'Отчёт сохранён'],
    migration: ['Разобран SQL-запрос', `Собран пакет «${run.values.target}»: 3 узла`, 'Сверка на выборке: совпадает', 'Отчёт сохранён'],
  }[key];
  return lines.slice(0, run.stage + (run.step === 'result' ? 1 : 0));
}

function reportData(key, values) {
  if (key === 'document') return {
    summary: 'Документ описывает назначение сценария, 14 узлов, потоки данных между ними и три подмодели.',
    checks: ['Описаны 14 из 14 узлов', 'Документ сохранён и открывается', 'Исходный пакет не изменён'],
    columns:['Раздел','Что внутри'], rows:[['Назначение','Что делает сценарий и для кого'],['Модули','Подмодели «Очистка», «Расчёт», «Выгрузка»'],['Потоки данных','Откуда берутся и куда уходят данные'],['Заметки','Комментарии автора из пакета']],
  };
  if (key === 'refactor:review') return {
    summary: 'Найдены два места для улучшения структуры. Пакет не изменялся.',
    checks: ['Прочитаны 12 из 12 узлов', 'Исходный пакет не изменён'],
    columns:['Наблюдение','Где','Что можно сделать'], rows:[['Повторяющийся фильтр','Узлы 04 и 08','Объединить фильтрацию в одном узле'],['Неясное название','Узел 14','Назвать по смыслу: «Выручка по городам»']],
  };
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

function resultBanner(key, run) {
  const pkg = chosenPackage(run);
  const banners = {
    success: ['ok','Готово',reportData(key,run.values).summary],
    inconclusive: ['warn','Результат не подтверждён','Агент сообщил о завершении, но приложение не нашло подтверждения, что результат сохранён. Проверьте файлы или запустите ещё раз.'],
    recovery: ['danger','Нужно проверить состояние',`Связь с Loginom прервалась во время сохранения. Действие могло выполниться. Не запускайте повторно, пока не проверите «${pkg.name}» в Loginom.`],
    failed: ['danger','Не удалось','Loginom не ответил при открытии пакета. Ничего не изменено — можно запустить ещё раз.'],
    cancelled: ['warn','Запуск остановлен','Агент остановлен. Уже выполненные действия не отменяются — они перечислены в подробностях.'],
  };
  const [tone,title,text] = banners[run.outcome];
  return `<div class="sl-outcome sl-outcome-${tone}" role="status"><strong>${title}</strong><p>${escape(text)}</p></div>`;
}

function renderResult(key, run) {
  const data = reportData(key, run.values);
  const ok = run.outcome === 'success';
  const pkg = chosenPackage(run);
  const file = key === 'document' ? `${pkg.name.replace(/\.lgp$/,'')} — описание.${run.values.format === 'md' ? 'md' : run.values.format}` : key === 'refactor:copy' || key === 'migration' ? run.values.target : 'Отчёт.html';
  return `${resultBanner(key, run)}
    <section class="sl-panel"><div class="sl-panel-head"><h2>Что проверило приложение</h2><span class="sl-tag">по фактам, а не со слов агента</span></div>
      <ul class="sl-checks">${(ok ? data.checks : ['Исходный пакет не изменён']).map(text => `<li class="ok">✓ ${escape(text)}</li>`).join('')}
      ${run.outcome === 'inconclusive' ? '<li class="warn">? Сохранение результата не подтверждено</li>' : ''}${run.outcome === 'recovery' ? '<li class="danger">! Неизвестно, сохранилась ли копия в Loginom</li>' : ''}</ul>
    </section>
    ${ok ? `<section class="sl-panel sl-report"><div class="sl-panel-head"><h2>Результат</h2><span class="sl-tag">учебные данные</span></div>
      <div class="sl-file"><span class="glyph red">📄</span><span><strong>${escape(file)}</strong><small>${key === 'refactor:copy' || key === 'migration' ? 'Пакет в вашей папке Loginom' : 'Папка проекта'}</small></span><button type="button" class="btn" data-sl-action="open-file">Открыть</button></div>
      <div class="sl-table"><table><thead><tr>${data.columns.map(label => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead>
      <tbody>${data.rows.map(row => `<tr>${row.map(cell => `<td ${['PASS','FAIL'].includes(cell) ? `class="sl-${cell.toLowerCase()}"` : ''}>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>` : ''}
    <div class="sl-actions sl-result-actions">
      <button type="button" class="btn primary" data-sl-action="discuss">Обсудить в чате</button>
      ${run.outcome === 'recovery' ? '<button type="button" class="btn" data-sl-action="check-state">Проверить состояние</button>' : ''}
      <button type="button" class="btn quiet" data-sl-action="again" ${run.outcome === 'recovery' ? 'disabled title="Сначала проверьте состояние пакета"' : ''}>Запустить ещё раз</button>
      ${ok ? '<button type="button" class="btn quiet" data-sl-action="download-report">Скачать отчёт</button>' : ''}
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
  const [title, description] = titles[key];
  const run = model.runs[key] ??= { values: {
    package:'Продажи.lgp', second:'Сводка продаж.lgp', format:'pdf', depth:'full', goal:'Понятность структуры',
    target:'Продажи — улучшено.lgp', data:'sales_sample.csv', baseline:'sales_expected.csv', tolerance:'0.01',
    sql:sqlExample, repeats:'5',
  }, step:'params', stage:0, outcome:'success', demoOutcome:'success' };
  if (state.runnerPackage && run.boundPackage?.name !== state.runnerPackage.name && run.step !== 'running') {
    run.boundPackage = state.runnerPackage;
    run.values.package = state.runnerPackage.name;
    run.values.target = state.runnerPackage.name.replace(/\.lgp$/,'') + ' — улучшено.lgp';
    run.step = 'params';
  }
  const back = {loginom:['loginom','← Пакеты'], home:['home','← Главная']}[state.runnerFrom] || ['hub','← Решения'];
  const blocked = key === 'regression' && run.values.baseline === 'missing';
  const access = accessFor(key, run);
  let body = '';
  if (run.step === 'params') body = `<section class="sl-panel"><form class="sl-form" data-sl-form="run">${run.error ? note(escape(run.error),'warn') : ''}${renderFields(key, run)}
    <div class="sl-actions">${blocked ? `<button type="button" class="btn" data-sl-action="baseline-draft" ${run.baselineDraft ? 'disabled' : ''}>Подготовить черновик эталона</button>` : '<button type="submit" class="btn primary">Далее: доступ</button>'}</div></form></section>`;
  if (run.step === 'access') body = `<section class="sl-panel sl-access">
      <p class="sl-access-lead">Перед запуском проверьте, что будет разрешено агенту. Права действуют только на этот запуск.</p>
      <div class="sl-perms"><div><h3>✓ Агент сможет</h3><ul>${access.can.map(text => `<li>${escape(text)}</li>`).join('')}</ul></div>
      <div><h3>✕ Агент не сможет</h3><ul>${access.cannot.map(text => `<li>${escape(text)}</li>`).join('')}</ul></div></div>
      <p class="sl-who">${tierBadge(item)} ${tiers[item.tier].title}, версия ${item.version}</p>
      <fieldset class="sl-demo"><legend>Демонстрация: чем закончится запуск</legend>${outcomes.map(([value,label]) => `<label><input type="radio" name="demo-outcome" value="${value}" ${run.demoOutcome === value ? 'checked' : ''}> ${label}</label>`).join('')}</fieldset>
      <div class="sl-actions"><button type="button" class="btn quiet" data-sl-action="to-params">Назад</button><button type="button" class="btn primary" data-sl-action="start">Разрешить и запустить</button></div></section>`;
  if (run.step === 'running') body = `<section class="sl-panel"><ol class="sl-stages" aria-live="polite">${item.stages.map((stage,index) => `<li class="${index < run.stage ? 'is-done' : index === run.stage ? 'is-current' : ''}"><span class="sl-stage-mark" aria-hidden="true">${index < run.stage ? '✓' : index+1}</span><span>${stage}</span><small>${index < run.stage ? 'Готово' : index === run.stage ? 'Идёт' : 'Ожидает'}</small></li>`).join('')}</ol>
      ${details(key, run)}
      <div class="sl-actions"><button type="button" class="btn" data-sl-action="stop">Остановить</button><small class="muted">Остановка прерывает агента, но не отменяет уже сделанное.</small></div></section>`;
  if (run.step === 'result') body = renderResult(key, run) + details(key, run);
  return `<div class="sl-page"><button type="button" class="btn quiet sl-back" data-sl-action="back" data-sl-back="${back[0]}">${back[1]}</button>
    <header class="sl-heading"><p class="sl-product">${tierBadge(item)} ${escape(item.product || item.title)}</p><h1>${title}</h1><p>${description}</p></header>
    ${stepper(run.step)}${body}</div>`;
}

function renderAuthor(model) {
  const author = model.author;
  return `<div class="sl-page"><button type="button" class="btn quiet sl-back" data-sl-action="back" data-sl-back="hub">← Решения</button>
    <header class="sl-heading"><span class="sl-product">Мои решения</span><h1>Создать решение</h1><p>Подготовьте повторяемую инструкцию для агента и сохраните черновик в библиотеке.</p></header>
    <div class="sl-switch" aria-label="Способ создания">${[['manual','С нуля'],['chat','Из разговора'],['import','Импорт файла']].map(([id,title]) => `<button type="button" class="sl-chip${id === author.method ? ' is-active' : ''}" data-sl-author="${id}" aria-pressed="${id === author.method}">${title}</button>`).join('')}</div>
    <div class="sl-grid"><section class="sl-panel"><div class="sl-panel-head"><h2>${author.method === 'import' ? 'Предпросмотр импорта' : 'Черновик решения'}</h2><span class="sl-tag">Личный</span></div>
      <form class="sl-form" data-sl-form="author">${author.method === 'import' ? `<label class="sl-field sl-upload"><span>Выбрать SKILL.md или манифест JSON</span><input name="import" type="file" accept=".md,.json,text/markdown,application/json"><small>Прочитаем название и описание для предпросмотра.</small></label>` : ''}
      ${author.feedback ? note(escape(author.feedback),author.warning ? 'warn' : '') : ''}
      <label class="sl-field"><span>Название решения</span><input name="title" maxlength="110" value="${escape(author.title)}" required></label>
      <label class="sl-field"><span>Что делает решение</span><textarea name="description" maxlength="900" rows="4" required>${escape(author.description)}</textarea></label>
      ${select('scope','Кому доступен черновик',['Личная библиотека','Только в текущем проекте'],author.scope)}
      <div class="sl-actions"><button type="submit" class="btn primary">Сохранить черновик</button><button type="button" class="btn quiet" data-sl-action="manifest">Скачать манифест</button></div></form></section>
      <aside class="sl-panel sl-permissions"><div class="sl-panel-head"><h2>Карточка решения</h2><span class="sl-tag">Черновик</span></div><h3 data-sl-preview-title>${escape(author.title || 'Название решения')}</h3><p data-sl-preview-desc>${escape(author.description)}</p><p>Из черновика можно экспортировать описание и входы решения.</p>${note('Черновик хранится в этом браузере.')}</aside></div>
    ${model.drafts.length ? `<section class="sl-panel sl-drafts"><div class="sl-panel-head"><h2>Сохранённые черновики</h2></div>${model.drafts.map(draft => `<button type="button" class="sl-draft" data-sl-draft="${escape(draft.id)}"><span><strong>${escape(draft.title)}</strong><small>${escape(draft.scope)}</small></span><span>Открыть →</span></button>`).join('')}</section>` : ''}</div>`;
}

export function initSolutionDrafts(state) {
  getState(state);
}

export function renderSolutions(state) {
  const model = getState(state);
  if (state.page !== 'studio') return renderRunner(state,model);
  return renderAuthor(model);
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

function readDraft(name, source) {
  if (name.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed.title !== 'string' || typeof parsed.description !== 'string') throw new Error();
    return { title:parsed.title, description:parsed.description };
  }
  if (!name.toLowerCase().endsWith('.md')) throw new Error();
  const yaml = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/)?.[1] ?? '';
  const title = yaml.match(/^name:\s*(.+)$/m)?.[1] ?? source.match(/^#\s+(.+)$/m)?.[1];
  if (!title) throw new Error();
  const paragraph = source.slice(source.indexOf(title) + title.length).split(/\r?\n/).find(line => /^[\p{L}\d]/u.test(line.trim()));
  return { title, description:yaml.match(/^description:\s*(.+)$/m)?.[1] ?? paragraph?.trim() ?? '' };
}

function validateRun(key, values) {
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
  const author = model.author;
  const key = runKey(state);
  const item = byId(key.split(':')[0]);
  const run = model.runs[key];
  panel.addEventListener('input', event => {
    const input = event.target;
    const form = input.closest('[data-sl-form]');
    if (!form || !input.name || input.type === 'file') return;
    if (form.dataset.slForm === 'run') {
      run.values[input.name] = input.value;
      return;
    }
    author[input.name] = input.value;
    if (input.name === 'title') panel.querySelector('[data-sl-preview-title]').textContent = input.value || 'Название решения';
    if (input.name === 'description') panel.querySelector('[data-sl-preview-desc]').textContent = input.value;
  });
  panel.addEventListener('change', async event => {
    if (event.target.name === 'demo-outcome') { run.demoOutcome = event.target.value; return; }
    if (event.target.name === 'baseline') { run.values.baseline = event.target.value; api.render(); return; }
    if (event.target.name !== 'import') return;
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error();
      const draft = readDraft(file.name, await file.text());
      Object.assign(author,{title:draft.title.slice(0,110),description:draft.description.slice(0,900),feedback:`Прочитан файл ${file.name}. Проверьте поля перед сохранением.`,warning:false,id:''});
    } catch {
      Object.assign(author,{feedback:'Не удалось прочитать карточку. Выберите SKILL.md или манифест JSON размером до 1 МБ.',warning:true});
    }
    if (state.page === 'studio') api.render();
  });
  panel.addEventListener('submit', event => {
    event.preventDefault();
    if (event.target.dataset.slForm === 'run') {
      run.error = validateRun(key,run.values);
      if (!run.error) run.step = 'access';
      api.render(true);
      return;
    }
    const title = author.title.trim();
    const description = author.description.trim();
    if (!title || !description) { api.toast('Заполните название и описание решения.'); return; }
    author.id ||= `draft-${Date.now()}`;
    const draft = {id:author.id,title,description,scope:author.scope};
    const index = model.drafts.findIndex(entry => entry.id === author.id);
    if (index === -1) model.drafts.push(draft);
    else model.drafts[index] = draft;
    let persisted = true;
    try { localStorage.setItem(draftKey,JSON.stringify(model.drafts)); } catch { persisted = false; }
    Object.assign(author,{feedback:persisted ? 'Черновик сохранён в библиотеке.' : 'Черновик сохранён на время этой вкладки.',warning:!persisted});
    api.render();
  });
  panel.addEventListener('click', event => {
    const button = event.target.closest('button, summary');
    if (!button) return;
    if (button.dataset.slAuthor) {
      const method = button.dataset.slAuthor;
      if (method === 'chat') Object.assign(author,{title:'Аудит сценария продаж',description:'Проверяет структуру пакета продаж и отмечает дублирующие преобразования.',id:''});
      if (method === 'import') Object.assign(author,{title:'',description:'',id:''});
      Object.assign(author,{method,feedback:method === 'chat' ? 'Поля предложены по учебному разговору.' : '',warning:false});
      api.render();
      return;
    }
    if (button.dataset.slDraft) {
      const draft = model.drafts.find(entry => entry.id === button.dataset.slDraft);
      if (draft) Object.assign(author,draft,{method:'manual',feedback:'',warning:false});
      api.render();
      return;
    }
    switch (button.dataset.slAction) {
      case 'back': api.navigate(button.dataset.slBack); return;
      case 'baseline-draft': run.baselineDraft = true; api.render(); return;
      case 'to-params': run.step = 'params'; api.render(true); return;
      case 'again': run.step = 'params'; run.stage = 0; run.details = false; api.render(true); return;
      case 'check-state': run.outcome = 'success'; api.toast('Копия найдена в Loginom и открывается — результат подтверждён'); api.render(); return;
      case 'toggle-details': event.preventDefault(); run.details = !run.details; api.render(); return;
      case 'open-session': api.toast('В приложении откроется разговор этого запуска со всеми шагами агента'); return;
      case 'open-file': api.toast('Файл откроется в программе по умолчанию'); return;
      case 'discuss': {
        const data = reportData(key, run.values);
        api.discuss(titles[key][0] + ' · ' + run.values.package, 'Разберём результат запуска «' + titles[key][0] + '»: ' + data.summary + ' Что стоит сделать дальше?', ['Отчёт.html']);
        return;
      }
      case 'stop': clearInterval(run.timer); run.step = 'result'; run.outcome = 'cancelled'; api.render(); return;
      case 'start': {
        run.step = 'running';
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
            run.stage = Math.min(run.stage, finalStage) - 1;
          }
          if (state.page === 'runner' && runKey(state) === key) api.render();
        }, 700);
        api.render(true);
        return;
      }
      case 'download-report': download(`${key.replace(':','-')}-demo-report.json`,{is_demo:true,real_execution:false,solution:item.product || item.title,version:item.version,tier:item.tier,parameters:run.values,outcome:run.outcome,checks:reportData(key,run.values).checks}); return;
      case 'manifest': {
        if (!author.title.trim() || !author.description.trim()) { api.toast('Заполните название и описание решения.'); return; }
        download('solution-manifest.demo.json',{schema_version:'proposal-0.1',is_demo:true,id:'local/draft',title:author.title,description:author.description,version:'0.1.0-draft',kind:'skill',status:'private_draft',entrypoint:'SKILL.md',permissions_requested:[],verification:{status:'not_verified'}});
      }
    }
  });
}
