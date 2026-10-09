// No live adapter is admitted until final observer absence has a supported,
// independently calibrated method. A boolean/config flag cannot waive it.
export function requireFiniteCleanup() {
  throw Object.assign(Error('BLOCKED_FINITE_SERVER_CLEANUP'), {code: 'BLOCKED_FINITE_SERVER_CLEANUP'});
}

export function verifyPairBindings(configs, operator) {
  if (configs.length !== 2 || new Set(configs.map(config => config.loginom.username)).size !== 2
    || configs.some((config, index) => config.role !== ['worker', 'reviewer'][index]
      || config.stage !== 'stage0' || config.loginom.url !== operator.url
      || config.agent_id !== operator.agents[config.role]
      || config.workspace_id !== operator.workspace_id
      || config.issue_id !== configs[0].issue_id
      || ['provider_auth_file', 'provider_auth_files'].some(key => key in config))) {
    throw Object.assign(Error('PAIR_BINDING_MISMATCH'), {code: 'PAIR_BINDING_MISMATCH'});
  }
  return {distinct_identities: true, same_stand: true, stage: 'stage0'};
}
