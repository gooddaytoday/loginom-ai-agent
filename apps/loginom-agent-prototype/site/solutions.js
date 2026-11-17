const catalog = {
  refactor: {
    name: 'Scenario Refactor', title: 'Улучшить сценарий',
    description: 'Проверьте структуру пакета и получите рекомендации с указанием конкретных узлов.',
    access: ['Читать структуру выбранного пакета', 'Сформировать отчёт'],
    stage: 'Анализ структуры сценария', report: 'Аудит структуры',
  },
  regression: {
    name: 'Regression Studio', title: 'Проверить изменения',
    description: 'Сравните выбранную выходную таблицу с утверждённым эталоном на тестовых данных.',
    access: ['Читать тестовый пакет и эталон', 'Запустить проверку в тестовом окружении', 'Сформировать отчёт'],
    stage: 'Сравнение с эталоном', report: 'Отчёт о регрессии',
  },
  migration: {
    name: 'Migration Bridge', title: 'Перенести SQL в Loginom',
    description: 'Сопоставьте операции SQL с узлами Loginom и проверьте результат на тестовом наборе.',
    access: ['Читать SQL и тестовую таблицу', 'Подготовить новый пакет', 'Сравнить результат в тестовом окружении'],
    stage: 'Сопоставление SQL с узлами', report: 'Отчёт о переносе SQL',
  },
  tournament: {
    name: 'Scenario Tournament', title: 'Сравнить реализации',
    description: 'Сначала сопоставьте результаты двух готовых сценариев, затем сравните время выполнения.',
    access: ['Читать два выбранных пакета', 'Выполнить повторы в тестовом окружении', 'Сформировать сравнительный отчёт'],
    stage: 'Сравнение двух сценариев', report: 'Сравнение реализаций',
  },
};
const statuses = ['Подготовка входных данных', 'Проверка разрешений', 'Анализ', 'Формирование отчёта'];
const draftKey = 'loginom-prototype-local-solutions';
const sqlExample = 'SELECT city, SUM(amount) AS revenue\nFROM sales\nWHERE amount IS NOT NULL\nGROUP BY city;';
const demoInputs = {
  package: 'sales_analytics.lgp', second: 'sales_variant_b.lgp',
  data: 'sales_sample.csv', baseline: 'sales_expected.csv', goal: 'Понятность структуры',
  tolerance: '0.01', sql: sqlExample, target: 'sales_migrated.lgp', repeats: '5',
};
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

function select(name, label, choices, selected, hint = '') {
  return `<label class="sl-field"><span>${label}</span><select name="${name}">${choices.map(choice => {
    const [value,text] = Array.isArray(choice) ? choice : [choice,choice];
    return `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(text)}</option>`;
  }).join('')}</select>${hint ? `<small>${hint}</small>` : ''}</label>`;
}

function note(text, tone = '') {
  return `<div class="sl-note ${tone ? `sl-note-${tone}` : ''}" role="status">${text}</div>`;
}

function renderFields(id, values, run) {
  const packageField = select('package', id === 'tournament' ? 'Базовый вариант' : 'Пакет Loginom', [...new Set([run.boundPackage, 'sales_analytics.lgp', 'customers_analytics.lgp'].filter(Boolean))], values.package);
  const dataField = select('data', 'Тестовые данные', ['sales_sample.csv', 'sales_edge_cases.csv'], values.data);
  if (id === 'refactor') return `${packageField}${select('goal','Цель анализа',['Понятность структуры','Повторяющиеся преобразования','Названия и организация'],values.goal)}
    <div class="sl-field"><span>Режим</span><div class="sl-static">Только анализ <span>Исходный пакет доступен для чтения.</span></div></div>`;
  if (id === 'regression') return `${packageField}${dataField}${select('baseline','Эталон результата',[["sales_expected.csv","sales_expected.csv · утверждённый"],["missing","Эталона пока нет"]],values.baseline)}
    ${values.baseline === 'missing' ? note(run.baselineDraft ? '<strong>Черновик эталона создан.</strong> После независимой проверки и утверждения появится возможность запустить сравнение.' : '<strong>Для сравнения нужен утверждённый эталон.</strong> Можно подготовить его черновик.', 'warn') : ''}
    <label class="sl-field"><span>Допустимое отклонение чисел</span><input type="number" name="tolerance" min="0" step="any" required value="${escape(values.tolerance)}"></label>`;
  if (id === 'migration') return `<label class="sl-field"><span>SQL-запрос</span><textarea class="sl-code" name="sql" required rows="5" spellcheck="false">${escape(values.sql)}</textarea><small>В демонстрации поддержаны SELECT, WHERE и GROUP BY.</small></label>${dataField}
    <label class="sl-field"><span>Имя нового пакета</span><input name="target" value="${escape(values.target)}" required pattern=".+\\.lgp"></label>`;
  return `${packageField}${select('second','Второй вариант',['sales_variant_b.lgp','customers_analytics.lgp'],values.second)}${dataField}${select('repeats','Число повторов после прогрева',['5','10'],values.repeats)}`;
}

