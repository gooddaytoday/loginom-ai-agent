import {terminalUserPublisherInspectorSource} from './terminal-user-publisher.mjs';
export function terminalScriptWitnessArguments(id,account){return Object.freeze({id,account,inspector:terminalUserPublisherInspectorSource})}
// Fixed same-Page evaluation only. Returned JSON is evidence, never original refs/authority.
export function collectTerminalScriptWitness(expected){
 const own=(o,k)=>{const d=Object.getOwnPropertyDescriptor(o,k);if(!d||!('value'in d))throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');return d.value};
 const requireFrozen=o=>{if(!o||!Object.isFrozen(o))throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');return o};
 const publisher=requireFrozen(own(globalThis,'__loginomOriginalUserPublisherV1')),inspect=own(publisher,'inspect');
 if(typeof inspect!=='function'||Function.prototype.toString.call(inspect)!==expected.inspector)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 const sample=requireFrozen(Reflect.apply(inspect,publisher,[])),doc=own(sample,'document'),startup=own(globalThis,'__loginomStartupV1');
 if(own(startup,'document')!==doc||own(startup,'id')!==expected.id||own(startup,'account')!==expected.account)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 const acquisition=requireFrozen(own(sample,'acquisition')),defs=requireFrozen(own(acquisition,'loadedDefinitions')),bindings=requireFrozen(own(defs,'bindings'));
 const initializer=requireFrozen(own(defs,'initializers'));
 if(own(initializer,'complete')!==true||own(initializer,'scriptIdentityComplete')!==true||own(initializer,'sourceExecutionQualified')!==false||own(initializer,'closureIdentityQualified')!==false)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 const rows=[],nodes=[];
 const script=(kind,witness)=>{requireFrozen(witness);if(own(witness,'complete')!==true||own(witness,'document')!==doc)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');const node=own(witness,'script'),url=own(witness,'url');if(!node||typeof url!=='string')throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');nodes.push(node);rows.push({kind,url})};
 script('initial',own(initializer,'initialScript'));script('modifier',own(initializer,'modifierScript'));
 const records=own(initializer,'records');requireFrozen(records);if(own(records,'length')!==3)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 const names=['ObjectProxy','FileStorage','StreamPersist'],constructors=['ObjectProxy','FileStorage','StreamPersistProxy'];
 for(let i=0;i<3;i++){
  const r=requireFrozen(own(records,String(i))),kind=own(r,'kind'),ctor=own(r,'ctor'),ss=own(r,'ss'),members=own(r,'members'),methods=requireFrozen(own(r,'methods')),dependencies=requireFrozen(own(r,'dependencies'));
  if(kind!==names[i]||ctor!==own(bindings,constructors[i])||ss!==own(bindings,'ss')||own(r,'receiver')!==ss||own(ctor,'__assembly')!==own(r,'assembly'))throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  for(const key of Reflect.ownKeys(methods)){const method=own(methods,key);if(typeof method!=='function'||own(members,key)!==method||own(own(ctor,'prototype'),key)!==method)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE')}
  if(own(dependencies,'shallowCopy')!==own(ss,'shallowCopy')||own(dependencies,'prepareProperties')!==own(ss,'prepareProperties')||typeof own(dependencies,'initialBase')!=='function')throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
  script(kind,own(r,'execution'));
 }
 if(nodes[3]!==nodes[4]||nodes[0]===nodes[1]||nodes[2]===nodes[3])throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 // Re-run the original guard after projection. Never return a node/receiver/closure as DTO.
 if(own(requireFrozen(Reflect.apply(inspect,publisher,[])),'document')!==doc)throw Error('TERMINAL_SCRIPT_WITNESS_UNAVAILABLE');
 return {id:expected.id,account:expected.account,rows,projectionOnly:true,sourceExecutionQualified:false,closureIdentityQualified:false};
}
