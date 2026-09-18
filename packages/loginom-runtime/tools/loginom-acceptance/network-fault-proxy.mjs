// Operator-only transport fault injection. Never logs URLs, headers or frames.
import http from 'node:http';
import net from 'node:net';

export async function createNetworkFaultProxy(origin) {
 const target=new URL(origin), allowedPorts=new Set([target.port||'80','8080']);
 if(target.protocol!=='http:'||target.username||target.password)throw Error('HTTP diagnostic origin required');
 const sockets=new Set(), tunnels=new Set();
 const track=s=>{if(!sockets.has(s)){sockets.add(s);s.on('close',()=>sockets.delete(s));s.on('error',()=>{});}return s;};
 const destination=raw=>{const u=new URL(raw);if(u.protocol!=='http:'||u.hostname!==target.hostname||!allowedPorts.has(u.port||'80')||u.username||u.password)throw Error('Proxy destination refused');return u;};
 const server=http.createServer((req,res)=>{
  let u;try{u=destination(req.url);}catch{res.writeHead(403).end();return;}
  const out=http.request({hostname:u.hostname,port:u.port||80,path:u.pathname+u.search,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
  out.on('socket',track);out.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(out);
 });
 server.on('connection',track);
 const tunnel=(client,host,port,initial)=>{
  const upstream=track(net.connect({host,port}));const pair={client,upstream};tunnels.add(pair);
  const closed=()=>{tunnels.delete(pair);client.destroy();upstream.destroy();};
  upstream.on('error',closed);client.on('error',closed);client.on('close',closed);upstream.on('close',closed);
  upstream.once('connect',()=>{if(initial)upstream.write(initial);client.pipe(upstream);upstream.pipe(client);});
 };
 server.on('upgrade',(req,client,head)=>{
  let u;try{u=destination(req.url.replace(/^ws:/,'http:'));}catch{client.destroy();return;}
  const headers=Object.entries(req.headers).map(([k,v])=>k+': '+v).join('\r\n');
  tunnel(client,u.hostname,Number(u.port||80),Buffer.concat([Buffer.from(`${req.method} ${u.pathname+u.search} HTTP/1.1\r\n${headers}\r\n\r\n`),head]));
 });
 server.on('connect',(req,client,head)=>{
  let u;try{u=destination('http://'+req.url);}catch{client.destroy();return;}
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n');tunnel(client,u.hostname,Number(u.port||80),head);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {server:'http://127.0.0.1:'+server.address().port,
  disconnect(){const count=tunnels.size;for(const {client,upstream} of [...tunnels]){client.destroy();upstream.destroy();}return {terminated_tunnels:count};},
  async close(){for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));}};
}
