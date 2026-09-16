"""Explicit Loginom storage destinations; never derive accounts from host identity."""
import json
import re


def storage_segments(directory):
    if not isinstance(directory,str) or not directory.startswith('/') or len(directory)>2000:
        raise ValueError('An explicit absolute Loginom storage directory is required')
    parts=directory[1:].split('/')
    if not 1<=len(parts)<=32 or any(not p or len(p)>200 or p in ('.','..') or p!=p.strip()
                                    or re.search(r'[\\\x00-\x1f\x7f]',p) for p in parts):
        raise ValueError('Loginom storage directory must have unambiguous path segments')
    return parts


def render_goal(template, package_path, directory):
    parts=storage_segments(directory)
    return (template.replace('__PACKAGE_PATH__',package_path)
            .replace('__STORAGE_DIRECTORY__',directory)
            .replace('__STORAGE_SEGMENTS__',json.dumps(parts,ensure_ascii=False)))
