// Single catalog for the Hub, the package actions and the solution runner.
// tier: who stands behind the item — official (Loginom), verified (community, checked by Loginom),
// community (not checked). evidence: separate axis — analytical checks on real examples.
export const tiers = {
  official: { label: 'Loginom', title: 'Официальное решение Loginom', tone: 'official',
    explain: 'Подготовлено и поддерживается Loginom. Может работать с Loginom через встроенные инструменты приложения.' },
  verified: { label: 'Проверено Loginom', title: 'Решение сообщества, проверенное Loginom', tone: 'verified',
    explain: 'Автор из сообщества, содержимое проверено Loginom. Работает как инструкция для агента и не получает дополнительных прав.' },
  community: { label: 'Сообщество', title: 'Решение сообщества без проверки', tone: 'community',
    explain: 'Loginom не проверял это решение. Оно работает как инструкция для агента, не управляет Loginom и видит только то, что вы передадите в разговоре.' },
}

export const actions = {
  document: { title: 'Документировать', detail: 'Описание сценария, узлов и потоков данных', icon: 'book', solution: 'document' },
  check: { title: 'Проверить', detail: 'Найти проблемы в структуре сценария', icon: 'shield', solution: 'refactor', mode: 'review' },
  improve: { title: 'Улучшить', detail: 'Предложить правки и собрать улучшенную копию', icon: 'wand', solution: 'refactor', mode: 'copy' },
  compare: { title: 'Сравнить', detail: 'Сопоставить две версии по результату и скорости', icon: 'chart', solution: 'tournament' },
}

