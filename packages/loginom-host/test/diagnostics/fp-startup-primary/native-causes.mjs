// Supplements the immutable reviewer controls with first native refusals.
// Only test input literals are replaced; production and original assertions stay intact.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {join,resolve} from 'node:path'
const [node,bundle,output,phase]=process.argv.slice(2)
const out=resolve(output);await mkdir(out,{recursive:true})
const original=await readFile(join(import.meta.dirname,'fprecv-primary-reproducer.mjs'),'utf8')
const start=original.indexOf('const cases=['),end=original.indexOf('\nconst rows=[]',start)
if(start<0||end<0)throw Error('Reviewer test input boundary missing')
const cases=`const cases=[
 {name:'native-factory-undefined',cancel:null,settled:false,later:boxed(undefined),expected:boxed(undefined)},
 {name:'native-factory-null',cancel:null,settled:false,later:boxed(null),expected:boxed(null)},
 {name:'native-factory-zero',cancel:null,settled:false,later:boxed(0),expected:boxed(0)},
 {name:'native-settled-empty',cancel:null,settled:true,later:boxed(''),expected:boxed('')},
 {name:'native-settled-Error',cancel:null,settled:true,later:laterError,expected:laterError},
]`
const runner=join(out,'native-causes-reproducer.mjs')
await writeFile(runner,original.slice(0,start)+cases+original.slice(end))
await copyFile(join(import.meta.dirname,'fprecv-primary-fixture.mjs'),join(out,'fprecv-primary-fixture.mjs'))
const result=spawnSync(node,[runner,node,bundle,join(out,'raw'),phase],{stdio:'inherit'})
if(result.error)throw result.error
process.exitCode=result.status??1
