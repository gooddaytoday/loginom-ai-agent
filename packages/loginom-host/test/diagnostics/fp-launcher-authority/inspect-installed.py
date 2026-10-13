import pathlib,os,json,hashlib
root=pathlib.Path(os.environ['LOGINOM_ARTIFACT_PATH']);out=pathlib.Path(os.environ['FP_AUTH_OUT'])
b=(root/'bin/loginom-ai-agent-cli').read_bytes();matches=[]
for i,chunk in enumerate(b.split(b'\0')):
 if b'field-parameters-preservation-v1' not in chunk or b'WeakMap' not in chunk:continue
 t=chunk.decode('utf8',errors='strict');p=out/('embedded-'+str(i)+'.mjs');p.write_text(t);matches.append({'index':i,'bytes':len(chunk),'sha256':hashlib.sha256(chunk).hexdigest(),'file':p.name,'has_inventory':b'resource-manifest.json' in chunk,'has_grant_mint':b'randomBytes' in chunk,'has_weakmap_set':b'.set(' in chunk})
(out/'installed-launcher-blocks.json').write_text(json.dumps(matches,indent=2));print(matches)
