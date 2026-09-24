#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile, rename, lstat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { installBundle, rollbackBundle, verifyBundle, restoreRuntime } from '../lib/install.mjs';
import { nativeSnapshot, validateNativeInstall, registerNative, restoreNative, unregisterNative, createNativeCommand } from '../lib/native.mjs';
import { loadConfig } from '../lib/config.mjs';
import { configureWorkflow, restoreWorkflow, workflowRegistration } from '../lib/install-profile.mjs';
import { agentVersionGuidance, diagnoseConnection } from '../lib/diagnostics.mjs';
import { createAgentLauncher } from '../lib/agent-command.mjs';
import { privateDirectory, privatePath, readRuntimePointer } from '../lib/platform.mjs';

process.umask(0o077);
let stage = 'проверка параметров';
let temporary;
let guidance = '';
let recovery;
async function saveRecord(path, record) {
  const pending = path + '.pending';
  await writeFile(pending, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  await rename(pending, path);
}
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error || result.status !== 0) throw new Error('A required installation step did not finish');
}
async function secretPrompt() {
  if (!process.stdin.isTTY) throw new Error('Use a private --config-from file for unattended setup');
  process.stdout.write('Ключ Dock (ввод скрыт): ');
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); };
    const onData = bytes => {
      for (const char of bytes.toString('utf8')) {
        if (char === '\x03') { done(); reject(new Error('Setup cancelled')); return; }
        if (char === '\r' || char === '\n') { done(); resolve(value); return; }
        if (char === '\x7f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', onData);
  });
}
try {
  const { values } = parseArgs({ options: {
    bundle: { type: 'string' }, home: { type: 'string' }, agent: { type: 'string' },
    'config-from': { type: 'string' }, 'loginom-url': { type: 'string' }, 'hermes-home': { type: 'string' },
    'storage-root': { type: 'string' },
    'runtime-only': { type: 'boolean' }, rollback: { type: 'boolean' }, uninstall: { type: 'boolean' },
  } });
  const root = resolve(values.home || process.env.LOGINOM_DOCK_HOME || join(homedir(), '.loginom-dock'));
  if (values.rollback && values['runtime-only']) { await rollbackBundle(root); console.log('Предыдущая среда Dock восстановлена.'); process.exit(0); }
  const profile = values.agent === 'hermes'
    ? resolve(values['hermes-home'] || process.env.HERMES_HOME || join(homedir(), '.hermes'))
    : resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
  const hermesConfigFile = join(root, 'profiles', 'hermes-user.json');
  const hasHermesConfig = values.agent === 'hermes' && await lstat(hermesConfigFile).then(()=>true).catch(e=>{if(e.code!=='ENOENT')throw e;return false;});
  const selectedConfigName = hasHermesConfig ? 'profiles/hermes-user.json' : 'config.json';
  const configFile = join(root, selectedConfigName);
  const nativeEnv = { ...process.env, HERMES_HOME: profile, LOGINOM_DOCK_HOME: root };
  const agentLauncher = createAgentLauncher(values.agent || '', { env: nativeEnv });
  const runNative = createNativeCommand(agentLauncher);
  const recordFile = join(root, 'registration-' + createHash('sha256').update(values.agent + ':' + profile).digest('hex').slice(0, 16) + '.json');
  if (!values['runtime-only'] && root !== join(homedir(), '.loginom-dock')) {
    guidance = 'Native-плагины этой версии используют ~/.loginom-dock. --home поддержан для runtime-only проверок.';
    throw new Error('Native runtime needs its standard persistent location');
  }
  if (values.rollback || values.uninstall) {
    if (!['codex', 'hermes'].includes(values.agent)) throw new Error('Specify the agent to change');
    stage = values.uninstall ? 'удаление плагина Dock' : 'восстановление плагина Dock';
    if (values.uninstall) {
      await unregisterNative({ agent: values.agent, env: nativeEnv, run: runNative });
      await rm(recordFile, { force: true });
      console.log('Плагин и подключение Dock удалены из выбранного агента. Локальные профили, артефакты, очередь и общая история сохранены.');
    } else {
      const record = JSON.parse(await readFile(recordFile, 'utf8'));
      const restoreConfigName = record.configName ?? 'config.json';
      if(!['config.json','profiles/hermes-user.json'].includes(restoreConfigName))throw Error('Invalid saved config destination');
      const restoreConfigFile = join(root,restoreConfigName);
      if (record.state === 'pending') {
        await restoreRuntime(root, record.previousRelease);
        if (record.hadConfig) await writeFile(restoreConfigFile, await readFile(recordFile + '.config-before'), { mode: 0o600 });
        else await rm(restoreConfigFile, { force: true });
        await restoreNative({ agent: values.agent, env: nativeEnv, run: runNative, before: record.before });
        if (record.previousRecord) await saveRecord(recordFile, record.previousRecord);
        else await rm(recordFile, { force: true });
        console.log('Прерванная установка отменена; прежняя регистрация Dock восстановлена.');
        process.exit(0);
      }
      if (record.state !== 'installed' || !record.previousRelease) throw new Error('No completed installation with a previous release');
      await verifyBundle(join(root, record.previousRelease), { checkNode: false });
      const currentNative = await nativeSnapshot(values.agent, nativeEnv, runNative);
      const currentRelease = await readRuntimePointer(root);
      const currentConfig = record.workflowChange ? await readFile(restoreConfigFile) : null;
      const restoredConfig = currentConfig ? restoreWorkflow(JSON.parse(currentConfig),record.workflowChange.installed,record.workflowChange.previous) : null;
      try {
        await restoreRuntime(root, record.previousRelease);
        await restoreNative({ agent: values.agent, env: nativeEnv, run: runNative, before: record.before });
        if(restoredConfig)await writeFile(restoreConfigFile,JSON.stringify(restoredConfig,null,2)+'\n',{mode:0o600});
        await saveRecord(recordFile, { ...record, before: currentNative, previousRelease: currentRelease, release: record.previousRelease,
          ...(record.workflowChange?{workflowChange:{installed:record.workflowChange.previous,previous:record.workflowChange.installed}}:{}) });
      } catch (error) {
        await restoreRuntime(root, currentRelease);
        if(currentConfig)await writeFile(restoreConfigFile,currentConfig,{mode:0o600});
        await restoreNative({ agent: values.agent, env: nativeEnv, run: runNative, before: currentNative });
        throw error;
      }
      console.log('Предыдущие runtime и native-плагин Dock восстановлены. Credentials и уже запущенные сессии сохранены.');
    }
    process.exit(0);
  }
  if (!values.bundle || !['codex', 'hermes'].includes(values.agent)) throw new Error('Specify the release bundle and agent');
  const bundle = resolve(values.bundle), manifest = await verifyBundle(bundle);
  stage = 'проверка установленного агента';
  const agentVersion = agentLauncher.run(['--version'], { encoding: 'utf8', windowsHide: true });
  guidance = agentVersionGuidance(values.agent, agentVersion);
  if (guidance) throw new Error('Agent preflight failed');
  const before = values['runtime-only'] ? null : await nativeSnapshot(values.agent, nativeEnv, runNative);
  if (before) validateNativeInstall(values.agent, manifest, before);
  if (before) {
    const saved = await readFile(recordFile, 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (saved?.state === 'pending') {
      guidance = 'Сначала повторите мастер с --rollback и тем же --agent, чтобы восстановить прерванную установку.';
      throw new Error('Interrupted installation needs recovery');
    }
  }
  console.log('Задачи Loginom после успешной подготовки сохраняются в общей базе Dock с очисткой секретов.');
  let data;
  const existingInfo = await lstat(configFile).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
  if(existingInfo && (!existingInfo.isFile() || !privatePath(existingInfo)))throw Error('Existing Dock config must be private');
  const existingData = existingInfo ? JSON.parse(await readFile(configFile,'utf8')) : null;
  if (values['config-from']) {
    const info = await lstat(resolve(values['config-from']));
    if (!info.isFile() || !privatePath(info)) throw new Error('Credential source must be a private regular file');
    data = JSON.parse(await readFile(resolve(values['config-from']), 'utf8'));
  } else if(existingData) {
    data = existingData;
  } else {
    const prompts = createInterface({ input: process.stdin, output: process.stdout });
    const endpoint = await prompts.question('Адрес Dock [https://mcp.loginom.ai/mcp]: ');
    const loginom = await prompts.question('Адрес Loginom с ?testable=true: ');
    prompts.close();
    const api_key = await secretPrompt();
    data = { endpoint: endpoint.trim() || 'https://mcp.loginom.ai/mcp', loginom_url: loginom.trim(), api_key, account: 'loginom-dock', user: 'loginom-dock' };
  }
  let storageRoot=values['storage-root'] ?? null;
  if(storageRoot===null && !data.workflow_profile?.storage_directories){
    if(!process.stdin.isTTY){guidance='Укажите --storage-root с существующей рабочей папкой Loginom либо workflow_profile.storage_directories в config-from.';throw Error('Explicit Loginom directory required');}
    const prompts=createInterface({input:process.stdin,output:process.stdout});
    storageRoot=(await prompts.question('Рабочая папка в Loginom (например /analyst/Мои сценарии): ')).trim();prompts.close();
  }
  const releaseWorkflow=JSON.parse(await readFile(join(bundle,'client/lib/release-workflow.json'),'utf8'));
  data=configureWorkflow(data,releaseWorkflow,{storageRoot});
  if (values['loginom-url']) data.loginom_url = values['loginom-url'];
  const loginom = new URL(data.loginom_url);
  if (!['http:', 'https:'].includes(loginom.protocol) || loginom.username || loginom.password || loginom.searchParams.get('testable') !== 'true') throw new Error('Loginom must have a credential-free HTTP(S) address with testable=true');
  await privateDirectory(root);
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || !privatePath(rootInfo)) throw new Error('Dock root must be a private directory');
  stage = 'проверка ключа и соединения с Dock';
  temporary = join(root, '.config-' + randomUUID() + '.json');
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  const config = await loadConfig({ configPath: temporary, stateDir: root, agent: values.agent, adapterRevision: manifest.adapterRevision });
  const response = await fetch(new URL('/health', config.endpoint), { headers: { Authorization: 'Bearer ' + config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    guidance = [401, 403].includes(response.status) ? 'Сервер не принял клиентский ключ Dock.' : 'Сервер Dock недоступен.';
    await response.body?.cancel();
    throw new Error('Dock authentication or network check failed');
  }
  const health = await response.json();
  if (!health.healthy || health.account_id !== 'loginom-dock' || health.user_id !== 'loginom-dock' || health.role !== 'user') throw new Error('Unexpected Dock server identity');
  stage = 'подготовка браузера';
  run(process.execPath, [join(bundle, 'client/bin/install-browser.mjs'), '--state-dir', root]);
  // Prepare the browser and authenticate before changing the active release.
  const previousRelease = await readRuntimePointer(root);
  const previousConfig = await readFile(configFile).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  const oldRecord = await readFile(recordFile).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  recovery = { root, configFile, before, nativeEnv, runNative, agent: values.agent, previousRelease, previousConfig, recordFile, oldRecord, nativeStarted: false };
  if (before) {
    if (previousConfig) await writeFile(recordFile + '.config-before', previousConfig, { mode: 0o600 });
    await saveRecord(recordFile, { state: 'pending', agent: values.agent, profile, before, previousRelease, configName:selectedConfigName,
      hadConfig: !!previousConfig, previousRecord: oldRecord ? JSON.parse(oldRecord) : null });
  }
  const installed = await installBundle(bundle, root);
  try {
    const previous = await readFile(configFile);
    if (!previous.equals(await readFile(temporary))) await writeFile(join(root, 'config.before.json'), previous, { mode: 0o600 });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rename(temporary, configFile);
  temporary = undefined;
  if (!values['runtime-only']) {
    stage = 'регистрация плагина и подключения агента';
    recovery.nativeStarted = true;
    await registerNative({ agent: values.agent, destination: installed.destination, root, manifest, env: nativeEnv, run: runNative, before });
    const prior = oldRecord ? JSON.parse(oldRecord) : null;
    // Reinstalling an identical version must not erase the useful rollback target.
    await saveRecord(recordFile, workflowRegistration(prior, { state: 'installed', agent: values.agent, profile, before, previousRelease, release: 'releases/' + installed.manifest.id, configName:selectedConfigName,
      workflowChange:{previous:existingData?.workflow_profile??null,installed:data.workflow_profile} }));
    if (values.agent === 'codex') console.log('После установки или обновления проверьте доверие к обработчикам Loginom Dock в /hooks. Без него вложения Codex не передаются в Dock. Решения о доверии установщик не изменяет.');
    else console.log('Плагин Hermes включён. Если gateway запущен, перезапустите его для загрузки новой версии.');
  }
  recovery = undefined;
  stage = 'итоговая диагностика';
  const diagnosis = await diagnoseConnection(config);
  for (const [name, check] of Object.entries(diagnosis.checks)) {
    const labels = { browserEnvironment: 'Графическое окружение', server: 'Сервер Dock', sources: 'Три источника знаний', skill: 'Пакет инструкций', loginom: 'Страница Loginom' };
    console.log(`${labels[name]}: ${check.ok ? 'доступно' : check.message || 'проверка не пройдена'}`);
  }
  if (!diagnosis.ok) console.log('Среда установлена, но подключение требует указанных исправлений. Повторите диагностику после их выполнения.');
  console.log('Среда Dock установлена. Откройте новую сессию агента и выполните диагностику Dock.');
} catch (error) {
  if (recovery) {
    try {
      await restoreRuntime(recovery.root, recovery.previousRelease);
      if (recovery.previousConfig) await writeFile(recovery.configFile, recovery.previousConfig, { mode: 0o600 });
      else await rm(recovery.configFile, { force: true });
      if (recovery.nativeStarted) await restoreNative({ agent: recovery.agent, env: recovery.nativeEnv, run: recovery.runNative, before: recovery.before });
      if (recovery.oldRecord) await writeFile(recovery.recordFile, recovery.oldRecord, { mode: 0o600 });
      else await rm(recovery.recordFile, { force: true });
      console.error('Прежняя установка Dock восстановлена после ошибки.');
    } catch { console.error('Автоматическое восстановление не завершилось. Данные для восстановления сохранены в registration-*.json внутри каталога Dock.'); }
  }
  // No credentials or remote exception bodies are printed by the wizard.
  console.error(`Установка Dock не завершена: ${stage}. Проверьте выбранный пакет, права каталога, ключ и сеть.`);
  if (guidance) console.error(guidance);
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, { force: true }).catch(() => {});
}
