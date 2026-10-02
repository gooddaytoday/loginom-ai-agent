// Separate cold process: only technical assignment and exact saved package path.
import {runJavascriptOperator} from './javascript-live.mjs';
import {requireJavascriptSavedPackagePath} from './javascript-package-binding.mjs';
// The controller invokes this read-only admission before consuming a cold lease.
// It exercises the actual frozen entry/import graph without creating evidence,
// logging in or accepting source/settings/oracle inputs.
if (process.argv[2] === '--check-package') {
  if (process.argv.length !== 4) throw Error('Exact package preflight arguments required');
  requireJavascriptSavedPackagePath(process.argv[3]);
  console.log('javascript_cold_package_path_admitted');
} else await runJavascriptOperator(process.argv.slice(2), {coldReader: true});
