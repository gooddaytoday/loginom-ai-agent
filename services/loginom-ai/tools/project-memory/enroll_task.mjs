#!/usr/bin/env node
// Evidence files contain host metadata only; never transcript content or secrets.
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const args = process.argv.slice(2);
const options = Object.fromEntries(args.reduce((pairs, value, i) => {
  if (i % 2 === 0) { if (!['--runtime','--cwd','--thread','--evidence','--hooks-receipt'].includes(value) || !args[i+1]) throw Error('Expected --runtime --cwd --thread --evidence --hooks-receipt'); pairs.push([value.slice(2), args[i+1]]); } return pairs;
}, []));
if (Object.keys(options).length !== 5) throw Error('All five enrollment arguments are required');
const runtime = resolve(options.runtime);
const { protectedPath } = await import(pathToFileURL(join(runtime, 'enrollment-routing.mjs')));
for (const file of [options.evidence, options['hooks-receipt']]) protectedPath(resolve(file));
const evidence = JSON.parse(readFileSync(options.evidence,'utf8'));
const hooksReceipt = JSON.parse(readFileSync(options['hooks-receipt'],'utf8'));
const { enrollFreshTask } = await import(pathToFileURL(join(runtime, 'enrollment-management.mjs')));
try { console.log(JSON.stringify(await enrollFreshTask({cwd:resolve(options.cwd), threadId:options.thread, evidence, hooksReceipt}))); }
catch(e) { process.stderr.write('Enrollment stopped; preserved state must be reconciled: '+e.message+'\n'); process.exitCode=1; }
