import {requireFiniteCleanup} from './qualify-accounts.mjs';
// Direct invocation stops before credentials, dependency import or browser creation.
try { requireFiniteCleanup(); }
catch (error) {
  console.error(JSON.stringify({schema: 'accounts-preparation-v1', status: 'BLOCKED', code: error.code}));
  process.exit(1);
}

const args = process.argv.slice(2);
const option = name => {const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1];};
try {
  const {runUIPreparation} = await import('./preparation-runtime.mjs');
  await runUIPreparation({configFile: option('--config'), operatorFile: option('--operator'),
    configsFiles: [option('--pair-worker'), option('--pair-reviewer')], evidenceDir: option('--evidence-dir'),
    operationFile: option('--operation-file')});
} catch (error) {
  console.error(JSON.stringify({schema: 'accounts-preparation-v1', status: 'UNKNOWN', code: error.code ?? error.message}));
  process.exitCode = 1;
}
