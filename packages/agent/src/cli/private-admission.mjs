import {openSync,readSync,closeSync,fstatSync,readFileSync,constants} from 'node:fs'
import {connect} from 'node:net'
import {randomBytes,createHash,createHmac,timingSafeEqual} from 'node:crypto'
const FORMAT='multica-private-child-v1', LIMIT=65536
const locator='LOGINOM_PRIVATE_ADMISSION_FD'
const numbers=new WeakMap(), scopes=new WeakMap()
const descriptors=Object.getOwnPropertyDescriptors
const aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get
const reason=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'reason').get
let begun=false, originalPromise, admitted, creation
function error(code){return Error('LOGINOM_PRIVATE_ADMISSION_'+code)}
function parse(text){
 let i=0
 function value(){
  while(/\s/.test(text[i]??'')&&i<text.length)i++
  const c=text[i]
  if(c==='"'){const start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue}if(text[i++]==='"')return JSON.parse(text.slice(start,i))}throw error('JSON')}
  if(c==='{'||c==='['){i++;const object=c==='{',out=object?Object.create(null):[];if(text[i]===(object?'}':']')){i++;return out}
   for(;;){let key;if(object){key=value();if(typeof key!=='string'||Object.hasOwn(out,key))throw error('DUPLICATE');if(text[i++]!==':')throw error('JSON')}
    const v=value();if(object)out[key]=v;else out.push(v)
    const end=text[i++];if(end===(object?'}':']'))return out;if(end!==',')throw error('JSON')
   }
  }
  for(const [word,v]of [['true',true],['false',false],['null',null]])if(text.startsWith(word,i)){i+=word.length;return v}
  const m=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));if(!m)throw error('JSON');i+=m[0].length;const n=Object.freeze({});numbers.set(n,m[0]);return n
 }
 const result=value();if(i!==text.length)throw error('JSON');return result
}
function ascii(s){return JSON.stringify(s).replace(/[\x7f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))}
function order(a,b){const x=Array.from(a),y=Array.from(b);for(let i=0;i<Math.min(x.length,y.length);i++){const d=x[i].codePointAt(0)-y[i].codePointAt(0);if(d)return d}return x.length-y.length}
function canonical(v){
 if(v===null)return 'null';if(typeof v==='string')return ascii(v);if(typeof v==='boolean')return String(v)
 if(typeof v==='object'&&numbers.has(v))return numbers.get(v)
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']'
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort(order).map(k=>ascii(k)+':'+canonical(v[k])).join(',')+'}'
 throw error('JSON')
}
function fields(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==keys.slice().sort().join(','))throw error('FIELDS')}
function hash(v){return createHash('sha256').update(canonical(v),'ascii').digest('hex')}
function snapshot(v,seen=new Map()){
 if(v===null||typeof v!=='object')return ()=>v
 if(seen.has(v))return seen.get(v)
 try{aborted.call(v);return ()=>v}catch{}
 if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw error('VALUE')
 const saved=descriptors(v),keys=Reflect.ownKeys(saved);for(const k of keys)if(!('value'in saved[k]))throw error('ACCESSOR')
 const checks=[];const check=()=>{const now=descriptors(v);if(Reflect.ownKeys(now).length!==keys.length)throw error('DRIFT');for(const [k,raw,nested]of checks){if(!now[k]||!('value'in now[k])||!Object.is(now[k].value,raw))throw error('DRIFT');nested()}return v};seen.set(v,check)
 for(const k of keys)checks.push([k,saved[k].value,snapshot(saved[k].value,seen)]);return check
}
function bootstrap(){
 const raw=process.env[locator];delete process.env[locator]
 if(raw===undefined)return
 if(process.platform!=='linux'||!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<3)throw error('FD')
 const inherited=Number(raw);let fd
 try{
  const old=fstatSync(inherited);if(!old.isFIFO())throw error('FD')
  // libuv/Node has no fcntl API. Reopen the same kernel pipe O_CLOEXEC,
  // then close the inherited descriptor synchronously before reading/awaiting.
  fd=openSync('/proc/self/fd/'+inherited,constants.O_RDONLY|0x80000)
  const next=fstatSync(fd);if(!next.isFIFO()||next.ino!==old.ino||next.dev!==old.dev)throw error('FD')
  const flags=/^flags:\s*([0-7]+)$/m.exec(readFileSync('/proc/self/fdinfo/'+fd,'utf8'));if(!flags||(parseInt(flags[1],8)&0x80000)===0)throw error('FD')
  closeSync(inherited)
  let bytes=[];const one=Buffer.alloc(1)
  for(;;){if(readSync(fd,one,0,1,null)!==1)throw error('BOOTSTRAP_EOF');bytes.push(one[0]);if(bytes.length>LIMIT)throw error('FRAME');if(one[0]===10)break}
  const b=parse(Buffer.from(bytes.slice(0,-1)).toString('utf8'));fields(b,['format','endpoint','key'])
  if(b.format!==FORMAT||typeof b.endpoint!=='string'||!b.endpoint.startsWith('/')||typeof b.key!=='string'||!/^[a-f0-9]{64}$/.test(b.key))throw error('BOOTSTRAP')
  return b
 }finally{if(fd!==undefined)closeSync(fd);try{closeSync(inherited)}catch{}}
}
export function receivePrivateAdmission(argv=process.argv){
 if(begun)return originalPromise
 begun=true
 // Consume/close the inherited bootstrap BEFORE returning the first Promise.
 let b;try{b=bootstrap()}catch(e){originalPromise=Promise.reject(e);return originalPromise}
 if(!b){originalPromise=Promise.resolve();return originalPromise}
 const argvRef=argv,argvCheck=snapshot(argv),exec=process.execPath
 const kernel=readFileSync('/proc/self/cmdline'),text=kernel.toString('utf8')
 if(!kernel.equals(Buffer.from(text,'utf8'))||!text.endsWith('\0')){originalPromise=Promise.reject(error('ARGV'));return originalPromise}
 // Bun compiled binaries project a synthetic argv[1]. Authenticate the actual
 // OS/Popen vector, never a normalized/relabelled JS projection.
 const argvHash=hash(text.slice(0,-1).split('\0'))
 const kernelCheck=()=>{if(!kernel.equals(readFileSync('/proc/self/cmdline')))throw error('ARGV')}
 originalPromise=(async()=>{
  const socket=connect(b.endpoint),key=Buffer.from(b.key,'hex'),nonce=randomBytes(32).toString('hex');let pending,buffer=Buffer.alloc(0),first,secondary=[],finished=false,deadline,timer
  function remember(e){if(first)secondary.push({value:e});else first={value:e};if(pending){const p=pending;pending=undefined;p.reject(first.value)}}
  const fail=e=>remember(e)
  const eof=()=>{if(!finished)remember(error('EOF'))}
  socket.on('error',fail);socket.on('end',eof)
  socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>LIMIT){remember(error('FRAME'));socket.destroy();return}pump()})
  function guard(){if(first)throw first.value;if(argv!==argvRef||process.argv!==argvRef||process.execPath!==exec)throw error('ARGV');argvCheck();kernelCheck();if(deadline!==undefined&&BigInt(Date.now())*1000000n>=deadline)throw error('EXPIRED')}
  function pump(){if(!pending)return;const i=buffer.indexOf(10);if(i<0)return;const p=pending;pending=undefined;const data=buffer.subarray(0,i);buffer=buffer.subarray(i+1);try{const text=data.toString('utf8'),frame=parse(text);if(!Buffer.from(text,'utf8').equals(data)||canonical(frame)!==text)throw error('CANONICAL');p.resolve(frame)}catch(e){remember(e);p.reject(first.value)}}
  function read(){guard();return new Promise((resolve,reject)=>{pending={resolve,reject};pump()})}
  async function send(v){guard();await new Promise((resolve,reject)=>socket.write(canonical(v)+'\n',e=>e?reject(e):resolve()));guard()}
  const mac=(stage,t)=>createHmac('sha256',key).update(stage+'\0','ascii').update(canonical(t),'ascii').digest('hex')
  function match(v,stage,t){if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v)||!timingSafeEqual(Buffer.from(v,'hex'),Buffer.from(mac(stage,t),'hex')))throw error('MAC')}
  try{
   await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject)});guard()
   await send({format:FORMAT,nonce});const c=await read();guard();fields(c,['transcript','mac']);const t=c.transcript;fields(t,['format','client_nonce','parent_nonce','origin_json','deadline_unix_ns','argv_sha256'])
   if(t.format!==FORMAT||t.client_nonce!==nonce||typeof t.parent_nonce!=='string'||!/^[a-f0-9]{64}$/.test(t.parent_nonce)||typeof t.origin_json!=='string'||typeof t.deadline_unix_ns!=='string'||!/^\d+$/.test(t.deadline_unix_ns)||t.argv_sha256!==argvHash)throw error('BINDING')
   match(c.mac,'challenge',t);const origin=parse(t.origin_json);if(canonical(origin)!==t.origin_json||numbers.get(origin.deadline_unix_ns)!==t.deadline_unix_ns||origin.format!=='multica-admitted-execution-origin-v1'||origin.sdk_authority!==false||origin.private_receiver!=='UNAVAILABLE')throw error('ORIGIN')
   const born=numbers.get(origin.born_unix_ns),seconds=numbers.get(origin.business_execution_seconds)
   if(origin.producer_sha256!=='39b629973cab0a1be721b35c170a53ca664c88365715f42849db6b164cbcb386'||!born||!/^\d+$/.test(born)||!seconds||!/^\d+$/.test(seconds)||BigInt(seconds)<1n||BigInt(seconds)>7200n||BigInt(t.deadline_unix_ns)!==BigInt(born)+BigInt(seconds)*1000000000n)throw error('ORIGIN')
   deadline=BigInt(t.deadline_unix_ns);guard();timer=setTimeout(()=>{remember(error('EXPIRED'));socket.destroy()},Number((deadline-BigInt(Date.now())*1000000n)/1000000n))
   await send({mac:mac('response',t)});const g=await read();guard();fields(g,['stage','mac']);if(g.stage!=='grant')throw error('STAGE');match(g.mac,'grant',t)
   await send({mac:mac('ack',t)});const a=await read();guard();fields(a,['stage','mac']);if(a.stage!=='accepted')throw error('STAGE');match(a.mac,'accepted',t)
   if(buffer.length)throw error('REPLAY');finished=true
   admitted={deadline,argv:argvRef,argvCheck:()=>{argvCheck();kernelCheck()},exec};socket.end()
  }catch(e){if(!first||!Object.is(first.value,e))remember(e);throw first.value}finally{clearTimeout(timer);key.fill(0);socket.destroy();socket.once('close',()=>{socket.removeListener('error',fail);socket.removeListener('end',eof)})}
 })()
 return originalPromise
}
function guardCreation(r,args,signal){
 try{
  if(r.args!==args||r.signal!==signal||r.origin!==admitted||process.argv!==r.origin.argv||process.execPath!==r.origin.exec)throw error('CREATION')
  r.origin.argvCheck();if(r.check)r.check()
 }catch(e){r.secondary.push({value:e});throw e}
 if(r.first)throw r.first.value
 try{if(aborted.call(signal))throw reason.call(signal);if(BigInt(Date.now())*1000000n>=r.origin.deadline)throw error('EXPIRED')}
 catch(e){r.first={value:e};throw e}
}
export function retainRunCommandCreation(args,signal){
 if(!admitted)return
 if(creation){guardCreation(creation,args,signal);return creation.token}
 const token=Object.freeze({}),r={origin:admitted,args,signal,token,secondary:[]};creation=r;scopes.set(token,r)
 try{r.check=snapshot(args)}catch(e){r.first={value:e};throw e}
 guardCreation(r,args,signal);return token
}
export function assertRunCommandCreation(token,args,signal){const r=scopes.get(token);if(!r)throw error('UNOWNED');guardCreation(r,args,signal);return r.origin.deadline}
const senders=new WeakMap(), requests=new WeakMap(), promptInputs=new WeakMap(), sdkContexts=new WeakMap(), invocations=new WeakMap(), sdkCalls=new WeakMap()
export function retainPromptSender(token,input,kind){
 const r=scopes.get(token);if(!r)return
 guardCreation(r,r.args,r.signal)
 if(kind!=='prompt'&&kind!=='command')throw error('SENDER')
 const sender={root:r,input,kind,check:snapshot(input)};senders.set(token,sender);return sender
}
export function associatePromptRequest(token,request){
 const s=senders.get(token);if(!s)return request
 guardCreation(s.root,s.root.args,s.root.signal);s.check()
 const suffix='/session/'+s.input.sessionID+'/'+(s.kind==='prompt'?'message':'command')
 if(request.method==='POST'&&new URL(request.url).pathname===suffix)requests.set(request,s)
 return request
}
export function relayPromptRequest(source,target){const s=requests.get(source);if(s){guardCreation(s.root,s.root.args,s.root.signal);requests.set(target,s)}return target}
export function admitPromptInput(source,input){
 const s=requests.get(source);if(!s)return input
 guardCreation(s.root,s.root.args,s.root.signal);s.check()
 if(canonical(parse(JSON.stringify(input)))!==canonical(parse(JSON.stringify(s.input))))throw error('PROMPT')
 promptInputs.set(input,s);return input
}
export function relayPromptInput(source,target){const s=promptInputs.get(source);if(s){guardCreation(s.root,s.root.args,s.root.signal);promptInputs.set(target,s)}return target}
export function promptSDKContext(input){const s=promptInputs.get(input);if(!s)return;guardCreation(s.root,s.root.args,s.root.signal);const t=Object.freeze({});sdkContexts.set(t,s);return t}
export function assertSDKContext(token){const s=sdkContexts.get(token);if(!s)throw error('UNOWNED');guardCreation(s.root,s.root.args,s.root.signal);return token}
export function retainSDKInvocation(request,options){
 const old=invocations.get(options)
 if(old){assertSDKContext(old.context);old.check();if(old.request!==request)throw error('SDK');if(old.first)throw old.first.value;const signal=options.abortSignal;if(aborted.call(signal))throw reason.call(signal);return old.token}
 const d=descriptors(options);if(!d.experimental_context)return
 if(!('value'in d.experimental_context))throw error('ACCESSOR')
 const s=sdkContexts.get(d.experimental_context.value);if(!s)return
 assertSDKContext(d.experimental_context.value)
 const id=d.toolCallId?.value;if(typeof id!=='string'||!id)throw error('SDK')
 let calls=sdkCalls.get(d.experimental_context.value);if(!calls){calls=new Map();sdkCalls.set(d.experimental_context.value,calls)}
 const existing=calls.get(id);if(existing&&(existing.request!==request||existing.options!==options))throw error('SDK')
 const token=Object.freeze({}),r={token,request,options,context:d.experimental_context.value,check:snapshot({request,options})};invocations.set(options,r);calls.set(id,r)
 // Raw SDK signal is qualified by its native intrinsic, never RunCommand signal.
 const signal=d.abortSignal?.value;try{if(!signal)throw error('SDK_SIGNAL');if(aborted.call(signal))throw reason.call(signal)}catch(e){r.first={value:e};throw e}
 return token
}
export function assertSDKInvocation(token,request,options){const r=invocations.get(options);if(!r||r.token!==token||r.request!==request)throw error('UNOWNED');assertSDKContext(r.context);r.check();if(r.first)throw r.first.value;const signal=options.abortSignal;if(aborted.call(signal))throw reason.call(signal);return {deadline:scopes.get(creation.token).origin.deadline,runCommandSignal:creation.signal,sdkSignal:signal}}
