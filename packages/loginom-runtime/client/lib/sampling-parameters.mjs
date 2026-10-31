const need=(v,m)=>{if(!v)throw Error('Sampling selection: '+m);};
export function validateSamplingParameters(p,mode,request){
 validateSequentialParameters(p,mode,request,['count','position']);
 if(p.count!==undefined)need(Number.isSafeInteger(p.count)&&p.count>=0&&p.count<=2147483647,'count must be a nonnegative row count');
 if(p.position!==undefined)need(['first','last'].includes(p.position),'position must be first or last');
}
export function validateSequentialParameters(p,mode,request,keys){
 need(['sequential','random'].includes(mode),'unsupported sampling mode');
 const sizes=keys.filter(k=>!['position','allocation_order'].includes(k));
 keys=mode==='sequential'?keys:[...sizes,'seed'];
 if(p?.seed!==undefined)need(Number.isInteger(p.seed)&&p.seed>=0&&p.seed<=2147483647,'seed must be an integer in 0..2147483647');
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>keys.includes(k)),'unknown parameters');
 need(request.target.kind!=='new'||keys.every(k=>Object.hasOwn(p,k)),'new node requires '+keys.join(', '));
 need(request.target.kind!=='new'||request.inputs.length===1,'new node requires one table source');
 need(request.inputs.length<=1&&request.inputs.every(i=>i.input===0),'one input port 0 required');
 need(request.mappings.every(m=>m.direction==='input'),'output mapping overrides are not supported in this slice');
 const outputs=request.target.type==='preprocessing.data_partition'?3:1;
 need((request.read?.ports??[]).every(port=>port<outputs),'output port does not exist');
}
