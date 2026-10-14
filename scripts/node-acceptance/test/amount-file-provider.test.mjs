import assert from'node:assert/strict';import vm from'node:vm';import{pathToFileURL}from'node:url';
const root=process.argv[2]??new URL('../../../packages/loginom-runtime',import.meta.url).pathname;
const{readAmountOwnPage}=await import(pathToFileURL(root+'/src/amount-own-page.mjs'));
for(const mode of ['descriptor-only','foreign-before-read','bounded-prototype']){
let invoked=0,rpc=0;const document={},o={id:'own',account:'own',origin:'https://app.loginom.ai'},s={get_CurrentUser:async()=>({get_Name:async()=>o.account}),get_Guid:async()=> '11111111-2222-3333-4444-555555555555'};
const map={FPackagesParentNode:{},PackageNodes:{Count:0},FServerConnection:{Connected:true,UserName:o.account,Session:s},HasRunningNodes:async()=>false};
Object.defineProperty(s,'FileStorage',{get(){invoked++;throw false}});s.GetFileInfo=()=>{rpc++;throw undefined};
if(mode==='bounded-prototype'){let chain={};for(let i=0;i<6;i++)chain=Object.create(chain);Object.setPrototypeOf(s,chain)}
const ctx={document,location:{origin:o.origin},__loginomStartupV1:{document,id:mode==='foreign-before-read'?'foreign':o.id,account:o.account},bg:{app:{Version:'7.4.2',Application:{FInstance:{FMainForm:{FMapTree:map}}}}}};
const result=await vm.runInNewContext('('+readAmountOwnPage.toString()+')',ctx)(o);assert.equal(invoked,0);assert.equal(rpc,0);
if(mode==='foreign-before-read'){assert.equal(result.reason,'ORIGINAL_PAGE_IDENTITY_CHANGED');assert.equal(result.file_provider,undefined)}else{assert.equal(result.status,'OWN_EMPTY_IDLE_PAGE');const p=result.file_provider;assert.equal(p.package_bytes_available,false);assert.equal(p.source_bytes_available,false);assert.equal(p.status,'BYTE_READ_PROVIDER_NOT_VERIFIED');assert(p.providers.find(x=>x.source==='session').members.some(x=>x.name==='FileStorage'&&x.kind==='getter'));assert(p.providers.every(x=>x.members.every(y=>y.depth<4)));}
console.log('PASS',mode);
}console.log('3 PASS; serialized native descriptors doubles, no native file calls');
