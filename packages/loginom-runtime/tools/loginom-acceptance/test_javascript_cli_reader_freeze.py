"""Physical Git/filesystem freezes and actual Node module resolution only."""
import copy
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from javascript_cli_candidate import file_sha256
from javascript_cli_reader_freeze import ENTRY,QA,freeze_cold_reader,verify_cold_reader


class JavascriptReaderFreezeTests(unittest.TestCase):
    def setUp(self):
        from test_javascript_cli_candidate import JavascriptCandidateTests
        self.fixture=JavascriptCandidateTests();self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.temporary=tempfile.TemporaryDirectory(prefix='loginom-reader-freeze-')
        self.addCleanup(self.temporary.cleanup)
        self.root=Path(self.temporary.name)
        self.source=self.root/'source';self.source.mkdir(mode=0o700)
        self.output=self.root/'reader';self.output.mkdir(mode=0o700)
        self.qa=self.source/QA;self.qa.mkdir(parents=True)
        (self.qa/'javascript-persistence-read-live.mjs').write_text(
            "import {fixtureIdentity} from './helper.mjs';\n"
            "if(process.argv.includes('--help'))console.log(JSON.stringify(await fixtureIdentity()));\n")
        (self.qa/'helper.mjs').write_text(
            "import {version} from '../../client/lib/frozen-reader-fixture.mjs';\n"
            "import {readFile} from 'node:fs/promises';\n"
            "export async function fixtureIdentity(){const {dynamic}=await import('./nested/dynamic.mjs');"
            "return {version,dynamic,data:JSON.parse(await readFile(new URL('./data.json',import.meta.url),'utf8'))};}\n")
        (self.qa/'nested').mkdir()
        (self.qa/'nested/dynamic.mjs').write_text("export const dynamic='frozen dynamic helper';\n")
        (self.qa/'data.json').write_text('{"fixture":"frozen data"}\n')
        checkout=self.source/'packages/loginom-runtime/client/lib/frozen-reader-fixture.mjs'
        checkout.parent.mkdir(parents=True);checkout.write_text("export const version='checkout';\n")
        self.git('init','--quiet')
        self.git('add','packages')
        self.git('-c','user.name=QA fixture','-c','user.email=qa@example.invalid','-c','commit.gpgSign=false',
            'commit','--quiet','-m','fixture: cold reader input')
        self.commit=self.git('rev-parse','HEAD').strip()
        self.fixture.metadata['sourceCommit']=self.commit
        self.fixture.expected['source_commit']=self.commit
        name='resources/loginom/runtime/client/lib/frozen-reader-fixture.mjs'
        content=b"export const version='candidate';\n"
        path=self.fixture.root/name;path.write_bytes(content);path.chmod(0o640)
        self.fixture.records.append(dict(path=name,mode=0o640,sha256=file_sha256(path)))
        self.fixture.resource['files'].append(dict(path=name.removeprefix('resources/loginom/'),sha256=file_sha256(path)))
        for directory in ('executor','examples'):(self.fixture.root/'resources/loginom/runtime'/directory).mkdir()
        self.fixture.repin()
        self.assertTrue(self.fixture.proof()['passed'])

    def git(self,*arguments):
        result=subprocess.run(['git',*arguments],cwd=self.source,text=True,
            stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
        return result.stdout

    def freeze(self):return freeze_cold_reader(self.source,self.fixture.root,self.fixture.expected,self.output)

    def proof(self,reader):return verify_cold_reader(reader,self.fixture.root,self.fixture.expected)

    def rewrite(self,path,content):
        path.chmod(0o600);path.write_bytes(content);path.chmod(0o400)

    def test_all_committed_qa_data_and_helpers_frozen_without_checkout_runtime(self):
        (self.qa/'untracked-private.json').write_text('untracked fixture data')
        reader=self.freeze();proof=self.proof(reader)
        self.assertTrue(proof['passed'],proof)
        self.assertEqual(proof['qa_files_verified'],4)
        self.assertEqual(proof['entry'],str(self.output/ENTRY))
        manifest=json.loads((self.output/'reader-manifest.json').read_text())
        self.assertEqual(manifest['source_commit'],self.commit)
        self.assertEqual(len(manifest['files']),4)
        self.assertNotIn('untracked-private',json.dumps(manifest))
        self.assertEqual(os.readlink(self.output/'runtime/client'),
            str(self.fixture.root/'resources/loginom/runtime/client'))
        self.assertFalse((self.output/'runtime/tools/loginom-acceptance/untracked-private.json').exists())
        for row in manifest['files']:self.assertEqual((self.output/row['path']).stat().st_mode & 0o777,0o400)
        for key in ('reader_execution_verified','native_journal_authenticated','cold_persistence_verified',
                'cli_acceptance_verified'):self.assertIs(proof[key],False)

    @unittest.skipUnless(os.environ.get('LOGINOM_NODE'),'actual pinned Node loader required')
    def test_actual_static_dynamic_and_data_resolution_uses_candidate_overlay(self):
        reader=self.freeze()
        result=subprocess.run([os.environ['LOGINOM_NODE'],self.proof(reader)['entry'],'--help'],
            cwd=self.output,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            check=False,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr.decode())
        self.assertEqual(json.loads(result.stdout),dict(version='candidate',dynamic='frozen dynamic helper',
            data=dict(fixture='frozen data')))
        self.assertTrue(self.proof(reader)['passed'])

    def test_qa_dirty_or_wrong_commit_refuses_before_freeze(self):
        path=self.qa/'helper.mjs';original=path.read_bytes();path.write_bytes(original+b'// uncommitted\n')
        with self.assertRaisesRegex(ValueError,'exact_committed_qa'):self.freeze()
        self.assertEqual(list(self.output.iterdir()),[])
        path.write_bytes(original)
        self.fixture.expected['source_commit']='a'*40
        self.fixture.metadata['sourceCommit']='a'*40;self.fixture.repin()
        with self.assertRaisesRegex(ValueError,'exact_committed_qa'):self.freeze()

    def test_git_symlink_cannot_enter_frozen_qa_payload(self):
        alias=self.qa/'alias.mjs';alias.symlink_to('helper.mjs')
        self.git('add',str(alias))
        self.git('-c','user.name=QA fixture','-c','user.email=qa@example.invalid','-c','commit.gpgSign=false',
            'commit','--quiet','-m','fixture: symlink negative')
        self.commit=self.git('rev-parse','HEAD').strip()
        self.fixture.expected['source_commit']=self.commit
        self.fixture.metadata['sourceCommit']=self.commit;self.fixture.repin()
        with self.assertRaisesRegex(ValueError,'source_tree_shape'):self.freeze()

    def test_existing_or_overlapping_output_never_overwritten(self):
        sentinel=self.output/'sentinel';sentinel.write_text('existing')
        with self.assertRaisesRegex(ValueError,'new_private_isolated_directory'):self.freeze()
        self.assertEqual(sentinel.read_text(),'existing')
        inside=self.source/'new-reader';inside.mkdir(mode=0o700)
        with self.assertRaisesRegex(ValueError,'new_private_isolated_directory'):
            freeze_cold_reader(self.source,self.fixture.root,self.fixture.expected,inside)

    def test_missing_external_pin_or_manifest_drift_refuses(self):
        reader=self.freeze()
        for value in ({},{**reader,'manifest_sha256':'0'*64},[reader],{**reader,'extra':True}):
            with self.subTest(value_type=type(value).__name__):self.assertFalse(self.proof(value)['passed'])
        path=self.output/'reader-manifest.json';self.rewrite(path,path.read_bytes()+b' ')
        self.assertIn('cli_reader_manifest_pin',self.proof(reader)['failures'])

    def test_static_dynamic_data_change_and_extras_all_refuse(self):
        reader=self.freeze()
        for name in ('helper.mjs','nested/dynamic.mjs','data.json'):
            with self.subTest(name=name):
                path=self.output/'runtime/tools/loginom-acceptance'/name
                original=path.read_bytes();self.rewrite(path,original+b' ')
                self.assertIn('cli_reader_qa_payload_changed',self.proof(reader)['failures'])
                self.rewrite(path,original)
        extra=self.output/'runtime/tools/loginom-acceptance/extra.mjs';extra.write_text('extra');extra.chmod(0o400)
        self.assertFalse(self.proof(reader)['passed'])
        extra.unlink();self.assertTrue(self.proof(reader)['passed'])

    def test_checkout_or_wrong_runtime_link_and_file_alias_refuse(self):
        reader=self.freeze()
        client=self.output/'runtime/client';original=os.readlink(client)
        client.unlink();client.symlink_to(self.source/'packages/loginom-runtime/client',target_is_directory=True)
        self.assertIn('cli_reader_runtime_link_changed',self.proof(reader)['failures'])
        client.unlink();client.symlink_to(original,target_is_directory=True)
        path=self.output/'runtime/tools/loginom-acceptance/helper.mjs'
        original_bytes=path.read_bytes();path.unlink();path.symlink_to(self.qa/'helper.mjs')
        self.assertIn('cli_reader_unexpected_symlink',self.proof(reader)['failures'])
        path.unlink();path.write_bytes(original_bytes);path.chmod(0o400)
        self.assertTrue(self.proof(reader)['passed'])

    def test_private_readonly_files_and_candidate_integrity_required(self):
        reader=self.freeze()
        path=self.output/ENTRY;path.chmod(0o600)
        self.assertIn('cli_reader_private_readonly_file',self.proof(reader)['failures'])
        path.chmod(0o400)
        candidate=self.fixture.root/'resources/loginom/runtime/client/lib/frozen-reader-fixture.mjs'
        candidate.write_text("export const version='changed';\n")
        self.assertIn('cli_reader_candidate_unverified',self.proof(reader)['failures'])

    def test_coherently_rewritten_inventory_still_requires_external_manifest_pin(self):
        reader=self.freeze()
        path=self.output/'reader-manifest.json';manifest=json.loads(path.read_text())
        for case in ('missing_helper','wrong_runtime','wrong_commit','duplicate','wrong_source_path'):
            value=copy.deepcopy(manifest)
            if case=='missing_helper':value['files']=value['files'][:1]
            if case=='wrong_runtime':value['links']['runtime/client']=str(self.source/'packages/loginom-runtime/client')
            if case=='wrong_commit':value['source_commit']='b'*40
            if case=='duplicate':value['files'].append(copy.deepcopy(value['files'][0]))
            if case=='wrong_source_path':value['files'][0]['source_path']='elsewhere/helper.mjs'
            self.rewrite(path,(json.dumps(value)+'\n').encode())
            with self.subTest(case=case):self.assertIn('cli_reader_manifest_pin',self.proof(reader)['failures'])
