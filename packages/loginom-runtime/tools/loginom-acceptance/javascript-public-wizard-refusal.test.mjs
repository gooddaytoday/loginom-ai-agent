import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {javascriptDiscoveryProbe} from './javascript-discovery-probes.mjs';
import {inspectJavascriptModulePolicy} from '../../client/lib/javascript-module-policy.mjs';
const entry=fileURLToPath(new URL('./javascript-public-wizard-refusal-live.mjs',import.meta.url));
for(const mode of ['code','declared'])test('fixed native syntax case is parseable by admission and repair preserves the pinned business source '+mode,()=>{
 const source=javascriptDiscoveryProbe('p1-business-'+mode+'-base').source;
 assert.equal(inspectJavascriptModulePolicy(source+'\nconst unsupported = ({})?.value;\n').status,'ADMITTED');
 assert.equal(inspectJavascriptModulePolicy(source+'\n// E: public native refusal repair on the SAME node.\n').status,'ADMITTED');
});
for(const args of [[],['--case','other'],['--case','syntax-code','--headless','true'],
 ['--case','syntax-code','--x11-no-focus','true'],['--case','syntax-code','--source','arbitrary'],
 ['--case','syntax-code','--case','syntax-declared']])test('fixed entrypoint refuses unassigned case or browser/source controls '+JSON.stringify(args),()=>{
 const result=spawnSync(process.execPath,[entry,...args],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Fixed public wizard refusal case required|Only assigned public wizard refusal paths permitted/);
});
test('fixed native-error help exposes only saved-package ordinary headed paths and no Save',()=>{
 const result=spawnSync(process.execPath,[entry,'--help'],{encoding:'utf8'});
 assert.equal(result.status,0);assert.match(result.stdout,/Ordinary headed/);assert.match(result.stdout,/no Save/);
});
