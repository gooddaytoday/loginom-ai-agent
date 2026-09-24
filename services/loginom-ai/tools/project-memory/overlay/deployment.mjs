import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';

// This owner-controlled file is pinned into each assembled runtime. Neither
// model arguments nor process cwd choose the project or its memory identity.
const path = fileURLToPath(new URL('./deployment.json', import.meta.url));
const stat = lstatSync(path);
if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path ||
    stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600)
  throw new Error('Memory deployment must be an owner-only regular file.');
export const DEPLOYMENT = JSON.parse(readFileSync(path, 'utf8'));
if (Object.keys(DEPLOYMENT).sort().join(',') !== 'enrollmentsDir,generation,namespace,projectRoot,stateDir,version' ||
    DEPLOYMENT.version !== 1 || !/^[a-z][a-z0-9-]+$/.test(DEPLOYMENT.namespace) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(DEPLOYMENT.generation) ||
    ['projectRoot','enrollmentsDir','stateDir'].some(key =>
      typeof DEPLOYMENT[key] !== 'string' || !isAbsolute(DEPLOYMENT[key]) || resolve(DEPLOYMENT[key]) !== DEPLOYMENT[key]))
  throw new Error('Memory deployment identity is invalid.');
