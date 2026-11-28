const uuid=/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export function normalizePackageGuid(value) {
  const bare=value.replace(/^\{([^{}]+)\}$/, '$1');
  return uuid.test(bare)?bare.toLowerCase():value;
}

export function requirePackageGuid(value) {
  if(typeof value!=='string')throw Error('Missing package GUID');
  const guid=normalizePackageGuid(value);
  if(!uuid.test(guid))throw Error('Missing package GUID');
  return guid;
}

const normalized = name => name.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
export const children = parent => Array.from(parent?.childNodes??[]).filter(element=>element.nodeType===1);
export const child = (parent,name) => children(parent).find(element=>element.localName===name);
export const items = parent => children(parent).filter(element=>element.localName==='Item');

export async function withSavedPackage(bytes, xmlBudget, read) {
  const {DOMParser}=await import('@xmldom/xmldom');
  const {Uint8ArrayReader,Uint8ArrayWriter,ZipReader}=await import('@zip.js/zip.js');
  // zip.js slices must own their buffers; Buffer.slice retains the original byte offset.
  const zip=new ZipReader(new Uint8ArrayReader(new Uint8Array(bytes)),{useWebWorkers:false});
  try {
    const entries=await zip.getEntries(), members=new Map();
    for(const entry of entries){
      if(entry.directory)continue;
      const name=normalized(entry.filename);
      if(xmlBudget!==undefined&&members.has(name))throw Error('Duplicate saved package member');
      members.set(name,entry);
    }
    const xml=async name=>{
      const entry=members.get(normalized(name));
      if(!entry?.getData)return undefined;
      const bounded=xmlBudget!==undefined;
      let bytes;
      if(!bounded)bytes=await entry.getData(new Uint8ArrayWriter());
      else{
        xmlBudget-=entry.uncompressedSize;
        if(xmlBudget<0)throw Error('PACKAGE_SCHEMA_TOO_LARGE');
        bytes=new Uint8Array(entry.uncompressedSize);
        let offset=0;
        await entry.getData(new WritableStream({write(chunk){
          if(offset+chunk.byteLength>bytes.byteLength)throw Error('PACKAGE_SCHEMA_TOO_LARGE');
          bytes.set(chunk,offset);
          offset+=chunk.byteLength;
        }}),{checkSignature:true});
        if(offset!==bytes.byteLength)throw Error('PACKAGE_DOCS_XML_INVALID');
      }
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const fail=()=>{throw Error('PACKAGE_DOCS_XML_INVALID');};
      if(bounded&&/<!DOCTYPE/i.test(text))fail();
      return new DOMParser({errorHandler:{warning:fail,error:fail,fatalError:fail}})
        .parseFromString(text,'application/xml').documentElement;
    };
    const units=async()=>{
      const index=await xml('PackageIndex.xml');
      const indexed=items(child(index,'Units')).map(unit=>
        (unit.getAttribute('BasePath')??'').replaceAll('\\','/').replace(/^\/+|\/+$/g,'')).filter(Boolean);
      if(indexed.length)return indexed;
      return [...new Set(entries.flatMap(entry=>{
        const match=/^(Unit_\d+)\/Unit\.xml$/i.exec(entry.filename.replaceAll('\\','/'));
        return match?[match[1]]:[];
      }))].sort();
    };
    return await read({xml,units});
  } finally {await zip.close();}
}

export function readSavedNode(element) {
  const guid=element.getAttribute('Guid')??'';
  const name=element.getAttribute('Name')??'';
  const display_name=element.getAttribute('DisplayName')??'';
  return {element,guid,name,display_name,label:display_name||name};
}

export function readSavedWorkflow(root, depth=Infinity) {
  if(depth<0)throw Error('Invalid package workflow depth');
  const nodes=items(child(root,'Nodes')).map(element=>{
    const unit=child(child(child(element,'Component'),'Engine'),'ModelUnit');
    return {...readSavedNode(element),submodel:unit?readSavedWorkflow(child(unit,'WorkFlow'),depth-1):undefined};
  });
  const links=[...items(child(root,'Links')),...items(child(root,'ServiceLinks'))].flatMap(item=>{
    const source=child(item,'SourcePort'),target=child(item,'TargetPort');
    if(!source&&!target)return [];
    return [{
      source_node_guid:source?.getAttribute('NodeGuid')??'',
      source_port_guid:source?.getAttribute('PortGuid')??'',
      target_node_guid:target?.getAttribute('NodeGuid')??'',
      target_port_guid:target?.getAttribute('PortGuid')??'',
    }];
  });
  return {root,nodes,links};
}
