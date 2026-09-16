#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { loadConfig } from '../lib/config.mjs';
import { recordLocalDiagnostics, readLocalDiagnosticReport, pruneLocalDiagnostics } from '../lib/local-diagnostics.mjs';

process.umask(0o077);
try {
  const { values } = parseArgs({ options: {
    config: { type: 'string' }, 'state-dir': { type: 'string' }, agent: { type: 'string' },
    'adapter-revision': { type: 'string' }, session: { type: 'string' }, report: { type: 'boolean' }, json: { type: 'boolean' },
  } });
  const config = await loadConfig({ configPath: values.config, stateDir: values['state-dir'], agent: values.agent, adapterRevision: values['adapter-revision'] });
  if (values.report) {
    const result = await readLocalDiagnosticReport(config.stateDir, values.session);
    const { events, ...summary } = result;
    if (values.json) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    else {
      const show = value => value === null ? 'не сообщается провайдером' : String(value);
      process.stdout.write(`Сессия: ${result.session_id}\nВремя: ${result.elapsed_ms === null ? 'неполное измерение' : (result.elapsed_ms / 1000).toFixed(3) + ' с'}\n`
        + `Запросов модели: ${result.usage.requests}; незавершённых: ${result.usage.incomplete_requests}\n`
        + `Вход без кеша: ${show(result.usage.totals.input_tokens)}; выход: ${show(result.usage.totals.output_tokens)}; всего: ${show(result.usage.totals.total_tokens)}\n`
        + `${result.cache_summary}\nЖурнал: ${result.incomplete ? 'неполный' : 'без обнаруженных пропусков'}\nФайлы: ${result.directory}\n`);
      process.stdout.write(`Вызовов инструментов: ${result.tool_calls}; подготовок: ${result.preparation_calls}; дополнительных обращений за знаниями: ${result.knowledge_calls}\n`
        + `Завершённых обработок узлов: ${result.dock_sessions.reduce((n,s)=>n+s.completed_node_operations,0)}; сохранений: ${result.dock_sessions.reduce((n,s)=>n+s.saves.length,0)}\n`);
      for (const task of result.tasks) {
        process.stdout.write(`Задача: ${task.task_id}; запросов: ${task.usage.requests}; незавершённых измерений: ${task.usage.incomplete_requests}\n`
          + `Вход без кеша: ${show(task.usage.totals.input_tokens)}; выход: ${show(task.usage.totals.output_tokens)}; всего: ${show(task.usage.totals.total_tokens)}\n`
          + `${task.cache_summary}\n`);
      }
    }
  } else {
    const chunks = []; let bytes = 0;
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > 4 * 1024 ** 2) throw Error('Diagnostic batch limit');
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const knownSecrets = [config.apiKey, ...Object.entries(process.env)
      .filter(([key]) => /KEY|TOKEN|SECRET|PASSWORD|COOKIE|AUTH/i.test(key)).map(([, value]) => value)];
    await recordLocalDiagnostics(config.stateDir, input.session_id, input.events, { knownSecrets });
    if (input.prune === true) await pruneLocalDiagnostics(config.stateDir);
  }
} catch {
  process.stderr.write('Loginom Dock: локальная диагностика неполна или недоступна.\n');
  process.exitCode = 1;
}
