"""Registry regressions; run with python3 -m unittest discover -s docs/node-development/tools."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import validate


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        repo=Path(self.temp.name)
        docs=repo/'docs'/'node-development'
        docs.mkdir(parents=True)
        # Read-only links retain real source files and plans; only the two
        # registry artifacts are private copies for negative cases.
        for parent,target in [(validate.REPO,repo),(validate.REPO/'docs',repo/'docs'),(validate.ROOT,docs)]:
            for child in parent.iterdir():
                destination=target/child.name
                if destination.exists():continue
                if child.name in ['registry.json','inventory.md'] and parent==validate.ROOT:
                    destination.write_bytes(child.read_bytes())
                else:destination.symlink_to(child,target_is_directory=child.is_dir())
        self.docs=docs
        self.data=json.loads((docs/'registry.json').read_text())
        self.root_patch=patch.object(validate,'ROOT',docs)
        self.repo_patch=patch.object(validate,'REPO',repo)
        self.root_patch.start();self.addCleanup(self.root_patch.stop)
        self.repo_patch.start();self.addCleanup(self.repo_patch.stop)

    def check(self,render=False):
        (self.docs/'registry.json').write_text(json.dumps(self.data,ensure_ascii=False))
        return validate.check(render_view=render,registry_only=True)

    def test_current_registry_and_grouped_dispatch_types(self):
        result=self.check()
        self.assertEqual(result['errors'],[])
        self.assertEqual(result['handler_types'],32)
        self.assertEqual(result['counts'],{'implemented':32,'backlog':43,'conditional_reserve':3})
        types={n['handler']['type'] for n in self.data['nodes'] if n['handler']}
        self.assertTrue({'transform.join_data','integration.rest_request'}<=types)

    def test_dropped_handler_is_rejected(self):
        node=next(n for n in self.data['nodes'] if n['slug']=='exports-excel')
        node['handler']=None;node['queue_class']='backlog'
        self.assertTrue(any('runtime handlers differ' in e and 'exports.excel' in e for e in self.check()['errors']))

    def test_stale_modes_are_rejected(self):
        node=next(n for n in self.data['nodes'] if n['slug']=='join')
        node['handler']['modes']=['inner','left']
        self.assertIn('runtime modes differ: transform.join_data',self.check()['errors'])

    def test_current_source_hash_is_checked(self):
        key='v039-node-contracts'
        self.data['evidence_catalog'][key]['sha256']='0'*64
        self.assertIn('evidence hash '+key,self.check()['errors'])

    def test_unknown_acceptance_source_is_rejected(self):
        self.data['nodes'][0]['acceptance']['evidence']=['missing-report']
        self.assertIn('unknown acceptance evidence missing-report',self.check()['errors'])

    def test_missing_snapshot_source_is_rejected(self):
        self.data['source_snapshot']['evidence'].append('missing-source')
        self.assertIn('unknown snapshot evidence missing-source',self.check()['errors'])

    def test_render_is_reproducible_and_detects_staleness(self):
        self.data['nodes'][0]['limitations'].append('Адресное ограничение.')
        self.assertIn('inventory is stale; run --render',self.check()['errors'])
        self.assertEqual(self.check(render=True)['errors'],[])
        first=(self.docs/'inventory.md').read_bytes()
        self.assertEqual(self.check(render=True)['errors'],[])
        self.assertEqual(first,(self.docs/'inventory.md').read_bytes())

    def test_unknown_registration_syntax_fails_closed(self):
        with self.assertRaisesRegex(ValueError,'unrecognized node definition'):
            validate.registered_modes("const definitions = [\n  ['x', 'X', 'x', 0, 1, false, getModes()],\n];")


if __name__=='__main__':unittest.main()
