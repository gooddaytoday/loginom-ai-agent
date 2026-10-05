"""Export only persistent source identities, never operation receipts or results."""
import re

def actor_source_manifest(observed,fixture,account):
    package=fixture['package_basename']
    refs=observed.get('nodes',[])
    if (observed.get('kind')!='source_only' or observed.get('sourcePackage')!='/'+account+'/'+package
        or observed.get('csv')!={'bytes':fixture['file']['bytes'],'sha256':fixture['file']['sha256']}
        or len(refs)!=2 or not all(re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}',r.get('node_id','')) for r in refs)
        or refs[0]['node_id']==refs[1]['node_id']
        or any(refs[0].get(k)!=refs[1].get(k) or not refs[0].get(k) for k in ('document_id','workflow_id'))):
        raise ValueError('OWNED_SOURCE_MANIFEST_REQUIRED')
    return {'kind':'source_only','package_basename':package,'source_csv_sha256':fixture['file']['sha256'],
            'node_ids':dict(zip(('VariantInput','VariantSource'),(r['node_id'] for r in refs)))}
