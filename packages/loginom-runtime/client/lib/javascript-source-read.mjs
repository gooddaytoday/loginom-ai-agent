import {createHash, randomUUID} from 'node:crypto';

const need = (ok, message) => { if (!ok) throw Error(message); };
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function javascriptSourceIdentity(source) {
  need(typeof source === 'string' && !/[\r\0]/u.test(source) && source.isWellFormed(), 'Source characters refused');
  const bytes = Buffer.byteLength(source, 'utf8'), lines = source.split('\n').length;
  need(bytes <= 32768 && lines <= 1024, 'Source bounds refused');
  return Object.freeze({source_sha256: hash(source), source_utf8_bytes: bytes, source_lf_lines: lines});
}

// Shared pure admission/read preparation. The worst permitted owner produces
// stable chunk boundaries before a new node has its actual identity.
const sourceEnvelope=(owner,metadata,chunk,offset,cursor)=>({kind:'source',owner,...metadata,
  source_text:chunk,offset_utf8_bytes:offset,chunk_utf8_bytes:Buffer.byteLength(chunk,'utf8'),cursor});
function exactSourceReceipt(receipt,redactor) {
  const cleaned=redactor.redact(receipt);
  need(equal(cleaned,receipt),'Source exact structured redaction refused');
  need(Buffer.byteLength(JSON.stringify(cleaned),'utf8')<=16384,'Source response budget refused');
  return cleaned;
}
export function prepareJavascriptSourceDelivery({source,owner,redactor,chunkBytes=4096}) {
  need(owner&&equal(Object.keys(owner).sort(),['document_id','node_id','operation_id','ui_epoch','workflow_id'])
    &&['document_id','workflow_id','operation_id'].every(key=>typeof owner[key]==='string'
    &&owner[key].length>0&&owner[key].length<=256)
    &&(owner.node_id===null||typeof owner.node_id==='string'&&owner.node_id.length>0&&owner.node_id.length<=256)
    &&Number.isSafeInteger(owner.ui_epoch)&&owner.ui_epoch>=0,'Source preparation owner refused');
  need(Number.isInteger(chunkBytes)&&chunkBytes>=4&&chunkBytes<=4096
    &&typeof redactor?.text==='function'&&typeof redactor?.redact==='function','Source preparation dependencies refused');
  const metadata=javascriptSourceIdentity(source);
  need(redactor.text(source)===source,'Source full redaction refused');
  need(equal(redactor.redact({source_text:source}),{source_text:source}),'Source full structured redaction refused');
  const placeholder='00000000-0000-4000-8000-000000000000';
  // JSON can escape each UTF-16 owner unit into six bytes. Budget every
  // allowed owner at that maximum, independently of the observed/new node.
  const longest='\u0001'.repeat(256);
  const worstOwner={document_id:longest,workflow_id:longest,node_id:longest,operation_id:longest,ui_epoch:Number.MAX_SAFE_INTEGER};
  const worstMetadata={source_sha256:'0'.repeat(64),source_utf8_bytes:32768,source_lf_lines:1024};
  const escapedBudget=16384-Buffer.byteLength(JSON.stringify(sourceEnvelope(worstOwner,worstMetadata,'',32768,placeholder)),'utf8')-4;
  const chunks=[];let text='',bytes=0,escapedBytes=0;
  for(const point of source){
    const size=Buffer.byteLength(point,'utf8'),escapedSize=Buffer.byteLength(JSON.stringify(point),'utf8')-2;
    if(bytes+size>chunkBytes||escapedBytes+escapedSize>escapedBudget){
      need(text.length>0,'Source envelope budget refused');
      chunks.push(text);text='';bytes=0;escapedBytes=0;
    }
    text+=point;bytes+=size;escapedBytes+=escapedSize;
  }
  chunks.push(text);
  let offset=0;
  for(const chunk of chunks){
    exactSourceReceipt(sourceEnvelope(owner,metadata,chunk,offset,placeholder),redactor);
    offset+=Buffer.byteLength(chunk,'utf8');
  }
  // Fragment inspection can grow the redactor's known context; recheck the
  // entire prospective delivery before admitting a source mutation.
  need(redactor.text(source)===source,'Source full redaction refused');
  need(equal(redactor.redact({source_text:source}),{source_text:source}),'Source full structured redaction refused');
  return {metadata,chunks};
}

