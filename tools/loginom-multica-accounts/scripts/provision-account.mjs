import {readFileSync} from 'node:fs';
import {Diagnostics} from './account-ui.mjs';
import {requireFiniteCleanup, verifyPairBindings} from './qualify-accounts.mjs';
import {verifyInheritedGuards, verifyRecordedEffects, runAccountLifecycle, sourceOnlyUIAdapter} from './account-lifecycle.mjs';

// Direct invocation stops before credentials, dependency import or browser creation.
try { requireFiniteCleanup(); }
catch (error) {
  console.error(JSON.stringify({schema: 'accounts-preparation-v1', status: 'BLOCKED', code: error.code}));
  process.exit(1);
}

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const configFile = option('--config');
const operatorFile = option('--operator');
const evidenceDir = option('--evidence-dir');
if (!configFile || !operatorFile || !evidenceDir || !option('--pair-worker') || !option('--pair-reviewer')) throw Error('PRIVATE_LIFECYCLE_INPUTS_REQUIRED');
const operator = JSON.parse(readFileSync(operatorFile, 'utf8'));
const configs = ['--pair-worker', '--pair-reviewer'].map(name => JSON.parse(readFileSync(option(name), 'utf8')));
verifyPairBindings(configs, operator, operatorFile);
const config = configs.find(item => JSON.stringify(item) === JSON.stringify(JSON.parse(readFileSync(configFile, 'utf8'))));
if (!config) throw Error('PAIR_BINDING_MISMATCH');
const diagnostics = new Diagnostics(evidenceDir, 300000);
try {
  const envelope = verifyInheritedGuards(process.env.LOGINOM_ACCOUNTS_GUARDS_FILE, configs, operator);
  await runAccountLifecycle({config, configs, operator, operatorFile, diagnostics,
    adapter: sourceOnlyUIAdapter(() => verifyRecordedEffects(envelope, configs, operator))});
  // Even a successful UI component result cannot make a child declare ready.
  throw Error('FINAL_SERVER_READBACK_NOT_IMPLEMENTED');
} catch (error) {
  console.error(JSON.stringify(diagnostics.recordError('provision', 'failure', null, error)));
  process.exitCode = 1;
}
