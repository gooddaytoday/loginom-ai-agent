import {test,expect} from 'bun:test'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {connectionStore} from '../src/connection/connection-store'
import {connectionService} from '../src/connection/connection-service'
import {credentials} from '../src/connection/credentials'
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'capture-lease-'))
 await writeFile(join(directory,'connection.json'),JSON.stringify({generation:1,revision:1,url:'https://labelled.invalid/app/',username:'worker',secrets:{apiKey:'labelled',password:'labelled'}}),{mode:0o600})
 const service=await connectionService(connectionStore(directory,credentials('linux')),
  {check:async()=>{throw Error('LABELLED_NATIVE_CHECK_FORBIDDEN')},prepare:async()=>({close:async()=>{throw Error('LABELLED_NATIVE_CLOSE_FORBIDDEN')}})})
 await service.settled();return service
}
test('original live acquired lease is current',async()=>{const service=await fixture(),lease=service.acquire('original')!;expect(lease).toBeDefined();lease.assertCurrent()})
test('released lease cannot establish currentness',async()=>{const service=await fixture(),lease=service.acquire('original')!;lease.release();expect(()=>lease.assertCurrent()).toThrow('LOGINOM_GENERATION_UNAVAILABLE')})
test('same run/generation reacquisition never revives original capability',async()=>{const service=await fixture(),lease=service.acquire('original')!;lease.release();const next=service.acquire('original')!;expect(next.generation).toBe(lease.generation);expect(next).not.toBe(lease);expect(()=>lease.assertCurrent()).toThrow('LOGINOM_GENERATION_UNAVAILABLE');next.assertCurrent()})
test('retained uncertainty refuses current capture without release',async()=>{const service=await fixture(),lease=service.acquire('original')!;lease.holdRecovery();expect(()=>lease.assertCurrent()).toThrow('LOGINOM_GENERATION_UNAVAILABLE');expect(service.acquire('original')).toBeUndefined()})
test('copied or forged methods cannot impersonate provider-owned lease',async()=>{const service=await fixture(),lease=service.acquire('original')!;service.assertLease(lease,'original');expect(()=>service.assertLease({...lease},'original')).toThrow('LOGINOM_GENERATION_UNAVAILABLE');expect(()=>service.assertLease({generation:1,assertCurrent(){ }},'original')).toThrow('LOGINOM_GENERATION_UNAVAILABLE')})
test('foreign owner/run cannot borrow the current actual lease',async()=>{const service=await fixture(),lease=service.acquire('original')!;expect(()=>service.assertLease(lease,'foreign')).toThrow('LOGINOM_GENERATION_UNAVAILABLE')})
test('replaced lease callbacks refuse without consulting substituted guard',async()=>{const service=await fixture(),lease=service.acquire('original')!;let invoked=0;lease.assertCurrent=()=>{invoked++};expect(()=>service.assertLease(lease,'original')).toThrow('LOGINOM_GENERATION_UNAVAILABLE');expect(invoked).toBe(0)})
