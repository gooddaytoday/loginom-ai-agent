"""Freeze all committed QA inputs; bind runtime imports to the exact candidate.

Does not launch the reader or prove its native result. No source checkout runtime
is copied; explicit overlay links point only into the verified immutable bundle.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from javascript_cli_candidate import file_sha256,hexadecimal,safe_payload_path,verify_cli_candidate


QA='packages/loginom-runtime/tools/loginom-acceptance/'
ENTRY='runtime/tools/loginom-acceptance/javascript-persistence-read-live.mjs'
RELEASE='packages/product/loginom-release.json'
RELEASE_FILE='product/loginom-release.json'
RUNTIME_LINKS=('client','src','executor','examples')


def repository(root,*arguments):
    result=subprocess.run(['git',*arguments],cwd=root,stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=False)
    if result.returncode!=0:raise ValueError('cli_reader_source_git_unconfirmed')
    return result.stdout


def freeze_cold_reader(source,candidate,pins,directory):
    source,candidate,directory=map(Path,(source,candidate,directory))
    if (any(not path.is_absolute() or path.resolve()!=path or not path.is_dir()
            for path in (source,candidate,directory)) or list(directory.iterdir())
            or directory.stat().st_uid!=os.getuid() or directory.stat().st_mode & 0o077
            or any(a.is_relative_to(b) or b.is_relative_to(a)
                for a,b in ((source,directory),(candidate,directory)))):
        raise ValueError('cli_reader_new_private_isolated_directory')
    if not verify_cli_candidate(candidate,pins)['passed']:raise ValueError('cli_reader_candidate_unverified')
    commit=pins['source_commit']
    if (repository(source,'rev-parse','--show-toplevel').decode().strip()!=str(source)
            or repository(source,'rev-parse','HEAD').decode().strip()!=commit
            or repository(source,'diff','HEAD','--',QA,RELEASE)):
        raise ValueError('cli_reader_exact_committed_qa_required')
    records=[]
    # Freeze the complete committed QA tree, including dynamic helper/data
    # dependencies. Never copy untracked caches, private evidence or a guessed
    # subset of the generic operator's transitive imports.
    entries=repository(source,'ls-tree','-r','-z',commit,'--',QA,RELEASE).split(b'\0')
    for entry in filter(None,entries):
        header,name=entry.split(b'\t',1)
        mode,kind,object_id=header.decode().split(' ')
        name=name.decode('utf-8')
        if (mode not in ('100644','100755') or kind!='blob' or not (name.startswith(QA) or name==RELEASE)
                or not safe_payload_path(name) or not hexadecimal(object_id,40)):
            raise ValueError('cli_reader_source_tree_shape')
        content=repository(source,'cat-file','blob',object_id)
        if hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()!=object_id:
            raise ValueError('cli_reader_git_blob_unconfirmed')
        path=RELEASE_FILE if name==RELEASE else 'runtime/tools/loginom-acceptance/'+name.removeprefix(QA)
        target=directory/path
        target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with os.fdopen(os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o400),'wb') as stream:
            stream.write(content)
        records.append(dict(path=path,source_path=name,git_blob=object_id,bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest()))
    if ENTRY not in {row['path'] for row in records}:raise ValueError('cli_reader_entry_missing')
    if RELEASE_FILE not in {row['path'] for row in records}:raise ValueError('cli_reader_release_missing')
    require_release_pins(directory/RELEASE_FILE,pins)
    links={}
    for name in RUNTIME_LINKS:
        target=candidate/'resources/loginom/runtime'/name
        if not target.is_dir() or target.resolve()!=target:raise ValueError('cli_reader_candidate_runtime_directory')
        path='runtime/'+name
        (directory/path).symlink_to(target,target_is_directory=True)
        links[path]=str(target)
    manifest=dict(format='javascript-cold-reader-freeze-v2',source_commit=commit,
        candidate=str(candidate),candidate_manifest_sha256=pins['manifest_sha256'],entry=ENTRY,
        files=sorted(records,key=lambda row:row['path']),links=links)
    path=directory/'reader-manifest.json'
    with os.fdopen(os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o400),'w') as stream:
        json.dump(manifest,stream,ensure_ascii=False,sort_keys=True,indent=2);stream.write('\n')
    descriptor=dict(root=str(directory),manifest_sha256=file_sha256(path))
    if not verify_cold_reader(descriptor,candidate,pins)['passed']:raise ValueError('cli_reader_frozen_inventory_unconfirmed')
    return descriptor


def verify_cold_reader(reader,candidate,pins):
    failures=[]
    entry=None
    count=0
    try:
        if (not isinstance(reader,dict) or set(reader)!={'root','manifest_sha256'}
                or not hexadecimal(reader.get('manifest_sha256'),64)):
            raise ValueError('cli_reader_external_pin_required')
        root,candidate=Path(reader['root']),Path(candidate)
        if (not root.is_absolute() or root.resolve()!=root or not root.is_dir()
                or root.stat().st_uid!=os.getuid() or root.stat().st_mode & 0o077
                or root.is_relative_to(candidate) or candidate.is_relative_to(root)):
            raise ValueError('cli_reader_canonical_private_root')
        if not verify_cli_candidate(candidate,pins)['passed']:raise ValueError('cli_reader_candidate_unverified')
        manifest_path=root/'reader-manifest.json'
        if manifest_path.is_symlink() or file_sha256(manifest_path)!=reader['manifest_sha256']:
            raise ValueError('cli_reader_manifest_pin')
        manifest=json.loads(manifest_path.read_text())
        if (set(manifest)!={'format','source_commit','candidate','candidate_manifest_sha256','entry','files','links'}
                or manifest['format']!='javascript-cold-reader-freeze-v2' or manifest['entry']!=ENTRY
                or manifest['source_commit']!=pins['source_commit'] or manifest['candidate']!=str(candidate)
                or manifest['candidate_manifest_sha256']!=pins['manifest_sha256']):
            raise ValueError('cli_reader_candidate_or_source_binding')
        links={'runtime/'+name:str(candidate/'resources/loginom/runtime'/name) for name in RUNTIME_LINKS}
        if manifest['links']!=links:raise ValueError('cli_reader_runtime_link_inventory')
        expected={}
        for row in manifest['files']:
            path=row['path']
            if (set(row)!={'path','source_path','git_blob','bytes','sha256'}
                    or not safe_payload_path(path)
                    or not (path.startswith('runtime/tools/loginom-acceptance/') or path==RELEASE_FILE)
                    or row['source_path']!=(RELEASE if path==RELEASE_FILE else QA+path.removeprefix('runtime/tools/loginom-acceptance/'))
                    or type(row['bytes']) is not int or row['bytes']<0 or not hexadecimal(row['sha256'],64)
                    or not hexadecimal(row['git_blob'],40) or path in expected):
                raise ValueError('cli_reader_qa_inventory')
            expected[path]=row
        if not expected or ENTRY not in expected:raise ValueError('cli_reader_entry_missing')
        if RELEASE_FILE not in expected:raise ValueError('cli_reader_release_missing')
        seen=set()
        pending=[root]
        while pending:
            directory=pending.pop()
            for path in directory.iterdir():
                name=path.relative_to(root).as_posix()
                stat=path.lstat()
                if name in links:
                    if (not path.is_symlink() or os.readlink(path)!=links[name]
                            or path.resolve()!=Path(links[name]) or not path.is_dir()):
                        raise ValueError('cli_reader_runtime_link_changed')
                    seen.add(name);continue
                if path.is_symlink():raise ValueError('cli_reader_unexpected_symlink')
                if path.is_dir():pending.append(path);continue
                if (not path.is_file() or stat.st_uid!=os.getuid() or stat.st_mode & 0o077
                        or stat.st_mode & 0o222):raise ValueError('cli_reader_private_readonly_file')
                if name=='reader-manifest.json':seen.add(name);continue
                row=expected.get(name)
                if row is None or stat.st_size!=row['bytes'] or file_sha256(path)!=row['sha256']:
                    raise ValueError('cli_reader_qa_payload_changed')
                content=path.read_bytes()
                if hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()!=row['git_blob']:
                    raise ValueError('cli_reader_git_blob_unconfirmed')
                seen.add(name)
        if seen!=set(expected)|set(links)|{'reader-manifest.json'}:raise ValueError('cli_reader_payload_inventory')
        entry=str(root/ENTRY)
        require_release_pins(root/RELEASE_FILE,pins)
        count=len(expected)-1
    except (OSError,ValueError,KeyError,TypeError,AttributeError,RuntimeError,UnicodeError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'cli_reader_missing_or_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),entry=entry,qa_files_verified=count,
        scope='complete_committed_qa_tree_and_exact_candidate_runtime_overlay',reader_execution_verified=False,
        native_journal_authenticated=False,cold_persistence_verified=False,cli_acceptance_verified=False)


def require_release_pins(path,pins):
    release=json.loads(path.read_text())
    if (release.get('protocol')!=1 or release.get('target')!='linux-x64'
            or release.get('nodeVersion')!=pins['node_version']
            or release.get('nodeSha256')!=pins['node_sha256']
            or release.get('browserSha256')!=pins['browser_sha256']):
        raise ValueError('cli_reader_release_candidate_pins')
