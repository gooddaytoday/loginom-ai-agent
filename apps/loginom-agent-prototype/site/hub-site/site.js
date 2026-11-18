// Prototype of the Loginom Hub catalog site (В-51): pages built from the signed catalog, no accounts and no database.
// An administrator reads the full text, downloads one item or an archive, and hands it to users in a closed network;
// they install it through «Каталог» → «Импорт из файла», and the app checks the Loginom signature.
import { catalog, tiers, kinds, tierBadge, evidenceLine } from '../catalog.js';
import { createDemoArchive } from '../hub.js';
import { icon } from '../icons.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
const root = document.getElementById('site');
const tierFilters = [['all','Все'],['official','Loginom'],['verified','Проверено Loginom'],['community','Сообщество']];
const state = { query:'', tier:'all', type:'Все', open:null, picked:new Set() };
// Built-in actions come with the app; there is nothing to download for them.
const items = catalog.filter((item) => !item.builtIn);

const theme = (() => { try { return JSON.parse(localStorage.getItem('loginom-demo-theme')) || 'light'; } catch { return 'light'; } })();
document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;

function downloadable(item) {
  return item.offline !== false;
}
// A stable stand-in for the file digest the real catalog carries.
function digest(text) {
  let hash = 0x811c9dc5;
  const out = [];
  for (let round = 0; round < 8; round++) {
    for (const ch of text + round) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    out.push(hash.toString(16).padStart(8, '0'));
  }
  return out.join('');
}
function contents(item) {
  if (item.kind === 'Навык') return {
    files:[['SKILL.md', '4 КБ'], ['примеры.md', '2 КБ']],
    text:'---\nname: ' + item.id + '\ndescription: ' + item.description + '\n---\n\n# ' + item.title + '\n\n' + item.description +
      '\n\n## Как действовать\n1. Уточни у пользователя данные и цель, если их нет в сообщении.\n2. ' + (item.prompt || 'Выполни задачу по шагам.') +
      '\n3. В конце коротко перечисли, что сделано и что проверить.\n',
  };
  if (item.kind === 'Действие') return {
    files:[['action.json', '1 КБ']],
    text:'Своё действие на основе встроенного: параметры, которые подставятся в мастер.\n\n' + (item.description || '') + '\n',
  };
  if (item.kind === 'Готовый сценарий') return {
    files:[[item.title + '.lgp', item.size || '1 МБ']],
    text:'Пакет Loginom (.lgp). Копия ляжет в папку пользователя в Loginom; открыть и посмотреть узлы можно в Loginom после установки.\n',
  };
  return { files:[['connection.json', '1 КБ']], text:'Подключение к внешнему сервису. Нужен интернет.\n' };
}
function closedNote(item) {
  if (!downloadable(item)) return 'Нужен интернет — в закрытом контуре не работает';
  if (item.tier === 'community') return 'В закрытом контуре установится, только если администратор разрешил навыки «Сообщество»';
  return '';
}

