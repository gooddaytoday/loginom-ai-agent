const need=(v,m)=>{if(!v)throw Error('Sampling selection: '+m);};
export function validateSamplingParameters(p,mode,request){
 validateSequentialParameters(p,mode,request,['count','position']);
 if(p.count!==undefined)need(Number.isSafeInteger(p.count)&&p.count>=0&&p.count<=2147483647,'count must be a nonnegative row count');
 if(p.position!==undefined)need(['first','last'].includes(p.position),'position must be first or last');
}
export function validateSequentialParameters(p,mode,request,keys){
 need(['sequential','random','stratified','biased','uniform'].includes(mode),'unsupported sampling mode');
 const partition=request.target.type==='preprocessing.data_partition';
 const uniform=partition?['train_group_size_rows','test_group_size_rows']:['group_size_rows'];
 const sizes=keys.filter(k=>!['position','allocation_order'].includes(k));
 keys=mode==='sequential'?keys:[...sizes,'seed',...(mode==='stratified'?['strata_fields']:mode==='biased'?['bias_field','bias_factors']:mode==='uniform'?uniform:[])];
 if(p?.seed!==undefined)need(Number.isInteger(p.seed)&&p.seed>=0&&p.seed<=2147483647,'seed must be an integer in 0..2147483647');
 const field=f=>f&&Object.keys(f).length===2&&f.kind==='input_field'&&typeof f.name==='string'&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(f.name);
 if(p?.strata_fields!==undefined)need(Array.isArray(p.strata_fields)&&p.strata_fields.length>0&&p.strata_fields.length<=128&&p.strata_fields.every(field)&&new Set(p.strata_fields.map(f=>f.name)).size===p.strata_fields.length,'unique strata input fields required');
 if(p?.bias_field!==undefined)need(field(p.bias_field),'one discrete string bias input field required');
 if(p?.bias_factors!==undefined)need(Array.isArray(p.bias_factors)&&p.bias_factors.length>0&&p.bias_factors.length<=128&&p.bias_factors.every(f=>f&&Object.keys(f).length===2&&typeof f.value==='string'&&f.value.length<=128&&Number.isFinite(f.factor)&&f.factor>=0&&f.factor<=1)&&new Set(p.bias_factors.map(f=>f.value)).size===p.bias_factors.length,'complete unique string category factors in 0..1 required');
 const required=[...keys];
 if(mode==='uniform'){
  for(const key of uniform)if(p?.[key]!==undefined)need(Number.isSafeInteger(p[key])&&p[key]>=1&&p[key]<=2147483647,key+' must be a positive row count');
  if(partition){
   keys=[...keys,'test_priority','test_priority_position'];
   if(p?.test_priority!==undefined)need(typeof p.test_priority==='boolean','test_priority must be Boolean');
   if(p?.test_priority_position!==undefined)need(['beginning','end'].includes(p.test_priority_position),'test priority position must be beginning or end');
   if(p?.test_priority_position!==undefined)need(p.test_priority===true,'test_priority_position requires test_priority:true');
   if(request.target.kind==='new'&&p?.test_priority===true)need(p.test_priority_position!==undefined,'priority position required');
  }
 }
 need(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).every(k=>keys.includes(k)),'unknown parameters');
 need(request.target.kind!=='new'||required.every(k=>Object.hasOwn(p,k)),'new node requires '+keys.join(', '));
 need(request.target.kind!=='new'||request.inputs.length===1,'new node requires one table source');
 need(request.inputs.length<=1&&request.inputs.every(i=>i.input===0),'one input port 0 required');
 need(request.mappings.every(m=>m.direction==='input'),'output mapping overrides are not supported in this slice');
 const outputs=request.target.type==='preprocessing.data_partition'?3:1;
 need((request.read?.ports??[]).every(port=>port<outputs),'output port does not exist');
}