export const catalog = [
  {
    id: 'document', title: 'Документирование пакета', product: 'ИИ Отчёт', kind: 'Решение', icon: 'book', color: 'lilac',
    version: '1.0.0', tier: 'official', builtIn: true, runner: true, offline: true, size: 'Встроено в приложение',
    keywords: 'документация описание отчёт docs',
    description: 'Создаёт понятное описание сценария: назначение, модули, потоки данных и заметки. PDF, Word или Markdown.',
    evidence: { passed: 18, total: 18, loginom: '7.4', note: 'на 18 учебных и рабочих пакетах' },
    can: ['Прочитать копию выбранного пакета', 'Создать документ в папке проекта'],
    cannot: ['Изменять пакет — ни копию, ни оригинал', 'Работать в Loginom от вашего имени', 'Обращаться в интернет'],
    stages: ['Чтение пакета', 'Описание узлов по справке Loginom', 'Сборка документа', 'Проверка полноты'],
  },
  {
    id: 'refactor', title: 'Проверка и улучшение сценария', product: 'Scenario Refactor', kind: 'Решение', icon: 'flow', color: 'sage',
    version: '1.0.0', tier: 'official', runner: true, offline: true, size: '0,4 МБ',
    keywords: 'рефакторинг оптимизация улучшить проверить аудит',
    description: 'Находит повторяющиеся преобразования, неясные названия и лишние узлы. Улучшения собирает в отдельной копии.',
    evidence: { passed: 9, total: 10, loginom: '7.4.2', note: 'на 10 эталонных сценариях' },
    can: ['Открыть копию пакета в Loginom', 'Прочитать настройки узлов', 'Сохранить улучшенную копию рядом с исходным пакетом (режим «Улучшить»)'],
    cannot: ['Изменять исходный пакет', 'Удалять пакеты в Loginom', 'Обращаться в интернет'],
    stages: ['Открытие копии пакета', 'Разбор структуры', 'Поиск улучшений', 'Сборка отчёта'],
  },
  {
    id: 'regression', title: 'Проверка на эталоне', product: 'Regression Studio', kind: 'Решение', icon: 'shield', color: 'blue',
    version: '1.0.0', tier: 'official', runner: true, offline: true, size: '0,6 МБ',
    keywords: 'регрессия эталон проверка изменений',
    description: 'Запускает сценарий на тестовых данных и сравнивает результат с утверждённым эталоном.',
    evidence: null,
    can: ['Запустить копию пакета на тестовых данных', 'Прочитать эталонный результат'],
    cannot: ['Изменять исходный пакет', 'Менять эталон без вашего подтверждения'],
    stages: ['Подготовка копии', 'Запуск на тестовых данных', 'Сравнение с эталоном', 'Отчёт'],
  },
  {
    id: 'tournament', title: 'Сравнение вариантов', product: 'Scenario Tournament', kind: 'Решение', icon: 'chart', color: 'sand',
    version: '1.0.0', tier: 'official', runner: true, offline: true, size: '0,5 МБ',
    keywords: 'сравнение турнир версии скорость',
    description: 'Сопоставляет две версии сценария: совпадают ли результаты и какая работает быстрее.',
    evidence: null,
    can: ['Запустить копии двух пакетов на одних данных', 'Замерить время выполнения'],
    cannot: ['Изменять исходные пакеты'],
    stages: ['Подготовка копий', 'Сверка результатов', 'Замеры времени', 'Отчёт'],
  },
  {
    id: 'migration', title: 'Перенос SQL в Loginom', product: 'Migration Bridge', kind: 'Решение', icon: 'link', color: 'clay',
    version: '1.0.0', tier: 'official', runner: true, offline: true, size: '0,5 МБ',
    keywords: 'sql миграция перенос запрос',
    description: 'Собирает сценарий Loginom по SQL-запросу и сверяет результат на тестовой выборке.',
    evidence: null,
    can: ['Создать новый пакет в вашей папке Loginom', 'Запустить его на тестовой выборке'],
    cannot: ['Подключаться к вашей базе данных', 'Изменять существующие пакеты'],
    stages: ['Разбор запроса', 'Сборка сценария', 'Сверка на выборке', 'Отчёт'],
  },
  {
    id: 'quality', title: 'Проверка качества данных', kind: 'Навык', icon: 'shield', color: 'sage',
    version: '1.3.0', tier: 'verified', publisher: 'DataLab · сообщество', offline: true, size: '48 КБ',
    keywords: 'качество пропуски дубликаты выбросы',
    description: 'Находит пропуски, дубликаты и выбросы до расчёта показателей.',
    evidence: { passed: 6, total: 6, loginom: '7.4.2', note: 'на 6 наборах данных' },
    prompt: 'Проверь качество входной таблицы в Loginom и предложи план очистки.',
    can: ['Подсказывать агенту порядок проверки данных'], cannot: ['Управлять Loginom без вашего запроса', 'Обращаться в интернет'],
  },
  {
    id: 'loads', title: 'Контроль полноты загрузок', kind: 'Шаблон', icon: 'flow', color: 'clay',
    version: '1.0.0', tier: 'official', offline: true, size: '22 КБ',
    keywords: 'загрузка полнота источники',
    description: 'Сверяет количество строк и ключи по каждому источнику.',
    evidence: null,
    prompt: 'Создай сценарий Loginom для контроля полноты загрузок по источникам.',
    can: ['Подставить готовую постановку задачи в разговор'], cannot: [],
  },
  {
    id: 'abc', title: 'ABC-анализ продаж', kind: 'Шаблон', icon: 'chart', color: 'sand',
    version: '1.2.0', tier: 'verified', publisher: 'Retail Analytics · сообщество', offline: true, size: '31 КБ',
    keywords: 'abc продажи выручка',
    description: 'Распределяет товары по вкладу в выручку и сохраняет сценарий.',
    evidence: { passed: 4, total: 4, loginom: '7.4.2', note: 'на 4 наборах продаж' },
    prompt: 'Построй в Loginom сценарий ABC-анализа товаров по выручке.',
    can: ['Подставить готовую постановку задачи в разговор'], cannot: [],
  },
  {
    id: 'profile', title: 'Профилирование таблиц', kind: 'Пакет Loginom', icon: 'table', color: 'blue',
    version: '2.1.0', tier: 'official', offline: true, size: '1,2 МБ',
    keywords: 'профиль поля распределения',
    description: 'Готовый пакет: профиль полей, распределения и сводка по типам данных.',
    evidence: null,
    prompt: 'Подготовь к открытию пакет профилирования таблиц.',
    can: ['Скопировать пакет в вашу папку Loginom после подтверждения'], cannot: [],
  },
  {
    id: 'summary', title: 'Сводка для руководителя', kind: 'Навык', icon: 'file', color: 'lilac',
    version: '0.3.0', tier: 'community', publisher: 'Иван П. · сообщество', offline: true, size: '12 КБ',
    keywords: 'сводка отчёт руководитель',
    description: 'Превращает результаты анализа в короткую сводку на одну страницу.',
    evidence: null,
    prompt: 'Составь короткую сводку для руководителя по результатам этого анализа.',
    can: ['Подсказывать агенту формат сводки'], cannot: ['Управлять Loginom', 'Видеть файлы, которые вы не передали'],
  },
  {
    id: 'help', title: 'Справка Loginom', kind: 'База знаний', icon: 'book', color: 'lilac',
    version: '2026.11', tier: 'official', builtIn: true, offline: true, size: 'Встроено в приложение',
    keywords: 'справка документация узлы',
    description: 'Руководство по узлам, функциям и работе со сценариями. Агент опирается на неё в ответах.',
    evidence: null, can: ['Давать агенту сведения об узлах Loginom'], cannot: [],
  },
  {
    id: 'cloud', title: 'Внешнее обогащение данных', kind: 'Интеграция', icon: 'link', color: 'blue',
    version: '1.0.0', tier: 'community', publisher: 'Example Data Inc. · сообщество', offline: false, size: '64 КБ',
    keywords: 'обогащение внешний сервис api',
    description: 'Дополняет записи данными из внешнего сервиса по API.',
    evidence: null, can: ['Отправлять выбранные поля во внешний сервис'], cannot: [],
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
