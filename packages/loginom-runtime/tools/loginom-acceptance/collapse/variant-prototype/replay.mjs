import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {decodeVariantFrame} from './decode.mjs';
let count=0;for(const file of process.argv.slice(2)){const r=JSON.parse(await fs.readFile(file));for(const c of r.cells){const bytes=[...c.payload,...Array(c.frame_size-12-c.payload.length).fill(0)],decoded=decodeVariantFrame(bytes,c.frame_size);assert.equal(JSON.stringify(decoded),JSON.stringify(c.decoded));count++;}}
console.log(JSON.stringify({final_decoder_replay:'PASS',cells:count,padding:'not interpreted'}));
