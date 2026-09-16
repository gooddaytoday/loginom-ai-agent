import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateProjectRouting, ProjectRoutingError } from './project-routing.mjs';

export const ENROLLMENT_GENERATION = '20260913.5';
export const PROJECT_ROOT = '/Users/kartamyshev/Git/loginom-dock';
export const ENROLLMENTS_DIR = join(homedir(), '.openviking/project-memory-enrollments/loginom-dock');
const fail = message => { throw new ProjectRoutingError(message); };
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const enrollmentKey = cwd => hash(cwd);
export const enrollmentPath = (cwd, directory = ENROLLMENTS_DIR) => join(directory, enrollmentKey(cwd) + '.json');
function pathPresent(path) {
  try { lstatSync(path); return true; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

export function protectedPath(path, directory = false) {
  const s = lstatSync(path);
  if (s.isSymbolicLink() || realpathSync(path) !== path || s.uid !== process.getuid() ||
      (directory ? !s.isDirectory() || (s.mode & 0o777) !== 0o700 : !s.isFile() || (s.mode & 0o777) !== 0o600))
    fail('Enrollment paths must be private, owner-controlled and non-symlinked.');
}

export function loadEnrollment(cwd, { directory = ENROLLMENTS_DIR, projectRoot = PROJECT_ROOT } = {}) {
  // Read exactly one independent record; unrelated deleted or corrupt entries
  // cannot change another task's route, hash or availability.
  if (typeof cwd !== 'string' || cwd !== resolve(cwd)) fail('Enrollment requires an exact absolute workspace.');
  if (!pathPresent(directory)) return null;
  protectedPath(directory, true);
  const path = enrollmentPath(cwd, directory);
  if (!pathPresent(path)) return null;
  protectedPath(path);
  let record;
  try { record = JSON.parse(readFileSync(path, 'utf8')); } catch { fail('Enrollment record is not valid JSON.'); }
  const fields = ['version','cwd','registrationId','routeSpec','routeHash','status','threadId','prepared','createdAt'];
  if (!record || Object.keys(record).some(k => !fields.includes(k)) || record.version !== 1 || record.cwd !== cwd ||
      !/^[a-f0-9-]{36}$/.test(record.registrationId) || !Number.isFinite(Date.parse(record.createdAt)) ||
      !['pending','enrolling','active'].includes(record.status) ||
      (record.status === 'pending' ? record.threadId !== null : !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(record.threadId)))
    fail('Enrollment identity or lifecycle is invalid.');
  if (record.routeSpec?.projectRoot !== projectRoot || record.routeSpec.generation !== ENROLLMENT_GENERATION ||
      JSON.stringify(record.routeSpec.workspaces) !== JSON.stringify([cwd]) || cwd === projectRoot ||
      !cwd.startsWith(projectRoot + '/.worktrees/')) fail('Enrollment must belong to one exact project worktree.');
  const route = validateProjectRouting({ version: 1, projects: [record.routeSpec] }).projects[0];
  if (route.routeHash !== record.routeHash || !record.prepared ||
      !/^[a-f0-9]{64}$/.test(record.prepared.configSha256) || !/^[a-f0-9]{64}$/.test(record.prepared.hooksSha256))
    fail('Enrollment preparation or route changed.');
  return { record, route, path, directory };
}

export function requireEnrolledTask(enrollment, threadId) {
  if (!enrollment) return;
  if (enrollment.record.status !== 'active') fail('Project memory registration is pending; finish coordinator enrollment before memory access.');
  if (enrollment.record.threadId !== threadId) fail('This workspace is enrolled to a different task; never reuse its capture cursor.');
}

export function observationPath(enrollment) {
  return join(enrollment.directory, enrollmentKey(enrollment.record.cwd) + '.bootstrap.json');
}

export function observeBootstrap(enrollment, context, input, event) {
  if (enrollment.record.status === 'enrolling') {
    if (enrollment.record.threadId !== context.threadId) fail('Another task owns this enrollment.');
    return;
  }
  const target = observationPath(enrollment);
  const expected = { version: 1, registrationId: enrollment.record.registrationId,
    cwd: context.cwd, threadId: context.threadId, routeHash: enrollment.route.routeHash };
  if (existsSync(target)) {
    protectedPath(target);
    let previous;
    try { previous = JSON.parse(readFileSync(target, 'utf8')); } catch { fail('Bootstrap observation is invalid.'); }
    if (Object.entries(expected).some(([key,value]) => previous[key] !== value))
      fail('Another task already observed this pending workspace; reconcile before continuing.');
    return;
  }
  if (event !== 'SessionStart') fail('Pending task requires its real SessionStart observation first.');
  // Metadata only: no prompt, messages or tools are captured during bootstrap.
  writeFileSync(target, JSON.stringify({ ...expected, observedAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
}
