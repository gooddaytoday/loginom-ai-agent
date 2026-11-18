import { catalog, byId, tiers, kinds, tierBadge, evidenceLine } from './catalog.js';
import { renderMine, ownCount } from './create.js';

const tabs = [['catalog','Каталог'],['installed','Установленные'],['mine','Мои'],['updates','Обновления'],['history','История']];
const tierFilters = [['all','Все'],['official','Loginom'],['verified','Проверено Loginom'],['community','Сообщество']];
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
  trash:'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  wand:'m5 19 13-13 2 2L7 21z M6 3v6 M3 6h6',
};
const icon = (name,size = 18) => '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="'+(iconPaths[name] || iconPaths.file)+'"/></svg>';
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const now = () => new Date().toLocaleString('ru',{dateStyle:'short',timeStyle:'short'});

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

export function createDemoArchive(ids = defaultSelection, compatible = true, name = 'Аналитика и качество данных') {
  const pieces = [];
  const directory = [];
  let offset = 0;
  let directorySize = 0;
  const items = catalog.filter(item => item.offline && !item.builtIn && ids.includes(item.id));
  const manifest = {
    format:'loginom-hub-demo-v1', name, publisher:'Loginom · демо',
    release:'2026.11', created:new Date().toISOString().slice(0,10), minAgent:compatible ? '0.5.0' : '0.7.0', minLoginom:'7.4.2',
    items:items.map(item => ({id:item.id,version:item.version})),
  };
  const files = [
    ['manifest.json', JSON.stringify(manifest, null, 2)],
    ...items.map(item => ['items/'+item.id+'.json', JSON.stringify({title:item.title,version:item.version,demo:true},null,2)]),
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
  if (file.size > 2_000_000) throw Error('Файл каталога больше 2 МБ.');
  const data = await file.arrayBuffer();
  if (data.byteLength < 22) throw Error('Файл повреждён. Попросите у администратора исправный файл.');
  const view = new DataView(data);
  const end = data.byteLength - 22;
  const files = new Map();
  if (view.getUint32(end,true) !== 0x06054b50) throw Error('Файл повреждён или имеет другой формат. Попросите у администратора исправный файл.');
  const directory = view.getUint32(end+16,true);
  const count = view.getUint16(end+10,true);
  let offset = 0;
  let entryOffset = directory;
  if (!count || count > catalog.length+1 || directory >= end || directory+view.getUint32(end+12,true) !== end) {
    throw Error('Не удалось прочитать состав файла.');
  }
  for (let index = 0; index < count; index++) {
    if (offset+30 > directory || view.getUint32(offset,true) !== 0x04034b50 || view.getUint16(offset+6,true) || view.getUint16(offset+8,true)) {
      throw Error('Подходят только файлы каталога, скачанные в демонстрации.');
    }
    const size = view.getUint32(offset+18,true);
    const nameLength = view.getUint16(offset+26,true);
    const start = offset+30+nameLength+view.getUint16(offset+28,true);
    if (start+size > directory) throw Error('Файл изменён или повреждён после подписи.');
    const name = decoder.decode(new Uint8Array(data,offset+30,nameLength));
    const bytes = new Uint8Array(data,start,size);
    const crc = view.getUint32(offset+14,true);
    if (files.has(name) || checksum(bytes) !== crc) throw Error('Файл изменён или повреждён после подписи.');
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
  if (offset !== directory || entryOffset !== end || !files.has('manifest.json')) throw Error('В файле не найдена опись каталога.');
  let manifest;
  try { manifest = JSON.parse(decoder.decode(files.get('manifest.json'))); }
  catch { throw Error('Не удалось прочитать опись каталога.'); }
  if (manifest?.format !== 'loginom-hub-demo-v1' || manifest.release !== '2026.11' || !['0.5.0','0.7.0'].includes(manifest.minAgent) || manifest.minLoginom !== '7.4.2' || !Array.isArray(manifest.items) || !manifest.items.length) {
    throw Error('Файл другого формата. Выберите файл каталога, скачанный в демонстрации.');
  }
  const ids = manifest.items.map(entry => catalog.find(item => item.offline && item.id === entry?.id && item.version === entry.version)?.id);
  if (ids.some(id => !id || !files.has('items/'+id+'.json')) || new Set(ids).size !== ids.length || files.size !== ids.length+1) {
    throw Error('Состав файла не соответствует описи.');
  }
  return {
    name:typeof manifest.name === 'string' && manifest.name ? manifest.name : 'Набор Loginom Hub', release:manifest.release, publisher:'Loginom',
    minAgent:manifest.minAgent, minLoginom:manifest.minLoginom, ids,
    created:/^\d{4}-\d{2}-\d{2}$/.test(manifest.created ?? '') ? manifest.created : '2026-11-12',
  };
}

// В-50, В-49: a community item from a file installs only when the administrator allowed it, and after consent.
function installable(bundle, hub, online) {
  return bundle.ids.filter(id=>hub.installed[id] !== byId(id).version && (online || byId(id).tier !== 'community'));
}

// В-60: a closed-network file is valid for 180 days from the day it was made.
function ruDate(iso, days = 0) {
  return new Date(Date.parse(iso+'T00:00:00Z') + days*864e5).toLocaleDateString('ru-RU', {timeZone:'UTC'});
}

function hubState(state) {
  return state.hub ??= {
    tab:'catalog', tier:'all', type:'Все', query:'',
    installed:{document:'1.0.0',help:'2026.11',refactor:'1.0.0',quality:'1.2.0',abc:'1.2.0'},
    events:[], favorites:[], dialog:null, revision:0,
  };
}

export function hubHasInstalled(state, id) {
  return Object.hasOwn(hubState(state).installed, id);
}

// Opens one tab of the catalog, e.g. «Мои» after creating a skill.
export function showHubTab(state, tab) {
  Object.assign(hubState(state), {tab, dialog:null});
}

// Opens the catalog filtered to one type, e.g. «Действие» from «Ещё действия в каталоге».
export function showHubType(state, type) {
  Object.assign(hubState(state), {tab:'catalog', tier:'all', type, query:'', dialog:null});
}

// Opens the solution card (online) or the bundle import (closed contour) for a solution that is not installed.
export function openHubSolution(state, id) {
  const item = byId(id);
  if (!item) return;
  Object.assign(hubState(state), {
    tab:'catalog', tier:'all', type:'Все', query:'',
    dialog:state.contour === 'closed' && !hubHasInstalled(state,id) ? {kind:'import',required:id} : {kind:'detail',id},
  });
}

function blockedByPolicy(item, online, byAdmin) {
  if (item.tier === 'community' && !online) return byAdmin ? 'Администратор вашей организации не разрешил навыки «Сообщество». Если такой навык нужен — обратитесь к нему.'
    : 'В закрытом контуре навыки «Сообщество» выключены, пока их не разрешит администратор.';
  if (!item.offline && !online) return 'Нужен доступ в интернет, а в закрытом контуре он отключён.';
  return '';
}

function itemCard(item, hub, online, tab) {
  const installed = hub.installed[item.id];
  const update = installed && installed !== item.version && online;
  const status = item.builtIn ? icon('check',15)+' Встроено' : installed ? icon('check',15)+' Установлено' : '';
  const primary = installed && tab !== 'updates' && (item.prompt || item.runner)
    ? '<button class="btn" data-hub-use="'+item.id+'">'+kinds[item.kind].use+' '+icon('arrow',15)+'</button>'
    : '<button class="btn" data-hub-detail="'+item.id+'">'+(update ? 'Обновить' : installed ? 'Подробнее' : 'Посмотреть')+' '+icon('arrow',15)+'</button>';
  return '<article class="hub-card">'+
    '<div class="hub-card-head"><span class="hub-tile hub-'+item.color+'">'+icon(item.icon,23)+'</span>'+
    '<span class="hub-type" title="'+kinds[item.kind].how+'">'+item.kind+'</span>'+
    '<button class="hub-favorite" data-hub-favorite="'+item.id+'" aria-label="'+(hub.favorites.includes(item.id)?'Убрать из избранного':'В избранное')+'" aria-pressed="'+hub.favorites.includes(item.id)+'">'+icon('star',17)+'</button></div>'+
    '<button class="hub-card-title" data-hub-detail="'+item.id+'">'+item.title+'</button>'+
    '<p>'+item.description+'</p>'+
    '<div class="hub-trust">'+tierBadge(item)+(item.publisher ? '<span class="hub-publisher">'+escape(item.publisher)+'</span>' : '')+'</div>'+
    '<div class="hub-evidence">'+evidenceLine(item)+'</div>'+
    '<div class="hub-card-actions">'+primary+
    '<span class="hub-installed">'+status+(update ? ' · есть '+item.version : '')+'</span></div></article>';
}

// Closed contour: a slim line saying where the catalog came from. Online: nothing — bundle export is an admin task,
// offered as a link under the catalog instead of a banner every analyst has to scroll past.
function sourceLine(state) {
  if (state.contour !== 'closed') return '';
  const text = state.policy === 'set' ? '<strong>Закрытый контур.</strong> Каталог из файла администратора от 12.11.2026, действует до 11.05.2027. Ставится только подготовленное или проверенное Loginom.'
    : state.policy === 'broken' ? '<strong>Файл политики администратора с ошибкой.</strong> Пока его не исправят, работает только установленное, а из файла ставится только подготовленное или проверенное Loginom.'
      : '<strong>Закрытый контур.</strong> Новое — через «Импорт из файла»; ставится только подготовленное или проверенное Loginom.';
  return '<div class="hub-source">'+icon(state.policy === 'broken' ? 'alert' : 'lock',16)+'<span>'+text+'</span></div>';
}

function history(hub) {
  if (!hub.events.length) return '<div class="hub-empty"><span class="hub-tile hub-sand">'+icon('clock',24)+'</span><h3>Пока нет операций</h3><p>Здесь появятся установки, обновления, удаления и восстановления версий.</p></div>';
  const labels = {install:'Установлено',update:'Обновлено',remove:'Удалено',import:'Импортировано',revert:'Восстановлено'};
  return '<div class="hub-history">'+hub.events.map((entry,index) => '<article><span class="hub-tile hub-sage">'+icon(entry.kind==='revert'?'clock':entry.kind==='remove'?'trash':'archive',21)+'</span>'+
    '<div><h3>'+escape(entry.name)+'</h3><p>'+escape(entry.date)+' · '+entry.ids.length+' '+(entry.ids.length === 1?'компонент':entry.ids.length <= 4?'компонента':'компонентов')+'</p></div>'+
    '<span class="hub-offline-tag">'+labels[entry.kind]+'</span>'+
    (index === 0 && entry.before && entry.kind !== 'revert' ? '<button class="btn" data-hub-action="rollback">Вернуть как было</button>':'')+'</article>').join('')+'</div>';
}

export function renderHub(state) {
  const hub = hubState(state);
  const online = state.contour !== 'closed';
  const updates = online ? catalog.filter(item => hub.installed[item.id] && item.version !== hub.installed[item.id]) : [];
  const available = online ? catalog : catalog.filter(item => hub.installed[item.id]);
  const installedItems = catalog.filter(item => hub.installed[item.id]);
  const source = hub.tab === 'updates' ? updates : hub.tab === 'installed' ? installedItems : available;
  const query = hub.query.trim().toLocaleLowerCase('ru');
  const items = source.filter(item => (hub.tier === 'all' || item.tier === hub.tier) && (hub.type === 'Все' || item.kind === hub.type) &&
    (!query || [item.title,item.product,item.description,item.kind,item.keywords].join(' ').toLocaleLowerCase('ru').includes(query)));
  const counts = {catalog:available.length,installed:installedItems.length,mine:ownCount(state),updates:updates.length};
  const types = ['Все',...new Set(source.map(item=>item.kind))];
  return '<section class="hub-page"><header class="hub-header"><div><div class="hub-title-line"><span class="hub-mark">'+icon('hub',26)+'</span><h1>Каталог</h1></div><p>Loginom Hub — действия с пакетами, навыки агента, готовые сценарии и подключения. Перед установкой видно, кто подготовил и что будет разрешено.</p></div>'+
    '<div class="hub-header-actions"><button class="btn" data-hub-action="studio">'+icon('plus',17)+' Создать своё</button><button class="btn" data-hub-action="import">'+icon('upload',18)+' Импорт из файла</button></div></header>'+
    sourceLine(state)+
    '<nav class="hub-tabs" aria-label="Разделы">'+tabs.map(([id,title])=>'<button data-hub-tab="'+id+'" '+(hub.tab===id?'aria-current="page"':'')+'>'+title+(id in counts?' <span>'+counts[id]+'</span>':'')+'</button>').join('')+'</nav>'+
    (hub.tab === 'mine' ? renderMine(state) : hub.tab === 'history' ? history(hub) :
      (source.length ? '<div class="hub-toolbar"><label class="hub-search">'+icon('search',18)+'<input type="search" aria-label="Поиск в каталоге" placeholder="Что нужно сделать? Например, «проверить данные»" value="'+escape(hub.query)+'"></label>'+
        '<div class="hub-filters" aria-label="Кто подготовил">'+tierFilters.filter(([id]) => online || id !== 'community').map(([id,label])=>'<button data-hub-tier="'+id+'" aria-pressed="'+(hub.tier===id)+'">'+label+'</button>').join('')+'</div>'+
        '<div class="hub-filters hub-types" aria-label="Тип">'+types.map(type=>'<button data-hub-type="'+type+'" aria-pressed="'+(hub.type===type)+'"'+(kinds[type]?' title="'+kinds[type].how+'"':'')+'>'+(kinds[type]?.plural || type)+'</button>').join('')+'</div>'+
        '<p class="hub-type-how hub-tier-how">'+tierFilters.filter(([id]) => id !== 'all' && (online || id !== 'community')).map(([id,label]) => '<span><strong>'+label+'</strong> — '+tiers[id].title.charAt(0).toLowerCase()+tiers[id].title.slice(1)+'</span>').join('')+'</p>'+
        (kinds[hub.type] ? '<p class="hub-type-how"><strong>'+hub.type+'</strong> — '+kinds[hub.type].how.charAt(0).toLowerCase()+kinds[hub.type].how.slice(1)+'</p>' : '')+'</div>' : '')+
      (items.length ? '<div class="hub-grid">'+items.map(item=>itemCard(item,hub,online,hub.tab)).join('')+'</div>' :
        '<div class="hub-empty"><span class="hub-tile hub-sand">'+icon(hub.tab==='updates'?'check':'search',23)+'</span><h3>'+(source.length?'Ничего не нашлось':hub.tab==='updates'?'Обновлений нет':'Здесь появится установленное')+'</h3>'+
        '<p>'+(source.length?'Измените запрос или фильтры.':online?'Установлены актуальные версии.':'Импортируйте файл каталога от администратора.')+'</p>'+
        (source.length?'<button class="btn" data-hub-action="clear">Сбросить фильтры</button>':!online?'<button class="btn" data-hub-action="import">Импорт из файла</button>':'')+'</div>'))+
      (online && hub.tab === 'catalog' ? '<p class="hub-admin-link">'+icon('archive',16)+' Для компьютеров без интернета — <a class="hub-text" href="hub-site/">сайт каталога hub.loginom.ai '+icon('arrow',15)+'</a>: скачайте нужное и передайте файлом</p>' : '')+
    '</section>'+renderDialog(hub, online, state.policy === 'set');
}

function footer(content) { return '<footer class="hub-dialog-footer">'+content+'</footer>'; }

function permissionList(item) {
  return '<div class="hub-perms"><div><h4>'+icon('check',16)+' Сможет</h4><ul>'+(item.can.length ? item.can.map(text=>'<li>'+escape(text)+'</li>').join('') : '<li>Только подсказывать агенту</li>')+'</ul></div>'+
    (item.cannot.length ? '<div><h4>'+icon('close',16)+' Не сможет</h4><ul>'+item.cannot.map(text=>'<li>'+escape(text)+'</li>').join('')+'</ul></div>' : '')+'</div>';
}

function detailDialog(hub, online, current, byAdmin) {
  const item = byId(current.id);
  const installed = hub.installed[item.id];
  const update = installed && installed !== item.version && online;
  const blocked = blockedByPolicy(item, online, byAdmin);
  const tier = tiers[item.tier];
  const needsAck = item.tier === 'community' && !installed;
  const body = '<div class="hub-detail-head"><span class="hub-tile hub-'+item.color+'">'+icon(item.icon,24)+'</span><div><p class="hub-detail-kind">'+item.kind+'</p><p class="hub-dialog-lead">'+item.description+'</p></div></div>'+
    '<section class="hub-section"><h3>Как этим пользоваться</h3><p>'+kinds[item.kind].how+'</p></section>'+
    '<section class="hub-section"><h3>Кто подготовил</h3><div class="hub-trust">'+tierBadge(item,'lg')+(item.publisher ? '<span class="hub-publisher">'+escape(item.publisher)+'</span>' : '')+'</div><p>'+tier.explain+'</p></section>'+
    '<section class="hub-section"><h3>Проверка на примерах</h3><p>'+evidenceLine(item,true)+'</p></section>'+
    '<section class="hub-section"><h3>Что будет разрешено</h3>'+permissionList(item)+
    (item.runner ? '<p class="hub-dialog-footnote">При каждом запуске приложение ещё раз покажет, к какому пакету и с какими правами получит доступ агент.</p>' : '')+'</section>'+
    '<dl class="hub-checks"><div><dt>Версия</dt><dd>'+(update ? installed+' → '+item.version : installed || item.version)+'</dd></div><div><dt>Размер</dt><dd>'+item.size+'</dd></div><div><dt>Совместимость</dt><dd>Loginom 7.4.2 и новее</dd></div><div><dt>Сеть</dt><dd>'+(item.offline?'Работает без интернета':'Нужен интернет')+'</dd></div></dl>'+
    (blocked ? '<div class="hub-notice hub-notice-error">'+icon('lock',18)+'<div><strong>Установка запрещена</strong><p>'+blocked+'</p></div></div>' : '')+
    (needsAck && !blocked ? '<label class="hub-ack"><input type="checkbox" data-hub-ack '+(current.ack?'checked':'')+'> Понимаю: Loginom это не проверял, а агент будет следовать указаниям навыка. Результат проверю сам</label>' : '');
  const actions = '<button class="btn quiet" data-hub-action="close">Закрыть</button>'+
    (installed && !item.builtIn ? '<button class="btn quiet hub-remove" data-hub-action="remove">'+icon('trash',16)+' Удалить</button>' : '')+
    (installed && !update && (item.prompt || item.runner) ? '<button class="btn primary" data-hub-use="'+item.id+'">'+kinds[item.kind].use+'</button>' : '')+
    (!blocked && (!installed || update) ? '<button class="btn primary" data-hub-action="install-one" '+(needsAck && !current.ack ? 'disabled' : '')+'>'+(update ? 'Обновить до '+item.version : 'Установить')+'</button>' : '');
  return ['', body, actions, item.title];
}

function renderDialog(hub, online, byAdmin) {
  const current = hub.dialog;
  if (!current) return '';
  let title = '';
  let body = '';
  let actions = '';
  if (current.kind === 'detail') [, body, actions, title] = detailDialog(hub, online, current, byAdmin);
  if (current.kind === 'import') {
    title = 'Импорт из файла';
    const requested = byId(current.required);
    body = '<p class="hub-dialog-lead">'+(requested?'«'+requested.title+'» нет среди установленного. Выберите файл от администратора, в котором это есть.':'Выберите файл <code>.loginom-hub</code> от администратора или из Loginom Hub. До установки вы увидите состав и проверку подписи.')+'</p>'+
      '<label class="hub-drop"><input type="file" accept=".loginom-hub,.zip" aria-label="Выбрать файл"><span class="hub-tile hub-clay">'+icon('upload',23)+'</span><strong>Выбрать файл или перетащить сюда</strong><small>Офлайн-набор Loginom Hub</small></label>'+
      '<div class="hub-demo"><span>Только для прототипа: примеры файлов</span><div><button class="btn" data-hub-sample="correct">Корректный</button><button class="btn" data-hub-sample="damaged">Повреждённый</button><button class="btn" data-hub-sample="incompatible">Несовместимый</button></div></div>';
    actions = '<button class="btn quiet" data-hub-action="close">Отмена</button>';
    body += '<p class="hub-dialog-footnote">Навык от коллеги добавляется иначе: «Создать своё» → «Навык» → «Из файла».</p>';
  }
  if (current.kind === 'checking') {
    title = 'Проверяем файл';
    body = '<div class="hub-result"><span class="hub-tile hub-clay">'+icon('archive',24)+'</span><h3>'+escape(current.filename)+'</h3><p role="status">Проверяем подпись, опись и целостность файлов.</p></div>';
  }
  if (current.kind === 'invalid') {
    title = 'Файл нельзя установить';
    body = '<p class="hub-filename">'+icon('file',17)+escape(current.filename)+'</p><div class="hub-notice hub-notice-error" role="alert">'+icon('alert',20)+'<div><strong>Проверка остановлена</strong><p>'+escape(current.message)+'</p></div></div>';
    actions = '<button class="btn quiet" data-hub-action="close">Закрыть</button><button class="btn primary" data-hub-action="import">Выбрать другой файл</button>';
  }
  if (current.kind === 'preview') {
    const bundle = current.bundle;
    const incompatible = bundle.minAgent !== '0.5.0';
    const changes = installable(bundle, hub, online);
    const community = changes.filter(id=>byId(id).tier === 'community');
    title = 'Что будет установлено';
    body = '<div class="hub-package-title"><span class="hub-tile hub-clay">'+icon('archive',24)+'</span><div><strong>'+bundle.name+'</strong><p class="hub-filename">'+escape(current.filename)+'</p></div></div>'+
      '<dl class="hub-checks"><div><dt>Подпись</dt><dd>'+icon('check',14)+' Loginom · демонстрационный ключ</dd></div><div><dt>Собран</dt><dd>'+ruDate(bundle.created)+'</dd></div><div><dt>Действует до</dt><dd>'+ruDate(bundle.created, 180)+'</dd></div><div><dt>Совместимость</dt><dd>Агент '+bundle.minAgent+'+ · Loginom '+bundle.minLoginom+'+</dd></div><div><dt>Сеть</dt><dd>Интернет не нужен</dd></div></dl>'+
      (incompatible?'<div class="hub-notice hub-notice-error" role="alert">'+icon('alert',20)+'<div><strong>Нужна более новая версия приложения</strong><p>Файл рассчитан на версию '+bundle.minAgent+'. Попросите у администратора файл для вашей версии.</p></div></div>':
        '<div class="hub-notice hub-notice-ok">'+icon('check',19)+'<div><strong>Подпись и файлы проверены</strong><p>Файл не изменялся после подписи. В прототипе используются учебные данные.</p></div></div>')+
      (current.required&&!bundle.ids.includes(current.required)?'<div class="hub-notice">'+icon('alert',19)+'<div><strong>Нужного в файле нет</strong><p>«'+byId(current.required).title+'» можно добавить из другого файла.</p></div></div>':'')+
      '<h3 class="hub-items-heading">Состав</h3><ul class="hub-preview-list">'+bundle.ids.map(id=>{
        const item = byId(id);
        const installed = hub.installed[id];
        const status = installed === item.version ? 'Уже установлено' : item.tier === 'community' && !online ? (byAdmin ? 'Не разрешено администратором' : 'Выключено в закрытом контуре') : installed ? 'Обновление' : 'Новое';
        return '<li><span>'+item.title+'<small>'+tiers[item.tier].label+' · '+item.kind+' · '+(installed && installed!==item.version ? installed+' → ' : '')+item.version+'</small></span><span class="hub-change">'+status+'</span></li>';
      }).join('')+'</ul>'+
      (bundle.ids.some(id=>byId(id).tier === 'community') && !online ? '<p class="hub-dialog-footnote">'+icon('lock',14)+(byAdmin ? ' Администратор вашей организации не разрешил навыки «Сообщество» — они не установятся.' : ' В закрытом контуре навыки «Сообщество» выключены — они не установятся.')+'</p>' : '')+
      (community.length ? '<label class="hub-ack"><input type="checkbox" data-hub-ack '+(current.ack?'checked':'')+'> Понимаю: Loginom это не проверял, а агент будет следовать указаниям навыка. Результат проверю сам</label>' : '')+
      '<p class="hub-dialog-footnote">Установка только добавляет это в приложение. Доступ к пакету и запуск подтверждаются отдельно при каждом использовании.</p>';
    actions = '<button class="btn quiet" data-hub-action="import">'+(incompatible?'Выбрать другой файл':'Назад')+'</button><button class="btn primary" data-hub-action="install" '+(incompatible||!changes.length||(community.length&&!current.ack)?'disabled':'')+'>Установить'+(changes.length?' ('+changes.length+')':'')+'</button>';
  }
  if (current.kind === 'installed') {
    title = 'Готово';
    body = '<div class="hub-result"><span class="hub-tile hub-sage">'+icon('check',27)+'</span><h3>'+escape(current.name)+'</h3><p>Добавлено в приложение. Если что-то пойдёт не так, предыдущие версии можно вернуть в разделе «История».</p></div>';
    actions = '<button class="btn" data-hub-tab="history">История</button>'+
      (current.next && byId(current.next).kind === 'Действие' ? '<button class="btn" data-hub-pin="'+current.next+'">Показывать в строке действий</button>' : '')+
      (current.next?'<button class="btn primary" data-hub-use="'+current.next+'">'+kinds[byId(current.next).kind].use+'</button>':'<button class="btn primary" data-hub-tab="installed">Установленные</button>');
  }
  if (current.kind === 'rollback') {
    title = 'Вернуть как было?';
    body = '<p class="hub-dialog-lead">Установленное вернётся к состоянию до последней операции: добавленное ею исчезнет, прежние версии вернутся.</p>';
    actions = '<button class="btn quiet" data-hub-action="close">Отмена</button><button class="btn primary" data-hub-action="confirm-rollback">Вернуть</button>';
  }
  return '<dialog class="hub-dialog" aria-labelledby="hub-dialog-title"><header><h2 id="hub-dialog-title">'+title+'</h2><button class="hub-close" data-hub-action="close" aria-label="Закрыть">'+icon('close',19)+'</button></header>'+
    '<div class="hub-dialog-main">'+body+'</div>'+(actions?footer(actions):'')+'</dialog>';
}

function record(hub, kind, ids, name) {
  const before = {...hub.installed};
  for (const id of ids) {
    if (kind === 'remove') delete hub.installed[id];
    else hub.installed[id] = byId(id).version;
  }
  hub.events.unshift({kind, name, ids, before, date:now()});
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
  root.querySelector('[data-hub-ack]')?.addEventListener('change', event => {
    hub.dialog.ack = event.target.checked;
    const install = root.querySelector('[data-hub-action="install-one"], [data-hub-action="install"]');
    if (install) install.disabled = !event.target.checked;
  });

  root.querySelectorAll('[data-hub-tab], [data-hub-type], [data-hub-tier], [data-hub-detail], [data-hub-use], [data-hub-pin], [data-hub-sample], [data-hub-favorite], [data-hub-action]').forEach(button=>button.addEventListener('click', () => {
    const data = button.dataset;
    if (data.hubTab) Object.assign(hub,{tab:data.hubTab,type:'Все',query:'',dialog:null});
    if (data.hubType) hub.type = data.hubType;
    if (data.hubTier) hub.tier = data.hubTier;
    if (data.hubDetail) hub.dialog = {kind:'detail',id:data.hubDetail};
    if (data.hubFavorite) {
      const id = data.hubFavorite;
      hub.favorites = hub.favorites.includes(id) ? hub.favorites.filter(entry=>entry!==id) : [...hub.favorites,id];
    }
    if (data.hubPin) { hub.dialog = null; api.pinSolution(data.hubPin); api.render(); return; }
    if (data.hubUse) {
      const item = byId(data.hubUse);
      hub.dialog = null;
      if (item.runner) api.runSolution(item.runAs?.solution || item.id, item.runAs?.mode);
      else api.useTemplate(item.title,item.prompt);
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
    switch (data.hubAction) {
      case 'import': hub.dialog = {kind:'import',required:hub.dialog?.required}; break;
      case 'close': hub.dialog = null; break;
      case 'clear': hub.query = ''; hub.type = 'Все'; hub.tier = 'all'; break;
      case 'studio': hub.dialog = null; if (state.own) state.own.editing = null; api.navigate('studio'); return;
      case 'install-one': {
        const item = byId(hub.dialog.id);
        const update = Boolean(hub.installed[item.id]);
        record(hub, update ? 'update' : 'install', [item.id], item.title);
        hub.dialog = {kind:'installed',name:item.title,next:item.runner || item.prompt ? item.id : null};
        api.toast(update ? 'Обновлено' : 'Установлено');
        break;
      }
      case 'remove': {
        const item = byId(hub.dialog.id);
        record(hub, 'remove', [item.id], item.title);
        hub.dialog = null;
        api.toast('Удалено. Вернуть можно в разделе «История».');
        break;
      }
      case 'install': {
        const bundle = hub.dialog.bundle;
        if (bundle.minAgent !== '0.5.0') return;
        const ids = installable(bundle, hub, state.contour !== 'closed');
        if (!ids.length || (ids.some(id=>byId(id).tier === 'community') && !hub.dialog.ack)) return;
        const required = hub.dialog.required;
        record(hub, 'import', ids, bundle.name);
        hub.dialog = {kind:'installed',name:bundle.name,next:ids.includes(required)?required:null};
        break;
      }
      case 'rollback': hub.dialog = {kind:'rollback'}; break;
      case 'confirm-rollback': {
        const entry = hub.events[0];
        if (!entry?.before) return;
        hub.installed = {...entry.before};
        hub.events.unshift({kind:'revert',name:entry.name,ids:entry.ids,date:now()});
        hub.dialog = null;
        break;
      }
    }
    api.render();
  }));
}