function reportData(id, values) {
  if (id === 'refactor') return {
    summary: 'Найдены два места для улучшения структуры. Запуск вычислений и редактирование пакета в этот режим не входят.',
    columns:['Наблюдение','Где','Что можно сделать'], rows:[['Повторяющийся фильтр','Узлы 04 и 08','Проверить, можно ли объединить фильтрацию'],['Неясное название','Узел 14','Указать назначение преобразования в имени']],
  };
  if (id === 'regression') {
    const withinTolerance = Number(values.tolerance) >= 50;
    return {
      summary: withinTolerance ? 'Все три проверки прошли. Разница в общей выручке укладывается в настроенный допуск.' : 'Две проверки совпали с эталоном. Общая выручка вышла за настроенный допуск.',
      columns:['Проверка','Ожидание','Факт','Итог'], rows:[['Поля','Город, выручка','Город, выручка','PASS'],['Число строк','245','245','PASS'],['Сумма выручки','4 230 000,00','4 229 950,00',withinTolerance ? 'PASS' : 'FAIL']],
    };
  }
  if (id === 'migration') return {
    summary: `Предложен граф для ${values.target}. Совпадение в примере относится к одной тестовой выборке.`,
    columns:['Операция SQL','Узел Loginom'], rows:[['FROM','Импорт данных'],[/\bWHERE\b/i.test(values.sql) ? 'WHERE' : 'SELECT',/\bWHERE\b/i.test(values.sql) ? 'Фильтр строк' : 'Настройка полей'], ...(/\bGROUP\s+BY\b/i.test(values.sql) ? [['GROUP BY','Группировка']] : [])],
  };
  return {
    summary:'Выходы совпали на учебной выборке. Медиана времени в примере ниже у второго варианта.',
    columns:['Критерий','Базовый','Второй'], rows:[['Значения и типы','Совпали','Совпали'],['Медиана, мс','1 830','1 260'],['Повторов',values.repeats,values.repeats]],
  };
}

