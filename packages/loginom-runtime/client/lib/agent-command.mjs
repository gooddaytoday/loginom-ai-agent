import { delimiter, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import crossSpawn from 'cross-spawn';
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
      // cross-spawn handles CMD shims and argument escaping; EXE and POSIX
      // executables retain direct execution. Do not enable options.shell.
      const spawn = process.platform === 'win32' && /\.(?:exe|com)$/i.test(executable) ? spawnSync : crossSpawn.sync;
      const result = spawn(executable, args, { ...options, env, cwd, shell: false });
      return { ...result, executable };
    },
  };
}
