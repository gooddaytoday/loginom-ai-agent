import {readFileSync} from 'node:fs';
import {verifyHarnessGuards} from './capture-harness.mjs';
import {privatePath} from './parent-readback.mjs';

// Fixed qualification child, distinct from both closed ordinary entrypoints.
// Validate actual parent/guard/barrier/source/operation provenance BEFORE any
// config/dependency/browser read. No env/PASS/ready boolean admits this entry.
const args = process.argv.slice(2);
const option = name => {const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1];};
try {
  const operationFile = option('--operation-file'), guardsFile = process.env.LOGINOM_ACCOUNTS_GUARDS_FILE;
  privatePath(operationFile); privatePath(guardsFile);
  const operation = JSON.parse(readFileSync(operationFile));
  const envelope = JSON.parse(readFileSync(guardsFile));
  if (operation.schema !== 'lab53-preparation-operation-v1'
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(operation.operation_id)
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(operation.issue_id)) throw Error('CAPTURE_OPERATION_UNKNOWN');
  verifyHarnessGuards(envelope, operation);
  const authorization = operation.parent_authorization;
  privatePath(authorization.path);
  const {createHash} = await import('node:crypto');
  const {lstatSync} = await import('node:fs');
  const info = lstatSync(authorization.path), raw = readFileSync(authorization.path), owner = JSON.parse(raw);
  if (info.dev !== authorization.device || info.ino !== authorization.inode
    || createHash('sha256').update(raw).digest('hex') !== authorization.sha256
    || owner.issue_id !== operation.issue_id || owner.operation_id !== operation.operation_id
    || JSON.stringify(owner.source) !== JSON.stringify(operation.source)
    || JSON.stringify(owner.configs) !== JSON.stringify(operation.configs)
    || JSON.stringify(owner.expected_observer) !== JSON.stringify(operation.expected_observer)) throw Error('PRIVATE_PARENT_BINDING_REQUIRED');
  if (operation.configs?.length !== 3) throw Error('PRIVATE_PARENT_CONFIG_BINDING_REQUIRED');
  if (option('--operator') !== operation.configs[0].path
    || option('--pair-worker') !== operation.configs[1].path
    || option('--pair-reviewer') !== operation.configs[2].path
    || !operation.configs.slice(1).some(binding => binding.path === option('--config')))
    throw Error('PRIVATE_PARENT_CONFIG_BINDING_REQUIRED');
  for (const binding of operation.configs) {
    privatePath(binding.path); const info = lstatSync(binding.path);
    if (info.dev !== binding.device || info.ino !== binding.inode
      || createHash('sha256').update(readFileSync(binding.path)).digest('hex') !== binding.sha256)
      throw Error('PRIVATE_PARENT_CONFIG_BINDING_REQUIRED');
  }
  const {runUIPreparation} = await import('./preparation-runtime.mjs');
  await runUIPreparation({configFile: option('--config'), operatorFile: option('--operator'),
    configsFiles: [option('--pair-worker'), option('--pair-reviewer')], evidenceDir: option('--evidence-dir'), operationFile});
} catch (error) {
  console.error(JSON.stringify({status: 'UNKNOWN', code: error.code ?? error.message})); process.exitCode = 1;
}
