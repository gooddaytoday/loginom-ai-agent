"""Integrity tests use physical files and manifests, never executable stand-ins."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from javascript_cli_candidate import verify_cli_candidate


def digest(content):
    return hashlib.sha256(content).hexdigest()


class JavascriptCandidateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()/'candidate'
        self.root.mkdir()
        self.payload = {
            'bin/loginom-ai-agent-cli':b'non-executable cli fixture',
            'resources/loginom/host/node-host.mjs':b'host fixture',
            'resources/loginom/bin/node':b'non-executable node fixture',
            'resources/loginom/browsers/chrome':b'non-executable browser fixture',
            'resources/loginom/client/lib/javascript-knowledge.mjs':b'knowledge module fixture',
        }
        for name,content in self.payload.items():
            path = self.root/name
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes(content)
            path.chmod(0o640)
        self.resource = dict(protocol=1,node='bin/node',browser='browsers/chrome',nodeVersion='24.19.0',files=[
            dict(path=name.removeprefix('resources/loginom/'),sha256=digest(content))
            for name,content in self.payload.items() if name.startswith('resources/loginom/')])
        self.metadata = dict(version='fixture-1',channel='test',platform='linux',arch='x64',
            sourceCommit='a'*40,sourceTreeSha256='b'*64,sourceDirty=True,dependencies={'fixture':'1'})
        self.expected = dict(source_commit='a'*40,source_tree_sha256='b'*64,version='fixture-1',node_version='24.19.0',
            node_sha256=digest(self.payload['resources/loginom/bin/node']),
            browser_sha256=digest(self.payload['resources/loginom/browsers/chrome']),
            javascript_knowledge_source_sha256=digest(self.payload['resources/loginom/client/lib/javascript-knowledge.mjs']))
        self.records = [dict(path=name,sha256=digest(content),mode=0o640) for name,content in self.payload.items()]
        self.repin()

    def repin(self):
        resource_bytes = (json.dumps(self.resource,sort_keys=True)+'\n').encode()
        resource_path = self.root/'resources/loginom/resource-manifest.json'
        resource_path.write_bytes(resource_bytes)
        resource_path.chmod(0o640)
        records = copy.deepcopy(self.records)+[dict(path='resources/loginom/resource-manifest.json',sha256=digest(resource_bytes),mode=0o640)]
        self.manifest = dict(format='loginom-cli-artifact-v1',metadata=self.metadata,files=records)
        self.pin_manifest()

    def pin_manifest(self):
        content = (json.dumps(self.manifest,sort_keys=True)+'\n').encode()
        (self.root/'cli-manifest.json').write_bytes(content)
        self.expected['manifest_sha256'] = digest(content)

    def proof(self):
        return verify_cli_candidate(self.root,self.expected)

    def assert_refused(self, failure=None):
        proof = self.proof()
        self.assertFalse(proof['passed'],proof)
        if failure:self.assertIn(failure,proof['failures'])

    def test_full_inventory_dirty_source_allowed_without_execution_claim(self):
        proof = self.proof()
        self.assertTrue(proof['passed'],proof)
        self.assertEqual(proof['files_verified'],6)
        for name in ('candidate_execution_verified','model_delivery_verified','cli_acceptance_verified'):
            self.assertIs(proof[name],False)

    def test_changed_missing_extra_files_and_modes_refuse(self):
        path = self.root/'resources/loginom/host/node-host.mjs'
        content = path.read_bytes()
        for case in ('changed','missing','extra','mode'):
            with self.subTest(case=case):
                if case == 'changed':path.write_bytes(b'changed')
                if case == 'missing':path.unlink()
                if case == 'extra':(self.root/'extra').write_bytes(b'extra')
                if case == 'mode':path.chmod(0o600)
                self.assert_refused('cli_candidate_payload_mismatch')
                path.write_bytes(content)
                path.chmod(0o640)
                (self.root/'extra').unlink(missing_ok=True)

    def test_manifest_bytes_and_external_pin_shape_refuse(self):
        manifest_path = self.root/'cli-manifest.json'
        content = manifest_path.read_bytes()
        manifest_path.write_bytes(content+b' ')
        self.assert_refused('cli_candidate_manifest_pin')
        manifest_path.write_bytes(content)
        for pin in ('source_commit','manifest_sha256','source_tree_sha256','node_sha256','browser_sha256','javascript_knowledge_source_sha256'):
            previous = self.expected[pin]
            self.expected[pin] = 'invalid'
            with self.subTest(pin=pin):self.assert_refused('cli_candidate_external_pin_shape')
            self.expected[pin] = previous

    def test_coherent_manifest_metadata_shape_target_and_source_refuse(self):
        original = copy.deepcopy(self.manifest)
        for key,value in [('platform','darwin'),('arch','arm64'),('sourceCommit','c'*40),('sourceTreeSha256','d'*64),
                ('version','wrong'),('sourceDirty',1),('dependencies',{'dependency':False}),('extra','unexpected')]:
            self.manifest = copy.deepcopy(original)
            self.manifest['metadata'][key] = value
            self.pin_manifest()
            with self.subTest(key=key):self.assert_refused('cli_candidate_source_target_pin')
        self.manifest = original
        self.manifest['extra'] = True
        self.pin_manifest()
        self.assert_refused('cli_candidate_source_target_pin')

    def test_coherent_duplicate_or_unsafe_inventory_refuse(self):
        original = copy.deepcopy(self.manifest)
        for name in ('duplicate','../outside','/absolute','a//b','a/./b','a\\b','cli-manifest.json'):
            self.manifest = copy.deepcopy(original)
            if name == 'duplicate':self.manifest['files'].append(copy.deepcopy(self.manifest['files'][0]))
            else:self.manifest['files'][0]['path'] = name
            self.pin_manifest()
            with self.subTest(name=name):self.assert_refused('cli_candidate_inventory_shape')

    def test_required_payload_and_independent_runtime_knowledge_pins(self):
        path = self.root/'resources/loginom/client/lib/javascript-knowledge.mjs'
        content = path.read_bytes()
        record = self.records.pop()
        resource_record = self.resource['files'].pop()
        path.unlink()
        self.repin()
        self.assert_refused('cli_candidate_required_payload')
        path.write_bytes(content)
        path.chmod(0o640)
        self.records.append(record)
        self.resource['files'].append(resource_record)
        self.repin()
        for pin in ('node_sha256','browser_sha256','javascript_knowledge_source_sha256'):
            previous = self.expected[pin]
            self.expected[pin] = '0'*64
            with self.subTest(pin=pin):self.assert_refused('cli_candidate_runtime_or_knowledge_pin:'+pin)
            self.expected[pin] = previous

    def test_resource_shape_binding_directory_and_executable_presence_refuse(self):
        original = copy.deepcopy(self.resource)
        cases = ('protocol_bool','node_version','directory_false','directory_integer','directory_true_file','digest','link','duplicate','missing_browser')
        for case in cases:
            self.resource = copy.deepcopy(original)
            if case == 'protocol_bool':self.resource['protocol'] = True
            if case == 'node_version':self.resource['nodeVersion'] = 'wrong'
            if case == 'directory_false':self.resource['files'][0]['directory'] = False
            if case == 'directory_integer':self.resource['files'][0]['directory'] = 1
            if case == 'directory_true_file':self.resource['files'][0]['directory'] = True
            if case == 'digest':self.resource['files'][0]['sha256'] = '0'*64
            if case == 'link':self.resource['files'][0]['link'] = 'invented'
            if case == 'duplicate':self.resource['files'].append(copy.deepcopy(self.resource['files'][0]))
            if case == 'missing_browser':self.resource['files'] = [r for r in self.resource['files'] if r['path'] != self.resource['browser']]
            self.repin()
            with self.subTest(case=case):self.assert_refused()

    def test_contained_file_and_directory_symlinks_pass_with_exact_link_inventory(self):
        links = [('resources/loginom/client/linked.mjs','lib/javascript-knowledge.mjs',False),
            ('resources/loginom/client/linked-directory','lib',True)]
        for name,target,directory in links:
            path = self.root/name
            path.symlink_to(target,target_is_directory=directory)
            value = digest(target.encode()) if directory else digest(path.read_bytes())
            self.records.append(dict(path=name,sha256=value,mode=0o777,link=target))
            self.resource['files'].append(dict(path=name.removeprefix('resources/loginom/'),sha256=value,link=target,
                **({'directory':True} if directory else {})))
        self.repin()
        self.assertTrue(self.proof()['passed'],self.proof())
        (self.root/links[0][0]).unlink()
        (self.root/links[0][0]).symlink_to('linked-directory/javascript-knowledge.mjs')
        self.assert_refused('cli_candidate_payload_mismatch')

    def test_resource_link_to_outer_bundle_and_external_link_refuse(self):
        path = self.root/'resources/loginom/client/link'
        path.symlink_to('../../../bin/loginom-ai-agent-cli')
        value = digest(path.read_bytes())
        self.records.append(dict(path='resources/loginom/client/link',sha256=value,mode=0o777,link=os.readlink(path)))
        self.resource['files'].append(dict(path='client/link',sha256=value,link=os.readlink(path)))
        self.repin()
        self.assert_refused('cli_candidate_resource_path_escape')
        path.unlink()
        external = self.root.parent/'outside'
        external.write_bytes(b'outside')
        path.symlink_to(external)
        self.assert_refused('cli_candidate_path_escape')

    def test_manifest_symlink_broken_payload_and_symlink_root_refuse(self):
        path = self.root/'cli-manifest.json'
        content = path.read_bytes()
        path.unlink()
        external = self.root.parent/'manifest-copy'
        external.write_bytes(content)
        path.symlink_to(external)
        self.assert_refused('cli_candidate_manifest_pin')
        path.unlink()
        path.write_bytes(content)
        link = self.root/'broken'
        link.symlink_to('nonexistent')
        self.assert_refused('cli_candidate_missing_or_malformed')
        link.unlink()
        root_link = self.root.parent/'root-link'
        root_link.symlink_to(self.root,target_is_directory=True)
        proof = verify_cli_candidate(root_link,self.expected)
        self.assertIn('cli_candidate_absolute_root',proof['failures'])


if __name__ == '__main__':
    unittest.main()
