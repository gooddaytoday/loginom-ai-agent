import {resolveAutoCorrelationField} from './auto-correlation-parameters.mjs';
import {validateAutoCorrelationOutputSchema} from './auto-correlation-output.mjs';
const need=(v,m)=>{if(!v)throw Error('Autocorrelation readback: '+m);};
export function autoCorrelationConfigurationReadback({node,phases,operation_id}){
 const owner=c=>c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c[k]===node[k]);
 const phase=name=>{const xs=phases.filter(p=>p.phase===name),p=xs[0];need(xs.length===1&&p.status==='verified'&&p.receipt_id===operation_id+':'+name&&p.value?.verified===true&&p.value.cleanup_complete===true,'verified '+name+' required');return p;};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish'),c=configured.value.configuration;
 need(c?.verified&&owner(c.node_context)&&c.domain==='time'&&c.pacf===false&&Number.isSafeInteger(c.lag_count)&&c.lag_count>=1,'supported configuration owner');
 need(resolveAutoCorrelationField({},c.fields)===c.field,'one configured series');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&owner(configured.value.validation.node_context),'accepted native settings');
 need(saved.value.settings_applied===true&&owner(saved.value.node_context)&&finished.value.settings_applied===true&&owner(finished.value.node_context),'committed native settings');
 const im=input.value.native_mapping;
 need(im?.verified&&im.inventory_complete&&owner(im.node_context)&&im.node_context.input_port?.port===0&&input.value.finish?.settings_applied===true,'input mapping owner');
 need(JSON.stringify(im.target_fields.map(({name,label,type})=>({name,label,type})))===JSON.stringify(c.fields.map(({name,label,type})=>({name,label,type}))),'input schema differs');
 const schema=validateAutoCorrelationOutputSchema(mapped.value.ports?.[0]?.schema);
 need(mapped.value.ports.length===1&&mapped.value.ports[0].port===0&&JSON.stringify(schema)===JSON.stringify(c.output_schema),'complete output schema');
 return {kind:'auto_correlation',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),
  mode:'time_domain',field:c.field,lag_count:c.lag_count,domain:'time',pacf:false,output_port:0,fields:schema.map(({name,label,type})=>({name,label,type})),package_persistence_verified:false};
}
