// Iteration 6: create and publish your own skills and actions (В-34…В-40).
// A skill is text only (В-37). Own skills live in the app; publishing sends one for review (В-38).
// Every skill works while the agent works in Loginom (В-36, В-41). One from a file stays «из файла» even after
// editing: it is switched on only after the user agrees that Loginom did not check it.
import { icon } from './icons.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);

const origins = {
  app: { label:'Создан вами', loginom:true },
  chat: { label:'Из вашего разговора', loginom:true },
  file: { label:'Из файла', loginom:true, unverified:true },
};
// One set of words for the app and the moderation console; an action («действие») takes the neuter forms.
const pubWords = {
  confirm:['Ждёт подтверждения почты','Ждёт подтверждения почты'], review:['На проверке','На проверке'],
  community:['Опубликован · Сообщество','Опубликовано · Сообщество'], verified:['Опубликован · Проверено Loginom','Опубликовано · Проверено Loginom'],
  returned:['Возвращён автору','Возвращено автору'], withdrawn:['Снят с публикации','Снято с публикации'],
  revoked:['Отозван Loginom','Отозвано Loginom'], admin:['Сохранён для администратора','Сохранено для администратора'],
};
export function pubLabel(item, stage = item.publication?.stage) {
  return stage ? pubWords[stage][item.type === 'action' ? 1 : 0] : '';
}
// Stages after which the next send is a new version.
const resendStages = ['community','verified','withdrawn','returned','revoked'];
const actionBases = {
  document: { title:'Документировать', key:'document', solution:'document', icon:'book' },
  check: { title:'Проверить сценарий', key:'refactor:review', solution:'refactor', mode:'review', icon:'shield' },
};
const docFormats = [['pdf','PDF'],['docx','Word'],['md','Markdown']];
const checkGoals = ['Понятность структуры','Повторяющиеся преобразования','Названия и организация'];

