import {verify,createPublicKey} from "node:crypto"
import {queueDigest} from "./lab57-queue-scope"
export type FdRequest={version:1;nonce:string;sourceSha:string;ownerSha256:string;uid:1000;controller:{pid:number;birth:string};requester:{pid:number;birth:string};
 node:{path:string;device:number;inode:number;bytes:number;sha256:string};profiles:string[];originalPids:number[];namespaces:{pid:string;mnt:string;user:string}}
type Identity={pid:number;birth:string;uid:number;parent:number;fdCount:number;fdDigest:string;nativeComm:string|null}
export type FdPass={complete:boolean;startedAt:number;finishedAt:number;inventory:Identity[];originalPids:unknown[];foreignNative:unknown[];denied:unknown[];profileFds:unknown[]}
export type FdProof={report:{version:1;request:FdRequest;producer:{uid:number;capSysPtrace:boolean};passes:FdPass[];observedAt:number};signature:string}
function canonical(v:unknown):string {
 if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]"
 if(v&&typeof v==="object")return "{"+Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+":"+canonical(x)).join(",")+"}"
 return JSON.stringify(v)
}
const consumed=new Set<string>()
/** Signed root-origin report, exact fresh request, complete coherent passes. Metadata cannot issue a native permit. */
export function verifyFdProof(proof:FdProof,request:FdRequest,publicKey:string):FdPass[] {
 const fail=():never=>{throw Error("FD_OBSERVER_REFUSED")}
 try {
  const r=proof?.report,now=Date.now(),key=createPublicKey(publicKey)
  if(key.asymmetricKeyType!=="rsa"||(key.asymmetricKeyDetails?.modulusLength??0)<2048||!proof||typeof proof.signature!=="string"
   ||!verify("sha256",Buffer.from(canonical(r)),key,Buffer.from(proof.signature,"base64"))||!r||r.version!==1
   ||queueDigest(r.request)!==queueDigest(request)||request.uid!==1000||!/^[0-9a-f]{64}$/.test(request.nonce)||consumed.has(request.nonce)
   ||r.producer?.uid!==0||r.producer.capSysPtrace!==true||!Number.isFinite(r.observedAt)||r.observedAt>now||now-r.observedAt>15000
   ||!Array.isArray(r.passes)||r.passes.length!==2||new Set(request.profiles).size!==6)fail()
  for(const p of r.passes){
   if(p.complete!==true||!Number.isFinite(p.startedAt)||!Number.isFinite(p.finishedAt)||p.startedAt>p.finishedAt||p.finishedAt>r.observedAt||now-p.startedAt>15000
    ||[p.originalPids,p.foreignNative,p.denied,p.profileFds].some(a=>!Array.isArray(a)||a.length)||!Array.isArray(p.inventory)||!p.inventory.length
    ||new Set(p.inventory.map(i=>i.pid)).size!==p.inventory.length||p.inventory.some(i=>!Number.isSafeInteger(i.pid)||i.pid<=0||!/^\d+$/.test(i.birth)
      ||!Number.isSafeInteger(i.uid)||i.uid<0||!Number.isSafeInteger(i.parent)||i.parent<0||!Number.isSafeInteger(i.fdCount)||i.fdCount<0||!/^[0-9a-f]{64}$/.test(i.fdDigest)
      ||!(i.nativeComm===null||typeof i.nativeComm==="string"&&["chrome","chromium","loginom-ai-","bwrap"].some(prefix=>i.nativeComm!.startsWith(prefix)))))fail()
   for(const e of [request.controller,request.requester])if(!p.inventory.some(i=>i.pid===e.pid&&i.birth===e.birth&&i.uid===1000))fail()
   if(p.inventory.some(i=>request.originalPids.includes(i.pid)))fail()
   let pid=request.requester.pid;const seen=new Set<number>()
   while(pid!==request.controller.pid){const i=p.inventory.find(i=>i.pid===pid);if(!i||i.uid!==1000||seen.has(pid))return fail();seen.add(pid);pid=i.parent}
  }
  if(r.passes[0]!.finishedAt>=r.passes[1]!.startedAt||queueDigest(r.passes[0]!.inventory)!==queueDigest(r.passes[1]!.inventory))fail()
  consumed.add(request.nonce);return r.passes
 }catch{return fail()}
}