// Internal production boundary; intentionally not registered as a public tool.
// The adapter must own the existing-node navigation, not accept caller scripts.
export function createJavascriptSourceReader({owner, deadline, adapter, redactor, record, chunkBytes = 4096}) {
  need(owner && equal(Object.keys(owner).sort(), ['document_id','node_id','operation_id','ui_epoch','workflow_id'])
    && ['document_id','node_id','operation_id','workflow_id'].every(key => typeof owner[key] === 'string' && owner[key].length > 0 && owner[key].length <= 256)
    && Number.isSafeInteger(owner.ui_epoch) && owner.ui_epoch >= 0, 'Source owner refused');
  need(Number.isSafeInteger(deadline) && deadline > Date.now(), 'Source deadline refused');
  need(Number.isInteger(chunkBytes) && chunkBytes >= 4 && chunkBytes <= 4096, 'Source chunk bound refused');
  need(['open','read','discard'].every(key => typeof adapter?.[key] === 'function')
    && typeof redactor?.text === 'function' && typeof redactor?.redact === 'function' && typeof record === 'function', 'Source dependencies refused');
  const identity = Object.freeze({...owner}), cursors = new Map();
  let started = false, busy = false, uncertain = false, sequence = 0, retained = null;
  const timely = () => need(Date.now() < deadline, 'Source original deadline expired');
  const bounded = async operation => {
    timely();
    let timer;
    try {
      const value = await Promise.race([Promise.resolve().then(operation), new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(Error('Source reply timeout; no replay')), Math.max(1, deadline - Date.now()));
      })]);
      timely(); return value;
    } finally { clearTimeout(timer); }
  };
  const journal = async (phase, step, receiptIdentity) => {
    const event = {phase, step, owner: identity, deadline, ...(receiptIdentity ? {receipt: receiptIdentity} : {})};
    const ack = await bounded(() => record(event));
    need(Object.keys(event).every(key => equal(ack?.[key], event[key])), 'Source journal ACK differs');
  };
  const exact=receipt=>exactSourceReceipt(receipt,redactor);
  const envelope=(metadata,chunk,offset,cursor)=>sourceEnvelope(identity,metadata,chunk,offset,cursor);
  const prepare=source=>prepareJavascriptSourceDelivery({source,owner:identity,redactor,chunkBytes});
  return {
    get uncertain() { return uncertain; },
    async read(request) {
      need(!busy && !uncertain, 'Source reader busy or uncertain; no replay');
      need(request && equal(request.owner, identity), 'Source request owner changed');
      need(Object.keys(request).every(key => ['owner','cursor','expected_source_sha256'].includes(key)), 'Source request fields refused');
      const continuation = request.cursor !== undefined;
      const entry = continuation ? cursors.get(request.cursor) : null;
      need(continuation ? !!entry && request.expected_source_sha256 === retained?.source_sha256 : !started && request.expected_source_sha256 === undefined,
        'Source cursor/digest refused');
      timely(); busy = true; started = true;
      if (continuation) cursors.delete(request.cursor);
      const step = ++sequence;
      try {
        await journal('source_open_dispatch', step);
        const handle = await bounded(() => adapter.open({owner: identity, deadline}));
        await journal('source_open_settled', step);
        const first = await bounded(() => adapter.read(handle, {owner: identity, deadline}));
        need(equal(first?.owner, identity), 'Source observed owner changed');
        const settings = structuredClone(first.settings);
        const fresh = await bounded(() => adapter.read(handle, {owner: identity, deadline}));
        need(equal(fresh?.owner, identity) && fresh.source === first.source && equal(fresh.settings, settings), 'Source changed during owned read');
        let prepared, refusal;
        try {
          prepared = prepare(first.source);
          need(!retained || equal(retained, prepared.metadata), 'Source continuation digest changed');
        } catch (error) { refusal = error; }
        await journal('source_discard_dispatch', step);
        const closing = await bounded(() => adapter.read(handle, {owner: identity, deadline}));
        need(equal(closing?.owner, identity) && closing.source === first.source && equal(closing.settings, settings),
          'Source changed before discard');
        const closed = await bounded(() => adapter.discard(handle, {owner: identity, deadline}));
        need(closed?.closed === true && equal(closed.owner, identity), 'Source discard unconfirmed');
        await journal('source_discard_settled', step);
        if (refusal) throw refusal;
        const index = entry?.index ?? 0, offset = entry?.offset ?? 0;
        const chunk = prepared.chunks[index];
        need(typeof chunk === 'string', 'Source cursor offset refused');
        const cursor = index + 1 < prepared.chunks.length ? randomUUID() : null;
        const receipt = exact(envelope(prepared.metadata, chunk, offset, cursor));
        await journal('source_delivery_verified', step, {...prepared.metadata,
          offset_utf8_bytes: receipt.offset_utf8_bytes, chunk_utf8_bytes: receipt.chunk_utf8_bytes,
          chunk_sha256: hash(chunk), cursor_sha256: cursor ? hash(cursor) : null});
        // Recheck the actual response after ACK: shared redactor context may grow.
        const delivered = exact(receipt);
        retained = prepared.metadata;
        if (cursor) cursors.set(cursor, {index: index + 1, offset: offset + receipt.chunk_utf8_bytes});
        return {receipt: delivered, settings};
      } catch (error) {
        uncertain = true; cursors.clear(); throw error;
      } finally { busy = false; }
    }
  };
}
