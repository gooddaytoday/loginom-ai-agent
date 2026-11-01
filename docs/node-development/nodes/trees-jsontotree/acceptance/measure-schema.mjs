// Measure a proposal in memory. This does not register types or install handlers.
import {readFile} from 'node:fs/promises';
import {nodeApiTools} from '../../../../../packages/loginom-runtime/client/lib/node-api.mjs';

const proposal=JSON.parse(await readFile(new URL('./schema-proposal.json',import.meta.url),'utf8'));
const base=nodeApiTools.find(tool=>tool.name==='dock_node_apply').inputSchema;
const bytes=schema=>Buffer.byteLength(JSON.stringify(schema),'utf8');
const combined=structuredClone(base);
console.log('base',bytes(base));
for(const [type,definition] of Object.entries(proposal)){
  const schema=structuredClone(base);
  for(const target of [schema,combined]){
    target.properties.target.properties.type.enum.push(type);
    target.properties.mode.enum.push(definition.mode);
    Object.assign(target.properties.parameters.properties,definition.parameter_schema.properties);
  }
  const increment=bytes(schema)-bytes(base);
  if(increment>1050)throw Error(type+' exceeds 1050-byte proposal budget: '+increment);
  console.log(type,increment,'total',bytes(schema));
}
console.log('combined',bytes(combined),'increment',bytes(combined)-bytes(base));
