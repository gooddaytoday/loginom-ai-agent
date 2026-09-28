import {createHash} from 'node:crypto';
import {javascriptSourceIdentity} from '../../client/lib/javascript-source-read.mjs';

export function javascriptSourceSettings(schema) {
  if (schema?.verified !== true || schema.generation?.checked === undefined) throw Error('Source settings incomplete');
  return {generation: schema.generation.checked, grids: schema.grids.map(grid => ({
    tid: grid.tid, fields: grid.fields.map(({record_id, connected_record_id, connected_back_id, ...field}) => field)
  }))};
}

export function javascriptSourceMappings(mappings) {
  const semantic = mapping => ({autosync: mapping.autosync,
    source_fields: mapping.source_fields.map(({record_id, field_id, ...field}) => field),
    target_fields: mapping.target_fields.map(({record_id, field_id, source, exclusion_source, ...field}) => ({...field,
      source: source ? Object.fromEntries(Object.entries(source).filter(([key]) => !['record_id','field_id'].includes(key))) : null,
      exclusion_source: exclusion_source ? Object.fromEntries(Object.entries(exclusion_source).filter(([key]) => !['record_id','field_id'].includes(key))) : null}))});
  return {input: semantic(mappings.input), output: semantic(mappings.output)};
}

export async function verifyJavascriptSourceCycle({createReader, owner, readMappings, checkBoundary, record, expectedSource, expectedSettings, expectedGeneration}) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const metadata = javascriptSourceIdentity(expectedSource);
  await checkBoundary();
  const evidenceBefore = structuredClone(await readMappings());
  const before = javascriptSourceMappings(evidenceBefore);
  const rounds = [];
  let retainedSettings = expectedSettings;
  for (let round = 0; round < 2; round++) {
    const readerOwner = {...owner, operation_id: owner.operation_id + ':' + round};
    const reader = createReader(readerOwner);
    let request = {owner: readerOwner}, source = '', settings, chunks = 0;
    const receipts = [];
    do {
      await checkBoundary();
      const observed = await reader.read(request), receipt = observed.receipt;
      if (!same(receipt.owner, readerOwner) || !Object.keys(metadata).every(key => receipt[key] === metadata[key])
        || receipt.offset_utf8_bytes !== Buffer.byteLength(source, 'utf8')
        || receipt.chunk_utf8_bytes !== Buffer.byteLength(receipt.source_text, 'utf8')
        || settings !== undefined && !same(settings, observed.settings)) throw Error('Source cycle identity/content drift');
      settings = observed.settings; source += receipt.source_text; chunks++;
      receipts.push({...metadata, owner: receipt.owner, offset_utf8_bytes: receipt.offset_utf8_bytes,
        chunk_utf8_bytes: receipt.chunk_utf8_bytes, chunk_sha256: createHash('sha256').update(receipt.source_text).digest('hex'),
        cursor_sha256: receipt.cursor ? createHash('sha256').update(receipt.cursor).digest('hex') : null});
      if (chunks > 8192 || Buffer.byteLength(source, 'utf8') > 32768) throw Error('Source cycle chunk bound');
      request = receipt.cursor ? {owner: readerOwner, cursor: receipt.cursor, expected_source_sha256: receipt.source_sha256} : null;
      await checkBoundary();
    } while (request);
    if (round === 0 && retainedSettings === undefined) retainedSettings = structuredClone(settings);
    if (source !== expectedSource || !same(javascriptSourceIdentity(source), metadata)
      || !same(settings, retainedSettings) || expectedGeneration !== undefined && settings.generation !== expectedGeneration) throw Error('Source/settings independent readback changed');
    rounds.push({round, ...metadata, chunks, receipts, settings, settings_sha256: createHash('sha256').update(JSON.stringify(settings)).digest('hex')});
  }
  const evidenceAfter = structuredClone(await readMappings());
  const after = javascriptSourceMappings(evidenceAfter);
  if (!same(before, after)) throw Error('Source cycle mappings changed');
  const process = await checkBoundary();
  const result = {rounds, mapping_evidence: {before: evidenceBefore, after: evidenceAfter}, mappings: {before, after}, mappings_unchanged: true, source_unchanged: true, settings_unchanged: true,
    process, no_execute_or_done_dispatched_in_cycle: true, no_server_commit_verified: false, public_source_read_enabled: false};
  const saved = await record({phase: 'source_cycle_verified', result});
  if (!same(saved?.result, result)) throw Error('Source cycle final ACK differs');
  return result;
}
