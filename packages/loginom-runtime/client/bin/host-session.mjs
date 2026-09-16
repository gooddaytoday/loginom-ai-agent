#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {loadConfig} from '../lib/config.mjs';
import {issueHostSession} from '../lib/host-session.mjs';
process.umask(0o077);
try{
 const {values}=parseArgs({options:{config:{type:'string'},'state-dir':{type:'string'},agent:{type:'string'},'adapter-revision':{type:'string'}}});
 const config=await loadConfig({configPath:values.config,stateDir:values['state-dir'],agent:values.agent,adapterRevision:values['adapter-revision']});
 let input='';for await(const chunk of process.stdin){input+=chunk;if(Buffer.byteLength(input)>4096)throw Error('Native identity limit');}
 process.stdout.write(JSON.stringify(await issueHostSession(config,JSON.parse(input)))+'\n');
}catch{process.stderr.write('Loginom Dock: идентификатор задачи Hermes не подтверждён.\n');process.exitCode=1;}
