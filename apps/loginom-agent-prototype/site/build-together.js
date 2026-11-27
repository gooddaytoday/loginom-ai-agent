const title = 'Собрать вместе с Loginom'
const importPrompt = 'Импортируй файл продаж'
const filterPrompt = 'Вставь фильтр перед «Результат»: только 2026 год'
const savePrompt = 'Сохрани как «Продажи — сборка» в моей папке'
const fixPrompt = 'Исправь имя узла «Левое» на «Слияние»'
const workWarning = 'Агент работает в окне Loginom — не меняйте схему до конца шага'
const interruptWarning = 'Вы изменили схему во время шага: шаг остановлен, ваши правки остались в окне'
const csv = `date,product,region,quantity,amount
2025-10-08,Кружка,Север,2,760
2025-12-17,Термос,Центр,1,1490
2026-01-09,Кружка,Север,3,1140
2026-02-12,Блокнот,Юг,6,1740
2026-02-24,Термос,Центр,2,2980
2026-03-04,Блокнот,Север,4,1160
2026-04-18,Кружка,Центр,5,1900
2026-05-03,Термос,Юг,2,2980
2026-07-21,Кружка,Север,1,380
2026-10-30,Блокнот,Центр,3,870
2027-01-05,Термос,Север,1,1490
2027-01-12,Блокнот,Юг,2,580
`
const csvDownload = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
const seconds = {import:90, filter:270, fix:120}
const now = () => new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'})
const last = item => item.build.turns.at(-1)
const working = item => last(item)?.status === 'working'
const packageName = pkg => pkg?.path?.split('/').at(-1) || 'Продажи — сборка'
const newPackage = () => ({nodes:{result:'Результат', merge:'Слияние'}, links:[], rows:[], modified:now(), dirty:true})
const nodeKinds = {import:'Импорт CSV', filter:'Фильтр по дате', result:'Выход сценария', merge:'Слияние'}

