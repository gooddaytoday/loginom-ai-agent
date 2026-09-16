"""Verify native download bytes against raw browser output, not summary booleans."""
import base64
import hashlib
import json
from pathlib import Path
import re
from package_snapshot import snapshot, compare, verify_graph


def raw_result(path):
    obj=json.loads(path.read_text())
    text='\n'.join(c.get('text','') for c in obj['content'] if c.get('type')=='text')
    match=re.search(r'^### Result\n([\s\S]*?)(?:\n### |$)',text)
    if not match: raise ValueError('missing raw browser result')
    return json.loads(match[1])


def verify(directory, manifest):
    directory=Path(directory)
    receipt=json.loads((directory/'readonly-first.json').read_text())
    prep=json.loads((directory/'preparation.json').read_text())
    session=json.loads((directory/'session.json').read_text())
    if receipt['executor_created'] is not False or receipt['session_id']!=session['sessionId'] or receipt['document_id']!=prep['document_id']:
        raise ValueError('fresh session/document binding')
    if prep.get('status')!='READY' or prep.get('target',{}).get('loginom_build')!='7.4.2' or prep.get('package_ref',{}).get('path')!=manifest['package']['path']: raise ValueError('native prepared package/build mismatch')
    if prep['created_draft'] or receipt['start_sequence']!=3 or receipt['end_sequence']!=6:
        raise ValueError('readonly-first startup sequence')
    if len(receipt['downloads'])!=2: raise ValueError('source/package pair required')
    pins=json.loads((Path(__file__).parent/'native-functions.json').read_text())
    snapshots=[]
    for index,(entry,expected) in enumerate(zip(receipt['downloads'],[manifest['source'],manifest['package']])):
        ref=f'browser-{index+5}.json'
        if entry['raw_observation_refs']!=[ref]: raise ValueError('raw ordering')
        raw=raw_result(directory/ref)
        if raw.get('function_sha256')!=pins['sha256']: raise ValueError('native function pins differ')
        calls=raw.get('calls',[])
        if calls[:2]!=['GetFileStream','GetFileSize'] or calls[-1:]!=['Dispose'] or any(not isinstance(c,dict) or set(c)!={'ReadBuffer'} or not 0<c['ReadBuffer']<=16384 for c in calls[2:-1]): raise ValueError('native readonly call trace differs')
        if sum(c['ReadBuffer'] for c in calls[2:-1])!=raw['bytes']: raise ValueError('native byte coverage differs')
        data=base64.b64decode(raw['base64'],validate=True)
        digest=hashlib.sha256(data).hexdigest()
        if raw['path']!=expected['path'] or entry['path']!=expected['path'] or digest!=expected['sha256'] or entry['sha256']!=digest:
            raise ValueError('native byte provenance mismatch')
        if raw['document_id']!=prep['document_id'] or raw['mode']!=0 or raw['stream_released'] is not True or raw['disposed'] is not True or raw['bytes']!=len(data):
            raise ValueError('native identity/cleanup mismatch')
        file=directory/'readonly-downloads'/expected['path'].split('/')[-1]
        if file.read_bytes()!=data: raise ValueError('local artifact differs from native bytes')
        if index: snapshots.append(snapshot(data))
    return {'status':'READONLY_DIAGNOSTIC_PASS','session_id':receipt['session_id'],'document_id':prep['document_id'],'snapshot':snapshots[0],
            'limitations':['Does not grant Hermes admission','Ten-case persistence and loss bridge remain separate gates']}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('manifest');p.add_argument('--baseline');p.add_argument('--graph');p.add_argument('--output',required=True);a=p.parse_args()
    result=verify(a.directory,json.loads(Path(a.manifest).read_text()))
    if a.baseline: result['settings_comparison']=compare(snapshot(Path(a.baseline).read_bytes()),result['snapshot'])
    if a.graph:
        graph=json.loads(Path(a.graph).read_text())
        manifest=json.loads(Path(a.manifest).read_text())
        if graph.get('package_path')!=manifest['package']['path'] or graph.get('document_id')!=result['document_id']:raise ValueError('native graph document/package differs')
        result['native_topology']=verify_graph(result['snapshot'],graph)
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(result['status'])