function renderReport(id, run) {
  const data = reportData(id, run.values);
  return `<section class="sl-panel sl-report"><div class="sl-panel-head"><h2>${catalog[id].report}</h2><span class="sl-tag">Демонстрационные данные</span></div>
    <p>${escape(data.summary)}</p><div class="sl-table"><table><thead><tr>${data.columns.map(label => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead>
    <tbody>${data.rows.map(row => `<tr>${row.map(cell => `<td ${['PASS','FAIL'].includes(cell) ? `class="sl-${cell.toLowerCase()}"` : ''}>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="sl-report-context"><span>Решение <b>${catalog[id].name}</b></span>${id === 'migration' ? `<span>Новый пакет <b>${escape(run.values.target)}</b></span>` : `<span>Пакет <b>${escape(run.values.package)}</b></span>`}${id === 'regression' ? `<span>Допуск <b>${escape(run.values.tolerance)}</b></span>` : ''}</div>
    <div class="sl-actions"><button type="button" class="btn primary" data-sl-action="download-report">Скачать демо-отчёт</button><button type="button" class="btn quiet" data-sl-action="again">Изменить параметры</button></div></section>`;
}

function renderRunner(state, model) {
  const id = Object.hasOwn(catalog, state.solution) ? state.solution : 'refactor';
  const item = catalog[id];
  const run = model.runs[id] ??= { values: {...demoInputs}, status:'setup', stage:0 };
  if (state.runnerPackage && run.boundPackage !== state.runnerPackage && run.status !== 'running') {
    run.boundPackage = state.runnerPackage;
    run.values.package = run.boundPackage;
    run.status = 'setup';
    run.error = '';
  }
  const active = run.status === 'running';
  const blocked = id === 'regression' && run.values.baseline === 'missing';
  const stageNames = [...statuses];
  stageNames[2] = item.stage;
  return `<div class="sl-page"><button type="button" class="btn quiet sl-back" data-sl-action="hub">← Loginom Hub</button>
    <header class="sl-heading"><span class="sl-product">${item.name}</span><h1>${item.title}</h1><p>${item.description}</p></header>
    <div class="sl-switch" aria-label="Выбрать решение">${Object.entries(catalog).map(([key, detail]) => `<button type="button" class="sl-chip${key === id ? ' is-active' : ''}" data-sl-switch="${key}" aria-pressed="${key === id}">${detail.name}</button>`).join('')}</div>
    ${run.status === 'done' ? renderReport(id,run) : `<div class="sl-grid">
    <section class="sl-panel"><div class="sl-panel-head"><h2>${active ? 'Ход запуска' : 'Параметры запуска'}</h2><span class="sl-tag">Демонстрация</span></div>
      ${active ? `<ol class="sl-stages" aria-live="polite">${stageNames.map((stage,index) => `<li class="${index < run.stage ? 'is-done' : index === run.stage ? 'is-current' : ''}"><span class="sl-stage-mark" aria-hidden="true">${index < run.stage ? '✓' : index+1}</span><span>${stage}</span><small>${index < run.stage ? 'Завершён' : index === run.stage ? 'Выполняется' : 'Ожидает'}</small></li>`).join('')}</ol>
      <div class="sl-actions"><button type="button" class="btn quiet" data-sl-action="stop">Остановить запуск</button></div>` : `<form class="sl-form" data-sl-form="run">
      ${run.status === 'cancelled' ? note('Запуск остановлен. Параметры сохранены для следующей попытки.') : ''}${run.error ? note(escape(run.error),'warn') : ''}
      ${renderFields(id, run.values, run)}<div class="sl-actions">${blocked ? `<button type="button" class="btn quiet" data-sl-action="baseline-draft" ${run.baselineDraft ? 'disabled' : ''}>Подготовить черновик эталона</button>` : '<button type="submit" class="btn primary">Проверить и продолжить</button>'}</div></form>`}
    </section><aside class="sl-panel sl-permissions"><h2>Доступ в запуске</h2><ul>${item.access.map(access => `<li><span aria-hidden="true">✓</span>${access}</li>`).join('')}</ul><p>Решение работает в пределах выбранных входов и указанного окружения.</p>${note('Ход запуска и результат показаны на учебных данных.')}</aside></div>`}
    ${run.status === 'confirm' ? `<dialog class="sl-dialog" data-sl-dialog="confirm" aria-labelledby="sl-confirm-title"><div class="sl-panel"><div class="sl-panel-head"><h2 id="sl-confirm-title">Подтвердить запуск</h2><button type="button" class="btn quiet sl-close" data-sl-action="cancel-confirm" aria-label="Закрыть">×</button></div><p>${item.name} / ${escape(id === 'migration' ? run.values.target : run.values.package)}</p><ul>${item.access.map(access => `<li>${access}</li>`).join('')}</ul><p>Запуск использует учебные данные.</p><div class="sl-actions"><button type="button" class="btn quiet" data-sl-action="cancel-confirm" autofocus>Вернуться</button><button type="button" class="btn primary" data-sl-action="start">Запустить демонстрацию</button></div></div></dialog>` : ''}</div>`;
}

function renderAuthor(model) {
  const author = model.author;
  return `<div class="sl-page"><button type="button" class="btn quiet sl-back" data-sl-action="hub">← Loginom Hub</button>
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
  if (state.solutionDraft) {
    const draft = model.drafts.find(item => item.id === state.solutionDraft);
    if (draft) Object.assign(model.author,draft,{method:'manual',feedback:'',warning:false});
    delete state.solutionDraft;
  }
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

function validateRun(id, values) {
  if (id === 'regression' && values.baseline === 'missing') return 'Нужен утверждённый эталон.';
  if (id === 'tournament' && values.package === values.second) return 'Выберите два разных пакета.';
  if (id === 'migration' && (!/^\s*SELECT\b[^;]*\bFROM\b[^;]+;?\s*$/i.test(values.sql) || /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|JOIN|UNION|OVER)\b/i.test(values.sql))) return 'Для этого примера используйте SELECT, WHERE и GROUP BY. Для других операций потребуется адаптация.';
  return '';
}

export function bindSolutions(root,state,api) {
  const panel = root.querySelector('.sl-page');
  if (!panel) return;
  const model = getState(state);
  const author = model.author;
  const id = Object.hasOwn(catalog, state.solution) ? state.solution : 'refactor';
  const run = model.runs[id];
  const dialog = panel.querySelector('[data-sl-dialog]');
  if (dialog) {
    dialog.showModal();
    dialog.addEventListener('cancel', event => { event.preventDefault(); run.status = 'setup'; api.render(); });
  }
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
      run.error = validateRun(id,run.values);
      if (!run.error) run.status = 'confirm';
      api.render();
      return;
    }
    const title = author.title.trim();
    const description = author.description.trim();
    if (!title || !description) { api.toast('Заполните название и описание решения.'); return; }
    author.id ||= `draft-${Date.now()}`;
    const draft = {id:author.id,title,description,scope:author.scope};
    const index = model.drafts.findIndex(item => item.id === author.id);
    if (index === -1) model.drafts.push(draft);
    else model.drafts[index] = draft;
    let persisted = true;
    try { localStorage.setItem(draftKey,JSON.stringify(model.drafts)); } catch { persisted = false; }
    Object.assign(author,{feedback:persisted ? 'Черновик сохранён в библиотеке.' : 'Черновик сохранён на время этой вкладки.',warning:!persisted});
    api.render();
  });
  panel.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.slSwitch) { api.runSolution(button.dataset.slSwitch); return; }
    if (button.dataset.slAuthor) {
      const method = button.dataset.slAuthor;
      if (method === 'chat') Object.assign(author,{title:'Аудит сценария продаж',description:'Проверяет структуру пакета продаж и отмечает дублирующие преобразования.',id:''});
      if (method === 'import') Object.assign(author,{title:'',description:'',id:''});
      Object.assign(author,{method,feedback:method === 'chat' ? 'Поля предложены по учебному разговору.' : '',warning:false});
      api.render();
      return;
    }
    if (button.dataset.slDraft) {
      const draft = model.drafts.find(item => item.id === button.dataset.slDraft);
      if (draft) Object.assign(author,draft,{method:'manual',feedback:'',warning:false});
      api.render();
      return;
    }
    switch (button.dataset.slAction) {
      case 'hub': api.navigate('hub'); return;
      case 'baseline-draft': run.baselineDraft = true; api.render(); return;
      case 'cancel-confirm': run.status = 'setup'; api.render(); return;
      case 'again': run.status = 'setup'; api.render(); return;
      case 'stop': clearInterval(run.timer); run.status = 'cancelled'; api.render(); return;
      case 'start': {
        run.status = 'running';
        run.stage = 0;
        run.timer = setInterval(() => {
          run.stage += 1;
          if (run.stage === statuses.length) { clearInterval(run.timer); run.status = 'done'; }
          if (state.page === 'runner' && (!state.solution || state.solution === id)) api.render();
        }, 600);
        api.render();
        return;
      }
      case 'download-report': download(`${id}-demo-report.json`,{is_demo:true,real_execution:false,solution:catalog[id].name,parameters:run.values,report:reportData(id,run.values)}); return;
      case 'manifest': {
        if (!author.title.trim() || !author.description.trim()) { api.toast('Заполните название и описание решения.'); return; }
        download('solution-manifest.demo.json',{schema_version:'proposal-0.1',is_demo:true,id:'local/draft',title:author.title,description:author.description,version:'0.1.0-draft',kind:'skill',status:'private_draft',entrypoint:'SKILL.md',permissions_requested:[],verification:{status:'not_verified'}});
      }
    }
  });
}
