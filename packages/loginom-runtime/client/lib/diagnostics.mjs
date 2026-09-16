import { skillTransport, validateManifest } from './skill.mjs';

const sources = ['ai-skills', 'e2e-tests', 'loginom-help'];
export const supportedAgents = { codex: '0.149.1', hermes: '0.21.0' };
export function agentVersionSupported(agent, output) {
  const version = String(output).match(/(?:^|[\sv])(\d+)\.(\d+)\.(\d+)\b/i);
  if (!version || !supportedAgents[agent]) return false;
  const actual = version.slice(1, 4).map(Number), minimum = supportedAgents[agent].split('.').map(Number);
  // A new major version needs explicit compatibility validation.
  if (actual[0] !== minimum[0]) return false;
  return actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2]);
}

export function agentVersionGuidance(agent, result) {
  const selected = result.executable ? ` Команда: ${JSON.stringify(result.executable)}.` : '';
  if (result.error) return `Не удалось запустить ${agent}: ${result.error.code || 'ошибка запуска'}. Проверьте установку агента и PATH.${selected}`;
  if (result.status !== 0) return `${agent} --version завершился с кодом ${result.status}; сигнал: ${result.signal || 'нет'}.${selected}`;
  if (!agentVersionSupported(agent, result.stdout)) {
    const output = JSON.stringify(String(result.stdout || '').slice(0, 200));
    return `Версия ${agent} не распознана или не поддерживается. Требуется не ниже ${supportedAgents[agent]} в поддерживаемой основной ветке.${selected} Ответ: ${output}.`;
  }
  return '';
}

export async function diagnoseConnection(config, { fetcher = fetch, manifest = () => skillTransport(config).manifest(),
  platform = process.platform, environment = process.env } = {}) {
  const displayAvailable = platform !== 'linux' || Boolean(environment.DISPLAY || environment.WAYLAND_DISPLAY);
  const checks = { browserEnvironment: displayAvailable
    ? { ok: true, browserLaunch: 'not_checked' }
    : { ok: false, message: 'Для видимого браузера Dock нужна графическая сессия Linux. Запустите агент в рабочем столе с DISPLAY или WAYLAND_DISPLAY.' } };
  async function dock(path) {
    try {
      const response = await fetcher(new URL(path, config.endpoint), {
        headers: { Authorization: 'Bearer ' + config.apiKey }, redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) { await response.body?.cancel(); return { ok: false, status: response.status }; }
      return { ok: true, value: await response.json() };
    } catch { return { ok: false, status: 0 }; }
  }
  const health = await dock('/health');
  checks.server = health.ok && health.value?.healthy === true && health.value.account_id === 'loginom-dock'
    && health.value.user_id === 'loginom-dock' && health.value.role === 'user'
    ? { ok: true } : { ok: false, message: health.status === 401 || health.status === 403
      ? 'Ключ Dock не принят. Проверьте обычный клиентский ключ.' : 'Нет соединения с сервером Dock или получена другая учётная запись.' };
  if (checks.server.ok) {
    const results = await Promise.all(sources.map(async name => {
      const result = await dock('/api/v1/fs/stat?uri=' + encodeURIComponent('viking://resources/loginom-dock/sources/' + name + '/.source-manifest.json'));
      return [name, result.ok && result.value.status === 'ok'];
    }));
    checks.sources = { ok: results.every(([, ok]) => ok), available: Object.fromEntries(results) };
    try { const detail = validateManifest(await manifest()); checks.skill = { ok: true, revision: detail.revision }; }
    catch { checks.skill = { ok: false, message: 'Пакет инструкций Dock недоступен или не прошёл проверку целостности.' }; }
  }
  if (!config.loginomUrl) checks.loginom = { ok: false, message: 'Адрес Loginom не задан.' };
  else if (new URL(config.loginomUrl).searchParams.get('testable') !== 'true') {
    checks.loginom = { ok: false, message: 'Добавьте testable=true к адресу Loginom.' };
  } else {
    try {
      // Never send the Dock key to Loginom, follow redirects or reuse cookies.
      const response = await fetcher(config.loginomUrl, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000) });
      await response.body?.cancel();
      checks.loginom = response.ok ? { ok: true, pageReachable: true, browserLogin: 'not_checked' }
        : { ok: false, message: 'Loginom требует входа, перенаправляет запрос или недоступен. Проверьте адрес в браузере.' };
    } catch { checks.loginom = { ok: false, message: 'Loginom недоступен. Проверьте VPN и адрес стенда.' }; }
  }
  return { ok: Object.values(checks).every(check => check.ok), checks };
}
