const releases = [
  {id:'refactor',name:'Scenario Refactor',keywords:'рефакторинг оптимизация улучшить',type:'Решение',icon:'flow',color:'sage',version:'1.0.0',offline:true,runner:true,description:'Найдите узкие места в сценарии и просмотрите предложенные правки.'},
  {id:'regression',name:'Regression Studio',keywords:'регрессия регрессионные проверки',type:'Решение',icon:'shield',color:'blue',version:'1.0.0',offline:true,runner:true,description:'Сравните результаты с эталоном перед изменением сценария.'},
  {id:'migration',name:'Migration Bridge',keywords:'перенос совместимость миграция запрос SQL',type:'Решение',icon:'link',color:'clay',version:'1.0.0',offline:true,runner:true,description:'Перенесите SQL-запрос в граф Loginom и проверьте результат на тестовой выборке.'},
  {id:'tournament',name:'Scenario Tournament',keywords:'турнир сравнение сценариев',type:'Решение',icon:'chart',color:'sand',version:'1.0.0',offline:true,runner:true,description:'Сравните несколько сценариев по выбранным критериям и входным данным.'},
  {id:'quality',name:'Проверка качества данных',type:'Навык',icon:'shield',color:'sage',version:'1.3.0',offline:true,description:'Найдите пропуски, дубликаты и выбросы до расчёта показателей.',prompt:'Проверь качество входной таблицы в Loginom и предложи план очистки.'},
  {id:'loads',name:'Контроль полноты загрузок',type:'Шаблон',icon:'flow',color:'clay',version:'1.0.0',offline:true,description:'Сверьте количество строк и ключи по каждому источнику.',prompt:'Создай сценарий Loginom для контроля полноты загрузок по источникам.'},
  {id:'profile',name:'Профилирование таблиц',type:'Пакет Loginom',icon:'table',color:'blue',version:'2.1.0',offline:true,description:'Профиль полей, распределения и сводка по типам данных.',prompt:'Подготовь к открытию демонстрационный пакет профилирования таблиц.'},
  {id:'abc',name:'ABC-анализ продаж',type:'Шаблон',icon:'chart',color:'sand',version:'1.2.0',offline:true,description:'Распределите товары по вкладу в выручку и сохраните сценарий.',prompt:'Построй в Loginom сценарий ABC-анализа товаров по выручке.'},
  {id:'help',name:'Справка Loginom',type:'База знаний',icon:'book',color:'lilac',version:'2026.11',offline:true,description:'Руководство по узлам, функциям и работе со сценариями.'},
  {id:'cloud',name:'Внешнее обогащение данных',type:'Интеграция',icon:'link',color:'blue',version:'1.0.0',offline:false,community:true,description:'Дополните записи данными из внешнего сервиса.'},
];

