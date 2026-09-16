import copy
import unittest
from port_mapping_evidence import configured_mapping_goal, verify_configured_mapping_final, verify_mapping_scroll


class MappingScrollTests(unittest.TestCase):
    def fixture(self):
        root='MF;TF-1;WizrdMCF'
        control=dict(ref='grid',tid=root+';ColumnsMappingEngineOutputPortWizard;grdTargetColumns;tbl',allowed_actions=['scroll'],scroll=dict(top=1000))
        state=dict(prepared_node_context=dict(verified=True,surface='wizard',node_id='node'),wizard=dict(root_tid=root,stage='output_mapping'),ui=dict(elements=[control]))
        outcome=dict(status='SUCCEEDED',output=copy.deepcopy(state))
        outcome['output']['ui']['elements'][0]['scroll']['top']=500
        return state,dict(verb='scroll',ref='grid',delta_y=-500),outcome

    def test_bound_scroll_is_accepted(self):
        self.assertEqual(verify_mapping_scroll(*self.fixture()),[])

    def test_foreign_owner_grid_budget_and_wrong_movement_are_rejected(self):
        changes=[lambda s,a,o:o['output']['prepared_node_context'].update(node_id='foreign'),
                 lambda s,a,o:s['ui']['elements'][0].update(tid='foreign'),
                 lambda s,a,o:a.update(delta_y=-1000),
                 lambda s,a,o:o['output']['ui']['elements'][0]['scroll'].update(top=1100),
                 lambda s,a,o:o['output']['ui']['elements'][0]['scroll'].update(top=1000),
                 lambda s,a,o:o['output']['wizard'].update(stage='source')]
        for change in changes:
            fixture=self.fixture();change(*fixture)
            self.assertTrue(verify_mapping_scroll(*fixture))


class ConfiguredMappingTests(unittest.TestCase):
    def fixture(self):
        columns=[dict(name=n,label='Same',type='string',data_kind='Дискретный',used=True) for n in ('A','B')]
        mapping=dict(direction='output',port=0,autosync=False,fields=[dict(source=dict(kind='configured_field',name='B'),name='A',label='Second'),dict(source=dict(kind='configured_field',name='A'),name='B',label='First')])
        source=[dict(record_id='s'+str(i),field_id=str(i),index=i,name=c['name'],label=c['label'],type=c['type'],required=True) for i,c in enumerate(columns)]
        targets=[dict(record_id='t'+str(i),field_id=str(i),index=i,name=c['name'],label=c['label'],type=c['type'],data_kind=c['data_kind'],required=False,source=copy.deepcopy(source[i])) for i,c in enumerate(columns)]
        before=dict(verified=True,inventory_complete=True,source_identity_verified=True,source_fields=source,target_fields=targets,autosync=True,node_context=dict(verified=True,node_id='node'))
        after=copy.deepcopy(before);after['target_fields'].reverse();after['autosync']=False
        for i,(target,name,label) in enumerate(zip(after['target_fields'],('A','B'),('Second','First'))):target.update(index=i,name=name,label=label)
        observations=[(1,dict(node_mapping=before)),(5,dict(node_mapping=after))]
        return columns,mapping,observations,[(3,dict(verb='apply_output_column'),{})]

    def test_requested_order_and_aliases_keep_raw_source_identity(self):
        columns,mapping,observations,mutations=self.fixture();columns[1]['source_name']='RawB'
        goal=configured_mapping_goal(mapping,columns)
        self.assertEqual([(c['name'],c['source_name']) for c in goal],[('A','RawB'),('B','A')])
        self.assertEqual(verify_configured_mapping_final(observations,mutations,mapping,columns,goal),[])

    def test_autosync_only_new_import_keeps_complete_source_order(self):
        columns,_,_,_=self.fixture()
        goal=configured_mapping_goal(dict(direction='output',port=0,autosync=False),columns)
        self.assertEqual([(c['name'],c['label']) for c in goal],[('A','Same'),('B','Same')])

    def test_mapping_goal_rejects_missing_duplicate_and_excluded_sources(self):
        columns,mapping,_,_=self.fixture()
        for change in (lambda m:m['fields'].pop(),lambda m:m['fields'][0]['source'].update(name='A'),lambda m:m['fields'][0].update(excluded=True),lambda m:m['fields'][0].update(name='b')):
            bad=copy.deepcopy(mapping);change(bad)
            with self.assertRaises(ValueError):configured_mapping_goal(bad,columns)

    def test_final_mapping_rejects_source_swap_unrelated_changes_and_stale_read(self):
        columns,mapping,observations,mutations=self.fixture();goal=configured_mapping_goal(mapping,columns)
        for change in (lambda n:n['target_fields'][0].update(source=n['source_fields'][0]),lambda n:n.update(autosync=True),lambda n:n['target_fields'][0].update(record_id='foreign'),lambda n:n['target_fields'][0].update(label='Wrong'),lambda n:n['source_fields'][0].update(name='Other'),lambda n:n['node_context'].update(node_id='other')):
            bad=copy.deepcopy(observations);change(bad[-1][1]['node_mapping'])
            self.assertTrue(verify_configured_mapping_final(bad,mutations,mapping,columns,goal))
        self.assertTrue(verify_configured_mapping_final(observations,[(6,dict(verb='click'),{})],mapping,columns,goal))


if __name__=='__main__':unittest.main()
