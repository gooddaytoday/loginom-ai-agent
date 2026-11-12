// Small shipped-Help layout for tests: help-manifest.json, loginom-help/data/**.md and aliases.jsonl.
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const PAGES = {
  'data/README.md': '# Loginom — руководство пользователя\n\nСм. [Калькулятор](processors/transformation/calc/README.md).\n',
  'data/processors/transformation/calc/README.md': '# Калькулятор\n\nОбработчик вычисляет новые столбцы по формулам.\n\n## Мастер настройки\n\nВыражение задаётся на языке Калькулятора.\n',
  'data/processors/func/calc-func/datetime.md': '# Дата/Время функции\n\n### AddDay\n\n**AddDay(Дата, Количество)**\n\nФункция возвращает значение аргумента Дата, увеличенного на указанное Количество дней.\n\n### DaysBetween\n\n**DaysBetween(Дата1, Дата2)**\n\nВозвращает полное количество дней между двумя датами.\n',
  'data/processors/func/calc-func/string.md': '# Строковые функции\n\n### Left\n\n**Left(Строка, Количество)**\n\nВозвращает первые символы строки.\n',
  'data/processors/integration/rest-request.md': '# REST-запрос\n\nУзел выполняет HTTP-запросы. Заголовки и авторизация задаются на вкладке Параметры.\n',
};
export const ALIASES = [
  { path: 'data/processors/func/calc-func/datetime.md', fn: 'AddDay', aliases: ['IncDay', 'DATEADD day', 'прибавить дни к дате'] },
  { path: 'data/processors/func/calc-func/string.md', fn: 'Left', aliases: ['Excel LEFT', 'substring prefix'] },
  { path: 'data/processors/integration/rest-request.md', aliases: ['HTTP API call', 'web request headers'] },
];

export async function helpFixture(t, options) {
  const root = await mkdtemp(join(tmpdir(), 'loginom-help-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return writeHelp(root, options);
}

// Writes the same layout into a caller-owned directory, for example <resources>/help.
export async function writeHelp(root, { pages = PAGES, aliases = ALIASES, tamper } = {}) {
  await mkdir(root, { recursive: true });
  const files = [];
  for (const [path, text] of Object.entries(pages).sort()) {
    const file = join(root, 'loginom-help', path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    files.push({ path, sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text) });
  }
  if (tamper) await writeFile(join(root, 'loginom-help', tamper), 'changed');
  await writeFile(join(root, 'help-manifest.json'), JSON.stringify({ protocol: 1, loginom_version: '7.4', files }));
  await writeFile(join(root, 'aliases.jsonl'), aliases.map(item => JSON.stringify(item)).join('\n') + '\n');
  return root;
}

