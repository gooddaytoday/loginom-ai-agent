"""Independent evidence audit; diagnostics are not atomic/full variant acceptance."""
import copy,json,struct,sys,datetime
from pathlib import Path

def audit(moscow,ny,ui_moscow,ui_ny,cancel):
    expected_dates=[[2024,3,10,2,30,0,0],[2024,11,3,1,30,0,0],[100,1,1,0,0,0,0],[9999,12,31,23,59,59,999],[1899,12,30,6,0,0,0]]
    ints=[2147483647,-2147483648,0,1,2]
    reals=[1.0000001192092896,3.4028234663852886e38,1.401298464324817e-45,-0.0,1.0]
    for r in [moscow,ny]:
        assert r['method']==321 and r['interface']==116 and r['port']==0
        assert r['atomic_snapshot_verified'] is False and r['consistency']=='observed_local_only'
        assert r['row_count']==15 and len(r['cells'])==15 and len(r['schema'])==4
        assert all(s['name']!='DataTypes' for s in r['schema'])
        assert r['execution']['status']=='completed' and r['execution']['execution_id'].startswith(r['document_id']+':')
        assert r['owner_rechecked'] and r['cache_identity_rechecked']
        assert len({c['message_id'] for c in r['cells']})==15
        for i,c in enumerate(r['cells']):
            assert c['row']==i and c['column']==3 and c['frame_size']==60
            payload=bytes(c['payload']);assert len(payload)==10
            tag=struct.unpack('<h',payload[:2])[0];assert tag==c['tag']==[20,5,7][i%3]
            if i%3==0:assert struct.unpack('<q',payload[2:])[0]==ints[i//3] and c['decoded']['decimal']==str(ints[i//3])
            if i%3==1:assert payload[2:]==struct.pack('<d',reals[i//3])
            if i%3==2:
                oa=struct.unpack('<d',payload[2:])[0]
                # Integer milliseconds avoid platform timestamp ranges for years 100/9999.
                dt=datetime.datetime(1970,1,1)+datetime.timedelta(milliseconds=round((oa-25569)*86400000))
                assert [dt.year,dt.month,dt.day,dt.hour,dt.minute,dt.second,dt.microsecond//1000]==expected_dates[i//3]
                assert c['decoded']['temporal_semantics']=='unverified'
    assert moscow['execution']['execution_id']!=ny['execution']['execution_id']
    assert [c['payload'] for c in moscow['cells']]==[c['payload'] for c in ny['cells']]
    assert ui_moscow['timezone']=='Europe/Moscow' and ui_ny['timezone']=='America/New_York'
    assert [d['local'] for d in ui_moscow['dates']]==expected_dates
    assert ui_ny['dates'][0]['local']==[2024,3,10,3,30,0,0] and ui_ny['dates'][0]['offset']==240
    assert ui_ny['dates'][1]['local']==expected_dates[1] and ui_ny['dates'][1]['offset']==240
    assert ui_ny['dates'][1]['epoch_ms']==1730611800000 # first fold occurrence
    assert [d['local'] for d in ui_ny['dates'][2:]]==expected_dates[2:]
    assert cancel['before']['pending']==1 and cancel['cancel']['cancelled'] is True
    assert cancel['cancel']['native_cancelled'] is False and cancel['outcome']['accepted'] is False
    s=cancel['after'];assert s['status']=='cancelled' and s['retired'] is True and s['published'] is False
    assert s['nativeCancelled'] is False and s['pending']==0 and s['lateResponses']>=1
    assert s['releasedRequests']==s['requests']==s['releasedResponses']
    assert cancel['retry']['accepted'] is False and cancel['started']<=cancel['cancelAt']<=cancel['ended']

def audit_disconnect(d):
    assert d['before']['pending']==1 and d['before']['requests']==1
    assert d['socket']['before']==1 and d['socket']['online'] is False
    assert d['socket']['state']==2 and d['socket']['close_event'] is False
    assert d['outcome']['accepted'] is False and 'deadline_exceeded' in d['outcome']['reason']
    s=d['status'];assert s['status']=='deadline_exceeded' and s['pending']==1
    assert s['published'] is False and s['nativeCancelled'] is False and s['releasedRequests']==0
    a=d['after'];assert a['status']=='deadline_exceeded' and a['pending']==0 and a['releasedRequests']==1
    assert a['nativeCancelled'] is False and a['releasedResponses']==0 and a['published'] is False and a['retired'] is True
    assert d['retry']['accepted'] is False and d['online_restored'] is True
    assert 'разрыв связи' in d['body'] and d['ended']-d['started']>=1000

def audit_race(r):
    assert r['overlapped'] is True and r['gestureStart']<r['gestureEnd']<r['readEnded']
    assert r['result']['accepted'] is False and 'loaded cache' in r['result']['reason']

if __name__=='__main__':
    root=Path(sys.argv[1]);names=['hardening-raw-moscow','hardening-raw-newyork','hardening-date-moscow','hardening-date-newyork','hardening-live-cancel']
    args=[json.loads((root/(name+'.json')).read_text()) for name in names];audit(*args)
    changes=[lambda a:a[0].update(atomic_snapshot_verified=True),lambda a:a[0]['cells'][0].update(tag=3),lambda a:a[1]['cells'][2]['payload'].__setitem__(2,0),lambda a:a[3]['dates'][0]['local'].__setitem__(3,2),lambda a:a[3]['dates'][1].update(offset=300),lambda a:a[4]['after'].update(published=True),lambda a:a[4]['after'].update(lateResponses=0),lambda a:a[4]['after'].update(pending=1),lambda a:a[4]['cancel'].update(native_cancelled=True),lambda a:a[4]['retry'].update(accepted=True)]
    for change in changes:
        a=copy.deepcopy(args);change(a)
        try:audit(*a)
        except (AssertionError,struct.error):continue
        raise AssertionError('evidence substitution accepted')
    if len(sys.argv)>2:
        d=json.loads((Path(sys.argv[2])/'hardening-live-disconnect.json').read_text());audit_disconnect(d)
        for field,value in [('pending',1),('published',True),('releasedRequests',0),('nativeCancelled',True)]:
            broken=copy.deepcopy(d);broken['after'][field]=value
            try:audit_disconnect(broken)
            except AssertionError:continue
            raise AssertionError('disconnect substitution accepted')
    if len(sys.argv)>3:audit_race(json.loads((Path(sys.argv[3])/'hardening-live-deactivate-pinned.json').read_text()))
    print(json.dumps({'observed_hardening':'PASS','negative_substitutions':len(changes)+(4 if len(sys.argv)>2 else 0), 'live_disconnect':'PASS' if len(sys.argv)>2 else 'NOT_CHECKED','atomic_snapshot':'UNPROVEN','native_cancel':'UNPROVEN','live_int32_real32':'NOT_OBSERVED','full_variant':'BLOCKED'},indent=2))
