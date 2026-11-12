import { delimiter, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import crossSpawn from 'cross-spawn';
import escape from 'cross-spawn/lib/util/escape.js';
import which from 'which';

function environmentValue(env, name) {
  const key = process.platform === 'win32'
    ? Object.keys(env).sort().find(key => key.toLowerCase() === name.toLowerCase()) : name;
  return env[key];
}

// Resolve once per installation, including recovery. Never switch to another
// installation after the version probe (or when the chosen command fails).
export function createAgentLauncher(command, { env = process.env, cwd = process.cwd() } = {}) {
  env = { ...env };
  cwd = resolve(cwd);
  let executable, resolutionError;
  try {
    const windows = process.platform === 'win32';
    const explicit = command.includes('/') || (windows && command.includes('\\'));
    const directories = explicit ? [''] : [
      ...(windows ? [cwd] : []),
      ...(environmentValue(env, 'PATH') ?? '').split(delimiter),
    ];
    for (const directory of directories) {
      const candidate = resolve(cwd, directory.replace(/^"(.*)"$/, '$1'), command);
      executable = which.sync(candidate, { nothrow: true,
        pathExt: windows ? (environmentValue(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD') : undefined });
      if (executable) break;
    }
    if (!executable) resolutionError = Object.assign(new Error('Agent command not found'), { code: 'ENOENT' });
  } catch (error) { resolutionError = error; }
  return {
    executable: executable || null,
    run(args, options = {}) {
      if (resolutionError) return { executable: null, error: resolutionError, status: null, signal: null, stdout: null, stderr: null };
      // cross-spawn only double-escapes shims under node_modules/.bin. Global
      // npm shims also forward %*, so their arguments undergo two CMD parses.
      if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)) {
        const command = [escape.command(executable), ...args.map(arg => escape.argument(arg, true))].join(' ');
        const result = spawnSync(process.env.ComSpec || process.env.comspec || 'cmd.exe',
          ['/d', '/v:off', '/s', '/c', `"${command}"`],
          { ...options, env, cwd, shell: false, windowsVerbatimArguments: true });
        return { ...result, executable };
      }
      const spawn = process.platform === 'win32' && /\.(?:exe|com)$/i.test(executable) ? spawnSync : crossSpawn.sync;
      const result = spawn(executable, args, { ...options, env, cwd, shell: false });
      return { ...result, executable };
    },
  };
}
