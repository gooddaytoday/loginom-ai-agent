import copy
import unittest

from node_apply_save_chain import verify_save_chain
import test_saved_import_evidence as saved_fixtures


class SaveChainTests(unittest.TestCase):
    def setUp(self):
        final = saved_fixtures.SavedPackageTransitionTests(); final.setUp()
        intermediate = saved_fixtures.IntermediateSavedPackageTests(); intermediate.setUp()
        self.path, self.seed = final.path, final.seed
        draft = self.path + '.draft.lgp'
        self.events = [copy.deepcopy(final.events[0])]
        # Reuse independent observed-contract fixtures, not verifier output.
        def replace(value):
            if isinstance(value, str):
                return draft if value == self.path else ('checkpoint' if value == 'save' else value)
            if isinstance(value, dict):
                return {k: replace(v) for k, v in value.items()}
            if isinstance(value, list):
                return [replace(v) for v in value]
            return value
        self.events.extend(replace(e) for e in intermediate.events[1:3])
        for e in copy.deepcopy(final.events[1:3]):
            e['checkpoint']['package_identity']['path'] = draft
            self.events.append(e)
        for e in self.events[1:]:
            e['action_revision'] = '2'
        self.revisions = {'package.save_checkpoint': '2', 'package.save_as': '2'}

    def audit(self):
        return verify_save_chain(self.events, self.seed, self.path, self.revisions)

    def test_two_distinct_saves_without_false_full_acceptance(self):
        result = self.audit()
        self.assertTrue(result['passed'], result)
        self.assertEqual(result['save_operation_ids'], ['checkpoint', 'save'])
        self.assertFalse(result['settings_persistence_verified'])
        self.assertFalse(result['hermes_acceptance_verified'])

    def test_four_declared_stages_preserve_order_and_previous_package(self):
        import json
        draft=self.path+'.draft.lgp'
        extra=[]
        for name in ('branch-product','branch-region'):
            pair=copy.deepcopy(self.events[1:3])
            for event in pair:
                event['operation_id']=name
                if 'outcome' in event:event['outcome']['operation_id']=name
                event['checkpoint']['package_identity']['path']=draft
            extra.extend(pair)
        events=self.events[:3]+extra+self.events[3:]
        stages=[('package.save_checkpoint',draft,False)]*3+[('package.save_as',self.path,True)]
        result=verify_save_chain(events,self.seed,self.path,self.revisions,stages=stages)
        self.assertTrue(result['passed'],result)
        for index in (3,5):
            wrong=copy.deepcopy(events);wrong[index]['checkpoint']['package_identity']['path']=''
            self.assertFalse(verify_save_chain(wrong,self.seed,self.path,self.revisions,stages=stages)['passed'])


    def test_missing_duplicate_and_reordered_saves_rejected(self):
        original = copy.deepcopy(self.events)
        for i in range(len(original)):
            for duplicate in (False, True):
                with self.subTest(index=i, duplicate=duplicate):
                    self.events = copy.deepcopy(original)
                    if duplicate:
                        self.events.insert(i, copy.deepcopy(self.events[i]))
                    else:
                        self.events.pop(i)
                    self.assertFalse(self.audit()['passed'])
        self.events = [original[0], *original[3:5], *original[1:3]]
        self.assertFalse(self.audit()['passed'])

    def test_replace_proven_draft_requires_exact_order_path_and_policy(self):
        draft=self.path+'.draft.lgp'
        pair=copy.deepcopy(self.events[1:3])
        for e in pair:
            e['operation_id']='branch';e['parameters']['conflict_policy']='replace'
            e['checkpoint']['package_identity']['path']=draft
            if 'outcome' in e:e['outcome']['operation_id']='branch'
        trace=pair[1]['outcome']['trace']
        at=next(i for i,t in enumerate(trace) if t['event']=='save_requested')+1
        trace[at:at]=[dict(event='save_conflict_observed',path=draft),dict(event='overwrite_confirmed')]
        events=self.events[:3]+pair+self.events[3:]
        stages=[('package.save_checkpoint',draft,False)]*2+[('package.save_as',self.path,True)]
        audit=lambda es:verify_save_chain(es,self.seed,self.path,self.revisions,stages=stages)
        self.assertTrue(audit(events)['passed'],audit(events))
        def policy(es):
            for e in es[3:5]:e['parameters']['conflict_policy']='fail'
        changes=[policy,
            lambda es:es[4]['outcome']['trace'][at].update(path='/foreign.lgp'),
            lambda es:es[4]['outcome']['trace'].pop(at),
            lambda es:es[4]['outcome']['trace'].pop(at+1),
            lambda es:es[4]['outcome']['trace'].insert(at+2,dict(event='overwrite_confirmed')),
            lambda es:es[4]['outcome']['trace'].reverse(),
            lambda es:es[4]['outcome']['trace'].append(dict(event='conflict_rejected')),
            lambda es:es[3]['checkpoint']['package_identity'].update(path='/foreign.lgp')]
        for change in changes:
            wrong=copy.deepcopy(events);change(wrong);self.assertFalse(audit(wrong)['passed'])
        # The first save is never allowed to replace an unproven preexisting file.
        wrong=copy.deepcopy(events)
        for e in wrong[1:3]:e['parameters']['conflict_policy']='replace'
        wrong[2]['outcome']['trace'][at:at]=copy.deepcopy(trace[at:at+2])
        self.assertFalse(audit(wrong)['passed'])

    def test_save_reopen_replaces_only_its_preceding_verified_checkpoint(self):
        import json
        events=json.loads(json.dumps(self.events).replace(self.path+'.draft.lgp',self.path))
        for e in events[3:]:e['parameters']['conflict_policy']='replace'
        trace=events[4]['outcome']['trace'];at=next(i for i,t in enumerate(trace) if t['event']=='save_requested')+1
        trace[at:at]=[dict(event='save_conflict_observed',path=self.path),dict(event='overwrite_confirmed')]
        stages=[('package.save_checkpoint',self.path,False),('package.save_as',self.path,True)]
        audit=lambda es:verify_save_chain(es,self.seed,self.path,self.revisions,stages=stages)
        self.assertTrue(audit(events)['passed'],audit(events))
        for change in [lambda es:es.pop(2),lambda es:es[2]['outcome'].update(status='FAILED'),lambda es:es[3]['checkpoint']['package_identity'].update(path='/foreign.lgp'),lambda es:es[4]['outcome']['trace'][at].update(path='/foreign.lgp'),lambda es:es[4]['outcome']['trace'].pop(at+1)]:
            wrong=copy.deepcopy(events);change(wrong);self.assertFalse(audit(wrong)['passed'])

    def test_declared_replace_without_actual_conflict_is_valid(self):
        for event in self.events[1:]:
            event['parameters']['conflict_policy'] = 'replace'
        self.assertTrue(self.audit()['passed'])
        # A real overwrite still requires separate conflict/persistence proof.
        self.events[4]['outcome']['trace'].append(dict(event='overwrite_confirmed'))
        self.assertFalse(self.audit()['passed'])

    def test_invalid_or_inconsistent_policy_rejected(self):
        original = copy.deepcopy(self.events)
        for policy in ('ignore', '', None, True):
            self.events = copy.deepcopy(original)
            for event in self.events[1:]:
                event['parameters']['conflict_policy'] = policy
            self.assertFalse(self.audit()['passed'])
        self.events = copy.deepcopy(original)
        self.events[1]['parameters']['conflict_policy'] = 'replace'
        self.assertFalse(self.audit()['passed'])

    def test_changed_path_graph_revision_and_premature_reopen_rejected(self):
        changes = [
            lambda e: e[3]['checkpoint']['package_identity'].update(path=''),
            lambda e: e[2]['outcome']['output'].update(reopened=True),
            lambda e: e[2]['outcome']['output'].update(workflow_preserved=False),
            lambda e: e[2]['outcome']['trace'].append(dict(event='saved_package_closed')),
            lambda e: e[4]['outcome']['trace'][3].update(actual_path='/other.lgp'),
            lambda e: e[4]['outcome']['trace'][3]['graph'].update(nodes=[]),
            lambda e: e[4].update(action_revision='1'),
            lambda e: e[3].update(session_id='another'),
            lambda e: e[4]['outcome'].update(status='AMBIGUOUS'),
            lambda e: e[4]['outcome'].update(cleanup_complete=False),
            lambda e: e[4]['outcome']['trace'].append(dict(event='overwrite_confirmed')),
            lambda e: e[1]['parameters'].update(conflict_policy='replace'),
        ]
        original = copy.deepcopy(self.events)
        for i, change in enumerate(changes):
            with self.subTest(index=i):
                self.events = copy.deepcopy(original)
                change(self.events)
                self.assertFalse(self.audit()['passed'])

    def test_catalog_revision_is_required_not_guessed(self):
        self.revisions.pop('package.save_checkpoint')
        self.assertFalse(self.audit()['passed'])


if __name__ == '__main__':
    unittest.main()
