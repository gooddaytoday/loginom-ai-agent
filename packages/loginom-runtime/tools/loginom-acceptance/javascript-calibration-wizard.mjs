// Serialized page capability: never invoke exception getters, formatters or RPC.
// Storage fields are evidenced by WizardForm, BG_Exceptions and mscorlib.
export function beginCalibrationWizard({id,stage,identity,deadline}){
 const s=globalThis.__loginomJavascriptNativeRoundtripV1;
 const need=(v,m)=>{if(!v)throw Error('Calibration wizard: '+m);};
 need(['K1-parse-v1','K2-sync-v1'].includes(id)&&s?.document===document&&s.calibration_id===id&&!s.named_case_id
  &&['source-bound','done-prepared'].includes(s.stage)&&['next','done'].includes(stage)&&Date.now()<deadline,'closed draft stage/deadline');
 need(!s.calibrationWizard||s.calibrationWizard.settled===true&&!s.calibrationWizard.diagnosticCaptured,'one pending wizard observation');
 const w=s.schemaWitness,source=s.source,digest=s.source_sha256,node=s.node,effect=identity.effect_id;
 need(identity.node_id===node.FGuid&&identity.source_sha256===digest&&typeof effect==='string'&&effect,'owned effect');
 const own=(o,k)=>{
  const d=Object.getOwnPropertyDescriptor(o,k);
  need(!d||Object.hasOwn(d,'value'),'accessor refused');
  return d?.value;
 };
 const pins={
  "constructor": "function Exception$(message, innerException) {\n\tthis._message = message || 'An error occurred.';\n\tthis._innerException = innerException || null;\n\tthis._error = new Error();\n}",
  "get_message": "function Exception$get_message() {\n\t\treturn this._message;\n\t}",
  "get_innerException": "function Exception$get_innerException() {\n\t\treturn this._innerException;\n\t}",
  "get_stack": "function Exception$get_stack() {\n\t\treturn this._error.stack;\n\t}",
  "message": "function () {\n            return this._message;\n        }",
  "name": "function () {\n            if (this._name) return this._name;\n            var xName = this.constructor.__typeName;\n            //if (!xName) return xName = ss.Exception.__typeName;\n            var i = xName.lastIndexOf(\".\");\n            if (i >= 0) xName = xName.substring(i + 1);\n            if (xName.length > 1 && xName.charAt(0) == \"$\") xName = xName.substring(1);\n            return xName;\n        }",
  "innerException": "function () {\n            return this.get_innerException();\n        }",
  "stack": "function () {\n                return this.get_stack();\n            }",
  "rpc_stack": "function() {\n\t\t\treturn stackTrace;\n\t\t}",
  "aggregate_constructor": "function AggregateException(arg0, arg1, arg2, arg3) {\n            var _this = this;\n            var sender, message, innerExceptions, exceptionType;\n            if (typeof arg0 === \"string\") {\n                message = arg0;\n                if (arg1 instanceof Array || arg1 === null) {\n                    innerExceptions = arg1;\n                    exceptionType = arg2;\n                }\n                else {\n                    innerExceptions = arg2;\n                    exceptionType = arg1;\n                }\n            }\n            else {\n                sender = arg0;\n                message = arg1;\n                if (arg2 instanceof Exception || arg2 === null) {\n                    innerExceptions = arg2;\n                    exceptionType = arg3;\n                }\n                else {\n                    innerExceptions = arg3;\n                    exceptionType = arg2;\n                }\n            }\n            if (sender) {\n                _this = _super.call(this, sender, message, exceptionType) || this;\n            }\n            else {\n                _this = _super.call(this, message, exceptionType) || this;\n            }\n            _this.FInnerExceptions = innerExceptions || [];\n            return _this;\n        }",
  "aggregate_children": "function () {\n                return this.FInnerExceptions;\n            }",
  "aggregate_count": "function () {\n                return this.FInnerExceptions.length;\n            }"
};
 const owner=()=>{
  need(globalThis.__loginomJavascriptNativeRoundtripV1===s&&s.document===document&&s.calibration_id===id
   &&s.schemaWitness===w&&s.source===source&&s.source_sha256===digest&&s.node===node&&Date.now()<deadline,'same capability/source/deadline');
  s.upstream();
  const tab=bg.app.Application.FInstance.FMainForm.Items.Workspace.getActiveTab();
  need(w.root.isConnected&&tab===s.input.card&&tab.Controller.Node.data.node===w.native
   &&tab.Controller.FController===w.model&&w.model.FView.el.dom===w.root,'current native wizard owner');
  need(s.sourceWitness.read()===source,'exact retained draft');
 };
 const exception=()=>{
  const d=Object.getOwnPropertyDescriptor(w.model,'FException');
  need(!d||Object.hasOwn(d,'value'),'FException accessor refused');
  need(d||!('FException' in w.model),'inherited FException refused');
  return d?.value??null;
 };
 const snapshot=value=>{
  const refs=new Set();let units=0,nodes=0;
  const string=(v,optional=false)=>{
   if(optional&&v===undefined)return null;
   need(typeof v==='string'&&v.length<=8192,'diagnostic string bound/type');
   units+=v.length;need(units<=32768,'diagnostic total bound');return v;
  };
  const textField=(o,k)=>{
   if(Object.hasOwn(o,k))return string(own(o,k),true);
   need(!(k in o),'inherited diagnostic field refused');return null;
  };
  const matches=(fn,key)=>typeof fn==='function'&&Function.prototype.toString.call(fn).replace(/\r\n/g,'\n')===pins[key];
  const backing=e=>{
   need(Object.hasOwn(e,'_innerException')&&Object.hasOwn(e,'_error'),'missing native backing storage');
   const ctor=own(own(globalThis,'ss')??{},'Exception'),base=ctor&&own(ctor,'prototype');
   need(ctor&&own(globalThis,'Exception')===ctor&&matches(ctor,'constructor')&&Object.getPrototypeOf(base)===Error.prototype,'native Exception constructor/alias');
   const resolve=k=>{
    let p=e;
    for(let depth=0;p&&depth<12;depth++,p=Object.getPrototypeOf(p)){
     const d=Object.getOwnPropertyDescriptor(p,k);if(d)return {owner:p,descriptor:d};
    }
    throw Error('Calibration wizard: missing exception method');
   };
   for(const k of ['message','name','innerException','stack']){
    const r=resolve(k);need(r.owner===base&&matches(r.descriptor.get,k),'native exception accessor drift');
   }
   for(const k of ['get_message','get_innerException']){
    const r=resolve(k);need(r.owner===base&&matches(own(base,k),k),'native exception method drift');
   }
   need(matches(own(base,'get_stack'),'get_stack'),'native base stack method drift');
   const classDescriptor=resolve('constructor');
   need(Object.hasOwn(classDescriptor.descriptor,'value'),'native constructor accessor');
   const type=own(classDescriptor.descriptor.value,'__typeName');
   need(typeof type==='string'&&type.length>0&&type.length<=256,'native constructor type name');
   const explicit=own(e,'_name');need(explicit===undefined||typeof explicit==='string','native name type');
   const suffix=type.slice(type.lastIndexOf('.')+1);
   const name=explicit||((suffix.length>1&&suffix[0]==='$')?suffix.slice(1):suffix);
   const stackMethod=resolve('get_stack');let stack,stackProvenance;
   if(stackMethod.owner===e){
    const fn=own(e,'get_stack');need(matches(fn,'rpc_stack'),'native RPC stack closure drift');refs.add(fn);
    // The pinned RPC factory stores the received string in this zero-argument
    // closure. Its exact body only returns that closed-over value: no property
    // access, getter, formatter, remote call or dependence on `this`.
    stack=string(fn());stackProvenance='native_rpc_stack_closure_source_verified_unattributed';
   }else{
    need(stackMethod.owner===base,'native stack method override');
    const error=own(e,'_error');need(error&&Object.getPrototypeOf(error)===Error.prototype,'native browser Error storage');refs.add(error);
    stack=textField(error,'stack');stackProvenance=stack===null?'absent':'browser_error_own_stack_not_server_span';
   }
   return {message:string(own(e,'_message')),name:string(name),stack,inner:own(e,'_innerException'),
    class_provenance:explicit?'native_exception_own_name_backing':'native_constructor_type_name_pinned_name_projection',
    stack_provenance:stackProvenance};
  };
  const visit=(e,depth)=>{
   need(e&&typeof e==='object'&&!Array.isArray(e)&&depth<=8&&++nodes<=32&&!refs.has(e),'tree bound/cycle/shape');refs.add(e);
   const keys=Reflect.ownKeys(e);
   const backed=Object.hasOwn(e,'_message');
   const allowed=backed?['_message','_name','_innerException','_error','get_stack','FInnerExceptions','FSender','FExceptionType','FRpcPassCount']
    :['message','name','stack','innerException','FInnerExceptions','FSender','FExceptionType','FRpcPassCount'];
   need(keys.length<=allowed.length&&keys.every(k=>typeof k==='string'&&allowed.includes(k)),'unknown exception storage');
   keys.forEach(k=>own(e,k));
   // Unknown/inherited storage is refused, rather than silently losing a child.
   for(const k of [backed?'_innerException':'innerException','FInnerExceptions'])need(Object.hasOwn(e,k)||!(k in e),'inherited exception child refused');
   const data=backed?backing(e):{message:string(own(e,'message')),name:textField(e,'name'),stack:textField(e,'stack'),inner:own(e,'innerException')};
   const {message,name,stack,inner}=data,aggregate=own(e,'FInnerExceptions');
   need(!inner||!aggregate,'mixed exception children');
   const children=[];
   if(aggregate!==undefined){
    const ctor=own(bg,'AggregateException'),prototype=ctor&&own(ctor,'prototype');
    need(backed&&matches(ctor,'aggregate_constructor'),'native aggregate constructor');
    let p=Object.getPrototypeOf(e),found=false;
    for(let i=0;p&&i<12;i++,p=Object.getPrototypeOf(p)){if(p===prototype){found=true;break;}}
    need(found&&matches(Object.getOwnPropertyDescriptor(prototype,'InnerExceptions')?.get,'aggregate_children')
     &&matches(Object.getOwnPropertyDescriptor(prototype,'Count')?.get,'aggregate_count'),'native aggregate storage provenance');
    need(Array.isArray(aggregate)&&Object.getPrototypeOf(aggregate)===Array.prototype&&!refs.has(aggregate),'aggregate array shape');refs.add(aggregate);
    const n=own(aggregate,'length');need(Number.isInteger(n)&&n<=32&&Reflect.ownKeys(aggregate).length===n+1,'dense bounded aggregate');
    for(let i=0;i<n;i++)children.push(visit(own(aggregate,String(i)),depth+1));
   }else if(inner!==null&&inner!==undefined)children.push(visit(inner,depth+1));
   for(const k of ['FExceptionType','FRpcPassCount'])need(own(e,k)===undefined||Number.isSafeInteger(own(e,k)),'metadata type');
   return {message,name,stack,children,storage:aggregate!==undefined?'FInnerExceptions':inner?'innerException':'leaf',
    class_provenance:data.class_provenance??(name===null?'absent':'native_exception_own_name'),
    stack_provenance:data.stack_provenance??(stack===null?'absent':'native_exception_own_stack_origin_unverified'),
    sender_present:own(e,'FSender')!==undefined};
  };
  const tree=value===null?null:visit(value,0);
  return {tree,refs,units};
 };
 owner();const prior=exception();
 // A stale tree of unknown structure is not an admissible baseline.
 const baseline=snapshot(prior);owner();need(exception()===prior,'baseline changed');
 let held,settled=false,diagnosticCaptured=false;
 const read=()=>{
  need(!settled,'wizard observation already settled');
  owner();const current=exception();
  if(current===null){need(!held,'native exception disappeared');return {present:false,fresh:false,native_owner_verified:true};}
  need(current!==prior,'stale native exception');
  let captured,refs;
  try{
   const raw=snapshot(current);
   refs=[...raw.refs];
   captured={present:true,fresh:true,native_owner_verified:true,native_text_complete:true,truncated:false,
    normalization_applied:'none',completeness_scope:'retained_wizard_exception_text_tree',tree:raw.tree,text_units:raw.units,
    position_status:'not_attributed',source_span:null,server_stack_origin:'not_established'};
  }catch(error){
   const message=error&&typeof error==='object'?Object.getOwnPropertyDescriptor(error,'message')?.value:null;
   captured={present:true,fresh:true,native_owner_verified:true,native_text_complete:false,truncated:false,
    normalization_applied:'none',completeness_scope:'retained_wizard_exception_text_tree',tree:null,
    refusal:typeof message==='string'&&message.startsWith('Calibration wizard:')&&message.length<200?message:'Calibration wizard: storage inspection refused',
    position_status:'incomplete',source_span:null,server_stack_origin:'not_established'};
  }
  need(!refs||refs.every(v=>!baseline.refs.has(v)),'stale inner exception');
  owner();need(exception()===current,'native exception changed during snapshot');
  const fingerprint=JSON.stringify(captured);
  if(held)need(held.exception===current&&held.fingerprint===fingerprint
   &&(!refs&&!held.refs||refs&&held.refs&&refs.length===held.refs.length&&refs.every((v,i)=>v===held.refs[i])),'native exception changed after observation');
  held={exception:current,fingerprint,refs};return captured;
 };
 const capture=({id:requestedId,stage:requestedStage,identity:requested,before,after})=>{
  need(!settled&&requestedId===id&&requestedStage===stage&&requested.effect_id===effect
   &&requested.node_id===node.FGuid&&requested.source_sha256===digest,'same reserved wizard effect');
  need(before?.owner_verified===true&&after?.owner_verified===true&&after.native_owner_verified===true
   &&after.wizard_visible===true&&!after.pending&&!after.boundary_refusal,'owned settled observation');
  const diagnostic=read();need(diagnostic.present&&diagnostic.fresh&&JSON.stringify(diagnostic)===JSON.stringify(after.calibration_native_exception),'exact observed native diagnostic');
  const messages=after.messages.filter(m=>!before.messages.some(old=>old.id===m.id));
  need(messages.length<=64&&messages.every(m=>typeof m.text==='string'&&m.text.length<=4096),'bounded display messages');
  settled=true;diagnosticCaptured=true;
  return {calibration_id:id,source,source_sha256:digest,node_id:node.FGuid,stage,identity:requested,messages,
   diagnostic_origin:'wizard_native_exception',native_owner_verified:true,draft_source_verified:true,
   native_text_complete:diagnostic.native_text_complete,diagnostic,explicit_execute_dispatched:false,
   implicit_execution:'unknown',committed_source_status:'not_established',prior_source_status:'initial_owned_editor_snapshot_only',
   position_status:diagnostic.position_status,class_observed:diagnostic.tree?.name??null,
   class_provenance:diagnostic.tree?.class_provenance??null,attribution:'none',case_complete:false};
 };
 s.calibrationWizard={read,capture,get settled(){return settled;},get diagnosticCaptured(){return diagnosticCaptured;},
  beforeDispatch(){owner();need(!settled&&!held&&exception()===prior&&JSON.stringify(snapshot(prior).tree)===JSON.stringify(baseline.tree),'baseline changed before dispatch');return {verified:true,effect_id:effect};},
  finishWithoutDiagnostic(){need(!settled&&!held&&exception()===null&&Date.now()<deadline,'unconsumed native diagnostic');settled=true;}};
 return {verified:true,calibration_id:id,stage,effect_id:effect,source_sha256:digest,baseline_present:prior!==null,
  baseline_text_units:baseline.units,baseline_kind:'retained_native_exception_identity_and_tree'};
}

export function readCalibrationWizard(){
 const s=globalThis.__loginomJavascriptNativeRoundtripV1;
 if(!s?.calibrationWizard)throw Error('Calibration wizard baseline required');
 return s.calibrationWizard.read();
}

export function captureCalibrationWizard(args){
 const s=globalThis.__loginomJavascriptNativeRoundtripV1;
 if(!s?.calibrationWizard)throw Error('Calibration wizard baseline required');
 return s.calibrationWizard.capture(args);
}

export function finishCalibrationWizardObservation(){
 const s=globalThis.__loginomJavascriptNativeRoundtripV1;
 if(!s?.calibrationWizard)throw Error('Calibration wizard baseline required');
 s.calibrationWizard.finishWithoutDiagnostic();
 return {settled:true};
}

export function checkCalibrationWizardBaseline(){
 const s=globalThis.__loginomJavascriptNativeRoundtripV1;
 if(!s?.calibrationWizard)throw Error('Calibration wizard baseline required');
 return s.calibrationWizard.beforeDispatch();
}
