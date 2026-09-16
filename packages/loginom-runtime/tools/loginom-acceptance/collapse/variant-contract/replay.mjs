import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {adaptCell,temporalProfile} from './adapter.mjs';
const fixtures=JSON.parse(await readFile(new URL('./observed.json',import.meta.url),'utf8'));
const output=[];
for(const fixture of fixtures){
 const source=await readFile(fixture.source);
 if(createHash('sha256').update(source).digest('hex')!==fixture.sha256)throw Error('Original evidence hash differs');
 const cells=JSON.parse(source).cells;
 for(const c of fixture.cells){const original=cells.find(x=>x.row===c.row&&x.column===c.column),native=original&&structuredClone(original);
  if(native&&[1,8,11].includes(native.tag))native.payload.fill(0,native.tag===11?3:2,10);
  if(!native||['tag','payload','frame_size','message_id'].some(k=>JSON.stringify(native[k])!==JSON.stringify(c[k])))throw Error('Copied evidence differs');
 }
 output.push({source:fixture.source,sha256:fixture.sha256,cells:fixture.cells.map(c=>adaptCell(c,{type:'variant'},{dateProfile:temporalProfile}))});
}
await writeFile(process.argv[2],JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({source_hashes_verified:fixtures.length,observed_cells:output.reduce((n,x)=>n+x.cells.length,0)}));
