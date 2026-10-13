import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest


def pin(path):
    return {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


class AdmissionTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name).resolve()
        self.cwd = self.root/'business'; self.cwd.mkdir()
        self.profile = self.root/'profile'; self.profile.mkdir()
        (self.profile/'config.json').write_text('{}')
        (self.profile/'cli-profile.json').write_text(json.dumps({'format':'loginom-cli','version':1,'channel':'dev'}))
        (self.root/'oauth').mkdir()
        (self.cwd/'task.md').write_text('Enable prefixes. Joined_ label JOIN_READY. На первом этапе и при добавлении третьего входа включите префиксы: имя Joined_, метка «Присоединённое: ».')
        (self.cwd/'input.csv').write_text('id\n1\n')
        self.candidate = self.root/'candidate'; self.candidate.mkdir()
        files = []
        for relative in ('bin/loginom-ai-agent-cli','resources/loginom/host/node-host.mjs','resources/loginom/resource-manifest.json','resources/loginom/bin/node'):
            path = self.candidate/relative; path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text('#!'+sys.executable+'\nimport json,os,sys\nfrom pathlib import Path\np=Path('+repr(str(self.root/'calls'))+')\np.write_text(p.read_text()+"call\\n" if p.exists() else "call\\n")\nPath('+repr(str(self.root/'transmitted'))+').write_text(json.dumps({"args":sys.argv,"env":dict(os.environ),"files":os.listdir(".")}))\n')
            path.chmod(0o755); files.append({'path':relative,'sha256':pin(path)['sha256'],'mode':0o755})
        (self.candidate/'cli-manifest.json').write_text(json.dumps({'format':'loginom-cli-artifact-v1','metadata':{'version':'test','channel':'dev','platform':'linux','arch':'x64','sourceCommit':'a'*40,'sourceTreeSha256':'b'*64,'sourceDirty':False,'dependencies':{}},'files':files}))
        self.spec = dict(issue='LAB-72',case='LAB-72-enabled-prefixes',task=pin(self.cwd/'task.md'),inputs=[pin(self.cwd/'input.csv')],cwd=str(self.cwd),profile=str(self.profile),shared_auth_dir=str(self.root/'oauth'),profile_config=pin(self.profile/'config.json'),model='openai/gpt-6-luna',variant='high',candidate={'path':str(self.candidate),'manifest_sha256':pin(self.candidate/'cli-manifest.json')['sha256'],'sha':'a'*40,'platform':'linux','arch':'x64','channel':'dev'})
        self.contract = dict(case=self.spec['case'],task_sha256=self.spec['task']['sha256'],review_reference='comment-review',required_text=['Enable prefixes.','Joined_','JOIN_READY'],required_fixes=['canonical-array'],prefixes=dict(enabled=True,joined='Joined_',label='Присоединённое: ',enabled_text='Enable prefixes.'))
        (self.root/'proof').write_text('PRIVATE ORACLE: expected=42')
        self.evidence = dict(binding=dict(self.spec),reviewer='reviewer',resource_reference='own resource probe',checked_at=time.time(),resources='PASS',cleanup='PASS',unknown_operation_replay=False,fixes={'canonical-array':dict(candidate_sha='a'*40,explanation='array keys preserved',verdict='PASS',reproducer='original counterexample',proof=pin(self.root/'proof'))})
        self.write()
    def write(self):
        (self.root/'requirements').write_text(json.dumps(self.contract)); self.spec['requirements']=pin(self.root/'requirements')
        (self.root/'evidence').write_text(json.dumps(self.evidence)); self.spec['evidence']=pin(self.root/'evidence')
        (self.root/'manifest').write_text(json.dumps(self.spec))
    def tearDown(self): self.tmp.cleanup()
    def run_cli(self):
        return subprocess.run([sys.executable,str(Path(__file__).with_name('admit.py')),'--manifest',str(self.root/'manifest'),'--receipt',str(self.root/'receipt')],env=dict(os.environ,MULTICA_TOKEN='PRIVATE_TOKEN'),capture_output=True,text=True)
    def rejected(self):
        result=self.run_cli(); self.assertNotEqual(result.returncode,0,result.stdout); self.assertFalse((self.root/'calls').exists())
    def test_correct_launch_once_without_private_context(self):
        result=self.run_cli(); self.assertEqual(result.returncode,0,result.stderr)
        transmitted=(self.root/'transmitted').read_text()
        for private in ('PRIVATE ORACLE','PRIVATE_TOKEN',str(self.root/'evidence'),str(self.root/'proof')): self.assertNotIn(private,transmitted)
        self.assertEqual(json.loads(transmitted)['env']['LOGINOM_AI_AGENT_SHARED_AUTH_DIR'],str(self.root/'oauth'))
        self.assertEqual(json.loads(transmitted)['env']['PWD'],str(self.cwd))
        args=json.loads(transmitted)['args']; self.assertEqual(args[args.index('--dir')+1],str(self.cwd))
        self.assertNotEqual(self.run_cli().returncode,0); self.assertEqual((self.root/'calls').read_text(),'call\n')
    def test_busy_profile_never_starts(self):
        (self.profile/'.writer').mkdir(); self.rejected()
    def test_missing_shared_oauth_never_starts(self):
        self.spec['shared_auth_dir']=str(self.root/'absent'); self.write(); self.rejected()
    def test_wrong_required_label(self):
        self.contract['prefixes']['label']='Wrong'; self.write(); self.rejected()
    def test_missing_first_stage_even_with_new_approved_hash(self):
        (self.cwd/'task.md').write_text('Enable prefixes. Joined_ label Присоединённое: JOIN_READY only on third input')
        self.spec['task']=pin(self.cwd/'task.md'); self.contract['task_sha256']=self.spec['task']['sha256']; self.evidence['binding']['task']=self.spec['task']; self.write(); self.rejected()
    def test_wrong_prefixes(self):
        self.contract['prefixes']['enabled']=False; self.write(); self.rejected()
    def test_changed_task(self):
        (self.cwd/'task.md').write_text('Disable prefixes'); self.rejected()
    def test_changed_input(self):
        (self.cwd/'input.csv').write_text('changed'); self.rejected()
    def test_wrong_candidate(self):
        self.spec['candidate']['sha']='c'*40; self.write(); self.rejected()
    def test_missing_fix(self):
        self.evidence['fixes']={}; self.write(); self.rejected()
    def test_cleanup_not_confirmed(self):
        self.evidence['cleanup']='UNKNOWN'; self.write(); self.rejected()
    def test_stale_resource_admission(self):
        self.evidence['checked_at']-=301; self.write(); self.rejected()
    def test_unknown_replay(self):
        self.evidence['unknown_operation_replay']=True; self.write(); self.rejected()
    def test_private_file_in_business_directory(self):
        (self.cwd/'oracle').write_text('expected 42'); self.rejected()
    def test_changed_profile(self):
        (self.profile/'config.json').write_text('changed'); self.rejected()
    def test_model_change(self):
        self.spec['model']='different'; self.write(); self.rejected()
    def test_payload_damage(self):
        (self.candidate/'resources/loginom/bin/node').write_text('damage'); self.rejected()
    def test_unexplained_nonapplicability(self):
        self.evidence['fixes']['canonical-array'].update(verdict='NOT_APPLICABLE',explanation=''); self.write(); self.rejected()

if __name__ == '__main__': unittest.main()
