import test from 'node:test';
import assert from 'node:assert/strict';
import {closeManagedHandles} from '../src/close-managed-handles.mjs';
for(const mode of ['success','retained','throw','profile-failure']) test(`managed local cleanup propagates ${mode} without inventing logout`,async()=>{
  const events=[];
  const handle=name=>({async close(){events.push(name);if(name==='bridge'){
    if(mode==='throw')throw Error('private detail');
    return {browser_transport_closed:mode!=='retained',package_cleanup:{status:'BLOCKED'}};
  }}});
  const closing=closeManagedHandles({client:handle('client'),bridge:handle('bridge'),browserServer:handle('server'),browser:handle('browser'),
    async removeProfile(){events.push('profile');if(mode==='profile-failure')throw Error('private path')}});
  if(mode==='success')assert.equal(await closing,undefined);
  else await assert.rejects(closing,/^Error: LOGINOM_RUNTIME_CLEANUP_FAILED$/);
  assert.deepEqual(events,['client','bridge','server','browser','profile']);
});
