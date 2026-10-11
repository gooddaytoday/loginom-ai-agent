# Existing Loginom account provisioning on mas

Generator owns creation of fresh worker/reviewer Loginom accounts.
Run the existing script from an ordinary Multica task after validating the private operator configuration:

python3 ~/.local/share/loginom-multica-accounts/scripts/provision-accounts.py --issue <card-UUID> --stage stage0

For this tool, stage0 selects Loginom-account preparation without provider OAuth or model settings. Do not use --stage full, which belongs to the historical multi-account pool.
Operator: ~/.config/loginom-multica/operator.json (0700 directory, 0600 file). Validate nonempty string admin_user/admin_password before any provisioning. Their values and api_key must not appear in stdout, screenshots, comments or model prompts.
Bindings use the installed pinned Node, Chromium and Playwright. Expected role files: ~/.config/loginom-multica/cards/<card-UUID>/worker.json and reviewer.json. Verify account_state=ready, same stand, distinct usernames, effective non-admin permissions and session cleanup. Repeated preparation preserves the persisted pair/passwords; uncertain creation requires reconciliation, never blind retry or password change.
Only these three existing source files are installed. Native Multica controls cards, queues, checkout and handoff; the runtime setup is documented in shared-oauth PR40. No account files or auth state from old runtimes were copied.
Current operator metadata is prepared for https://app.loginom.ai; administrative credentials are still absent. Do not run account creation until that missing connection is resolved.
