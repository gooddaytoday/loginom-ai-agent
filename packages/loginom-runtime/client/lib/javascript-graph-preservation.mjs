const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

export function verifyJavascriptMappingGraph(before,after,node){
  const domain=value=>({document_id:value.document_id,workflow_ref:value.workflow_ref,
    nodes:value.nodes.map(({dom_epoch,...item})=>item),links:value.links,foreign_links:value.foreign_links});
  need(before?.complete===true&&after?.complete===true&&before.document_id===node.document_id
    &&after.document_id===node.document_id&&before.workflow_ref.workflow_id===node.workflow_id
    &&after.workflow_ref.workflow_id===node.workflow_id,'JavaScript mapping graph owner changed');
  const previous=before.nodes.find(item=>same(item.ref,node)),current=after.nodes.find(item=>same(item.ref,node));
  need(previous&&current,'JavaScript mapping node disappeared');
  const expected=previous.locked===true&&current.locked===false
    ?{...before,nodes:before.nodes.map(item=>item===previous?{...item,locked:false}:item)}:before;
  need(same(domain(expected),domain(after)),'JavaScript complete mapping graph changed');
  return true;
}