function render() {
  const query = state.query.trim().toLocaleLowerCase('ru');
  const list = items.filter((item) => (state.tier === 'all' || item.tier === state.tier) && (state.type === 'Все' || item.kind === state.type) &&
    (!query || [item.title, item.product, item.description, item.kind, item.keywords].join(' ').toLocaleLowerCase('ru').includes(query)));
  const types = ['Все', ...new Set(items.map((item) => item.kind))];
  root.innerHTML = '<header class="hs-top"><a class="hs-brand" href="./"><img src="../assets/loginom.png" alt="" width="28" height="28"><span><strong>Loginom Hub</strong><small>Каталог навыков и действий для Loginom AI Agent</small></span></a>'+
    '<a class="hs-app" href="../#hub">Открыть приложение (прототип) '+icon('arrow',15)+'</a></header>'+
    '<main class="hs-main"><section class="hs-intro"><h1>Каталог навыков</h1><p>Здесь можно посмотреть, что внутри каждого навыка, и скачать его файлом или несколько — одним архивом. Для компьютеров без интернета: скачайте здесь и передайте пользователям.</p>'+
    '<ol class="hs-steps"><li><strong>Скачайте</strong> нужное — по одному или архивом.</li><li><strong>Проверьте сами</strong>, если считаете нужным: полный текст и файлы — в «Что внутри».</li><li><strong>Передайте пользователям</strong> — они ставят файл через «Каталог» → «Импорт из файла». Приложение проверит подпись Loginom: изменённый или повреждённый файл не установится.</li></ol></section>'+
    '<div class="hs-toolbar"><label class="hub-search">'+icon('search',18)+'<input type="search" aria-label="Поиск в каталоге" placeholder="Что нужно сделать? Например, «проверить данные»" value="'+esc(state.query)+'"></label>'+
    '<div class="hub-filters" aria-label="Кто подготовил">'+tierFilters.map(([id, label]) => '<button data-tier="'+id+'" aria-pressed="'+(state.tier === id)+'">'+label+'</button>').join('')+'</div>'+
    '<div class="hub-filters" aria-label="Тип">'+types.map((type) => '<button data-type="'+esc(type)+'" aria-pressed="'+(state.type === type)+'"'+(kinds[type] ? ' title="'+esc(kinds[type].how)+'"' : '')+'>'+(kinds[type]?.plural || type)+'</button>').join('')+'</div></div>'+
    (list.length ? '<div class="hs-grid">'+list.map(card).join('')+'</div>' : '<div class="hub-empty"><h3>Ничего не нашлось</h3><p>Измените запрос или фильтры.</p></div>')+
    '<p class="hs-foot">Каталог подписан Loginom · обновлён 18.11.2026 · Только для прототипа: файлы демонстрационные, их можно импортировать в прототип приложения.</p></main>'+
    (state.picked.size ? '<div class="hs-bar"><span>'+icon('archive',17)+' В архиве: <strong>'+state.picked.size+'</strong></span><button class="btn quiet" data-clear>Очистить</button><button class="btn primary" data-archive>'+icon('download',16)+' Скачать архив</button></div>' : '')+
    (state.open ? detail(items.find((item) => item.id === state.open)) : '');
  bind();
}

function card(item) {
  const note = closedNote(item);
  const can = downloadable(item);
  return '<article class="hub-card hs-card"><div class="hub-card-head"><span class="hub-tile hub-'+item.color+'">'+icon(item.icon,23)+'</span><span class="hub-type">'+esc(item.kind)+'</span></div>'+
    '<button class="hub-card-title" data-open="'+item.id+'">'+esc(item.title)+'</button><p>'+esc(item.description)+'</p>'+
    '<div class="hub-trust">'+tierBadge(item)+(item.publisher ? '<span class="hub-publisher">'+esc(item.publisher)+'</span>' : '')+'</div>'+
    '<div class="hub-evidence">'+evidenceLine(item)+'</div><p class="hs-meta">Версия '+esc(item.version)+' · '+esc(item.size || '')+'</p>'+
    (note ? '<p class="hs-note">'+icon(can ? 'help' : 'lock',14)+' '+note+'</p>' : '')+
    '<div class="hs-actions"><button class="btn quiet" data-open="'+item.id+'">Что внутри</button>'+
    (can ? '<label class="hs-pick"><input type="checkbox" data-pick="'+item.id+'"'+(state.picked.has(item.id) ? ' checked' : '')+'> В архив</label><button class="btn" data-one="'+item.id+'">'+icon('download',15)+' Скачать</button>' : '')+'</div></article>';
}

