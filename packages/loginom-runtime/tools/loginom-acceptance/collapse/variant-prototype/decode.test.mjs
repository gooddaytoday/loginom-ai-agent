import test from 'node:test';import assert from 'node:assert/strict';import {decodeVariantFrame} from './decode.mjs';
const frame=(tag,write=()=>{})=>{const b=new Uint8Array(48),d=new DataView(b.buffer);d.setInt16(0,tag,true);write(d,b);return Array.from(b);};
test('lossless signed64 boundaries and values beyond 2^53',()=>{for(const n of [1n,9007199254740993n,9223372036854775807n,-9223372036854775808n])assert.equal(decodeVariantFrame(frame(20,d=>d.setBigInt64(2,n,true)),60).decimal,String(n));});
test('separate real32/64 and negative zero',()=>{for(const tag of [4,5]){const r=decodeVariantFrame(frame(tag,d=>tag===4?d.setFloat32(2,-0,true):d.setFloat64(2,-0,true)),60);assert.equal(r.type,'real');assert.equal(r.bits,tag===4?32:64);assert.equal(r.representation,'-0');}});
test('Null differs from empty string and boolean',()=>{assert.equal(decodeVariantFrame(frame(1),60).value,null);assert.equal(decodeVariantFrame(frame(8),60).value,'');assert.equal(decodeVariantFrame(frame(11),60).value,false);});
test('reject unknown/interface/undefined tags and nonfinite values',()=>{for(const t of [0,13,99,8192])assert.throws(()=>decodeVariantFrame(frame(t),60));for(const n of [NaN,Infinity,-Infinity])assert.throws(()=>decodeVariantFrame(frame(5,d=>d.setFloat64(2,n,true)),60));});
test('reject truncated frames, excessive payload, invalid strings and boolean',()=>{assert.throws(()=>decodeVariantFrame(frame(20).slice(0,9),21));assert.throws(()=>decodeVariantFrame([...frame(20),0],61));assert.throws(()=>decodeVariantFrame(frame(8,d=>d.setInt32(10,-1,true)),60));assert.throws(()=>decodeVariantFrame(frame(8,d=>d.setInt32(10,100,true)),60));assert.throws(()=>decodeVariantFrame(frame(11,d=>d.setUint8(2,2)),60));});
test('datetime keeps original bits and does not invent timezone semantics',()=>{const r=decodeVariantFrame(frame(7,d=>d.setFloat64(2,45351.99997827546,true)),60);assert.equal(r.bytes_le,'ba70d2ffff24e640');assert.equal(r.temporal_semantics,'unverified');});

test('UTF-8 is the only admitted nonempty string codepage',()=>{const b=frame(8,(d,b)=>{const s=new TextEncoder().encode('Я');d.setInt32(10,s.length,true);d.setUint16(14,65001,true);b.set(s,16);});assert.equal(decodeVariantFrame(b,60).value,'Я');const invalid=[...b];invalid[14]=0;invalid[15]=0;assert.throws(()=>decodeVariantFrame(invalid,60));});
test('signed32 remains distinct from real32',()=>{for(const n of [-2147483648,2147483647])assert.equal(decodeVariantFrame(frame(3,d=>d.setInt32(2,n,true)),60).decimal,String(n));});
test('leading U+FEFF is scalar content, not a transport BOM',()=>{
 for(const text of ['\ufeffA','\ufeff','\ufeff\ufeffЯ','A\ufeffB']){
  const bytes=new TextEncoder().encode(text),payload=frame(8,(d,b)=>{d.setInt32(10,bytes.length,true);d.setUint16(14,65001,true);b.set(bytes,16);});
  const decoded=decodeVariantFrame(payload,60);assert.equal(decoded.value,text);
  assert.deepEqual(new TextEncoder().encode(JSON.parse(JSON.stringify(decoded)).value),bytes);
 }
});
