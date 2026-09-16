// Pure bounded decoder. Padding belongs to the pinned 60-byte transport frame.
export function decodeVariantFrame(payload,frameSize){
 const need=(x,m)=>{if(!x)throw Error(m);};
 need(Array.isArray(payload)&&payload.every(n=>Number.isInteger(n)&&n>=0&&n<=255),'bytes');
 need(Number.isInteger(frameSize)&&frameSize>=60&&frameSize<=65536&&payload.length===frameSize-12,'frame bounds');
 const b=Uint8Array.from(payload),d=new DataView(b.buffer),tag=d.getInt16(0,true);let used=10,result;
 const hex=(start,size)=>Array.from(b.slice(start,start+size)).map(n=>n.toString(16).padStart(2,'0')).join('');
 if(tag===1)result={type:'null',value:null};
 else if(tag===3||tag===20)result={type:'integer',decimal:tag===3?String(d.getInt32(2,true)):String(d.getBigInt64(2,true)),bits:tag===3?32:64};
 else if([4,5,7].includes(tag)){const n=tag===4?d.getFloat32(2,true):d.getFloat64(2,true);need(Number.isFinite(n),'non-finite number');result={type:tag===7?'datetime':'real',bits:tag===4?32:64,bytes_le:hex(2,tag===4?4:8),representation:Object.is(n,-0)?'-0':String(n),...(tag===7?{temporal_semantics:'unverified',oadate:n}:{value:n})};}
 else if(tag===11){need(b[2]===0||b[2]===1,'boolean byte');result={type:'boolean',value:b[2]===1};}
 else if(tag===8){const len=d.getInt32(10,true);need(len>=0&&len<=65520,'string length');used=len===0?14:16+len;need(used<=b.length,'truncated string');let value='';if(len){const cp=d.getUint16(14,true),encoding={65001:'utf-8'}[cp];need(encoding,'unknown string codepage');value=new TextDecoder(encoding,{fatal:true,ignoreBOM:true}).decode(b.slice(16,used));}result={type:'string',value};}
 else throw Error('unknown/interface tag');
 need(frameSize===Math.max(60,12+used),'unexpected/truncated payload length');
 return {tag,...result,consumed_bytes:used,padding_bytes:payload.length-used};
}
