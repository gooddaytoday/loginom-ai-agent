// Operator-only bounded source. Never deliver this CPU loop to model knowledge.
import {createHash} from 'node:crypto';
import {javascriptBusinessProbes} from './javascript-business-probes.mjs';

export function javascriptStopProbe(){
  const short=javascriptBusinessProbes().find(p=>p.id==='p1-business-code-base');
  const loop='var stopStarted=Date.now();\nfor(var stopIteration=0;stopIteration<100000000 && Date.now()-stopStarted<45000;stopIteration++) {}\n';
  const source=short.source.replace('for (var row=0;',loop+'for (var row=0;');
  if(source===short.source)throw Error('Finite stop loop was not inserted');
  return {...short,id:'p1-stop-finite',scope:'P1-stop',source,
    source_sha256:createHash('sha256').update(source,'utf8').digest('hex'),
    finite_loop:{wall_clock_limit_ms:45000,iteration_limit:100000000},short};
}