const ruleSkill = {
  name:'Правила оформления сценариев',
  when:'Когда собираешь, проверяешь или улучшаешь сценарий Loginom',
  body:'1. Узлы называй по смыслу и по-русски: «Выручка по городам», а не «Узел14».\n2. Перед расчётом ставь проверку пустых значений.\n3. Денежные суммы — в тысячах рублей, два знака после запятой.\n4. Даты — в формате ДД.ММ.ГГГГ.\n5. В начале каждого модуля — заметка: что он делает и кто за него отвечает.',
};
const fileSamples = {
  zip: {
    file:'Описание для бизнеса.zip', name:'Описание пакета для бизнеса',
    when:'Когда нужно объяснить сценарий Loginom руководителю без технических подробностей',
    body:'Пиши для человека, который не открывал Loginom.\n1. Начни с одного предложения: какой вопрос бизнеса решает сценарий.\n2. Перечисли источники данных и как часто они обновляются.\n3. Опиши результат: что за таблица или отчёт и кто им пользуется.\n4. Технические названия узлов не используй.',
    files:[['SKILL.md',''],['шаблон-описания.md',''],['make_doc.py','программа — в навыке может быть только текст']],
  },
  md: {
    file:'SKILL.md', name:'Проверка выгрузок перед отправкой',
    when:'Когда сценарий выгружает данные в файл или базу',
    body:'Перед запуском выгрузки сверь число строк с источником и проверь, что в выгрузке нет пустых ключей. Если расхождение больше 1%, остановись и спроси.',
    files:[['SKILL.md','']],
  },
};
// What may leak from your files and conversations into a skill. «Убрать» removes just that place from the text.
const leakRules = [
  [/\/user(?:\/[^\s«»,.;:]+)*/g, 'путь в Loginom'],
  [/[\wА-Яа-яЁё-]+\.(?:csv|lgp|xlsx)\b/g, 'имя файла'],
  [/[А-ЯЁ][а-яё]+ [А-ЯЁ]\.(?:[А-ЯЁ]\.)?/g, 'имя сотрудника'],
  // Run 3 of the review: client data. Numbers count only next to their word, so years and counts are not data.
  [/[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:вич|вна|ична|инична)(?![а-яё])/g, 'ФИО'],
  [/[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:вич|вна|ична|инична)\s+[А-ЯЁ][а-яё]+(?![а-яё])/g, 'ФИО'],
  [/(?:\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g, 'телефон'],
  [/(?:паспорт|серия)[^\d\n]{0,12}\d{2}\s?\d{2}[^\d\n]{0,10}\d{6}\b/gi, 'паспорт'],
  [/(?<![А-Яа-яЁё])(?:ИНН|инн)\s*:?\s*\d{10}(?:\d{2})?\b/g, 'ИНН'],
  [/(?:сч[её]т|р\/с|л\/с)[^\d\n]{0,12}\d{20}\b/gi, 'номер счёта'],
  [/(?:карт[аеуы]?)[^\d\n]{0,12}(?:\d{4}[\s-]?){3}\d{4}\b/gi, 'номер карты'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, 'адрес почты'],
  [/(?:пароль|password|token|ключ)\s*[:=]\s*\S+/gi, 'пароль или ключ'],
];

export function ownState(state) {
  state.own ??= { items:[], editing:null, dialog:null, seq:41 };
  // A submission from another author keeps the moderation console from looking empty.
  state.own.foreign ??= [{
    id:'foreign-1', type:'skill', name:'Сводка продаж для маркетинга', when:'Когда готовишь сводку продаж для отдела маркетинга',
    body:'Группируй продажи по каналам привлечения. Показывай долю каждого канала и изменение к прошлому месяцу. Без технических деталей.',
    files:[['SKILL.md','']], origin:'app', status:'on', version:'1.0',
    publication:{ stage:'review', email:'m.petrova@example.org', receipt:'2026-1118-0040', sent:'Сегодня, 10:12' },
  }];
  return state.own;
}
function itemById(state, id) {
  const own = ownState(state);
  return own.items.find((item) => item.id === id) || own.foreign.find((item) => item.id === id);
}
export function ownCount(state) {
  return ownState(state).items.length;
}
function textOf(item, extra = '') {
  return [item.name, item.when, item.body, item.params?.custom, extra].filter(Boolean).join('\n');
}
export function leaksOf(item, extra = '') {
  const text = textOf(item, extra);
  return leakRules.flatMap(([re, label]) => [...new Set(text.match(re) || [])].map((match) => ({ match, label })));
}
// Removes one found place and tidies the phrase around it: quotes, a preposition left hanging, a stray full stop.
// Other found places stay; a line is dropped only when nothing is left of it.
function removeLeak(item, match, dialog) {
  const cut = (text) => text.split('\n').map((line) => cutLine(line, match)).filter((line) => line !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  item.name = cut(item.name);
  item.when = cut(item.when);
  item.body = cut(item.body);
  if (item.params) item.params.custom = cut(item.params.custom);
  if (dialog?.summary) dialog.summary = cut(dialog.summary);
}
function cutLine(line, match) {
  if (!line.includes(match)) return line;
  const mark = '\u0000';
  const out = line.split(match).join(mark)
    .replace(new RegExp('«' + mark + '»', 'g'), mark)
    .replace(new RegExp('\\s+(?:в|во|на|из|у|к|с|для|от)\\s+' + mark, 'gi'), mark)
    .split(mark).join('')
    .replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').replace(/[:,]\./g, '.').trim();
  // «Пример из разговора: …» with nothing left after the colon is dropped.
  const label = line.indexOf(':') > 0 ? line.slice(0, line.indexOf(':')) : '';
  if (!out.replace(/[.,;:!?\s]/g, '') || (label && out.replace(/[.:\s]+$/, '') === label)) return null;
  return out;
}
function canCannot(state, item) {
  if (item.type === 'action') {
    const base = actionBases[item.base];
    return [[`Запускать «${base.title}» с вашими настройками`],
      ['Добавлять шаги или права сверх встроенного действия', 'Менять пакет']];
  }
  // В-41: every skill works in Loginom too; one from a file only after the user agrees Loginom did not check it.
  return [
    ['Подсказывать агенту, как делать задачу, в том числе когда агент работает в Loginom'],
    ['Запускать программы — в навыке только текст', 'Давать агенту новые права'],
  ];
}
function permsBlock(state, item) {
  const [can, cannot] = canCannot(state, item);
  return '<div class="hub-perms own-perms"><div><h4>'+icon('check',16)+' Сможет</h4><ul>'+can.map((text) => '<li>'+esc(text)+'</li>').join('')+'</ul></div>'+
    '<div><h4>'+icon('close',16)+' Не сможет</h4><ul>'+cannot.map((text) => '<li>'+esc(text)+'</li>').join('')+'</ul></div></div>'+
    (item.type === 'action' ? '<p class="own-note">'+icon('help',15)+' Перед каждым запуском — шаг «Доступ», как у встроенного действия.</p>' : '');
}
// В-62: in the closed contour a skill from a file works only if the administrator allowed unverified skills.
// В-76: a strict organization's policy can turn own skills off altogether; by default they work (В-70). The demo
// policy of the prototype has the switch on, so the lock can be seen; «Инструкции» are not affected.
function ownSkillsOff(state) {
  return state.policy === 'set';
}
function blockedFile(state, item) {
  return item.type === 'skill' && ((state.contour === 'closed' && item.origin === 'file') || ownSkillsOff(state));
}
function blockedFileText(state, item) {
  if (ownSkillsOff(state) && item?.origin !== 'file') return 'Свои навыки выключил администратор вашей организации: агент их не применяет. «Инструкции» в настройках работают — агент следует им во всех разговорах. Если навык нужен — передайте его администратору.';
  return state.policy === 'set' ? 'Администратор вашей организации не разрешил навыки, которые Loginom не проверял: из файла и «Сообщество». Если навык нужен — передайте файл администратору.'
    : 'В закрытом контуре навыки, которые Loginom не проверял, — из файла и «Сообщество» — выключены, пока их не разрешит администратор. Если навык нужен — передайте файл администратору.';
}

function statusLine(item, blocked = false, byAdmin = true) {
  const action = item.type === 'action';
  const own = blocked ? (byAdmin ? 'Выключен администратором' : 'Выключен в закрытом контуре') : item.status === 'draft' ? 'Черновик' : item.status === 'on' ? (action ? 'Включено' : 'Включён') : (action ? 'Выключено' : 'Выключен');
  const pub = pubLabel(item);
  return '<span class="own-status own-'+(blocked ? 'off' : item.status)+'">'+own+'</span>'+
    (item.type === 'skill' && item.origin === 'file' ? '<span class="own-pub own-pub-review">Не проверен Loginom</span>' : '')+
    (pub ? '<span class="own-pub own-pub-'+item.publication.stage+'">'+esc(pub)+'</span>' : '');
}
function newItem(state, type, fields) {
  const own = ownState(state);
  return { id:'own-'+(++own.seq), type, name:'', when:'', body:'', files:[], origin:'app', status:'draft', version:'1.0', publication:null, ...fields };
}

// ——— «Создать своё» ———

export function renderCreate(state) {
  const own = ownState(state);
  const edit = own.editing;
  const back = '<button type="button" class="sl-back-link" data-own="to-mine">← Мои</button>';
  if (!edit) return '<div class="sl-page own-page">'+back+
    '<header class="sl-heading"><span class="sl-product">Каталог</span><h1>Создать своё</h1><p>Своё работает только у вас. Опубликовать для всех можно потом — после проверки Loginom.</p></header>'+
    '<div class="own-choose">'+
      '<button type="button" class="own-choice" data-own="new-skill"><span class="hub-tile hub-sage">'+icon('book',24)+'</span><strong>Навык</strong><small>Как агенту делать задачу: правила, порядок, термины. Агент применяет его сам, когда задача подходит. Правила для всех разговоров — в «Настройки» → «Инструкции».</small></button>'+
      '<button type="button" class="own-choice" data-own="new-action"><span class="hub-tile hub-lilac">'+icon('layers',24)+'</span><strong>Своё действие</strong><small>Встроенное действие с вашими настройками, например «Документировать» по шаблону отдела. Появится среди действий с пакетом.</small></button>'+
    '</div>'+(ownSkillsOff(state) ? '<p class="own-note">'+icon('lock',16)+' Свои навыки выключил администратор: навык можно составить и передать ему, но агент его не применит. «Инструкции» в настройках работают.</p>' : '')+'<p class="own-note">'+icon('help',16)+' Подключения к внешним сервисам и программы создать нельзя: в навыке может быть только текст.</p></div>';
  return edit.type === 'action' ? renderActionEditor(state, edit) : renderSkillEditor(state, edit);
}

function renderSkillEditor(state, edit) {
  const own = ownState(state);
  const item = edit.item;
  const saved = own.items.some((entry) => entry.id === item.id);
  const leaks = leaksOf(item);
  const sessions = state.sessions.filter((session) => session.phase === 'done' || (session.history || []).length);
  let source = '';
  if (!saved && edit.method === 'chat' && !edit.fromSession) source = '<section class="sl-panel"><h2>Из какого разговора</h2>'+
    (sessions.length ? '<div class="own-sessions">'+sessions.slice(0,6).map((session) => '<button type="button" class="sl-draft" data-own="from-session:'+esc(session.id)+'"><span><strong>'+esc(session.title)+'</strong><small>'+esc(session.date || '')+'</small></span><span>Выбрать →</span></button>').join('')+'</div>'
      : '<p class="muted">Завершённых разговоров пока нет. Начните с нуля или возьмите пример.</p><button type="button" class="btn" data-own="from-session:demo">Только для прототипа: пример разговора</button>')+'</section>';
  if (!saved && edit.method === 'file' && !edit.fromFile && state.contour === 'closed') source = '<section class="sl-panel"><h2>Из файла</h2><div class="sl-note sl-note-warn">'+icon('lock',16)+' '+blockedFileText(state)+'</div></section>';
  else if (!saved && edit.method === 'file' && !edit.fromFile) source = '<section class="sl-panel"><h2>Из файла</h2>'+
    '<label class="hub-drop"><input type="file" accept=".md,.zip,.loginom-skill" data-own-file aria-label="Выбрать файл навыка"><span class="hub-tile hub-clay">'+icon('upload',23)+'</span><strong>Выбрать SKILL.md, ZIP или файл навыка от коллеги</strong><small>Файл только читается: ничего из него не запускается.</small></label>'+
    '<div class="hub-demo"><span>Только для прототипа</span><div><button class="btn" data-own="sample:zip">Навык от коллеги (ZIP)</button><button class="btn" data-own="sample:md">SKILL.md</button></div></div></section>';
  const ready = saved || edit.method === 'app' || edit.fromSession || edit.fromFile;
  const intro = edit.fromSession ? '<div class="sl-note">'+icon('help',16)+' Агент составил черновик по разговору «'+esc(edit.fromSession)+'». Прочитайте его целиком: в разговор мог попасть чужой текст или данные из ваших файлов.</div>'
    : item.origin === 'file' ? '<div class="sl-note sl-note-warn">'+icon('alert',16)+' Навык из файла Loginom не проверял: прочитайте его перед включением. Правка этого не меняет — навык остаётся «из файла».</div>' : '';
  const files = item.files.length ? '<div class="own-files"><h3>Файлы навыка</h3><ul>'+item.files.map(([name, refused]) => '<li class="'+(refused ? 'refused' : '')+'">'+icon(refused ? 'close' : 'file',15)+' <span>'+esc(name)+(refused ? ' — <em>не принят: '+esc(refused)+'</em>' : '')+'</span></li>').join('')+'</ul></div>' : '';
  const form = ready ? '<section class="sl-panel"><form class="sl-form" data-own-form>'+intro+
    '<label class="sl-field"><span>Название</span><input name="name" maxlength="80" value="'+esc(item.name)+'" placeholder="Например, Правила оформления сценариев" required></label>'+
    '<label class="sl-field"><span>Когда агент его применяет</span><input name="when" maxlength="200" value="'+esc(item.when)+'" placeholder="Например, когда собираешь или проверяешь сценарий Loginom"><small>Агент читает эту строку и сам решает, нужен ли навык в разговоре.</small></label>'+
    '<label class="sl-field"><span>Что делать</span><textarea name="body" rows="9" placeholder="Правила, порядок действий, термины — обычным текстом">'+esc(item.body)+'</textarea></label>'+
    files+
    (item.origin === 'file' ? '<label class="own-consent"><input type="checkbox" data-own-ack'+(item.ack ? ' checked' : '')+'> Понимаю: Loginom этот навык не проверял, а агент будет следовать его указаниям. Результат проверю сам</label>' : '')+
    leaksBlock(leaks, 'Уберите, если навыком будут пользоваться другие.')+
    '<div class="sl-actions"><button type="submit" class="btn">'+(saved ? 'Сохранить' : 'Сохранить черновик')+'</button>'+
    (blockedFile(state, item) ? '</div><div class="sl-note sl-note-warn">'+icon('lock',16)+' '+blockedFileText(state, item)+'</div></form></section>'
      : '<button type="button" class="btn" data-own="try">'+icon('message',15)+' Попробовать</button>'+
        (item.status === 'on' ? '<button type="button" class="btn quiet" data-own="disable">Выключить</button>' : '<button type="button" class="btn primary" data-own="enable">Включить</button>')+'</div></form></section>') : '';
  return '<div class="sl-page own-page"><button type="button" class="sl-back-link" data-own="to-mine">← Мои</button>'+
    '<header class="sl-heading"><span class="sl-product">Навык · '+origins[item.origin].label+'</span><h1>'+(saved ? esc(item.name || 'Навык') : 'Новый навык')+'</h1><p>Навык подсказывает агенту, как делать задачу. Он работает только у вас, пока вы его не опубликуете.</p></header>'+
    (saved ? '' : '<div class="sl-switch" aria-label="Способ создания">'+[['chat','Из разговора'],['app','С нуля'],['file','Из файла']].map(([id, title]) => '<button type="button" class="sl-chip'+(edit.method === id ? ' is-active' : '')+'" data-own="method:'+id+'" aria-pressed="'+(edit.method === id)+'">'+title+'</button>').join('')+'</div>')+
    '<div class="sl-grid">'+(source || form)+
    '<aside class="sl-panel sl-permissions"><div class="sl-panel-head"><h2>Карточка навыка</h2>'+statusLine(item, blockedFile(state, item), state.policy === 'set')+'</div><h3>'+esc(item.name || 'Название навыка')+'</h3><p>'+esc(item.when || 'Когда агент его применяет')+'</p>'+permsBlock(state, item)+
    (saved && item.status !== 'draft' ? '<div class="sl-actions">'+publishButton(state, item)+'</div>' : saved ? '<p class="own-note">'+icon('help',15)+' Включённый навык работает только у вас. Опубликовать его для всех можно потом, отдельной кнопкой.</p>' : '')+'</aside></div>'+renderPublishDialog(state)+'</div>';
}

function leaksBlock(leaks, hint) {
  if (!leaks.length) return '';
  return '<div class="own-leaks"><h3>'+icon('alert',15)+' Похоже на личные данные или данные из ваших файлов</h3><p>'+hint+'</p><ul>'+
    leaks.map((leak) => '<li><code>'+esc(leak.match)+'</code> <small>'+leak.label+'</small> <button type="button" class="btn quiet" data-own-leak="'+esc(leak.match)+'">Убрать</button></li>').join('')+'</ul></div>';
}

function renderActionEditor(state, edit) {
  const own = ownState(state);
  const item = edit.item;
  const saved = own.items.some((entry) => entry.id === item.id);
  const base = actionBases[item.base];
  const params = item.base === 'document'
    ? '<fieldset class="sl-seg sl-multi"><legend>Формат документа</legend><div class="sl-seg-row">'+docFormats.map(([id, label]) => '<label><input type="checkbox" name="formats" value="'+id+'"'+(item.params.formats.includes(id) ? ' checked' : '')+'><span>'+(item.params.formats.includes(id) ? '✓ ' : '')+label+'</span></label>').join('')+'</div><small>Можно несколько — по документу на каждый формат</small></fieldset>'+
      '<label class="sl-field"><span>Какая документация нужна</span><textarea name="custom" rows="5" placeholder="Например: по шаблону отдела — назначение, источники, владелец, расписание обновления">'+esc(item.params.custom)+'</textarea><small>Агент напишет документ по этому описанию вместо стандартной структуры.</small></label>'
    : '<label class="sl-field"><span>На что обратить внимание</span><select name="goal">'+checkGoals.map((goal) => '<option'+(item.params.goal === goal ? ' selected' : '')+'>'+goal+'</option>').join('')+'</select></label>'+
      '<label class="sl-field"><span>Свои правила проверки</span><textarea name="custom" rows="5" placeholder="Например: узлы по-русски, проверка пустых значений перед расчётом">'+esc(item.params.custom)+'</textarea></label>';
  return '<div class="sl-page own-page"><button type="button" class="sl-back-link" data-own="to-mine">← Мои</button>'+
    '<header class="sl-heading"><span class="sl-product">Своё действие · на основе «'+base.title+'»</span><h1>'+(saved ? esc(item.name) : 'Новое действие')+'</h1><p>Встроенное действие с вашими настройками. Права и шаги — те же, что у «'+base.title+'».</p></header>'+
    '<div class="sl-grid"><section class="sl-panel"><form class="sl-form" data-own-form>'+
    (saved ? '' : '<label class="sl-field"><span>На основе</span><select name="base">'+Object.entries(actionBases).map(([id, entry]) => '<option value="'+id+'"'+(item.base === id ? ' selected' : '')+'>'+entry.title+'</option>').join('')+'</select></label>')+
    '<label class="sl-field"><span>Название</span><input name="name" maxlength="60" value="'+esc(item.name)+'" placeholder="Например, Документировать по шаблону отдела" required><small>Так действие будет называться в «Что сделать с пакетом» → «Ещё».</small></label>'+
    '<label class="sl-field"><span>Что делает</span><input name="when" maxlength="160" value="'+esc(item.when)+'" placeholder="Одна строка для списка действий"></label>'+params+
    leaksBlock(leaksOf(item), 'Уберите, если действием будут пользоваться другие.')+
    '<div class="sl-actions"><button type="submit" class="btn primary">'+(saved ? 'Сохранить' : 'Сохранить действие')+'</button>'+(saved ? '<button type="button" class="btn" data-own="run:'+item.id+'">'+icon('arrow',15)+' Запустить</button>' : '')+'</div></form></section>'+
    '<aside class="sl-panel sl-permissions"><div class="sl-panel-head"><h2>Карточка действия</h2>'+statusLine(item)+'</div><h3>'+esc(item.name || 'Название действия')+'</h3><p>'+esc(item.when || 'Что делает')+'</p>'+permsBlock(state, item)+
    (saved ? '<div class="sl-actions">'+publishButton(state, item)+'</div>' : '')+'</aside></div>'+renderPublishDialog(state)+'</div>';
}

function publishTitle(state, item) {
  if (state.contour === 'closed') return 'Передать администратору';
  return resendStages.includes(item.publication?.stage) ? 'Отправить новую версию' : 'Опубликовать для всех';
}
function publishButton(state, item) {
  const stage = item.publication?.stage;
  if (['confirm','review'].includes(stage)) return '';
  const closed = state.contour === 'closed';
  const label = publishTitle(state, item)+'…';
  return '<button type="button" class="btn" data-own="publish:'+item.id+'">'+icon(closed ? 'download' : 'upload',15)+' '+label+'</button>';
}

// ——— «Мои» in the catalog ———

export function renderMine(state) {
  const own = ownState(state);
  const closed = state.contour === 'closed';
  if (!own.items.length) return '<div class="own-scope"><div class="hub-empty"><span class="hub-tile hub-sand">'+icon('book',24)+'</span><h3>Здесь будут ваши навыки и действия</h3><p>Они работают только у вас. Опубликовать для всех можно потом.</p><button class="btn primary" data-own="create">'+icon('plus',16)+' Создать своё</button></div>'+renderPublishDialog(state)+'</div>';
  return '<div class="own-scope"><div class="own-list">'+own.items.map((item) => {
    const pub = item.publication;
    const note = pub?.stage === 'returned' ? '<p class="own-reason">'+icon('alert',14)+' Замечание проверяющего: «'+esc(pub.reason)+'». Исправьте и отправьте новую версию.</p>'
      : pub?.stage === 'revoked' ? '<p class="own-reason">'+icon('alert',14)+' Loginom отозвал эту версию: «'+esc(pub.reason)+'». У тех, кто её установил, она выключена.</p>'
        : pub?.stage === 'review' ? '<p class="own-receipt">Квитанция № '+esc(pub.receipt)+' · ответ придёт на '+esc(pub.email)+' и появится здесь</p>'
          : pub?.stage === 'confirm' ? '<p class="own-receipt">Письмо отправлено на '+esc(pub.email)+'. Откройте ссылку в письме — после этого начнётся проверка.</p>'
            : pub?.stage === 'community' && item.type === 'skill' ? '<p class="own-receipt">С отметкой «Сообщество» другие ставят навык, подтвердив, что Loginom его не проверял; в закрытом контуре — только если разрешил администратор.</p>'
              : pub?.stage === 'admin' ? '<p class="own-receipt">Файл «'+esc(pub.file)+'» сохранён — передайте его администратору</p>' : '';
    const confirm = pub?.stage === 'confirm' ? '<button class="btn quiet" data-own="resend:'+item.id+'">Отправить письмо ещё раз</button><button class="btn quiet" data-own="publish:'+item.id+'">Изменить почту</button><button class="btn quiet" data-own="confirm-mail:'+item.id+'">Только для прототипа: подтвердить</button>' : '';
    const deleting = own.confirmDelete === item.id;
    const blocked = blockedFile(state, item);
    return '<article class="own-row"><span class="hub-tile '+(item.type === 'action' ? 'hub-lilac' : 'hub-sage')+'">'+icon(item.type === 'action' ? actionBases[item.base].icon : 'book',21)+'</span>'+
      '<div class="own-row-main"><div class="own-row-title"><button class="hub-card-title" data-own="edit:'+item.id+'">'+esc(item.name || 'Без названия')+'</button>'+
      '<span class="hub-type">'+(item.type === 'action' ? 'Действие' : 'Навык')+'</span><span class="own-origin">'+(item.type === 'action' ? 'на основе «'+actionBases[item.base].title+'»' : origins[item.origin].label)+'</span></div>'+
      '<p>'+esc(item.when)+'</p><div class="own-row-status">'+statusLine(item, blockedFile(state, item), state.policy === 'set')+(item.version !== '1.0' || pub ? '<span class="own-version">версия '+esc(item.version)+'</span>' : '')+'</div>'+(blocked ? '<p class="own-reason">'+icon('lock',14)+' '+blockedFileText(state)+'</p>' : note)+'</div>'+
      '<div class="own-row-actions">'+
        (blocked ? '' : item.type === 'skill' ? (item.status === 'draft' ? '<button class="btn" data-own="enable:'+item.id+'">Включить</button>' : '<label class="own-toggle"><input type="checkbox" role="switch" data-own-toggle="'+item.id+'"'+(item.status === 'on' ? ' checked' : '')+'> Пользоваться</label>')
          +'<button class="btn quiet" data-own="try:'+item.id+'">Попробовать</button>' : '<button class="btn" data-own="run:'+item.id+'">Запустить '+icon('arrow',15)+'</button>')+
        '<button class="btn quiet" data-own="edit:'+item.id+'">Изменить</button>'+
        (item.status === 'draft' ? '' : publishButton(state, item).replace('class="btn"','class="btn quiet"'))+confirm+
        (pub && ['community','verified'].includes(pub.stage) && !closed ? '<button class="btn quiet" data-own="withdraw:'+item.id+'">Снять с публикации</button>' : '')+
        (closed ? '' : '<button class="btn quiet" data-own="export:'+item.id+'">Сохранить в файл</button>')+
        (deleting ? '<span class="own-confirm">'+(pub && ['community','verified'].includes(pub.stage) ? 'Удалить у себя? Опубликованная версия останется в каталоге — снять её можно кнопкой «Снять с публикации».' : 'Удалить насовсем?')+
          ' <button class="btn quiet" data-own="delete-yes:'+item.id+'">Удалить</button><button class="btn quiet" data-own="delete-no">Отмена</button></span>'
          : '<button class="btn quiet" data-own="delete:'+item.id+'">Удалить</button>')+
        (item.status === 'draft' && !blocked ? '<small class="own-hint">Включите, чтобы опубликовать</small>' : '')+
      '</div></article>';
  }).join('')+'</div><p class="own-note">'+icon('help',15)+(closed ? ' В закрытом контуре свой навык передают через администратора: «Передать администратору…» сохранит файл для него. Коллега сам навык из файла не включит.' : ' Свой навык, сохранённый в файл, у коллеги станет навыком «из файла»: перед включением коллега подтвердит, что Loginom его не проверял.')+'</p>'+renderPublishDialog(state)+'</div>';
}

function renderPublishDialog(state) {
  const own = ownState(state);
  const dialog = own.dialog;
  if (!dialog) return '';
  const item = itemById(state, dialog.id);
  const closed = state.contour === 'closed';
  const leaks = leaksOf(item, dialog.summary);
  const passwords = leaks.filter((leak) => leak.label === 'пароль или ключ');
  const personal = leaks.filter((leak) => leak.label !== 'пароль или ключ');
  const what = item.type === 'action' ? 'действие' : 'навык';
  let title = publishTitle(state, item);
  let body = '';
  let actions = '';
  const lines = item.body.split('\n').filter((line) => line.trim()).length;
  const outgoing = '<div class="own-outgoing"><h3>Что уйдёт</h3><ul>'+
    (item.type === 'action'
      ? '<li>'+icon('file',14)+' Действие: название, «что делает» и настройки «'+actionBases[item.base].title+'» — '+(item.base === 'document' ? 'форматы и описание документации' : 'на что смотреть и свои правила')+'</li>'
      : '<li>'+icon('file',14)+' Навык: название, «когда применять» и текст — '+lines+' '+plural(lines, 'строка', 'строки', 'строк')+'</li>'+
        item.files.filter(([name, refused]) => !refused && name !== 'SKILL.md').map(([name]) => '<li>'+icon('file',14)+' '+esc(name)+'</li>').join(''))+
    '<li>'+icon('file',14)+' Описание для каталога'+(closed ? '' : '; почта — только проверяющему')+'</li>'+
    '</ul><p>Не уйдут: ваши разговоры, пакеты, файлы проекта и настройки.</p></div>';
  if (dialog.step === 'form') {
    body = '<p class="hub-dialog-lead">'+(closed
      ? 'В закрытом контуре отправить в Loginom нельзя. Сохраните файл и передайте администратору — он добавит '+(item.type === 'action' ? 'действие' : 'навык')+' в каталог вашей организации.'
      : 'Сотрудник Loginom проверит '+what+' и опубликует его в каталоге. До этого его видите только вы.')+'</p>'+
      (!closed && item.type === 'skill' ? '<div class="own-marks"><h3>Что получат другие</h3><p>После проверки сотрудник поставит одну из отметок:</p><ul>'+
        '<li><strong>Проверено Loginom</strong> — другие ставят навык без дополнительных вопросов; он доступен и организациям в закрытом контуре.</li>'+
        '<li><strong>Сообщество</strong> — перед установкой человек подтверждает, что Loginom навык не проверял и он сам проверит результат; в закрытом контуре — только если разрешил администратор.</li></ul>'+
        '<p>С любой отметкой навык работает у других и тогда, когда агент работает в Loginom.</p></div>' : '')+
      '<label class="sl-field"><span>Описание для каталога</span><textarea data-own-pub="summary" rows="3">'+esc(dialog.summary ?? item.when)+'</textarea></label>'+
      '<p class="own-rule">'+icon('help',15)+' Другие смогут пользоваться '+(item.type === 'action' ? 'действием' : 'навыком')+' и менять свою копию под себя. Автором в каталоге всегда указаны вы.</p>'+
      (closed ? '' : '<label class="sl-field"><span>Почта для ответа</span><input type="email" data-own-pub="email" value="'+esc(dialog.email || '')+'" placeholder="you@example.org"><small>Пришлём письмо, чтобы подтвердить почту, и ответ после проверки. Пароль не нужен.</small></label>')+
      (dialog.error ? '<div class="sl-note sl-note-warn">'+icon('alert',16)+' '+esc(dialog.error)+'</div>' : '');
    actions = '<button class="btn quiet" data-own="dialog-close">Отмена</button><button class="btn primary" data-own="pub-check">Проверить</button>';
  }
  if (dialog.step === 'checks') {
    const checks = [
      ['Формат', 'в порядке', true],
      ['Только текст, без программ', item.files.some(([, refused]) => refused) ? 'программа не принята и не уйдёт' : 'в порядке', true],
      ['Пароли и ключи', passwords.length ? 'найдено: '+passwords.length : 'не найдены', !passwords.length],
      ['Личные данные и данные из ваших файлов', personal.length ? 'найдено: '+personal.length : 'не найдены', !personal.length],
    ];
    body = '<ul class="own-checks">'+checks.map(([name, text, ok]) => '<li class="'+(ok ? 'ok' : 'warn')+'">'+icon(ok ? 'check' : 'alert',15)+' <strong>'+name+'</strong> — '+text+'</li>').join('')+'</ul>'+
      leaksBlock(leaks, 'Уберите перед отправкой.')+
      outgoing+
      '<label class="own-consent"><input type="checkbox" data-own-pub="consent"'+(dialog.consent ? ' checked' : '')+'> '+(item.origin === 'file' ? 'Я автор этого навыка или автор разрешил мне его опубликовать' : 'Я автор и могу это публиковать')+'; здесь нет данных клиентов и паролей</label>';
    actions = '<button class="btn quiet" data-own="pub-back">Назад</button><button class="btn primary" data-own="pub-send"'+(leaks.length || !dialog.consent ? ' disabled' : '')+'>'+(closed ? icon('download',16)+' Сохранить файл' : 'Отправить на проверку')+'</button>';
  }
  if (dialog.step === 'confirm') {
    title = 'Подтвердите почту';
    body = '<p class="hub-dialog-lead">Мы отправили письмо на <strong>'+esc(item.publication.email)+'</strong>. Откройте ссылку в письме — после этого '+(item.type === 'action' ? 'действие' : 'навык')+' уйдёт на проверку. Подтверждать нужно один раз.</p>'+
      '<div class="hub-demo"><span>Только для прототипа</span><div><button class="btn" data-own="pub-confirm">Подтвердить почту</button></div></div>';
    actions = '<button class="btn quiet" data-own="dialog-close">Закрыть</button>';
  }
  if (dialog.step === 'sent') {
    title = closed ? 'Файл сохранён' : 'Отправлено на проверку';
    body = closed
      ? '<p class="hub-dialog-lead">Файл «'+esc(item.publication.file)+'» сохранён. Передайте его администратору: он проверит и добавит '+(item.type === 'action' ? 'действие' : 'навык')+' в каталог организации.</p>'
      : '<p class="hub-dialog-lead">Квитанция № <strong>'+esc(item.publication.receipt)+'</strong>. Статус — в «Моих»: приложение узнаёт его по квитанции, ответ придёт и на почту. Обычно проверка занимает несколько рабочих дней.</p>';
    actions = '<button class="btn primary" data-own="dialog-close">Готово</button>';
  }
  return '<dialog class="hub-dialog own-dialog" aria-labelledby="own-dialog-title"><header><h2 id="own-dialog-title">'+title+' · '+esc(item.name)+'</h2><button class="hub-close" data-own="dialog-close" aria-label="Закрыть">'+icon('close',19)+'</button></header>'+
    '<div class="hub-dialog-main">'+body+'</div><footer class="hub-dialog-footer">'+actions+'</footer></dialog>';
}

// Own actions in «Что сделать с пакетом» → «Ещё».
export function ownActionsGroup(state) {
  const list = ownState(state).items.filter((item) => item.type === 'action');
  if (!list.length) return '';
  return '<p class="pkg-section">Мои</p><div class="all-actions own-scope">'+list.map((item) => '<div class="all-action"><button class="all-action-main" data-own="run:'+item.id+'"><span class="glyph red">'+icon(actionBases[item.base].icon,17)+'</span>'+
    '<span><strong>'+esc(item.name)+'</strong><small>'+esc(item.when || 'На основе «'+actionBases[item.base].title+'»')+'</small></span></button></div>').join('')+'</div>';
}

// ——— Trial conversation ———

export function trialBanner(state) {
  const trial = state.trialSkill;
  if (!trial) return '';
  return '<div class="edit-banner own-trial own-scope">'+icon('book',15)+'<span>Проба навыка «'+esc(trial.name)+'» — '+(trial.status === 'draft' ? 'черновик включён только в этом разговоре' : trial.status === 'off' ? 'навык выключен, в этом разговоре включён для пробы' : 'агент применит его в этом разговоре')+'</span><button type="button" class="small-icon" data-own="trial-cancel" aria-label="Отменить пробу">'+icon('close',13)+'</button></div>';
}
export function trialResult(item) {
  const trial = item.trial || {};
  const back = '<div class="button-row own-scope"><button class="btn" data-own="edit:'+esc(trial.id)+'">'+icon('book',15)+' Вернуться к навыку</button></div>';
  const draftNote = trial.status === 'draft' ? '<p class="muted">Это проба: навык-черновик включён только в этом разговоре.</p>' : '';
  if (!trial.rules) return '<div class="answer-block"><h2>Ответил по навыку «'+esc(trial.name)+'»</h2><p>В прототипе ответ условный: в приложении агент выполнит задачу по тексту навыка и покажет в ленте шаг «Применил навык».</p>'+draftNote+back+'</div>';
  return '<div class="answer-block"><h2>По правилам навыка — 3 расхождения</h2><p>Проверил «Продажи.lgp» по навыку «'+esc(trial.name)+'». Пакет не менял.</p>'+
    '<ol class="findings"><li><strong>«Узел14»</strong> назван не по смыслу — например, «Выручка по городам».</li><li><strong>Нет проверки пустых значений</strong> перед расчётом выручки.</li><li><strong>В модуле нет заметки</strong> о том, что он делает и кто за него отвечает.</li></ol>'+
    draftNote+back+'</div>';
}

// ——— Moderation console (prototype only: a Loginom staff screen, not the analyst's) ———

const reviewChecks = [
  'Инструкции не просят обходить разрешения, скрывать действия или отправлять данные наружу',
  'Нет скрытого текста и ссылок на внешние программы',
  'Справочные файлы соответствуют описанию',
  'Попробовал на примере: агент делает то, что обещано',
];
export function renderModeration(state) {
  const own = ownState(state);
  const all = [...own.items, ...own.foreign].filter((item) => item.publication && item.publication.stage !== 'admin');
  const queue = all.filter((item) => item.publication.stage === 'review');
  const published = all.filter((item) => ['community','verified'].includes(item.publication.stage));
  const mod = own.mod ??= {};
  return '<div class="sl-page own-page own-console"><header class="sl-heading"><span class="sl-product own-proto">Только для прототипа · служебная консоль Loginom, аналитик её не видит</span><h1>Консоль модерации</h1>'+
    '<p>Очередь навыков и действий, отправленных на проверку. Решение сразу видно автору в «Моих» и уходит письмом; одобренное попадает в подписанный каталог.</p></header>'+
    '<h2 class="rv-heading">На проверке · '+queue.length+'</h2>'+
    (queue.length ? queue.map((item) => {
      const checks = mod[item.id] ??= [];
      const all4 = checks.length === reviewChecks.length;
      return '<article class="sl-panel own-review"><div class="sl-panel-head"><h3>'+esc(item.name)+'</h3><span class="hub-type">'+(item.type === 'action' ? 'Действие' : 'Навык')+'</span></div>'+
        '<p class="own-receipt">Версия '+esc(item.version)+' · '+esc(item.publication.email)+' · квитанция № '+esc(item.publication.receipt)+(item.origin === 'file' ? ' · добавлен из файла — проверьте, не копия ли это чужого навыка' : '')+'</p>'+
        '<ul class="own-checks"><li class="ok">'+icon('check',15)+' Автоматические проверки пройдены: формат, только текст, нет паролей и данных из файлов</li></ul>'+
        '<p><strong>Описание для каталога:</strong> '+esc(item.publication.summary || item.when)+'</p><details open><summary>Текст '+(item.type === 'action' ? 'действия' : 'навыка')+'</summary><p><strong>'+(item.type === 'action' ? 'Что делает' : 'Когда применять')+':</strong> '+esc(item.when)+'</p><pre class="own-body">'+esc(item.body || (item.params?.custom ?? ''))+'</pre></details>'+
        '<fieldset class="own-review-checks"><legend>Перед отметкой «Проверено Loginom»</legend>'+reviewChecks.map((text, index) => '<label><input type="checkbox" data-mod-check="'+item.id+':'+index+'"'+(checks.includes(index) ? ' checked' : '')+'> '+text+'</label>').join('')+'</fieldset>'+
        '<label class="sl-field"><span>Замечание автору (если возвращаете)</span><textarea rows="2" data-mod-reason="'+item.id+'">'+esc(mod['r-'+item.id] || '')+'</textarea></label>'+
        '<div class="sl-actions"><button class="btn" data-mod="community:'+item.id+'">Опубликовать в «Сообществе»</button><button class="btn primary" data-mod="verified:'+item.id+'"'+(all4 ? '' : ' disabled title="Отметьте все пункты проверки"')+'>Опубликовать как «Проверено Loginom»</button><button class="btn quiet" data-mod="returned:'+item.id+'">Вернуть автору</button></div></article>';
    }).join('') : '<div class="hub-empty"><h3>Очередь пуста</h3><p>Отправьте свой навык из «Моих» — он появится здесь.</p></div>')+
    (published.length ? '<h2 class="rv-heading">Опубликовано</h2>'+published.map((item) => '<article class="sl-panel own-review"><div class="sl-panel-head"><h3>'+esc(item.name)+'</h3><span class="own-pub own-pub-'+item.publication.stage+'">'+pubLabel(item)+'</span></div>'+
      '<label class="sl-field"><span>Причина отзыва</span><input data-mod-revoke="'+item.id+'" value="'+esc(mod['v-'+item.id] || '')+'" placeholder="Например, найдена инструкция, которая обходит разрешения"></label>'+
      '<div class="sl-actions"><button class="btn quiet danger" data-mod="revoked:'+item.id+'">Отозвать версию</button></div></article>').join('') : '')+
    '<p class="own-note">'+icon('help',15)+' Что сотрудник проверяет перед «Проверено Loginom» — предложение; ждёт решения владельца.</p></div>';
}

// ——— Events ———

// Pages re-render into fresh elements: listeners go on each new own block, never on the app root.
export function bindOwn(root, state, api) {
  for (const scope of root.querySelectorAll('.own-page, .own-scope')) bindScope(scope, state, api);
}
function bindScope(root, state, api) {
  const own = ownState(state);
  toastHook = api.toast;
  const dialog = root.querySelector('.own-dialog');
  if (dialog && !dialog.open) {
    dialog.showModal();
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); own.dialog = null; api.render(); });
  }
  const form = root.querySelector('[data-own-form]');
  const readForm = () => {
    if (!form || !own.editing) return;
    const item = own.editing.item;
    const data = new FormData(form);
    for (const key of ['name','when','body']) if (data.has(key)) item[key] = String(data.get(key));
    if (item.type === 'action') {
      if (data.has('base')) item.base = String(data.get('base'));
      if (data.has('custom')) item.params.custom = String(data.get('custom'));
      if (data.has('goal')) item.params.goal = String(data.get('goal'));
      if (form.querySelector('[name="formats"]')) item.params.formats = data.getAll('formats').map(String);
    }
  };
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (target.matches('[data-own-ack]')) { item0().ack = target.checked; return; }
    if (target.closest('[data-own-form]')) {
      readForm();
      if (target.name === 'base') { item0().params = defaultParams(item0().base); api.render(); }
      if (target.name === 'formats') api.render();
      return;
    }
    const pub = target.dataset.ownPub;
    if (pub && own.dialog) {
      own.dialog[pub] = target.type === 'checkbox' ? target.checked : target.value;
      if (pub === 'consent') api.render();
    }
    if (target.dataset.modCheck) {
      const [id, index] = target.dataset.modCheck.split(':');
      const list = (own.mod ??= {})[id] ??= [];
      own.mod[id] = target.checked ? [...new Set([...list, Number(index)])] : list.filter((value) => value !== Number(index));
      api.render();
    }
    if (target.dataset.modReason) (own.mod ??= {})['r-'+target.dataset.modReason] = target.value;
    if (target.dataset.modRevoke) (own.mod ??= {})['v-'+target.dataset.modRevoke] = target.value;
    if (target.dataset.ownToggle) {
      const item = itemById(state, target.dataset.ownToggle);
      item.status = target.checked ? 'on' : 'off';
      api.toast(item.status === 'on' ? 'Навык включён' : 'Навык выключен');
      api.render();
    }
  });
  const item0 = () => own.editing.item;
  root.addEventListener('change', (event) => {
    const input = event.target.closest('[data-own-file]');
    if (!input?.files?.[0]) return;
    const file = input.files[0];
    // A catalog file is not a skill of one's own: send the user to the import that checks the signature.
    if (file.name.toLowerCase().endsWith('.loginom-hub')) return api.toast('Это файл каталога Loginom — откройте «Каталог» → «Импорт из файла»: там проверяется подпись.');
    if (file.name.toLowerCase().endsWith('.zip')) return loadSample('zip', file.name);
    file.text().then((text) => {
      const yaml = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
      const name = yaml.match(/^name:\s*(.+)$/m)?.[1] ?? text.match(/^#\s+(.+)$/m)?.[1] ?? file.name.replace(/\.md$/i, '');
      const when = yaml.match(/^description:\s*(.+)$/m)?.[1] ?? '';
      const body = text.replace(/^---[\s\S]*?---\s*/, '').trim();
      Object.assign(item0(), { name:name.trim(), when:when.trim(), body, files:[[file.name, '']], origin:'file' });
      own.editing.fromFile = file.name;
      api.render();
    });
  });
  const loadSample = (key, fileName) => {
    const sample = fileSamples[key];
    Object.assign(item0(), { name:sample.name, when:sample.when, body:sample.body, files:sample.files, origin:'file' });
    own.editing.fromFile = fileName || sample.file;
    api.render();
  };
  root.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-own-form]')) return;
    event.preventDefault();
    readForm();
    const item = item0();
    if (!ready(item)) return;
    if (!own.items.includes(item)) own.items.unshift(item);
    // A saved action is ready to run; a skill stays a draft until it is switched on.
    if (item.type === 'action') item.status = 'on';
    api.toast(item.type === 'action' ? 'Действие сохранено — оно в «Моих» и в «Что сделать с пакетом» → «Ещё»' : 'Черновик сохранён — он в «Моих»');
    api.render();
  });
  root.addEventListener('click', (event) => {
    const leak = event.target.closest('[data-own-leak]');
    if (leak) {
      readForm();
      removeLeak(own.dialog ? itemById(state, own.dialog.id) : item0(), leak.dataset.ownLeak, own.dialog);
      api.render();
      return;
    }
    const mod = event.target.closest('[data-mod]');
    if (mod) return moderate(state, api, ...mod.dataset.mod.split(':'));
    const button = event.target.closest('[data-own]');
    if (!button) return;
    const [action, value] = button.dataset.own.split(':');
    readForm();
    if (action === 'create' || action === 'to-create') { own.editing = null; return api.navigate('studio'); }
    if (action === 'to-mine') { own.editing = null; return api.openMine(); }
    if (action === 'new-skill') own.editing = { type:'skill', method:'chat', item:newItem(state, 'skill', {}) };
    if (action === 'new-action') own.editing = { type:'action', item:newItem(state, 'action', { base:'document', params:defaultParams('document') }) };
    if (action === 'method') {
      own.editing.method = value;
      own.editing.fromSession = own.editing.fromFile = null;
      Object.assign(item0(), { name:'', when:'', body:'', files:[], origin:value === 'file' ? 'file' : value === 'chat' ? 'chat' : 'app' });
    }
    if (action === 'from-session') fillFromSession(own.editing, state.sessions.find((entry) => entry.id === value));
    if (action === 'sample') return loadSample(value);
    if (action === 'edit') {
      const item = itemById(state, value);
      if (!item) { api.toast('Навык удалён', 'alert'); return; }
      own.editing = { type:item.type, method:item.origin, item };
      return api.navigate('studio');
    }
    if (action === 'enable') {
      const item = value ? itemById(state, value) : item0();
      if (blockedFile(state, item)) return api.toast(blockedFileText(state, item), 'alert');
      if (!ready(item, true)) return;
      if (!own.items.includes(item)) own.items.unshift(item);
      item.status = 'on';
      api.toast('Навык включён — агент применит его, когда задача подойдёт');
    }
    if (action === 'disable') {
      item0().status = 'off';
      api.toast('Навык выключен — агент его не применяет');
    }
    if (action === 'try') {
      const item = value ? itemById(state, value) : item0();
      if (blockedFile(state, item)) return api.toast(blockedFileText(state, item), 'alert');
      if (!ready(item)) return;
      if (!own.items.includes(item)) own.items.unshift(item);
      own.editing = null;
      return api.startTrial(trialOf(item), trialOf(item).prompt);
    }
    if (action === 'trial-cancel') {
      if (state.draft === state.trialSkill?.prompt) state.draft = '';
      state.trialSkill = null;
      return api.render();
    }
    if (action === 'run') {
      const item = itemById(state, value);
      const base = actionBases[item.base];
      return api.runOwnAction({ key:base.key, solution:base.solution, mode:base.mode, name:item.name, baseTitle:base.title,
        values:item.base === 'document' ? { formats:item.params.formats.length ? item.params.formats : ['pdf'], depth:item.params.custom.trim() ? 'custom' : 'full', custom:item.params.custom } : { goal:item.params.goal } });
    }
    if (action === 'publish') {
      const item = itemById(state, value);
      if (!ready(item, true)) return;
      own.dialog = { id:item.id, step:'form', summary:item.publication?.summary ?? item.when, email:item.publication?.email || own.email || '' };
    }
    if (action === 'dialog-close') own.dialog = null;
    if (action === 'pub-back') own.dialog.step = 'form';
    if (action === 'pub-check') {
      const closed = state.contour === 'closed';
      if (!closed && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(own.dialog.email || '')) { own.dialog.error = 'Укажите почту — на неё придёт ответ после проверки.'; return api.render(); }
      own.dialog.error = '';
      own.dialog.step = 'checks';
    }
    if (action === 'pub-send') {
      const item = itemById(state, own.dialog.id);
      const closed = state.contour === 'closed';
      const bump = resendStages.includes(item.publication?.stage);
      if (bump) item.version = (Number(item.version) + 0.1).toFixed(1);
      if (closed) {
        const file = item.name.replace(/[\\/:*?"<>|]/g, '') + (item.type === 'action' ? '.loginom-action' : '.loginom-skill');
        download(file, item);
        item.publication = { stage:'admin', file };
        own.dialog.step = 'sent';
        return api.render();
      }
      own.email = own.dialog.email;
      // Assumption (on «Что решить»): no account — the app keeps the receipt and asks the service by it.
      const confirmed = (own.confirmedMails ??= []).includes(own.dialog.email);
      item.publication = { stage:confirmed ? 'review' : 'confirm', email:own.dialog.email, receipt:'2026-1118-00'+(++own.seq), summary:own.dialog.summary, sent:'Сейчас' };
      own.dialog.step = confirmed ? 'sent' : 'confirm';
      return api.render();
    }
    // The address is confirmed once: everything waiting for it goes to review.
    if (action === 'pub-confirm' || action === 'confirm-mail') {
      const email = itemById(state, action === 'pub-confirm' ? own.dialog.id : value).publication.email;
      (own.confirmedMails ??= []).push(email);
      for (const item of own.items) if (item.publication?.stage === 'confirm' && item.publication.email === email) item.publication.stage = 'review';
      if (own.dialog) own.dialog.step = 'sent';
      else api.toast('Почта подтверждена — проверка началась');
    }
    if (action === 'resend') api.toast('Письмо отправлено ещё раз на ' + itemById(state, value).publication.email);
    if (action === 'withdraw') {
      itemById(state, value).publication.stage = 'withdrawn';
      api.toast('Снят с публикации: новые пользователи его не увидят, у установивших он останется');
    }
    if (action === 'export') {
      const item = itemById(state, value);
      download(item.name.replace(/[\\/:*?"<>|]/g, '') + (item.type === 'action' ? '.loginom-action' : '.loginom-skill'), item);
      api.toast(item.type === 'action' ? 'Файл действия сохранён' : 'Файл сохранён. У коллеги навык будет «из файла»: перед включением он подтвердит, что Loginom его не проверял');
      return;
    }
    if (action === 'delete') own.confirmDelete = value;
    if (action === 'delete-no') own.confirmDelete = null;
    if (action === 'delete-yes') {
      own.items = own.items.filter((item) => item.id !== value);
      own.confirmDelete = null;
      api.toast('Удалено');
    }
    api.render();
  });
}

// A name and the «когда» line are required: the agent decides by that line whether the skill fits.
function ready(item, needWhen = false) {
  if (!item.name.trim()) return warn('Укажите название');
  if (needWhen && item.type === 'skill' && !item.when.trim()) return warn('Заполните «Когда агент его применяет» — по этой строке агент решает, нужен ли навык');
  if (needWhen && item.origin === 'file' && !item.ack) return warn('Отметьте, что понимаете: Loginom этот навык не проверял');
  return true;
  function warn(text) { toastHook?.(text, 'alert'); return false; }
}
let toastHook = null;
// The trial task depends on the skill: rules are checked on a package; other skills get a task in their name.
function trialOf(item) {
  const rules = /узл/i.test(item.body) && /назыв/i.test(item.body);
  const prompt = rules ? 'Проверь «Продажи.lgp» по правилам навыка' : 'Сделай задачу по навыку «'+item.name+'» для «Продажи.lgp»';
  return { id:item.id, name:item.name, origin:item.origin, status:item.status, rules, prompt, kind:'skilltrial' };
}
// The agent drafts a skill from the conversation. The prototype has one scripted draft per kind of task.
const drafts = {
  abc: { name:'ABC-анализ по правилам отдела', when:'Когда строишь ABC-анализ товаров по выручке',
    body:'1. Выручка — сумма продаж по товару за период.\n2. Пороги накопленной доли: A — 80 %, B — 15 %, C — 5 %.\n3. Итог сохраняй новым пакетом, исходные данные не меняй.' },
  quality: { name:'Проверка выгрузки перед загрузкой', when:'Когда проверяешь таблицу на пропуски и дубликаты',
    body:'1. Пропуски считай по каждому столбцу.\n2. Дубликат — полное совпадение строки, если не сказано иначе.\n3. В отчёте перечисли столбцы, которые нужно проверить перед загрузкой.' },
  document: { name:'Описание пакета по шаблону отдела', when:'Когда документируешь пакет Loginom',
    body:'1. Начни с назначения сценария одним предложением.\n2. Перечисли источники данных и владельца.\n3. Для каждого модуля — что он делает и что получает на выходе.' },
};
function fillFromSession(editing, session) {
  const kind = session ? (['refactor','improve','clean'].includes(session.kind) ? 'rules' : session.kind) : 'rules';
  const file = session?.files?.[0];
  const draft = kind === 'rules' ? ruleSkill : drafts[kind];
  const example = !session ? '\n\nПример из разговора: в «Продажи.lgp» Иванов А. просил переименовать «Узел14» и сохранить копию в /user/Продажи.'
    : file ? `\n\nПример из разговора: «${file}» в /user.` : '';
  Object.assign(editing.item, draft
    ? { ...draft, origin:'chat', body:draft.body + example }
    : { name:session.title, when:'Когда задача похожа на «'+session.title+'»', body:'Опишите, как агенту делать такие задачи: порядок, правила, что проверить в конце.', origin:'chat' });
  editing.fromSession = session ? session.title : 'Проверка сценария продаж';
}
// «Сохранить как навык» under an answer in the conversation.
export function startFromSession(state, session) {
  const own = ownState(state);
  own.editing = { type:'skill', method:'chat', item:newItem(state, 'skill', {}) };
  fillFromSession(own.editing, session);
}
// Starting points for the paths on «Что решить».
export function demoOwn(state, api, kind) {
  const own = ownState(state);
  if (kind === 'chat' || kind === 'file') {
    own.editing = { type:'skill', method:kind, item:newItem(state, 'skill', { origin:kind }) };
    return api.navigate('studio');
  }
  if (kind === 'action') {
    own.editing = { type:'action', item:newItem(state, 'action', { base:'document', params:defaultParams('document') }) };
    return api.navigate('studio');
  }
  if (kind === 'moderation') return api.navigate('moderation');
  let demo = own.items.find((item) => item.demo || item.name === ruleSkill.name);
  if (!demo) {
    demo = newItem(state, 'skill', { ...ruleSkill, origin:'chat', status:'on', demo:true });
    own.items.unshift(demo);
  }
  if (kind === 'trial') return api.startTrial(trialOf(demo), trialOf(demo).prompt);
  return api.openMine();
}
function plural(count, one, few, many) {
  const tail = count % 100;
  if (tail > 10 && tail < 20) return many;
  return [many, one, few, few, few, many, many, many, many, many][count % 10];
}
function defaultParams(base) {
  return base === 'document' ? { formats:['pdf'], custom:'' } : { goal:checkGoals[0], custom:'' };
}
function moderate(state, api, decision, id) {
  const own = ownState(state);
  const item = itemById(state, id);
  const key = (decision === 'revoked' ? 'v-' : 'r-') + id;
  const reason = ((own.mod ??= {})[key] || '').trim();
  if ((decision === 'returned' || decision === 'revoked') && !reason) { api.toast('Напишите причину — её увидит автор', 'alert'); return; }
  item.publication.stage = decision;
  item.publication.reason = reason;
  // Notes belong to one decision on one version.
  delete own.mod['r-'+id];
  delete own.mod['v-'+id];
  delete own.mod[id];
  api.toast({ community:'Опубликовано в «Сообществе»', verified:'Опубликовано как «Проверено Loginom»', returned:'Возвращено автору с замечанием', revoked:'Версия отозвана: у установивших она выключится' }[decision]);
  api.render();
}
function download(name, item) {
  const text = '---\nname: ' + item.name + '\ndescription: ' + item.when + '\n---\n\n' + (item.body || item.params?.custom || '') + '\n';
  const url = URL.createObjectURL(new Blob([text], { type:'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
