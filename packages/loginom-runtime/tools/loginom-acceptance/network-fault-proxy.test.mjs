import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {once} from 'node:events';
import {createNetworkFaultProxy} from './network-fault-proxy.mjs';

test('owned proxy refuses other destinations and terminates only its transport tunnels',async()=>{
 const peers=new Set();const upstream=http.createServer((req,res)=>res.end('ok'));
 upstream.on('connection',s=>{peers.add(s);s.on('close',()=>peers.delete(s));});
 upstream.on('upgrade',(req,s)=>s.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+upstream.address().port,p=await createNetworkFaultProxy(origin),address=new URL(p.server);
 const request=path=>new Promise((resolve,reject)=>{http.get({hostname:address.hostname,port:address.port,path},r=>{r.resume();r.on('end',()=>resolve(r.statusCode));}).on('error',reject);});
 try{
  assert.equal(await request(origin+'/'),200);assert.equal(await request('http://example.invalid/'),403);
  for(let i=0;i<2;i++){
   const client=net.connect({host:address.hostname,port:Number(address.port)});await once(client,'connect');
   client.write(`GET ${origin}/socket HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`);
   const [reply]=await once(client,'data');assert.match(String(reply),/101 Switching/);
   const closed=once(client,'close');assert.deepEqual(p.disconnect(),{terminated_tunnels:1});await closed;
  }
 }finally{await p.close();for(const s of peers)s.destroy();await new Promise(r=>upstream.close(r));}
});
