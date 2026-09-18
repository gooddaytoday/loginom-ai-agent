#!/usr/bin/env node
// Private native adapter endpoint; never exposed in the model's tool catalog.
import { parseArgs } from 'node:util';
import { loadConfig } from '../lib/config.mjs';
import { produceHostInputTicket,nativeInputFailure } from '../lib/host-inputs.mjs';
process.umask(0o077);
try {
  const { values } = parseArgs({ options: { config:{type:'string'}, 'state-dir':{type:'string'}, agent:{type:'string'}, 'adapter-revision':{type:'string'} } });
  const config = await loadConfig({ configPath:values.config,stateDir:values['state-dir'],agent:values.agent,adapterRevision:values['adapter-revision'] });
  let text = '';
  for await (const chunk of process.stdin) { text += chunk; if (Buffer.byteLength(text) > 65536) throw Error('Native input limit'); }
  const request = JSON.parse(text);
  const result = await produceHostInputTicket(config, request);
  process.stdout.write(JSON.stringify(result) + '\n');
} catch(error) { process.stdout.write(JSON.stringify(nativeInputFailure(error))+'\n'); process.exitCode = 1; }
