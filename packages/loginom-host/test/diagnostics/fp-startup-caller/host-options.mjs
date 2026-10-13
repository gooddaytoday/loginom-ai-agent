import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const [module,resources,rawRoot]=process.argv.slice(2),root=resolve(rawRoot)
await mkdir(root,{recursive:true})
const {createLoginomHost}=await import(pathToFileURL(module))
const capture={authorization:'a'.repeat(64),packagePath:'/worker/fp.lgp',harness:'field-parameters-preservation-v1'}
const options={root,resources,headless:true,environment:{},codec:{encrypt:async x=>x,decrypt:async x=>x},acceptanceCapture:capture}
const starting=createLoginomHost(options)
capture.authorization='b'.repeat(64);capture.harness='amount-import-type-v1';capture.packagePath='/foreign/changed.lgp';options.root+='-foreign'
const host=await starting
assert.equal(host.authorizeCapture('a'.repeat(64)),true)
assert.equal(host.authorizeCapture('b'.repeat(64)),false)
assert.equal(capture.harness,'amount-import-type-v1');assert.equal(Object.isFrozen(capture),false)
await host.settled();await host.close()
console.log('FP original host options/auth retention PASS; real empty-profile FS/service; no native/lease authority')
