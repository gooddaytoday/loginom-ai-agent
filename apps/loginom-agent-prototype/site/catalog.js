// Single catalog for the Hub, the package actions and the solution runner.
// tier: who stands behind the item — official (Loginom), verified (community, checked by Loginom),
// community (not checked). evidence: separate axis — analytical checks on real examples.
export const tiers = {
  official: { label: 'Loginom', title: 'Подготовил сам Loginom', tone: 'official',
    explain: 'Подготовлено и поддерживается Loginom. Действия Loginom работают с Loginom через инструменты, встроенные в приложение; перед каждым запуском мастер показывает, что именно будет разрешено.' },
  verified: { label: 'Проверено Loginom', title: 'Автор из сообщества, Loginom проверил', tone: 'verified',
    explain: 'Автор — участник сообщества, Loginom проверил содержимое. Устанавливается без дополнительных вопросов и доступно в закрытом контуре; дополнительных прав не получает: всё выполняет само приложение с теми же разрешениями, что у возможностей Loginom.' },
  community: { label: 'Сообщество', title: 'Автор из сообщества, Loginom не проверял', tone: 'community',
    explain: 'Сделал другой пользователь, Loginom это не проверял. Агент будет следовать указаниям навыка, в том числе в Loginom, — смотрите, что он делает, и проверяйте результат. Что именно будет разрешено, написано ниже.' },
}

// What the user does with each type of catalog item. Hub formats (ADR-001) map onto these:
// solution and adapter templates -> Действие, skill and knowledge-base -> Навык, lgp-package -> Готовый сценарий (В-48),
// integration -> Подключение.
export const kinds = {
  'Действие': { plural: 'Действия', use: 'Запустить', how: 'Запускается для пакета по шагам и даёт отчёт или новый файл.' },
  'Навык': { plural: 'Навыки', use: 'Начать разговор', how: 'Агент лучше справляется с задачей в разговоре. Отдельно запускать не нужно.' },
  'Готовый сценарий': { plural: 'Готовые сценарии', use: 'Открыть', how: 'Копия ляжет в вашу папку Loginom: её можно открыть и изменить.' },
  'Подключение': { plural: 'Подключения', use: 'Подключить', how: 'Даёт агенту доступ к внешнему сервису. Нужен интернет.' },
}

// Package actions. New ones arrive with app updates or from the catalog (kind «Действие»); privileged work is
// always done by an action built into the app (run), catalog data only configures it.
export const actions = {
  document: { title: 'Документировать', detail: 'Описание сценария, узлов и потоков данных', icon: 'book', solution: 'document' },
  check: { title: 'Проверить', detail: 'Найти проблемы в структуре сценария', icon: 'shield', solution: 'refactor', mode: 'review' },
  improve: { title: 'Улучшить', detail: 'Агент правит копию в разговоре; вы решаете, сохранить ли', icon: 'wand', solution: 'refactor', mode: 'copy' },
  compare: { title: 'Сравнить', detail: 'Сопоставить две версии по результату и скорости', icon: 'chart', solution: 'tournament' },
  regression: { title: 'Проверить на эталоне', detail: 'Запустить на тестовых данных и сверить с эталоном', icon: 'layers', solution: 'regression' },
  standard: { title: 'Проверить по стандарту', detail: 'Названия, комментарии и порядок полей по правилам DataLab', icon: 'check', solution: 'standard', run: { solution: 'refactor', mode: 'review' } },
  sql: { title: 'Собрать пакет из SQL', detail: 'Создать сценарий Loginom по SQL-запросу', icon: 'database', solution: 'migration', noPackage: true },
}

