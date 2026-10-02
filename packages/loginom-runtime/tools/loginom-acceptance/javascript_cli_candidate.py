"""Independent Linux standalone bundle integrity check against operator pins.

Matches cli-manifest.ts inventory semantics, including contained symlinks.
Does not execute a candidate or prove its use by a CLI/model/browser process.
"""
import hashlib
import json
import os
from pathlib import Path
import stat


def file_sha256(path):
    hash_value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):
            hash_value.update(chunk)
    return hash_value.hexdigest()


def safe_payload_path(value):
    return (isinstance(value,str) and bool(value) and not value.startswith('/') and '\\' not in value
        and all(part not in ('','.','..') for part in value.split('/')) and value != 'cli-manifest.json')


def hexadecimal(value, length):
    return isinstance(value,str) and len(value) == length and all(c in '0123456789abcdef' for c in value)


def verify_cli_candidate(root, expected):
    failures = []
    file_count = 0
    try:
        if (not hexadecimal(expected.get('source_commit'),40)
                or any(not hexadecimal(expected.get(pin),64) for pin in ('manifest_sha256','source_tree_sha256',
                    'node_sha256','browser_sha256','javascript_knowledge_source_sha256'))
                or any(not isinstance(expected.get(pin),str) or not expected[pin] for pin in ('version','node_version'))):
            raise ValueError('cli_candidate_external_pin_shape')
        root = Path(root)
        if not root.is_absolute() or root.resolve() != root or not root.is_dir():
            raise ValueError('cli_candidate_absolute_root')
        manifest_path = root/'cli-manifest.json'
        if manifest_path.is_symlink() or file_sha256(manifest_path) != expected['manifest_sha256']:
            raise ValueError('cli_candidate_manifest_pin')
        manifest = json.loads(manifest_path.read_text())
        metadata = manifest['metadata']
        if (set(manifest) != {'format','metadata','files'}
                or set(metadata) != {'version','channel','platform','arch','sourceCommit','sourceTreeSha256','sourceDirty','dependencies'}
                or not isinstance(metadata['channel'],str) or not isinstance(metadata['dependencies'],dict)
                or any(not isinstance(k,str) or not isinstance(v,str) for k,v in metadata['dependencies'].items())
                or manifest.get('format') != 'loginom-cli-artifact-v1' or metadata.get('platform') != 'linux'
                or metadata.get('arch') != 'x64' or metadata.get('sourceCommit') != expected['source_commit']
                or metadata.get('sourceTreeSha256') != expected['source_tree_sha256']
                or metadata.get('version') != expected['version'] or type(metadata.get('sourceDirty')) is not bool):
            raise ValueError('cli_candidate_source_target_pin')
        records = manifest['files']
        if (not isinstance(records,list) or not records or len({r['path'] for r in records}) != len(records)
                or any(not safe_payload_path(r['path']) or type(r.get('mode')) is not int or not 0 <= r['mode'] <= 0o7777
                    or not hexadecimal(r.get('sha256'),64) for r in records)):
            raise ValueError('cli_candidate_inventory_shape')
        indexed = {r['path']:r for r in records}
        actual = {}
        pending = [root]
        while pending:
            directory = pending.pop()
            for path in directory.iterdir():
                name = path.relative_to(root).as_posix()
                if name == 'cli-manifest.json':
                    continue
                info = path.lstat()
                if stat.S_ISDIR(info.st_mode):
                    pending.append(path)
                    continue
                if not (stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode)):
                    raise ValueError('cli_candidate_file_type')
                resolved = path.resolve(strict=True)
                if resolved == root or not resolved.is_relative_to(root):
                    raise ValueError('cli_candidate_path_escape')
                link = os.readlink(path) if stat.S_ISLNK(info.st_mode) else None
                digest = hashlib.sha256(link.encode('utf-8')).hexdigest() if link is not None and resolved.is_dir() else file_sha256(path)
                actual[name] = dict(path=name,mode=info.st_mode & 0o7777,sha256=digest,**({'link':link} if link is not None else {}))
        if indexed != actual:
            raise ValueError('cli_candidate_payload_mismatch')
        file_count = len(actual)
        required = ('bin/loginom-ai-agent-cli','resources/loginom/host/node-host.mjs',
            'resources/loginom/resource-manifest.json','resources/loginom/bin/node',
            'resources/loginom/runtime/src/managed-entry.mjs',
            'resources/loginom/runtime/client/lib/javascript-knowledge.mjs')
        if any(name not in actual for name in required):
            raise ValueError('cli_candidate_required_payload')
        resource = json.loads((root/'resources/loginom/resource-manifest.json').read_text())
        if (type(resource.get('protocol')) is not int or resource['protocol'] != 1 or resource.get('node') != 'bin/node'
                or resource.get('nodeVersion') != expected['node_version']
                or not safe_payload_path(resource.get('browser')) or not isinstance(resource.get('files'),list) or not resource['files']):
            raise ValueError('cli_candidate_resource_shape')
        seen = set()
        for record in resource['files']:
            name = record['path']
            outer = actual.get('resources/loginom/'+name)
            if (not safe_payload_path(name) or name in seen or outer is None
                    or outer['sha256'] != record.get('sha256') or outer.get('link') != record.get('link')
                    or ('directory' in record and record['directory'] is not True)):
                raise ValueError('cli_candidate_resource_payload_binding')
            path = root/'resources/loginom'/name
            if not path.resolve(strict=True).is_relative_to(root/'resources/loginom'):
                raise ValueError('cli_candidate_resource_path_escape')
            if record.get('directory') is True:
                if not path.is_symlink() or not path.is_dir():
                    raise ValueError('cli_candidate_resource_directory_link')
            elif not path.is_file():
                raise ValueError('cli_candidate_resource_file')
            seen.add(name)
        if resource['node'] not in seen or resource['browser'] not in seen:
            raise ValueError('cli_candidate_resource_executables_missing')
        for name,pin in [(resource['node'],'node_sha256'),(resource['browser'],'browser_sha256'),
                ('runtime/client/lib/javascript-knowledge.mjs','javascript_knowledge_source_sha256')]:
            if actual['resources/loginom/'+name]['sha256'] != expected[pin]:
                raise ValueError('cli_candidate_runtime_or_knowledge_pin:'+pin)
    except (OSError,KeyError,TypeError,AttributeError,ValueError,RuntimeError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'cli_candidate_missing_or_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),files_verified=file_count,
        scope='linux_cli_bundle_integrity_against_external_pins',candidate_execution_verified=False,
        model_delivery_verified=False,cli_acceptance_verified=False)