const tabs = [['catalog','Каталог'],['installed','Моя библиотека'],['updates','Обновления'],['history','История']];
const defaultSelection = ['quality','loads','profile'];
const archiveName = 'loginom-hub-analytics-2026.11.loginom-hub';
const iconPaths = {
  hub:'M5 7.5 12 3l7 4.5v9L12 21l-7-4.5v-9Z M5 7.5l7 4.5 7-4.5 M12 12v9',
  shield:'M12 22s7-3 7-10V6l-7-3-7 3v6c0 7 7 10 7 10Z M9 12l2 2 4-4',
  flow:'M5 5h5v5H5z M14 14h5v5h-5z M7.5 10v6.5H14 M14 5h5v5h-5z M16.5 10v4',
  table:'M4 5h16v14H4z M4 10h16 M10 10v9',
  chart:'M4 5v14h16 M8 15v-3 M12 15V8 M16 15v-5',
  book:'M12 7C10 5 7 5 4 5v14c3 0 6 0 8 2 2-2 5-2 8-2V5c-3 0-6 0-8 2Zm0 0v14',
  link:'M10 14l4-4 M9 16l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0 M15 8l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0',
  download:'M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4',
  upload:'M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4',
  archive:'M4 5h16v4H4z M6 9v11h12V9 M10 13h4',
  lock:'M6 10h12v10H6z M8 10V7a4 4 0 0 1 8 0v3 M12 14v2',
  arrow:'M4 12h15m-6-6 6 6-6 6',
  check:'m5 12 4 4 10-10',
  close:'m6 6 12 12M18 6 6 18',
  search:'M20 20l-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  alert:'M12 3 2 20h20L12 3Zm0 5v5m0 3v.1',
  clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v6l3 2',
  file:'M6 3h7l5 5v13H6z M13 3v6h5 M9 14h6 M9 17h6',
  star:'m12 3 2.8 5.8 6.4 1-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L3 9.8l6.4-1L12 3Z',
  plus:'M12 5v14M5 12h14',
};
const icon = (name,size = 18) => '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+iconPaths[name]+'"/></svg>';
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8',{fatal:true});
const crcTable = Array.from({length:256},(_,index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value;
});
function checksum(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

export function createDemoArchive(ids = defaultSelection, compatible = true) {
  const pieces = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  const items = releases.filter(item => item.offline && ids.includes(item.id));
  const manifest = {
    format:'loginom-hub-demo-v1', name:'Аналитика и качество данных', publisher:'Loginom · демо',
    release:'2026.11', minAgent:compatible ? '0.5.0' : '0.7.0', minLoginom:'7.4.2',
    items:items.map(item => ({id:item.id,version:item.version})),
  };
  const files = [
    ['manifest.json', JSON.stringify(manifest, null, 2)],
    ...items.map(item => ['items/'+item.id+'.json', JSON.stringify({title:item.name,version:item.version,demo:true},null,2)]),
  ];
  for (const [path, value] of files) {
    const name = encoder.encode(path);
    const data = encoder.encode(value);
    const crc = checksum(data);
    const header = new ArrayBuffer(30);
    const headerView = new DataView(header);
    headerView.setUint32(0,0x04034b50,true);
    headerView.setUint16(4,20,true);
    headerView.setUint16(12,0x5d6f,true);
    headerView.setUint32(14,crc,true);
    headerView.setUint32(18,data.length,true);
    headerView.setUint32(22,data.length,true);
    headerView.setUint16(26,name.length,true);
    pieces.push(header,name,data);
    const entry = new ArrayBuffer(46);
    const entryView = new DataView(entry);
    entryView.setUint32(0,0x02014b50,true);
    entryView.setUint16(4,20,true);
    entryView.setUint16(6,20,true);
    entryView.setUint16(14,0x5d6f,true);
    entryView.setUint32(16,crc,true);
    entryView.setUint32(20,data.length,true);
    entryView.setUint32(24,data.length,true);
    entryView.setUint16(28,name.length,true);
    entryView.setUint32(42,offset,true);
    directory.push(entry,name);
    directorySize += 46 + name.length;
    offset += 30 + name.length + data.length;
  }
  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  endView.setUint32(0,0x06054b50,true);
  endView.setUint16(8,files.length,true);
  endView.setUint16(10,files.length,true);
  endView.setUint32(12,directorySize,true);
  endView.setUint32(16,offset,true);
  return new Blob([...pieces,...directory,end],{type:'application/zip'});
}

// shortcut: accepts only uncompressed archives produced by this prototype, until a signed production importer exists.
export async function inspectDemoArchive(file) {
  if (file.size > 2_000_000) throw Error('Демонстрационный пакет превышает 2 МБ.');
  const data = await file.arrayBuffer();
  if (data.byteLength < 22) throw Error('Файл повреждён. Выберите другой пакет.');
  const view = new DataView(data);
  const end = data.byteLength - 22;
  const files = new Map();
  if (view.getUint32(end,true) !== 0x06054b50) throw Error('Файл повреждён или имеет другой формат.');
  const directory = view.getUint32(end+16,true);
  const count = view.getUint16(end+10,true);
  let offset = 0;
  let entryOffset = directory;
  if (!count || count > releases.length+1 || directory >= end || directory+view.getUint32(end+12,true) !== end) {
    throw Error('Не удалось прочитать состав пакета.');
  }
  for (let index = 0; index < count; index++) {
    if (offset+30 > directory || view.getUint32(offset,true) !== 0x04034b50 || view.getUint16(offset+6,true) || view.getUint16(offset+8,true)) {
      throw Error('Поддерживаются ZIP-пакеты, собранные в демонстрации.');
    }
    const size = view.getUint32(offset+18,true);
    const nameLength = view.getUint16(offset+26,true);
    const start = offset+30+nameLength+view.getUint16(offset+28,true);
    if (start+size > directory) throw Error('Целостность пакета нарушена.');
    const name = decoder.decode(new Uint8Array(data,offset+30,nameLength));
    const bytes = new Uint8Array(data,start,size);
    const crc = view.getUint32(offset+14,true);
    if (files.has(name) || checksum(bytes) !== crc) throw Error('Целостность пакета нарушена.');
    const nextEntry = entryOffset+46+nameLength;
    if (nextEntry > end || view.getUint32(entryOffset,true) !== 0x02014b50 ||
      view.getUint32(entryOffset+16,true) !== crc || view.getUint32(entryOffset+42,true) !== offset ||
      view.getUint16(entryOffset+28,true) !== nameLength ||
      decoder.decode(new Uint8Array(data,entryOffset+46,nameLength)) !== name) {
      throw Error('Оглавление архива повреждено.');
    }
    files.set(name, bytes);
    entryOffset = nextEntry;
    offset = start+size;
  }
  if (offset !== directory || entryOffset !== end || !files.has('manifest.json')) throw Error('В архиве не найдена опись пакета.');
  let manifest;
  try { manifest = JSON.parse(decoder.decode(files.get('manifest.json'))); }
  catch { throw Error('Не удалось прочитать опись пакета.'); }
  if (manifest?.format !== 'loginom-hub-demo-v1' || manifest.release !== '2026.11' || !['0.5.0','0.7.0'].includes(manifest.minAgent) || manifest.minLoginom !== '7.4.2' || !Array.isArray(manifest.items) || !manifest.items.length) {
    throw Error('Пакет собран для другого формата. Выберите пакет, скачанный в демонстрации.');
  }
  const ids = manifest.items.map(entry => releases.find(item => item.offline && item.id === entry?.id && item.version === entry.version)?.id);
  if (ids.some(id => !id || !files.has('items/'+id+'.json')) || new Set(ids).size !== ids.length || files.size !== ids.length+1) {
    throw Error('Состав архива не соответствует описи пакета.');
  }
  return {
    name:'Аналитика и качество данных', release:manifest.release, publisher:'Loginom',
    minAgent:manifest.minAgent, minLoginom:manifest.minLoginom, ids,
  };
}

function hubState(state) {
  return state.hub ??= {tab:'catalog',type:'Все',query:'',installed:{quality:'1.2.0',help:'2026.11',refactor:'1.0.0'},events:[],favorites:[],dialog:null,revision:0,community:false,favoritesOnly:false};
}

export function hubHasInstalled(state, id) {
  return Object.hasOwn(hubState(state).installed, id);
}

export function openHubSolution(state, id) {
  if (!releases.some(item => item.id === id && item.runner)) return;
  Object.assign(hubState(state), {
    tab:'catalog',type:'Все',query:'',favoritesOnly:false,
    dialog:state.contour === 'closed' && !hubHasInstalled(state,id) ? {kind:'import',required:id} : {kind:'detail',id},
  });
}

function itemCard(item, hub, online, tab) {
  const installed = hub.installed[item.id];
  const version = !online || (tab === 'installed' && installed) ? installed : item.version;
  const update = installed && installed !== item.version;
  return '<article class="hub-card">'+
    '<div class="hub-card-head"><span class="hub-tile hub-'+item.color+'">'+icon(item.icon,23)+'</span>'+
    '<span class="hub-type">'+item.type+'</span>'+
    '<button class="hub-favorite" data-hub-favorite="'+item.id+'" aria-label="'+(hub.favorites.includes(item.id)?'Убрать из избранного':'В избранное')+'" aria-pressed="'+hub.favorites.includes(item.id)+'">'+icon('star',17)+'</button></div>'+
    '<button class="hub-card-title" data-hub-detail="'+item.id+'">'+item.name+'</button>'+
    '<p>'+item.description+'</p>'+
    '<div class="hub-card-meta"><span class="hub-version">'+version+'</span><span class="'+(item.offline?'hub-offline-tag':'hub-online-tag')+'">'+(item.runner?'Loginom внутри контура':item.offline?'Работает офлайн':'Требуется интернет')+'</span></div>'+
    '<div class="hub-card-actions">'+
    (installed && (tab !== 'updates') && (item.prompt || item.runner) ? '<button class="btn" data-hub-use="'+item.id+'">Использовать '+icon('arrow',15)+'</button>' :
    installed && item.id === 'help' ? '<button class="btn" data-hub-detail="'+item.id+'">Открыть справку '+icon('arrow',15)+'</button>' :
    '<button class="btn" data-hub-detail="'+item.id+'">'+(installed && update && online ? 'Обновить' : 'Подробнее')+' '+icon('arrow',15)+'</button>')+
    '<span class="hub-installed">'+(installed ? icon('check',15)+' Установлено' : item.community ? 'Сообщество' : '')+'</span></div></article>';
}

function syncBanner(online) {
  return '<section class="hub-banner '+(online?'':'hub-banner-closed')+'"><div class="hub-banner-content">'+
    '<span class="hub-banner-label">'+icon(online?'archive':'lock',16)+(online?' Работа без интернета':' Закрытый контур')+'</span>'+
    '<h2>'+(online?'Перенесите возможности Hub внутрь контура':'Локальная библиотека Hub')+'</h2>'+
    '<p>'+(online?'Соберите навыки, шаблоны и их зависимости в один файл для администратора.':'Доступны установленные инструменты. Новые версии добавляются из файла, который передал администратор.')+'</p>'+
    (online?'<button class="hub-text" data-hub-action="export">Собрать офлайн-пакет '+icon('arrow',15)+'</button>':'')+'</div>'+
    '<div class="hub-visual" aria-hidden="true"><span class="hub-baseline"></span><span class="hub-visual-chip hub-chip-first">'+icon('flow',23)+'</span><span class="hub-visual-chip hub-chip-second">'+icon('book',23)+'</span><span class="hub-visual-chip hub-chip-third">'+icon(online?'archive':'lock',32)+'</span></div></section>';
}

function history(hub) {
  if (!hub.events.length) return '<div class="hub-empty"><span class="hub-tile hub-sand">'+icon('clock',24)+'</span><h3>Пока нет операций</h3><p>Здесь появятся импорты, обновления и восстановления версий.</p><button class="btn" data-hub-action="import">Импортировать пакет</button></div>';
  return '<div class="hub-history">'+hub.events.map((entry,index) => '<article><span class="hub-tile hub-sage">'+icon(entry.revert?'clock':'archive',21)+'</span>'+
    '<div><h3>'+escape(entry.name)+'</h3><p>'+escape(entry.date)+' · '+entry.ids.length+' '+(entry.ids.length === 1?'компонент':entry.ids.length <= 4?'компонента':'компонентов')+'</p></div>'+
    '<span class="hub-offline-tag">'+(entry.revert?'Восстановлено':'Установлено')+'</span>'+
    (index === 0 && entry.before ? '<button class="btn" data-hub-action="rollback">Восстановить версии</button>':'')+'</article>').join('')+'</div>';
}

export function renderHub(state) {
  const hub = hubState(state);
  const online = state.contour !== 'closed';
  const installedCount = Object.keys(hub.installed).length;
  const updates = online ? releases.filter(item => hub.installed[item.id] && item.version !== hub.installed[item.id]) : [];
  const available = online ? releases.filter(item=>hub.community||!item.community) : releases.filter(item=>hub.installed[item.id]);
  const library = hub.favoritesOnly ? available.filter(item=>hub.favorites.includes(item.id)) : available.filter(item=>hub.installed[item.id]);
  const source = hub.tab === 'updates' ? updates : hub.tab === 'installed' ? library : available;
  const query = hub.query.trim().toLocaleLowerCase('ru');
  const items = source.filter(item => (hub.type === 'Все' || item.type === hub.type) && (!query || [item.name,item.description,item.type,item.keywords].join(' ').toLocaleLowerCase('ru').includes(query)));
  const counts = {catalog:available.length,installed:installedCount,updates:updates.length};
  const filters = ['Все',...new Set(source.map(item=>item.type))];
  return '<section class="hub-page"><header class="hub-header"><div><div class="hub-title-line"><span class="hub-mark">'+icon('hub',26)+'</span><h1>Loginom Hub</h1></div><p>Решения, шаблоны и пакеты для работы в Loginom.</p></div>'+
    '<div class="hub-header-actions"><button class="btn" data-hub-action="studio">'+icon('plus',17)+' Создать решение</button><button class="btn primary" data-hub-action="import">'+icon('upload',18)+' Импортировать пакет</button></div></header>'+
    syncBanner(online)+
    '<nav class="hub-tabs" aria-label="Разделы Loginom Hub">'+tabs.map(([id,title])=>'<button data-hub-tab="'+id+'" '+(hub.tab===id?'aria-current="page"':'')+'>'+title+(id in counts?' <span>'+counts[id]+'</span>':'')+'</button>').join('')+'</nav>'+
    (hub.tab === 'history' ? history(hub) :
      (hub.tab==='installed'?'<div class="hub-library-controls"><button class="btn" aria-pressed="'+!hub.favoritesOnly+'" data-hub-action="show-installed">Установлено</button><button class="btn" aria-pressed="'+hub.favoritesOnly+'" data-hub-action="show-favorites">'+icon('star',16)+' Избранное</button><button class="hub-text" data-hub-action="studio">Мои решения '+icon('arrow',15)+'</button></div>':'')+
      (source.length ? '<div class="hub-toolbar"><label class="hub-search">'+icon('search',18)+'<input type="search" aria-label="Поиск в Hub" placeholder="Поиск в Hub" value="'+escape(hub.query)+'"></label>'+
        '<div class="hub-filters" aria-label="Тип содержимого">'+filters.map(type=>'<button data-hub-type="'+type+'" aria-pressed="'+(hub.type===type)+'">'+type+'</button>').join('')+'</div></div>' : '')+
      (online&&hub.tab==='catalog'?'<label class="hub-community"><input type="checkbox" data-hub-community '+(hub.community?'checked':'')+'> Показывать решения сообщества</label>':'')+
      (items.length ? '<div class="hub-grid">'+items.map(item=>itemCard(item,hub,online,hub.tab)).join('')+'</div>' :
        '<div class="hub-empty"><span class="hub-tile hub-sand">'+icon(hub.tab==='updates'?'check':'search',23)+'</span><h3>'+(source.length?'Поиск ничего не нашёл':hub.tab==='updates'?'Нет доступных обновлений':hub.favoritesOnly?'Избранное пока пусто':'Здесь появятся установленные инструменты')+'</h3>'+
        '<p>'+(source.length?'Измените запрос или выберите другой тип.':hub.favoritesOnly?'Нажмите на звёздочку в карточке решения.':online?'Актуальные версии уже установлены.':'Проверьте пакет обновления из файла.')+'</p>'+
        (source.length?'<button class="btn" data-hub-action="clear">Сбросить фильтры</button>':!online?'<button class="btn" data-hub-action="import">Импортировать пакет</button>':'')+'</div>'))+
    '</section>'+renderDialog(hub, online);
}

function footer(content) { return '<footer class="hub-dialog-footer">'+content+'</footer>'; }

function renderDialog(hub, online) {
  const current = hub.dialog;
  if (!current) return '';
  let title = '';
  let body = '';
  let actions = '';
  if (current.kind === 'import') {
    title = 'Импортировать пакет';
    const requested = releases.find(item=>item.id===current.required);
    body = '<p class="hub-dialog-lead">'+(requested?'Для запуска <strong>'+requested.name+'</strong> выберите файл с этим решением. Оно входит в демонстрационный пример.':'Выберите один файл <code>.loginom-hub</code>. До установки вы увидите, что войдёт в библиотеку.')+'</p>'+
      '<label class="hub-drop"><input type="file" accept=".loginom-hub,.zip" aria-label="Выбрать файл пакета"><span class="hub-tile hub-clay">'+icon('upload',23)+'</span><strong>Выбрать файл или перетащить сюда</strong><small>Офлайн-пакет Loginom Hub</small></label>'+
      '<div class="hub-demo"><span>Демонстрационные пакеты</span><div><button class="btn" data-hub-sample="correct">Корректный</button><button class="btn" data-hub-sample="damaged">Повреждённый</button><button class="btn" data-hub-sample="incompatible">Несовместимый</button></div></div>';
    actions = '<button class="btn quiet" data-hub-action="close">Отмена</button>';
  }
  if (current.kind === 'checking') {
    title = 'Проверяем пакет';
    body = '<div class="hub-result"><span class="hub-tile hub-clay">'+icon('archive',24)+'</span><h3>'+escape(current.filename)+'</h3><p role="status">Читаем опись и проверяем целостность.</p></div>';
  }
  if (current.kind === 'invalid') {
    title = 'Пакет нельзя установить';
    body = '<p class="hub-filename">'+icon('file',17)+escape(current.filename)+'</p><div class="hub-notice hub-notice-error" role="alert">'+icon('alert',20)+'<div><strong>Проверка остановлена</strong><p>'+escape(current.message)+'</p></div></div>';
    actions = '<button class="btn quiet" data-hub-action="close">Закрыть</button><button class="btn primary" data-hub-action="import">Выбрать другой пакет</button>';
  }
  if (current.kind === 'preview') {
    const bundle = current.bundle;
    const incompatible = bundle.minAgent !== '0.5.0';
    const changes = bundle.ids.filter(id=>hub.installed[id] !== releases.find(item=>item.id===id).version);
    title = 'Проверка пакета';
    body = '<div class="hub-package-title"><span class="hub-tile hub-clay">'+icon('archive',24)+'</span><div><strong>'+bundle.name+'</strong><p class="hub-filename">'+escape(current.filename)+'</p></div></div>'+
      '<dl class="hub-checks"><div><dt>Издатель</dt><dd>'+bundle.publisher+'</dd></div><div><dt>Подпись издателя</dt><dd>Демонстрация проверки</dd></div><div><dt>Совместимость</dt><dd>Agent '+bundle.minAgent+'+ · Loginom '+bundle.minLoginom+'+</dd></div><div><dt>Лицензия</dt><dd>Демонстрационная лицензия</dd></div><div><dt>Сеть</dt><dd>Интернет для установки не требуется</dd></div></dl>'+
      (incompatible?'<div class="hub-notice hub-notice-error" role="alert">'+icon('alert',20)+'<div><strong>Требуется более новая версия агента</strong><p>Версия в прототипе 0.5.0. Выберите пакет для этой версии.</p></div></div>':
        '<div class="hub-notice hub-notice-ok">'+icon('check',19)+'<div><strong>Опись и целостность проверены</strong><p>В пакете только демонстрационные данные. Установка действует в этом прототипе.</p></div></div>')+
      (current.required&&!bundle.ids.includes(current.required)?'<div class="hub-notice">'+icon('alert',19)+'<div><strong>Запрошенного решения в архиве нет</strong><p>'+releases.find(item=>item.id===current.required).name+' можно добавить из другого файла.</p></div></div>':'')+
      '<h3 class="hub-items-heading">Состав пакета</h3><ul class="hub-preview-list">'+bundle.ids.map(id=>{
        const item = releases.find(entry=>entry.id===id);
        const installed = hub.installed[id];
        const status = installed === item.version ? 'Уже установлен' : installed ? 'Обновление' : 'Добавление';
        return '<li><span>'+item.name+'<small>'+item.type+' · '+(installed && installed!==item.version ? installed+' → ' : '')+item.version+'</small></span><span class="hub-change">'+status+'</span></li>';
      }).join('')+'</ul><p class="hub-dialog-footnote">Установка добавляет компоненты в библиотеку. Доступ к пакету Loginom и запуск сценария подтверждаются отдельно.</p>';
    actions = '<button class="btn quiet" data-hub-action="import">'+(incompatible?'Выбрать другой пакет':'Назад')+'</button><button class="btn primary" data-hub-action="install" '+(incompatible||!changes.length?'disabled':'')+'>Установить'+(changes.length?' ('+changes.length+')':'')+'</button>';
  }
  if (current.kind === 'installed') {
    title = 'Пакет установлен';
    body = '<div class="hub-result"><span class="hub-tile hub-sage">'+icon('check',27)+'</span><h3>'+escape(current.name)+'</h3><p>Компоненты доступны в библиотеке Hub. Версии можно восстановить в истории.</p></div>';
    actions = '<button class="btn" data-hub-tab="history">Посмотреть историю</button>'+
      (current.next?'<button class="btn primary" data-hub-use="'+current.next+'">Настроить решение</button>':'<button class="btn primary" data-hub-tab="installed">Открыть установленные</button>');
  }
  if (current.kind === 'export') {
    title = 'Собрать офлайн-пакет';
    body = '<p class="hub-dialog-lead">Выберите компоненты для переноса. В рабочей версии Hub добавит обязательные офлайн-зависимости и подпишет архив.</p>'+
      '<dl class="hub-checks"><div><dt>Целевая версия агента</dt><dd>0.5.0 и новее</dd></div><div><dt>Версия Loginom</dt><dd>7.4.2 и новее</dd></div></dl>'+
      '<fieldset class="hub-export-list"><legend>Включить в пакет</legend>'+releases.filter(item=>item.offline).map(item=>
        '<label><input type="checkbox" data-hub-select="'+item.id+'" '+(current.ids.includes(item.id)?'checked':'')+'><span>'+item.name+'<small>'+item.type+' · '+item.version+'</small></span></label>').join('')+'</fieldset>'+
      '<p class="hub-dialog-footnote">Модель подключается отдельно в настройках внутри контура.</p>';
    actions = '<button class="btn quiet" data-hub-action="close">Отмена</button><button class="btn primary" data-hub-action="download" '+(!current.ids.length?'disabled':'')+'>'+icon('download',17)+' Скачать пакет</button>';
  }
  if (current.kind === 'detail') {
    const item = releases.find(entry=>entry.id===current.id);
    const version = hub.installed[item.id];
    title = item.name;
    body = '<p class="hub-dialog-lead">'+item.description+'</p><dl class="hub-checks"><div><dt>Тип</dt><dd>'+item.type+'</dd></div><div><dt>Издатель</dt><dd>'+(item.community?'Автор сообщества':'Loginom')+'</dd></div><div><dt>Проверка</dt><dd>'+(item.community?'Без проверки Loginom':'Проверен · демо')+'</dd></div><div><dt>Версия каталога</dt><dd>'+(online ? item.version : version)+'</dd></div><div><dt>Подключение</dt><dd>'+(item.runner?'Нужен Loginom внутри контура':item.offline?'Работает внутри контура':'Нужен доступ в интернет')+'</dd></div></dl>'+
      (item.runner?'<div class="hub-notice">'+icon('lock',18)+'<div><strong>Разрешения</strong><p>Чтение выбранного пакета Loginom. Перед запуском можно проверить входы и права на изменения.</p></div></div>':'')+
      (item.community?'<div class="hub-notice hub-notice-error">'+icon('lock',18)+'<div><strong>Установка ограничена политикой организации</strong><p>Организация разрешила устанавливать только проверенные решения Loginom.</p></div></div>':'')+
      (item.id==='help'?'<p class="hub-dialog-lead">Разделы справки</p><ul class="hub-help-list"><li>Создание и сохранение пакета</li><li>Импорт табличных данных</li><li>Обработка пропусков и дубликатов</li></ul>':'');
    actions = '<button class="btn quiet" data-hub-action="close">Закрыть</button>'+
      (version && (item.prompt||item.runner)?'<button class="btn '+(version===item.version||!online?'primary':'')+'" data-hub-use="'+item.id+'">Использовать</button>':'')+
      (online&&version!==item.version&&!item.community?'<button class="btn primary" data-hub-online-install="'+item.id+'">'+(version?'Обновить':item.runner?'Добавить и настроить':'Установить')+'</button>':'');
  }
  if (current.kind === 'rollback') {
    title = 'Восстановить предыдущие версии?';
    body = '<p class="hub-dialog-lead">Версии компонентов до последней установки будут восстановлены. Компоненты, добавленные этой установкой, исчезнут из библиотеки.</p>';
    actions = '<button class="btn quiet" data-hub-action="close">Отмена</button><button class="btn primary" data-hub-action="confirm-rollback">Восстановить</button>';
  }
  return '<dialog class="hub-dialog" aria-labelledby="hub-dialog-title"><header><h2 id="hub-dialog-title">'+title+'</h2><button class="hub-close" data-hub-action="close" aria-label="Закрыть">'+icon('close',19)+'</button></header>'+
    '<div class="hub-dialog-main">'+body+'</div>'+(actions?footer(actions):'')+'</dialog>';
}

function completeInstall(hub, ids, name) {
  const before = {...hub.installed};
  for (const id of ids) hub.installed[id] = releases.find(item=>item.id===id).version;
  hub.events.unshift({name, ids, before, date:new Date().toLocaleString('ru',{dateStyle:'short',timeStyle:'short'})});
  const requested = hub.dialog?.required;
  hub.dialog = {kind:'installed',name,next:ids.includes(requested)?requested:null};
}

export function bindHub(root, state, api) {
  const hub = hubState(state);
  const dialog = root.querySelector('.hub-dialog');
  if (dialog) {
    dialog.showModal();
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      hub.dialog = null;
      api.render();
    });
  }

  async function load(file, filename = file.name) {
    const revision = ++hub.revision;
    const required = hub.dialog?.required;
    hub.dialog = {kind:'checking',filename,required};
    api.render();
    try {
      const bundle = await inspectDemoArchive(file);
      if (hub.revision !== revision || hub.dialog?.kind !== 'checking') return;
      hub.dialog = {kind:'preview',filename,bundle,required};
    } catch (error) {
      if (hub.revision !== revision || hub.dialog?.kind !== 'checking') return;
      hub.dialog = {kind:'invalid',filename,required,message:error instanceof TypeError?'Не удалось прочитать содержимое файла.':error.message};
    }
    api.render();
  }

  const search = root.querySelector('.hub-search input');
  search?.addEventListener('input', () => {
    hub.query = search.value;
    const start = search.selectionStart;
    const end = search.selectionEnd;
    api.render();
    const replacement = root.querySelector('.hub-search input');
    replacement?.focus();
    replacement?.setSelectionRange(start,end);
  });
  const drop = root.querySelector('.hub-drop');
  if (drop) {
    drop.querySelector('input').addEventListener('change', event => {
      if (event.target.files[0]) load(event.target.files[0]);
    });
    drop.addEventListener('dragover', event => {
      event.preventDefault();
      drop.classList.add('is-dragging');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
    drop.addEventListener('drop', event => {
      event.preventDefault();
      drop.classList.remove('is-dragging');
      if (event.dataTransfer.files[0]) load(event.dataTransfer.files[0]);
    });
  }
  root.querySelector('[data-hub-community]')?.addEventListener('change', event => {
    hub.community = event.target.checked;
    hub.type = 'Все';
    api.render();
  });

  if (hub.dialog?.kind === 'export') {
    root.querySelectorAll('[data-hub-select]').forEach(box => box.addEventListener('change', () => {
      hub.dialog.ids = Array.from(root.querySelectorAll('[data-hub-select]:checked'), input=>input.dataset.hubSelect);
      root.querySelector('[data-hub-action="download"]').disabled = !hub.dialog.ids.length;
    }));
  }

  root.querySelectorAll('[data-hub-tab], [data-hub-type], [data-hub-detail], [data-hub-use], [data-hub-sample], [data-hub-favorite], [data-hub-online-install], [data-hub-action]').forEach(button=>button.addEventListener('click', () => {
    const data = button.dataset;
    if (data.hubTab) {
      Object.assign(hub,{tab:data.hubTab,type:'Все',query:'',dialog:null,favoritesOnly:false});
    }
    if (data.hubType) hub.type = data.hubType;
    if (data.hubDetail) hub.dialog = {kind:'detail',id:data.hubDetail};
    if (data.hubFavorite) {
      const id = data.hubFavorite;
      hub.favorites = hub.favorites.includes(id) ? hub.favorites.filter(entry=>entry!==id) : [...hub.favorites,id];
    }
    if (data.hubUse) {
      const item = releases.find(entry=>entry.id===data.hubUse);
      hub.dialog = null;
      if (item.runner) api.runSolution(item.id);
      else api.useTemplate(item.name,item.prompt);
      return;
    }
    if (data.hubSample) {
      const sample = data.hubSample;
      const required = hub.dialog?.required;
      const ids = required ? [...defaultSelection, required] : defaultSelection;
      const file = sample === 'damaged' ? new Blob(['broken demo bundle']) : createDemoArchive(ids,sample !== 'incompatible');
      load(file,sample === 'correct' ? archiveName : 'loginom-hub-'+(sample==='damaged'?'damaged':'new-agent')+'.loginom-hub');
      return;
    }
    if (data.hubOnlineInstall) {
      const item = releases.find(item=>item.id===data.hubOnlineInstall);
      completeInstall(hub,[item.id],item.name);
      if (item.runner) {
        hub.dialog = null;
        api.runSolution(item.id);
        return;
      }
    }
    switch (data.hubAction) {
      case 'import': hub.dialog = {kind:'import',required:hub.dialog?.required}; break;
      case 'export': hub.dialog = {kind:'export',ids:[...defaultSelection]}; break;
      case 'close': hub.dialog = null; break;
      case 'clear': hub.query = ''; hub.type = 'Все'; break;
      case 'show-installed': hub.favoritesOnly = false; hub.query = ''; hub.type = 'Все'; break;
      case 'show-favorites': hub.favoritesOnly = true; hub.query = ''; hub.type = 'Все'; break;
      case 'studio': hub.dialog = null; api.navigate('studio'); return;
      case 'install': {
        const bundle = hub.dialog.bundle;
        if (bundle.minAgent !== '0.5.0') return;
        const ids = bundle.ids.filter(id=>hub.installed[id] !== releases.find(item=>item.id===id).version);
        if (!ids.length) return;
        completeInstall(hub,ids,bundle.name);
        break;
      }
      case 'rollback': hub.dialog = {kind:'rollback'}; break;
      case 'confirm-rollback': {
        const entry = hub.events[0];
        if (!entry?.before) return;
        hub.installed = {...entry.before};
        hub.events.unshift({name:entry.name,ids:entry.ids,date:new Date().toLocaleString('ru',{dateStyle:'short',timeStyle:'short'}),revert:true});
        hub.dialog = null;
        break;
      }
      case 'download': {
        if (!hub.dialog.ids.length) return;
        const url = URL.createObjectURL(createDemoArchive(hub.dialog.ids));
        const link = document.createElement('a');
        link.href = url;
        link.download = archiveName;
        link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
        hub.dialog = null;
        api.toast('Пакет скачивается');
        break;
      }
    }
    api.render();
  }));
}