export const catalog = [
  {
    id: 'document', title: 'Документировать', product: 'ИИ Отчёт', kind: 'Действие', icon: 'book', color: 'lilac',
    version: '1.0.0', tier: 'official', builtIn: true, runner: true, offline: true, size: 'Встроено в приложение',
    keywords: 'документация описание отчёт docs',
    description: 'Создаёт понятное описание сценария: назначение, модули, потоки данных и заметки. PDF, Word или Markdown.',
    evidence: { passed: 18, total: 18, loginom: '7.4', note: 'на 18 учебных и рабочих пакетах' },
    can: ['Прочитать выбранный файл .lgp', 'Пользоваться встроенной справкой Loginom', 'Создать документ в папке проекта'],
    cannot: ['Изменять пакет', 'Подключаться к Loginom и открывать браузер', 'Запускать программы на компьютере', 'Открывать сайты в интернете'],
    stages: ['Чтение пакета', 'Описание узлов по справке Loginom', 'Сборка документа', 'Проверка полноты'],
  },
  {
    id: 'refactor', title: 'Проверить и улучшить', product: 'Scenario Refactor', kind: 'Действие', icon: 'flow', color: 'sage',
    version: '1.0.0', tier: 'official', runner: true, offline: true, size: '0,4 МБ',
    keywords: 'рефакторинг оптимизация улучшить проверить аудит',
    description: 'Находит повторяющиеся преобразования, неясные названия и лишние узлы. Улучшения собирает в отдельной копии.',
    evidence: { passed: 9, total: 10, loginom: '7.4.2', note: 'на 10 эталонных сценариях' },
    can: ['Открывать пакет в Loginom под вашей учётной записью и читать настройки узлов', 'В режиме «Улучшить» — менять узлы и сохранять результат новым пакетом'],
    cannot: ['Сохранять поверх исходного пакета', 'Удалять пакеты', 'Открывать сайты в интернете'],
    stages: ['Открытие копии пакета', 'Разбор структуры', 'Поиск улучшений', 'Сборка отчёта'],
  },
  {
    id: 'regression', title: 'Проверить на эталоне', product: 'Regression Studio', kind: 'Действие', icon: 'shield', color: 'blue',
    version: '1.0.0', tier: 'official', runner: true, offline: true, size: '0,6 МБ',
    keywords: 'регрессия эталон проверка изменений',
    description: 'Запускает сценарий на тестовых данных и сравнивает результат с утверждённым эталоном.',
    evidence: null,
    can: ['Открывать пакет в Loginom под вашей учётной записью', 'Запускать сценарий на тестовых данных', 'Читать эталон'],
    cannot: ['Менять пакет и эталон', 'Открывать сайты в интернете'],
    stages: ['Подготовка копии', 'Запуск на тестовых данных', 'Сравнение с эталоном', 'Отчёт'],
  },
  {
    id: 'tournament', title: 'Сравнить версии', product: 'Scenario Tournament', kind: 'Действие', icon: 'chart', color: 'sand',
    version: '1.0.0', tier: 'official', runner: true, offline: true, size: '0,5 МБ',
    keywords: 'сравнение турнир версии скорость',
    description: 'Сопоставляет две версии сценария: совпадают ли результаты и какая работает быстрее.',
    evidence: null,
    can: ['Открывать два пакета в Loginom под вашей учётной записью', 'Запускать их и замерять время'],
    cannot: ['Менять и сохранять пакеты', 'Открывать сайты в интернете'],
    stages: ['Подготовка копий', 'Сверка результатов', 'Замеры времени', 'Отчёт'],
  },
  {
    id: 'migration', title: 'Собрать пакет из SQL', product: 'Migration Bridge', kind: 'Действие', icon: 'link', color: 'clay',
    version: '1.0.0', tier: 'official', runner: true, offline: true, size: '0,5 МБ',
    keywords: 'sql миграция перенос запрос',
    description: 'Собирает сценарий Loginom по SQL-запросу и сверяет результат на тестовой выборке.',
    evidence: null,
    can: ['Создавать новый пакет в вашей папке Loginom', 'Запускать его на тестовой выборке'],
    cannot: ['Подключаться к вашей базе данных — запрос только читается', 'Менять другие пакеты'],
    stages: ['Разбор запроса', 'Сборка сценария', 'Сверка на выборке', 'Отчёт'],
  },
  {
    id: 'standard', title: 'Проверить по стандарту', kind: 'Действие', icon: 'check', color: 'sage',
    version: '1.1.0', tier: 'verified', publisher: 'DataLab', runner: true, runAs: { solution: 'refactor', mode: 'review' }, offline: true, size: '18 КБ',
    keywords: 'стандарт оформление названия комментарии проверка правила',
    description: 'Проверяет пакет по правилам оформления DataLab: названия узлов, комментарии, порядок полей. Выполняется встроенным действием «Проверить».',
    evidence: { passed: 7, total: 8, loginom: '7.4.2', note: 'на 8 пакетах DataLab' },
    can: ['Через встроенное действие «Проверить»: открыть пакет в Loginom под вашей учётной записью и прочитать настройки узлов'],
    cannot: ['Менять пакет', 'Добавлять права сверх действия «Проверить»', 'Открывать сайты в интернете'],
  },
  {
    id: 'quality', title: 'Проверка качества данных', kind: 'Навык', icon: 'shield', color: 'sage',
    version: '1.3.0', tier: 'verified', publisher: 'DataLab', offline: true, size: '48 КБ',
    keywords: 'качество пропуски дубликаты выбросы',
    description: 'Находит пропуски, дубликаты и выбросы до расчёта показателей.',
    evidence: { passed: 6, total: 6, loginom: '7.4.2', note: 'на 6 наборах данных' },
    prompt: 'Проверь качество входной таблицы в Loginom и предложи план очистки.',
    can: ['Подсказывать агенту порядок проверки данных', 'Работать и тогда, когда агент работает в Loginom'], cannot: ['Давать агенту доступ к Loginom или дополнительные права', 'Запускать программы — в навыке только текст'],
  },
  {
    id: 'loads', title: 'Контроль полноты загрузок', kind: 'Навык', icon: 'flow', color: 'clay',
    version: '1.0.0', tier: 'official', offline: true, size: '22 КБ',
    keywords: 'загрузка полнота источники',
    description: 'Агент соберёт сценарий, который сверяет количество строк и ключи по каждому источнику.',
    evidence: null,
    prompt: 'Создай сценарий Loginom для контроля полноты загрузок по источникам.',
    can: ['Подсказывать агенту, как собрать такой сценарий'], cannot: ['Давать агенту доступ к Loginom или дополнительные права'],
  },
  {
    id: 'abc', title: 'ABC-анализ продаж', kind: 'Навык', icon: 'chart', color: 'sand',
    version: '1.2.0', tier: 'verified', publisher: 'Retail Analytics', offline: true, size: '31 КБ',
    keywords: 'abc продажи выручка',
    description: 'Агент построит сценарий ABC-анализа: распределит товары по вкладу в выручку.',
    evidence: { passed: 4, total: 4, loginom: '7.4.2', note: 'на 4 наборах продаж' },
    prompt: 'Построй в Loginom сценарий ABC-анализа товаров по выручке.',
    can: ['Подсказывать агенту, как собрать такой сценарий', 'Работать и тогда, когда агент работает в Loginom'], cannot: ['Давать агенту доступ к Loginom или дополнительные права', 'Запускать программы — в навыке только текст'],
  },
  {
    id: 'profile', title: 'Профилирование таблиц', kind: 'Готовый сценарий', icon: 'table', color: 'blue',
    version: '2.1.0', tier: 'official', offline: true, size: '1,2 МБ',
    keywords: 'профиль поля распределения',
    description: 'Готовый пакет: профиль полей, распределения и сводка по типам данных.',
    evidence: null,
    prompt: 'Подготовь к открытию пакет профилирования таблиц.',
    can: ['Скопировать пакет в вашу папку Loginom после подтверждения'], cannot: [],
  },
  {
    id: 'summary', title: 'Сводка для руководителя', kind: 'Навык', icon: 'file', color: 'lilac',
    version: '0.3.0', tier: 'community', publisher: 'Иван П.', offline: true, size: '12 КБ',
    keywords: 'сводка отчёт руководитель',
    description: 'Превращает результаты анализа в короткую сводку на одну страницу.',
    evidence: null,
    prompt: 'Составь короткую сводку для руководителя: что выяснили, что это значит для бизнеса и что делать дальше.',
    can: ['Подсказывать агенту формат сводки — в любом разговоре, в том числе когда агент работает в Loginom'],
    cannot: ['Добавлять агенту права', 'Запускать программы — в навыке только текст'],
  },
  {
    id: 'help', title: 'Справка Loginom', kind: 'Навык', icon: 'book', color: 'lilac',
    version: '2026.11', tier: 'official', builtIn: true, offline: true, size: 'Встроено в приложение',
    keywords: 'справка документация узлы',
    description: 'Агент знает руководство по узлам, функциям и работе со сценариями и опирается на него в ответах.',
    evidence: null, can: ['Давать агенту сведения об узлах Loginom'], cannot: [],
  },
  {
    id: 'cloud', title: 'Внешнее обогащение данных', kind: 'Подключение', icon: 'link', color: 'blue',
    version: '1.0.0', tier: 'official', offline: false, size: '64 КБ',
    keywords: 'обогащение внешний сервис api',
    description: 'Дополняет записи данными из внешнего сервиса по API.',
    evidence: null, can: ['Отправлять выбранные поля во внешний сервис Example Data'], cannot: [],
  },
]

export const byId = (id) => catalog.find((item) => item.id === id)

export function tierBadge(item, size = '') {
  const tier = tiers[item.tier]
  return `<span class="tier tier-${tier.tone}${size ? ' tier-' + size : ''}" title="${tier.title}">${tier.label}</span>`
}

// Short on cards; the full wording (what the examples were) is shown in the solution dialog.
export function evidenceLine(item, full = false) {
  if (!item.evidence) return '<span class="evidence evidence-none">Не проверялось на примерах</span>'
  const e = item.evidence
  return `<span class="evidence${e.passed === e.total ? '' : ' evidence-partial'}">Проверено на примерах: ${e.passed} из ${e.total}${full ? ' ' + e.note : ''} · Loginom ${e.loginom}</span>`
}
