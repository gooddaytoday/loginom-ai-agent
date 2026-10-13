import {isAbsolute,join,resolve} from 'node:path'
import {mkdir} from 'node:fs/promises'
import {cliSourceSnapshot} from '../../../script/cli-source-snapshot'
// Component compiler only. It does not modify the stock builder/inventory or
// install/select this module as a runtime private entry.
const destination=process.argv[2]
if(!destination||!isAbsolute(destination))throw Error('ABSOLUTE_COMPONENT_OUTPUT_REQUIRED')
const repo=resolve(import.meta.dir,'../../../../..')
await mkdir(destination,{recursive:true,mode:0o700})
const result=await Bun.build({entrypoints:[join(repo,'packages/loginom-host/src/amount-private-launcher-entry.ts')],outdir:destination,naming:'amount-private-launcher.mjs',target:'node',packages:'bundle',splitting:false,metafile:true})
if(!result.success||!result.metafile)throw new AggregateError(result.logs,'AMOUNT_COMPONENT_BUILD_FAILED')
await Bun.write(join(destination,'amount-launcher-build-inputs.json'),JSON.stringify(result.metafile,null,2))
await Bun.write(join(destination,'component-only.json'),JSON.stringify({source:await cliSourceSnapshot(repo),bun:process.versions.bun,scope:'PREPARED_COMPONENT_BUNDLE_NOT_SELECTED_STOCK_ENTRY',stockSelected:false,nativeAuthority:false},null,2)+'\n')
