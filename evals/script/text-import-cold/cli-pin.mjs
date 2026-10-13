import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const pins=JSON.parse(await readFile(new URL('./cli-pins.json',import.meta.url),'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyTextImportCli(resources){
 const prefix=resolve(resources,'../..'),bytes=await readFile(resolve(prefix,'cli-manifest.json'));
 const manifest=JSON.parse(bytes),pin=pins.find(p=>p.sourceCommit===manifest.metadata?.sourceCommit&&p.sourceDirty===manifest.metadata?.sourceDirty&&p.manifestSha256===hash(bytes));
 if(!pin)throw Error('TEXT_IMPORT_CLI_PIN_DIFFERS');
 if(hash(await readFile(resolve(prefix,'bin/loginom-ai-agent-cli')))!==pin.binarySha256)throw Error('TEXT_IMPORT_CLI_BINARY_DIFFERS');
 return pin;
}
