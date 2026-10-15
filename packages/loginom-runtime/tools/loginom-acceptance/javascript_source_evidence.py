"""Closed UTF-8 source-reader evidence shared by JS configuration/read/cold audits.

This validates recorded chunks, not journal provenance or supplied JS execution.
"""
import hashlib
from datetime import datetime
from javascript_cli_candidate import hexadecimal
from javascript_cli_evidence import value_digest


def epoch(text):
    return int(datetime.fromisoformat(text.replace('Z','+00:00')).timestamp()*1000)


def source_identity(source):
    text = source.decode('utf-8')
    if '\r' in text or '\x00' in text or not source or len(source) > 32768:raise ValueError('cold_source_contract')
    return dict(source_sha256=hashlib.sha256(source).hexdigest(),source_utf8_bytes=len(source),source_lf_lines=text.count('\n')+1)


def verify_closed_source_read(rows,source,metadata,owner,deadline):
    """Every UTF-8 chunk has its own reader step and closed native lifecycle."""
    deliveries = [(i,r) for i,r in rows if r['phase'] == 'source_delivery_verified']
    if not deliveries or len(rows) != 5*len(deliveries):
        raise ValueError('javascript_reread_source_closed_lifecycle')
    if any(value_digest(r.get('owner')) != value_digest(owner) or r.get('deadline') != deadline
            or epoch(r['recorded_at']) > deadline for i,r in rows):
        raise ValueError('javascript_reread_source_owner_deadline')
    offset = 0
    previous = -1
    start = None
    for step,(index,row) in enumerate(deliveries,1):
        if type(row.get('step')) is not int or row['step'] != step:
            raise ValueError('javascript_reread_source_chunk_step')
        lifecycle = []
        for phase in ('source_open_dispatch','source_open_settled','source_discard_dispatch','source_discard_settled'):
            found = [(i,r) for i,r in rows if r['phase'] == phase and type(r.get('step')) is int and r['step'] == step]
            if len(found) != 1:raise ValueError('javascript_reread_source_closed_lifecycle')
            lifecycle.append(found[0][0])
        if lifecycle != sorted(lifecycle) or not previous < lifecycle[0] < lifecycle[-1] < index:
            raise ValueError('javascript_reread_source_closed_order')
        if start is None:start = lifecycle[0]
        receipt = row['receipt']
        count = receipt.get('chunk_utf8_bytes')
        if (any(receipt.get(k) != v for k,v in metadata.items())
                or any(type(receipt.get(k)) is not int for k in ('source_utf8_bytes','source_lf_lines','offset_utf8_bytes'))
                or receipt['offset_utf8_bytes'] != offset or type(count) is not int or not 0 < count <= 4096):
            raise ValueError('javascript_reread_source_chunk_identity')
        chunk = source[offset:offset+count]
        if len(chunk) != count or hashlib.sha256(chunk).hexdigest() != receipt.get('chunk_sha256'):
            raise ValueError('javascript_reread_source_chunk_bytes')
        chunk.decode('utf-8')
        offset += count
        cursor = receipt.get('cursor_sha256')
        if (cursor is None and (offset != len(source) or index != deliveries[-1][0])
                or cursor is not None and (not hexadecimal(cursor,64) or offset >= len(source))):
            raise ValueError('javascript_reread_source_cursor')
        previous = index
    if offset != len(source) or deliveries[-1][1]['receipt'].get('cursor_sha256') is not None:
        raise ValueError('javascript_reread_source_incomplete')
    return start,previous

