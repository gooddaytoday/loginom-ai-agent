import copy
import unittest
from unittest.mock import patch
from reform_configuration_evidence import verify_reform_configuration


def fixture():
    node=dict(document_id='d',workflow_id='w',node_id='n');owner=dict(node,verified=True,surface='wizard')
    source=[dict(record_id='s'+str(i),field_id=str(10+i),index=i,name=name,label='Same',type='string') for i,name in enumerate(('Raw','Other'))]
    incoming=[dict(record_id='i'+str(i),field_id=str(3+i),index=i,name=s['name'],label='Same',type='string',data_kind='Дискретный',source=s) for i,s in enumerate(source)]
    im=dict(verified=True,inventory_complete=True,source_identity_verified=True,mapping_wizard='TuneDataSourceMappingWizard',autosync=True,
            node_context=dict(owner,input_port=dict(port=0)),source_fields=source,target_fields=incoming)
    old=[dict(index=i,field_id=str(3+i),record_id='r'+str(i),name=s['name'],label='Same',type='string',data_kind='Дискретный',usage_type=0,caching_method=0,excluded=False) for i,s in enumerate(source)]
    fields=copy.deepcopy(old);fields[0].update(name='Amount',type='real',data_kind='Непрерывный',usage_type=7);fields[1]['excluded']=True
    cache=dict(value=0,display='Отключено',variable=False)
    config=lambda f:dict(verified=True,inventory_complete=True,node_context=owner,fields=f,caching=copy.deepcopy(cache))
    baseline,actual=config(old),config(fields)
    generated=dict(record_id='generated',field_id='88',index=0,name='Amount',label='Same',type='real')
    om=dict(verified=True,inventory_complete=True,source_identity_verified=True,mapping_wizard='DerivedDataSourceOutputSocketWizard',autosync=True,
            node_context=dict(owner,output_port=dict(port=0)),source_fields=[generated],target_fields=[dict(index=0,name='Amount',label='Same',type='real',data_kind='Непрерывный',excluded=False,source=generated)])
    requests=[dict(field=dict(kind='input_field',name='Raw'),name='Amount',type='real',data_kind='Непрерывный',usage='Показатель'),dict(field=dict(kind='input_field',name='Other'),excluded=True)]
    request=dict(operation_id='op',target=dict(kind='new'),parameters=dict(changes=requests),finish='done',mappings=[])
    events=[];observations=[];mutations=[]
    def add_phase(name,reads,acts,value):
        events.append(dict(operation_id='op',phase='node_phase_prepared',receipt=dict(phase=name)))
        for n,state in reads:
            observations.append((n,copy.deepcopy(dict(prepared_node_context=owner,**state))));events.append(dict(operation_id='op',step=n))
        for n,action in acts:
            mutations.append((n,action,{}));events.append(dict(operation_id='op',step=n))
        events.append(dict(operation_id='op',phase='node_phase_completed',receipt=dict(phase=name,receipt_id='op:'+name,status='verified',value=dict(verified=True,cleanup_complete=True,**copy.deepcopy(value)))))
    add_phase('input_mapping',[(1,dict(node_mapping=im))],[],dict(native_mapping=im,finish=dict(settings_applied=True)))
    mutations.append((5,dict(verb='begin_wizard'),{}))
    add_phase('configure',[(11,dict(node_reform=baseline)),(14,dict(node_reform=actual)),(16,dict(wizard=dict(stage='done')))],
              [(12,dict(verb='apply_reform_column')),(13,dict(verb='apply_reform_column')),(15,dict(verb='wizard_step',expected_stage=['output_mapping','done']))],
              dict(validation=dict(status='accepted_by_loginom_next',node_context=owner)))
    add_phase('node_finish',[],[(20,dict(verb='finish_wizard'))],dict(settings_applied=True,mode='done',node_context=owner))
    add_phase('output_mapping',[(31,dict(node_mapping=om))],[],dict(native_mapping=om,finish=dict(settings_applied=True)))
    add_phase('finish',[],[],dict(settings_applied=True,mode='done',node_context=owner))
    projected=[]
    for f,in_field in zip(fields,incoming):
        value={k:v for k,v in f.items() if k!='record_id'}
        value['input_field']={k:in_field[k] for k in ('field_id','name','label','type','index')}
        value['input_field'].update(source_name=in_field['source']['name'],source_field_id=in_field['source']['field_id']);projected.append(value)
    rb=dict(kind='field_parameters',scope='observed_before_verified_finish',values_are='observed_ui_values',node=node,
            receipt_ids=['op:'+p for p in ('input_mapping','configure','node_finish','output_mapping','finish')],fields=projected,caching=cache,
            preservation=dict(unrequested_fields=True,unrequested_properties=True,caching=True),
            input_mapping=dict(port=0,autosync=True,fields=[{**{k:f[k] for k in ('index','field_id','name','label','type','data_kind')},'source_name':f['source']['name']} for f in incoming]),
            output_mapping=dict(port=0,autosync=True,fields=[dict(index=0,name='Amount',label='Same',type='real',data_kind='Непрерывный',excluded=False,source_name='Amount')]),package_persistence_verified=False)
    events.append(dict(operation_id='op',phase='node_checkpoint',result=copy.deepcopy(dict(status='SUCCEEDED',node=node,configuration=dict(status='applied',readback=rb),execution=dict(status='not_requested',execution_id=None),output=dict(status='not_refreshed')))))
    sequence=dict(passed=True,failures=[],observations=sorted(observations),mutations=sorted(mutations))
    return request,events,sequence


class ReformConfigurationEvidenceTest(unittest.TestCase):
    def check(self,r,e,s):
        with patch('reform_configuration_evidence.verify_internal_sequence',return_value=s):return verify_reform_configuration(e,r)

    def test_input_ids_duplicate_labels_changes_and_done(self):
        r,e,s=fixture();self.assertTrue(self.check(r,e,s)['passed'])

    def test_raw_and_public_evidence_tampering(self):
        for change in [
            lambda r,e,s:s['observations'][2][1]['node_reform']['fields'][0].update(label='Lost'),
            lambda r,e,s:s['observations'][2][1]['node_reform']['fields'][1].update(caching_method=1),
            lambda r,e,s:s['observations'][2][1]['node_reform']['caching'].update(value=1),
            lambda r,e,s:s['observations'][0][1]['node_mapping']['target_fields'][0].update(field_id='foreign'),
            lambda r,e,s:s['observations'][0][1]['prepared_node_context'].update(node_id='foreign'),
            lambda r,e,s:s['mutations'].append((99,dict(verb='open_wizard'),{})),
            lambda r,e,s:s['mutations'].append((98,dict(verb='execute_graph_node'),{})),
            lambda r,e,s:e[-1]['result']['configuration']['readback']['fields'][0].update(name='Counterfeit'),
            lambda r,e,s:e[-1]['result']['configuration']['readback'].update(package_persistence_verified=True),
            lambda r,e,s:r['parameters']['changes'][0]['field'].update(name='Unknown'),
            lambda r,e,s:s.update(passed=False,failures=['bad_sequence']),
        ]:
            r,e,s=fixture();change(r,e,s);self.assertFalse(self.check(r,e,s)['passed'])


if __name__=='__main__':unittest.main()
