const sourceSchema = [
  ['Дата','Дата'], ['Товар','Строка'], ['Регион','Строка'],
  ['Количество','Целое'], ['Цена','Вещественное'], ['Выручка','Вещественное'],
]
const abcSchema = [['Товар','Строка'], ['Группа','Строка']]
const salesRows = Array.from({length:2400}, (_, i) => {
  const price = i < 12 ? null : 75 + i % 14 * 25
  const quantity = 1 + i % 4
  const date = i < 2388 ? '10.10.2026' : '01.11.2026'
  return [date, 'Товар ' + (1 + i % 120), ['Центр','Север','Юг'][i % 3], quantity, price, price === null ? null : price * quantity]
})
const abcRows = Array.from({length:120}, (_, i) => ['Товар ' + (i + 1), i < 15 ? 'A' : i < 43 ? 'B' : 'C'])

function output(node, schema, rows, settings, port, before) {
  return {node, schema, row_count:rows.length, sample:rows.slice(0, 10), sample_complete:rows.length <= 10,
    preview:rows.slice(0, 100), settings, port, portIndex:0, before}
}

export const sourceOutput = output(0, sourceSchema, salesRows, 'Файл sales-demo.csv', 'Набор данных')
export const filterSettings = 'Дата от «Начало периода» до «Конец периода»'
export const filteredOutput = output(1, sourceSchema, salesRows.slice(0, 2388), filterSettings, 'Соответствуют условию', sourceOutput.row_count)
export const emptyOutput = output(2, sourceSchema, [], 'Дата позже «Конец периода»', 'Соответствуют условию', filteredOutput.row_count)
export const abcOutput = output(3, abcSchema, abcRows, 'Границы групп 80% и 95% накопленной выручки', 'Выходной набор данных')
export const abcDownload = {name:'ABC-анализ.csv', schema:abcSchema, rows:abcRows}

export const salesVariables = [
  ['Начало периода','Дата','01.01.2026','Фильтр по дате → начало диапазона'],
  ['Конец периода','Дата','31.10.2026','Фильтр по дате → конец диапазона, Проверка будущих дат → условие'],
]

export const exportReceipt = {node:3, artifact_id:'sales-export-csv', verification_id:'sales-export-demo',
  name:'Продажи за период.csv'}
export const missingDate = 'Узел «Фильтр» не выполнился: поле «Дата» не найдено'
