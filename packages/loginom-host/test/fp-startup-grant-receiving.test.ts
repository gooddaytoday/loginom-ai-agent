import {test,expect} from 'bun:test'
import {createLoginomHost} from '../src/host'
test('copied FP flags/control never activate Sorting host startup or filesystem',async()=>{
 const controller=new AbortController()
 const options:any={root:'/unavailable',resources:'/unavailable',codec:{},
  acceptanceCapture:{harness:'field-parameters-preservation-v1',authorization:'a'.repeat(64),packagePath:'/worker/fp.lgp'},
  fpStartup:{control:{signal:controller.signal,deadline:Date.now()+60000}},originalStartup:{},owner:{}}
 await expect(createLoginomHost(options)).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
 await expect(createLoginomHost(JSON.parse(JSON.stringify(options)))).rejects.toThrow('LOGINOM_HANDSHAKE_INVALID')
})