function detail(item) {
  const inside = contents(item);
  const can = downloadable(item);
  return '<div class="hs-backdrop" data-close></div><section class="hs-detail" role="dialog" aria-labelledby="hs-detail-title"><header><div><span class="hub-type">'+esc(item.kind)+'</span><h2 id="hs-detail-title">'+esc(item.title)+'</h2></div><button class="hub-close" data-close aria-label="Закрыть">'+icon('close',19)+'</button></header>'+
    '<div class="hs-detail-main"><p>'+esc(item.description)+'</p>'+
    '<h3>Кто подготовил</h3><p>'+tierBadge(item)+' '+esc(item.publisher || 'Loginom')+'. '+esc(tiers[item.tier].explain)+'</p>'+
    '<h3>Проверка на примерах</h3><p>'+evidenceLine(item, true)+'</p>'+
    '<h3>Что будет разрешено</h3><div class="hub-perms"><div><h4>'+icon('check',16)+' Сможет</h4><ul>'+(item.can.length ? item.can.map((text) => '<li>'+esc(text)+'</li>').join('') : '<li>Только подсказывать агенту</li>')+'</ul></div>'+
    (item.cannot.length ? '<div><h4>'+icon('close',16)+' Не сможет</h4><ul>'+item.cannot.map((text) => '<li>'+esc(text)+'</li>').join('')+'</ul></div>' : '')+'</div>'+
    '<h3>Что внутри</h3><p class="hs-muted">Прочитайте перед тем, как передавать пользователям. В прототипе текст условный.</p><pre class="hs-text">'+esc(inside.text)+'</pre>'+
    '<table class="hs-files"><thead><tr><th>Файл</th><th>Размер</th><th>Контрольная сумма SHA-256</th></tr></thead><tbody>'+inside.files.map(([name, size]) => '<tr><td>'+esc(name)+'</td><td>'+esc(size)+'</td><td><code>'+digest(item.id + item.version + name)+'</code></td></tr>').join('')+'</tbody></table>'+
    '<p class="hs-muted">Версия '+esc(item.version)+' · совместимость: Loginom 7.4.2 и новее, приложение 0.5.0 и новее'+(closedNote(item) ? ' · '+esc(closedNote(item)) : '')+'</p></div>'+
    '<footer>'+(can ? '<label class="hs-pick"><input type="checkbox" data-pick="'+item.id+'"'+(state.picked.has(item.id) ? ' checked' : '')+'> В архив</label><button class="btn primary" data-one="'+item.id+'">'+icon('download',15)+' Скачать</button>' : '<span class="hs-muted">Этот элемент нельзя скачать для работы без интернета.</span>')+'</footer></section>';
}

function save(ids, name) {
  const file = createDemoArchive(ids, true, name);
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name.replace(/[\\/:*?"<>|]/g, '') + '.loginom-hub';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  // В-60: a closed-network file is valid for 180 days.
  toast('Файл «' + link.download + '» сохранён, действует до ' + new Date(Date.now() + 180 * 864e5).toLocaleDateString('ru-RU') + ' — передайте его пользователям');
}
function toast(text) {
  const box = document.getElementById('site-toast');
  box.textContent = text;
  box.classList.add('is-on');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('is-on'), 3200);
}

function bind() {
  root.querySelector('input[type="search"]')?.addEventListener('input', (event) => {
    state.query = event.target.value;
    const caret = event.target.selectionStart;
    render();
    const field = root.querySelector('input[type="search"]');
    field.focus();
    field.setSelectionRange(caret, caret);
  });
}
// The root stays; its content is redrawn. Listeners are attached once.
root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-tier],[data-type],[data-open],[data-close],[data-one],[data-archive],[data-clear]');
  if (!target) return;
  const d = target.dataset;
  if (d.tier) state.tier = d.tier;
  if (d.type) state.type = d.type;
  if (d.open) state.open = d.open;
  if ('close' in d) state.open = null;
  if (d.one) { const item = items.find((entry) => entry.id === d.one); save([item.id], item.title); return; }
  if ('archive' in d) { save([...state.picked], 'Набор Loginom Hub от 18.11.2026'); return; }
  if ('clear' in d) state.picked.clear();
  render();
});
root.addEventListener('change', (event) => {
  const box = event.target.closest('[data-pick]');
  if (!box) return;
  if (box.checked) state.picked.add(box.dataset.pick);
  else state.picked.delete(box.dataset.pick);
  render();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.open) { state.open = null; render(); }
});
render();
