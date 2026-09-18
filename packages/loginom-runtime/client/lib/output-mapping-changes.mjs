// Expand edits against a complete, verified layout. The legacy fields array is
// always a full layout and is never silently supplemented.
export function expandOutputChanges(mapping,baseline) {
 if(mapping.changes===undefined)return mapping;
 if(mapping.direction!=='output'||mapping.fields!==undefined)throw Error('Output changes and full fields are mutually exclusive');
 if(!Array.isArray(mapping.changes)||mapping.changes.length>1000)throw Error('Bounded output changes required');
 const edits=new Map();
 for(const edit of mapping.changes){
  const name=edit.source?.name;
  if(edit.source?.kind!=='configured_field'||edits.has(name)||baseline.filter(f=>f.source.name===name).length!==1)
   throw Error('Output changes reference an unknown or repeated source: '+name);
  if(!['name','label','excluded'].some(k=>Object.hasOwn(edit,k)))throw Error('Output change must rename or exclude a field');
  edits.set(name,edit);
 }
 const fields=baseline.map(field=>{
  const edit=edits.get(field.source.name);if(!edit)return structuredClone(field);
  // Existing resolvers determine the native exclusion name and label. Do not
  // override those with the active field's previous display properties.
  const base=edit.excluded===true&&field.excluded!==true?{source:field.source}:field;
  return {...structuredClone(base),...structuredClone(edit)};
 });
 const {changes,...rest}=mapping;
 return {...rest,fields};
}
