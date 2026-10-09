#!/usr/bin/env python3
"""Publish a completed private sibling artifact once; no overwriting or retry."""
import argparse,hashlib,json,os
from pathlib import Path
from common import process_identity
def publish(staging, final, size, sha256):
    staging,final=Path(staging),Path(final)
    if not staging.is_absolute() or not final.is_absolute() or staging.parent!=final.parent or staging==final or any(
            p.is_symlink() for p in [staging,staging.parent,*staging.parents]): raise RuntimeError('HANDOFF_PRIVATE_SIBLING_REQUIRED')
    parent=staging.parent.stat();before=staging.lstat()
    if parent.st_uid!=os.getuid() or parent.st_mode&0o077 or before.st_uid!=os.getuid() or before.st_mode&0o077 or not staging.is_file():
        raise RuntimeError('HANDOFF_PRIVATE_SIBLING_REQUIRED')
    raw=staging.read_bytes()
    if len(raw)!=size or hashlib.sha256(raw).hexdigest()!=sha256: raise RuntimeError('HANDOFF_BYTES_CHANGED')
    data=json.loads(raw)
    if data.get('schema')=='lab53-held-fd-inventory-v1':
        for sample in [data['before'],data['after']]:
            record=sample['control'];current=process_identity(record['pid'])
            if current and current['start_ticks']==record['start_ticks'] and current['state'] not in {'Z','X'}:
                raise RuntimeError('HANDOFF_COLLECTOR_CONTROL_STILL_LIVE')
    fd=os.open(staging,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        info=os.fstat(fd)
        if (info.st_dev,info.st_ino,info.st_size)!=(before.st_dev,before.st_ino,before.st_size) or staging.read_bytes()!=raw:
            raise RuntimeError('HANDOFF_BYTES_CHANGED')
        os.fsync(fd);os.link(staging,final,follow_symlinks=False)
        directory=os.open(final.parent,os.O_RDONLY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally: os.close(fd)
    return {'bytes':len(raw),'sha256':sha256}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('staging',type=Path);parser.add_argument('final',type=Path)
    parser.add_argument('--bytes',type=int,required=True);parser.add_argument('--sha256',required=True);args=parser.parse_args()
    try: print(json.dumps(publish(args.staging,args.final,args.bytes,args.sha256)))
    except Exception as error: print(str(error) if isinstance(error,RuntimeError) else 'HANDOFF_PUBLICATION_UNKNOWN',file=__import__('sys').stderr);raise SystemExit(1)
