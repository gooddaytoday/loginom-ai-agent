import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const [results,probe]=process.argv.slice(2)
assert.equal(createHash('sha256').update(await readFile(probe)).digest('hex'),'31735e6a6a6b1386bc33d7bfe6c2ab1013ee6774a6ba64cfa2803dda28489d60')
const {rows,pass,fail}=JSON.parse(await readFile(results,'utf8'))
assert.equal(pass,3);assert.equal(fail,0)
assert(!Object.hasOwn(rows[0].actual,'secondaryRejection'))
assert.deepEqual(rows[1].actual.secondaryRejection,{kind:'Error',name:'Error',message:'later factory refusal',cause:{kind:'value',is_undefined:false,value:0}})
assert.deepEqual(rows[2].actual.secondaryRejection,{kind:'value',is_undefined:true,value:null})
for(const row of rows){assert.deepEqual(row.actual.rejection,row.expected);assert.deepEqual(row.counters,{factory:1,acquire:0,close:0,release:0});assert.deepEqual(row.exit,{code:0,signal:null})}
console.log('immutable assertions/primary/secondary/terminal receipts PASS')
