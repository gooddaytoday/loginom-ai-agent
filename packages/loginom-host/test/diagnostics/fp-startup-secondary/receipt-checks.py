from pathlib import Path
import argparse,json,hashlib
parser=argparse.ArgumentParser();parser.add_argument('results');parser.add_argument('output');args=parser.parse_args()
path=Path(args.results);d=json.loads(path.read_text());rows={r['name']:r for r in d['results']};checks=[]
single=['native-zero-first','native-undefined','native-null','native-false','native-empty','native-error-cause-false','abort-false-first-resource-await']
for name in single:
    row=rows[name];packets=[m for m in row['messages'] if 'rejection' in m]
    assert len(packets)==1,name
    packet=packets[0]
    checks.append({'case':name,'expected':'secondaryRejection absent:single observed refusal,including propagation of same primary','pass':'secondaryRejection' not in packet,'actual':packet,'host_exit':row['own_exit'],'native_close_calls':sum(m.get('fixture')=='native-close-called' for m in row['messages'])})
canonical=rows['canonical-ready'];checks.append({'case':'canonical-ready','expected':'no rejection or secondary','pass':not any('rejection' in m or 'secondaryRejection' in m for m in canonical['messages'])})
late=rows['abort-false-original-pending'];packet=next(m for m in late['messages'] if 'rejection' in m)
checks.append({'case':'genuine-second-native-rejection','expected':'original false primary;later Error(cause:0) secondary','pass':packet['rejection']=={'kind':'value','value':False,'is_undefined':False} and packet.get('secondaryRejection')=={'kind':'Error','name':'Error','message':'late native','cause':{'kind':'value','value':0,'is_undefined':False}},'actual':packet})
result={'phase':d['phase'],'results_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pass':sum(r['pass'] for r in checks),'fail':sum(not r['pass'] for r in checks),'checks':checks,'limits':'pure independent receipt assertions over actual own SOURCE_COMPILED/INSTALLED composition;no additional native/transport effects'}
Path(args.output).write_text(json.dumps(result,indent=2)+'\n');print(d['phase'],result['pass'],'PASS',result['fail'],'FAIL:primary propagation must not fabricate another failure')
raise SystemExit(0 if result['fail']==0 else 1)
