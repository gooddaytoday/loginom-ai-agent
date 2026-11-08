import {clusteringNormalizations} from './clustering-parameters.mjs';
const need=(value,message)=>{if(!value)throw Error('Clustering readback: '+message);};
export function clusteringConfigurationReadback({node,phases,operation_id}){
 const phase=name=>{const rows=phases.filter(p=>p.phase===name);need(rows.length===1&&rows[0].status==='verified'&&rows[0].receipt_id===operation_id+':'+name&&rows[0].value?.verified===true&&rows[0].value.cleanup_complete===true,'verified '+name);return rows[0];};
 const input=phase('input_mapping'),configured=phase('configure'),saved=phase('node_finish'),mapped=phase('output_mapping'),finished=phase('finish');
 const c=configured.value.configuration,training=finished.value.training??{status:'not_requested'};
 need(c?.verified===true&&['document_id','workflow_id','node_id'].every(k=>c.node_context?.[k]===node[k]),'configuration owner changed');
 need(configured.value.validation?.status==='accepted_by_loginom_next'&&saved.value.settings_applied===true&&finished.value.settings_applied===true,'settings were not committed');
 need(finished.value.mode!=='execute'||training.status==='trained'&&training.execution_id!==finished.value.execution_id&&training.source?.length===1,'training on the connected source must complete before Execute');
 const features=c.fields.filter(f=>f.usage_type!==0).map(f=>f.name),norm=c.normalization;
 const automatic=c.mode==='g_means';
 need(!automatic||Number.isSafeInteger(c.min_clusters)&&Number.isSafeInteger(c.max_clusters)&&c.min_clusters>=1&&c.min_clusters<=c.max_clusters&&c.max_clusters<=1000&&Number.isFinite(c.threshold)&&c.threshold>0,'automatic cluster bounds or threshold');
 need(Array.isArray(norm)&&norm.length===features.length&&features.length>0&&features.every((name,i)=>norm[i]?.name===name)
  &&Object.values(clusteringNormalizations).some(n=>n.type===norm[0].norm_type)&&norm.every(f=>f.norm_type===norm[0].norm_type),'complete uniform supported normalization');
 return {kind:'clustering',scope:'observed_before_verified_finish',values_are:'observed_ui_values',node:structuredClone(node),
  receipt_ids:[input,configured,saved,mapped,finished].map(p=>p.receipt_id),mode:automatic?'g_means':'k_means',
  features,...(automatic?{min_clusters:c.min_clusters,max_clusters:c.max_clusters,threshold:c.threshold}:{clusters:c.clusters}),seed:c.seed,normalization:Object.keys(clusteringNormalizations).find(k=>clusteringNormalizations[k].type===norm[0].norm_type),
  training:structuredClone(training),package_persistence_verified:false};
}
