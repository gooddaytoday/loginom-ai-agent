import {readFileSync, lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {privatePath} from './parent-readback.mjs';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function boundFile(path) {
  const info = privatePath(path);
  return {path, device: info.dev, inode: info.ino, sha256: hash(readFileSync(path))};
}
export function bootstrapBindings(paths, issueId, stand) {
  if (paths?.length !== 3 || new Set(paths).size !== 3) throw Error('BOOTSTRAP_CONFIG_BINDING_UNKNOWN');
  const bindings = paths.map(boundFile), [global, card, intent] = paths.map(path => JSON.parse(readFileSync(path)));
  if (global.url !== stand || card.url !== stand || global.admin_user === card.admin_user
    || !global.admin_user || !card.admin_user || !global.admin_password || !card.admin_password
    || card.workspace_id !== global.workspace_id || !equal(card.agents, global.agents)
    || ['node','browser','playwright_module','proxy','api_key'].some(key => !equal(card[key], global[key]))
    || intent.schema !== 'lab53-card-admin-intent-v1' || intent.issue_id !== issueId
    || !equal(intent.card_operator, bindings[1]) || !['probe-existing','create-unstarted'].includes(intent.action)
    || typeof intent.full_name !== 'string' || !intent.full_name
    || (card.admin_marker !== undefined && card.admin_marker !== intent.full_name)) throw Error('BOOTSTRAP_CONFIG_BINDING_UNKNOWN');
  return {bindings, global, card, intent, users: [global.admin_user, card.admin_user].map(hash)};
}

export function verifyBootstrapLogouts(completion, operation) {
  if (completion?.schema !== 'lab53-admin-bootstrap-completion-v1' || completion.issue_id !== operation.issue_id
    || completion.operation_id !== operation.operation_id || !equal(completion.source, operation.source)
    || !equal(completion.expected_observer, operation.expected_observer) || completion.own_browser_closed !== true
    || completion.receipts?.length !== 2 || completion.receipts[0].actor !== 'bootstrap-admin'
    || completion.receipts[1].actor !== 'card-admin' || completion.receipts.some(receipt => receipt.effective_admin !== true
      || receipt.role !== 'admin' || receipt.effect.stand !== operation.stand || receipt.logout?.guid_hash !== receipt.effect.guid_hash
      || receipt.logout.ui_logout_invoked !== true || receipt.logout.transport_disconnected !== true
      || !/^[a-f0-9]{64}$/.test(receipt.causal_proof_sha256))
    || new Set(completion.receipts.map(receipt => receipt.effect.guid_hash)).size !== 2)
    throw Error('BOOTSTRAP_ALL_EFFECTS_UNKNOWN');
  return completion.receipts;
}
