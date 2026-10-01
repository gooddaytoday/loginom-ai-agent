import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { checkOracle, compareCsv } from "../src/oracle"

test("oracle: все колонки, строки и числовые значения должны совпасть в допуске", () => {
  const oracle = "category,revenue,average\nBooks,100.5,2.25\nFood,50,1.5\n"
  expect(compareCsv(oracle, "category,revenue,average\nBooks,100.505,2.25\nFood,50,1.5\n")).toMatchObject({ passed: true })
  expect(compareCsv(oracle, "category,revenue,average\nBooks,103,2.25\nFood,50,1.5\n")).toMatchObject({ passed: false })
})

test("oracle: BOM, CRLF и CSV quoting не изменяют результат", () => {
  expect(compareCsv('category,note,revenue\n"Books, Food","a ""quote""",12\n', '\uFEFFcategory,note,revenue\r\n"Books, Food","a ""quote""",12.005\r\n')).toMatchObject({ passed: true })
})

test("oracle: экспорт с точкой с запятой и десятичной запятой сравнивается с эталоном", () => {
  expect(compareCsv("category,revenue\nBooks,12.5\n", "category;revenue\r\nBooks;12,505\r\n")).toMatchObject({ passed: true })
})

test("oracle: граница числового допуска учитывает точность float без расширения допуска", () => {
  expect(compareCsv("value\n100.5\n", "value\n100.51\n", 0.01)).toMatchObject({ passed: true })
  expect(compareCsv("value\n100.5\n", "value\n100.511\n", 0.01)).toMatchObject({ passed: false })
})

test("oracle: нулевой допуск требует точного числового совпадения", () => {
  expect(compareCsv("value\n1\n", "value\n1.0000000000000002\n", 0)).toMatchObject({ passed: false })
})

test("oracle: отсутствие результата является провалом проверки, а не исключением", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-oracle-"))
  try {
    await Bun.write(path.join(dir, "oracle.csv"), "Item,Qty\nA,15\n")
    expect(await checkOracle({ dir, oracle: "oracle.csv", oracleTolerance: 0.01 }, path.join(dir, "artifact"))).toMatchObject({ passed: false })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("oracle: неполные колонки, переставленные строки и изменённый текст отклоняются", () => {
  const expected = "category,revenue,average\nBooks,100,2\nFood,50,1\n"
  for (const actual of [
    "category,revenue\nBooks,100\nFood,50\n",
    "category,revenue,average\nFood,50,1\nBooks,100,2\n",
    "category,revenue,average\nBook,100,2\nFood,50,1\n",
    "category,revenue,average\nBooks,100,2\n",
    'category,revenue,average\n"Books,100,2\nFood,50,1\n',
  ]) expect(compareCsv(expected, actual)).toMatchObject({ passed: false })
})

test("oracle: несколько файлов результата не позволяют выбрать удачный случайно", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-oracle-"))
  try {
    await mkdir(path.join(dir, "artifact", "results"), { recursive: true })
    await Bun.write(path.join(dir, "oracle.csv"), "Item,Qty\nA,15\n")
    await Bun.write(path.join(dir, "artifact", "results", "one.result.csv"), "Item,Qty\nA,15\n")
    await Bun.write(path.join(dir, "artifact", "results", "two.result.csv"), "Item,Qty\nA,16\n")
    expect(await checkOracle({ dir, oracle: "oracle.csv", oracleTolerance: 0.01 }, path.join(dir, "artifact"))).toMatchObject({ passed: false })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