export function createBuildTogether({state, esc, icon, render, composer, openSession, newSession, currentItem, moreButton}) {
  const current = () => state.page === 'chat' ? currentItem() : null
  const windows = () => state.sessions.filter(item => item.build?.open)
  const unsaved = item => item.build?.open && item.build.pkg?.dirty
  let closing = null
  let sequence = 0

  function start() {
    const item = {
      id:'build-' + ++sequence, title, project:null, date:'Сегодня', kind:'build-together',
      build:{turns:[], edits:[], open:false, visible:false, pkg:null, saved:null},
    }
    state.sessions.unshift(item)
    state.draftFiles = []
    state.draftPackage = null
    openSession(item.id)
    state.draft = importPrompt
    render()
    document.querySelector('#prompt')?.focus()
  }

  function update(item, follow = false) {
    if (follow && current() === item) state.scrollToEnd = true
    if (!state.overlay) render()
  }

  function request(item, prompt) {
    const build = item.build
    if (working(item)) return
    const pkg = build.pkg
    const turn = {prompt}
    build.turns.push(turn)
    state.draft = ''
    if (/^сохрани(?:те)?\s/iu.test(prompt) && pkg && build.open) {
      const name = prompt.match(/[«"]([^»"\/\\]+)[»"]/)?.[1].trim()
      save(item, name, turn)
    } else if (/^импорт/iu.test(prompt) && !pkg?.nodes.import) {
      begin(item, turn, 'import')
    } else if (/фильтр/iu.test(prompt) && /2026/.test(prompt) && build.open && pkg?.nodes.import && !pkg.nodes.filter) {
      begin(item, turn, 'filter')
    } else if (/^(?:исправь|переименуй).*левое.*слияние/iu.test(prompt) && build.open && pkg?.nodes.merge === 'Левое') {
      begin(item, turn, 'fix')
    } else {
      turn.answer = pkg?.nodes.filter ? `Попробуйте «${savePrompt}».` : pkg?.nodes.import ? `Попробуйте «${filterPrompt}».` : `Попробуйте «${importPrompt}».`
    }
    update(item, true)
  }

  function begin(item, turn, step) {
    const build = item.build
    build.pkg ??= newPackage()
    build.open = build.visible = true
    turn.edits = build.edits.splice(0)
    turn.step = step
    turn.status = 'working'
    item.phase = 'running'
    turn.timer = setTimeout(() => finish(item, turn), seconds[step] * 1000 / 20)
  }

  function finish(item, turn) {
    const build = item.build
    const pkg = build.pkg
    if (turn.step === 'import') {
      const [, ...rows] = csv.trim().split(/\r?\n/)
      pkg.rows = rows
      pkg.nodes.import = 'Импорт'
      pkg.links.push(['import', 'result'])
      turn.answer = `Добавил узел «Импорт» для sales-demo.csv. Связал с узлом «${pkg.nodes.result}». Запустил импорт без ошибок · ${pkg.rows.length} строк.`
    } else if (turn.step === 'filter') {
      pkg.nodes.filter = 'Только 2026 год'
      // «Вставь … перед/между» rewires the existing link; «добавь после» only adds a branch — the agent does not touch neighbours unasked.
      const insert = /встав|между|перед/iu.test(turn.prompt || '')
      const direct = pkg.links.some(([from, to]) => from === 'import' && to === 'result')
      if (insert) pkg.links = pkg.links.filter(([from, to]) => from !== 'import' || to !== 'result')
      pkg.links.push(['import', 'filter'])
      if (insert) pkg.links.push(['filter', 'result'])
      turn.answer = insert
        ? `Вставил фильтр «Только 2026 год» ${direct ? `между «${pkg.nodes.import}» и «${pkg.nodes.result}»` : `перед «${pkg.nodes.result}»`}. Запустил без ошибок · ${rowsIn2026(pkg)} из ${pkg.rows.length} строк, «${pkg.nodes.result}» получает ${rowsIn2026(pkg)} строк.`
        : `Добавил фильтр «Только 2026 год» отдельной веткой от «${pkg.nodes.import}»: «${pkg.nodes.result}» по-прежнему получает все ${pkg.rows.length} строк. Чтобы фильтр стоял перед «${pkg.nodes.result}», попросите: «вставь фильтр перед «${pkg.nodes.result}»». Запустил без ошибок · ${rowsIn2026(pkg)} из ${pkg.rows.length} строк.`
    } else {
      pkg.nodes.merge = 'Слияние'
      turn.answer = 'Переименовал узел «Левое» в «Слияние». Связи не менял. Запуск для переименования не нужен.'
    }
    markDirty(pkg)
    turn.status = 'done'
    item.phase = 'done'
    update(item)
  }

  function stop(item, warning) {
    const turn = last(item)
    clearTimeout(turn.timer)
    turn.status = 'stopped'
    turn.warning = warning
    item.phase = 'done'
    if (warning) update(item, true)
  }

  function markDirty(pkg) {
    pkg.dirty = true
    pkg.modified = now()
  }

  function rowsIn2026(pkg) {
    return pkg.rows.filter(row => row.startsWith('2026-')).length
  }

  function save(item, name, turn = {}) {
    const build = item.build
    const pkg = build.pkg
    const filename = name || packageName(pkg)
    pkg.path = '/user/' + filename + (/\.lgp$/i.test(filename) ? '' : '.lgp')
    pkg.savedAt = now()
    pkg.dirty = false
    // The demo Loginom normalizes one node on the first save. Use the read-back names from here on.
    build.saved = structuredClone(pkg)
    if (!build.savedOnce && pkg.nodes.merge === 'Слияние') {
      build.saved.nodes.merge = 'Левое'
      turn.renamed = true
    }
    build.savedOnce = true
    build.pkg = structuredClone(build.saved)
    const checked = build.saved
    const ran = Boolean(checked.nodes.import)
    turn.answer = 'Сохранил пакет и перечитал его в Loginom.'
    turn.verification = {path:checked.path, nodes:Object.keys(checked.nodes).length, ran, rows:checked.nodes.filter ? rowsIn2026(checked) : checked.rows.length}
    if (!turn.prompt) build.turns.push(turn)
  }

  function edit(item, command) {
    const build = item.build
    const pkg = build.pkg
    if (!build.open) return
    if (command === 'interrupt') {
      if (!working(item)) return
      const before = pkg.nodes.result
      const after = before === 'Результат' ? 'Выход' : 'Результат'
      pkg.nodes.result = after
      build.edits.push(`переименовали «${before}» → «${after}»`)
      markDirty(pkg)
      return stop(item, interruptWarning)
    }
    if (working(item)) return
    if (command === 'rename' && pkg.nodes.import === 'Импорт') {
      pkg.nodes.import = 'Продажи'
      build.edits.push('переименовали «Импорт» → «Продажи»')
    } else if (command === 'unlink' && pkg.links.some(([from, to]) => from === 'import' && to === 'result')) {
      pkg.links = pkg.links.filter(([from, to]) => from !== 'import' || to !== 'result')
      build.edits.push(`удалили связь «${pkg.nodes.import}» → «${pkg.nodes.result}»`)
    } else return
    markDirty(pkg)
    update(item)
  }

  function closeWindow(item) {
    const build = item.build
    if (working(item)) stop(item, 'Шаг остановлен при закрытии окна Loginom.')
    build.open = build.visible = false
    build.pkg = structuredClone(build.saved)
    build.edits = []
  }

  function continueClosing(choice) {
    const pending = closing.dirty[0]
    if (choice === 'save') {
      if (working(pending)) stop(pending, 'Шаг остановлен при закрытии окна Loginom.')
      save(pending)
    }
    if (choice) closing.dirty.shift()
    if (closing.dirty.length) {
      state.overlay = 'build-close'
      return render()
    }
    const {after, items} = closing
    items.forEach(closeWindow)
    closing = null
    state.overlay = null
    after()
  }

  function close(items, after, reason = 'window') {
    const open = items.filter(item => item.build?.open)
    if (!open.length) return after()
    closing = {items:open, dirty:open.filter(unsaved), after, reason, back:state.overlay}
    continueClosing()
  }

  function cancelClose() {
    if (!closing) return
    state.overlay = closing.back
    closing = null
    render()
  }

  function command(action, id) {
    const item = id ? state.sessions.find(entry => entry.id === id) : current()
    if (action === 'exit') return close(windows(), newSession, 'exit')
    if (action === 'save' || action === 'discard') return continueClosing(action)
    if (action === 'close') return close([item], render)
    if (action === 'show') {
      const build = item.build
      if (!build.open) {
        build.pkg ??= newPackage()
        build.open = true
      }
      build.visible = !build.visible
      if (state.overlay === 'loginom-status') {
        build.visible = true
        return openSession(item.id)
      }
      render()
    }
    if (action === 'retry' && !working(item) && last(item)?.status === 'stopped') {
      const previous = last(item)
      const turn = {prompt:previous.prompt, retry:true}
      item.build.turns.push(turn)
      begin(item, turn, previous.step)
      update(item, true)
    }
    if (action === 'fill-filter' || action === 'fill-save' || action === 'fill-fix') {
      state.draft = {'fill-filter':filterPrompt, 'fill-save':savePrompt, 'fill-fix':fixPrompt}[action]
      render()
      document.querySelector('#prompt')?.focus()
    }
    if (['rename','unlink','interrupt'].includes(action)) edit(item, action)
    if (action === 'view' && item.build.saved) {
      state.buildView = item.build.saved
      state.overlay = 'build-view'
      render()
    }
  }

  function warning() {
    return `<p class="build-warning" role="status">${icon('alert',16)} <span>${workWarning}</span></p>`
  }

  function schema(pkg) {
    return `<div class="build-canvas" aria-label="Схема пакета">
      <ul class="build-nodes">${Object.keys(nodeKinds).filter(id => pkg.nodes[id]).map(id => `<li><span class="glyph ${id === 'import' ? 'blue' : 'red'}">${icon(id === 'import' ? 'database' : 'flow',16)}</span><span><strong>${esc(pkg.nodes[id])}</strong><small>${nodeKinds[id]}</small></span></li>`).join('')}</ul>
      <div class="build-links"><strong>Связи</strong>${pkg.links.length ? `<ul>${pkg.links.map(([from, to]) => `<li>${esc(pkg.nodes[from])} → ${esc(pkg.nodes[to])}</li>`).join('')}</ul>` : '<p>Связей нет</p>'}</div>
    </div>`
  }

  function panel(item) {
    const {pkg} = item.build
    const busy = working(item)
    const canUnlink = pkg.links.some(([from, to]) => from === 'import' && to === 'result')
    return `<aside class="build-window" aria-labelledby="build-window-title">
      <div class="build-window-title"><img src="assets/loginom.png" alt="" width="22" height="22"><h2 id="build-window-title">Окно Loginom</h2><button class="icon-btn" aria-label="Закрыть окно Loginom" title="Закрыть окно Loginom" data-build="close">${icon('close',18)}</button></div>
      <div class="build-window-package"><strong>${esc(packageName(pkg))}</strong><small>Схема пакета · макет Loginom</small></div>
      ${busy ? warning() : ''}
      ${schema(pkg)}
      <div class="build-window-controls">
        ${busy ? '<button class="btn" data-build="interrupt">Изменить схему, пока агент работает</button>'
          : `<button class="btn" data-build="rename" ${pkg.nodes.import === 'Импорт' ? '' : 'disabled'}>Переименовать узел</button><button class="btn" data-build="unlink" ${canUnlink ? '' : 'disabled'}>Удалить связь</button>`}
      </div>
    </aside>`
  }

  function turnView(item, turn) {
    const verification = turn.verification
    return `<div class="turn build-turn">
      ${turn.prompt && !turn.retry ? `<div class="user-turn"><div class="user-message">${esc(turn.prompt)}${turn.step === 'import' ? `<div class="message-files"><a href="${csvDownload}" download="sales-demo.csv">${icon('file',14)} sales-demo.csv</a></div>` : ''}</div></div>` : ''}
      <div class="agent-message"><span class="agent-avatar"><img src="assets/loginom.png" alt="" width="31" height="31"></span><div class="agent-body"><strong class="agent-caption">Loginom AI Agent</strong>
        <div class="answer-block build-answer">
          ${turn.retry ? '<p class="muted">Повтор шага</p>' : ''}
          ${turn.edits?.length ? `<p class="build-edits">Учёл ваши правки в Loginom: ${esc(turn.edits.join(', '))}.</p>` : ''}
          ${turn.status === 'working' ? `${warning()}<div class="build-wait"><progress aria-label="Выполняется шаг"></progress><strong>Прототип ускоряет ожидание ×20</strong></div>` : ''}
          ${turn.warning ? `<p class="build-warning" role="status">${icon('alert',16)} <span>${esc(turn.warning)}</span></p>` : ''}
          ${turn.status === 'stopped' && turn === last(item) && item.build.open ? '<button class="btn" data-build="retry">Повторить шаг</button>' : ''}
          ${turn.answer ? `<p>${esc(turn.answer)}</p>` : ''}
          ${turn.renamed ? `<div class="build-edits"><p>Loginom переименовал узел «Слияние» → «Левое»</p>${item.build.open && item.build.pkg.nodes.merge === 'Левое' ? '<button class="link-btn" data-build="fill-fix">Попросить исправить</button>' : ''}</div>` : ''}
          ${verification ? `<section class="build-verified" aria-label="Проверено приложением"><h2>${icon('check',16)} Проверено приложением</h2>
            <ul><li>Пакет по пути <code>${esc(verification.path)}</code></li><li>Узлы · ${verification.nodes}</li>
            ${verification.ran ? `<li>Запуск без ошибок · ${verification.rows} строк результата</li>` : ''}</ul>
            <p class="muted">${verification.ran ? 'Не проверены настройки и запуск остальных узлов.' : 'Проверочный запуск и число строк не проверены: импорта ещё нет.'}</p>
            <button class="btn" data-build="view">${icon('external',15)} Посмотреть в Loginom</button></section>` : ''}
        </div>
      </div></div>
    </div>`
  }

  function packageLine(build) {
    const pkg = build.pkg
    const where = build.open ? 'открыт в окне Loginom' : 'окно Loginom закрыто'
    const status = pkg.dirty ? `не сохранён · изменён ${pkg.modified}` : `сохранён ${pkg.savedAt} в ${pkg.path}`
    const name = pkg.dirty ? pkg.path || 'Путь ещё не задан' : packageName(pkg)
    return `<div class="build-package">${icon('file',17)}<div><strong>${esc(name)}</strong><small>${esc(where + ' · ' + status)}</small></div></div>`
  }

  function chat(item) {
    const build = item.build
    const pkg = build.pkg
    const suggestion = !working(item) && build.open && last(item)?.status !== 'stopped' &&
      (pkg?.nodes.filter && pkg.dirty ? ['fill-save', savePrompt] : pkg?.nodes.import && !pkg.nodes.filter ? ['fill-filter', filterPrompt] : null)
    return `<div class="chat-layout build-layout${build.visible ? ' build-layout-open' : ''}">
      <div class="chat-main">
        <div class="build-chat-title"><div><p class="eyebrow">Разговор</p><h1>${esc(item.title)}</h1></div>${moreButton('chat',item.id,`Действия с разговором «${item.title}»`).replace('row-more','row-more page-more')}</div>
        ${pkg ? packageLine(build) : ''}
        <div class="build-toolbar"><button class="btn" data-build="show" aria-expanded="${build.visible}">${icon('panel',17)} ${build.visible ? 'Скрыть окно Loginom' : 'Показать окно Loginom'}</button></div>
        <div class="chat-timeline">${build.turns.length ? build.turns.map(turn => turnView(item, turn)).join('') : `<div class="answer-block build-intro"><p>Начните с импорта учебной таблицы. После шага можно изменить схему в окне Loginom и попросить агента продолжить.</p><a href="${csvDownload}" download="sales-demo.csv">${icon('file',16)} sales-demo.csv</a></div>`}</div>
        <div class="chat-bottom">${suggestion ? `<button class="link-btn build-suggestion" data-build="${suggestion[0]}">${esc(suggestion[1])}</button>` : ''}${composer(item)}</div>
      </div>
      ${build.visible ? panel(item) : ''}
    </div>`
  }

  function windowsList() {
    const items = windows()
    return `<section class="build-windows-list"><h3>Окна приложения</h3>
      ${items.length ? `<ul>${items.map(item => `<li><div><strong>${esc(item.title)}</strong><small>${esc(item.build.pkg.path || packageName(item.build.pkg))} · ${item.build.pkg.dirty ? 'не сохранён' : 'сохранён'}</small>
      <button class="link-btn" data-build="show" data-build-id="${item.id}">Показать окно Loginom</button></div><button class="btn" data-build="close" data-build-id="${item.id}">Закрыть</button></li>`).join('')}</ul>` : '<p class="muted">Открытых окон Loginom нет.</p>'}
      <button class="btn quiet" data-build="exit">Выйти из приложения</button>
    </section>`
  }

  function dialog(kind) {
    if (kind === 'build-view') {
      const pkg = state.buildView
      return ['Посмотреть в Loginom', `<div class="build-view-path"><code>${esc(pkg.path)}</code></div>${schema(pkg)}`]
    }
    const item = closing.dirty[0]
    const heading = {window:'Закрыть окно Loginom?', chat:'Закрыть разговор?', exit:'Выйти из приложения?'}[closing.reason]
    return [heading, `<p class="dialog-desc">Пакет «${esc(packageName(item.build.pkg))}» в разговоре «${esc(item.title)}» не сохранён.</p>
      <div class="button-row"><button class="btn primary" data-build="save">Сохранить в Loginom</button><button class="btn" data-build="discard">Закрыть без сохранения</button><button class="btn quiet" data-action="dismiss">Отмена</button></div>`]
  }

  addEventListener('beforeunload', event => {
    if (!windows().some(unsaved)) return
    event.preventDefault()
    event.returnValue = true
  })

  return {start, request, command, close, cancelClose, chat, windowsList, dialog, working, hasWindows:() => windows().length > 0}
}
