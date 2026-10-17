## LAB-61: proposed address-specific Chromium admission

Proposal only; not installed or loaded. Independent exact-source review must precede OS effects. This document does not admit the new CLI, resume cases or authorize model calls.

The separately built product source remains `2e990a84aa25dc37a4e808da564be752aae6f564`, version `0.1.17-lab61.epoch.2e990a84`. Its immutable installation is `/home/user/.local/share/loginom-evals-runtime/cli-rich-lab61-epoch-2e990a84aa25dc37a4e808da564be752aae6f564`. The source review was accepted by Ben in comment `01a14a96-d0fc-72ea-b58f-eb740a2b5e20`; this OS proposal was not part of that review.

The author's installation admission on 17 October 2026 acquired its own unit lease and invoked the unchanged f2aa helper with a new config changing only the Rich/Ben CLI paths. Preflight stopped at `PROFILE_NOT_READY`. The installed CLI's `loginom status --format json --headless` returned `recoverable-error` / `LOGINOM_BROWSER_START_FAILED`; the supervisor confirmed cleanup with no unknown processes or binding refusals. This is an installation error, not a new case/reference/product attempt.

Kernel audit at 16:12:26 UTC identifies the exact new Chrome executable (PID 3046145) transitioning from `unconfined` to `unprivileged_userns`; its child PID 3046152 was denied capability `sys_admin`. The global unprivileged-userns restriction is 1. Existing address-specific Loginom policies cover the older installations, including d6, and do not attach to this new path. These observations localize the startup failure without another browser attempt.

The adjacent proposed profile follows the existing d6 profile's structure, changing only its profile name and exact Chrome attachment path. It contains no wildcard and grants only `userns` within the same existing unconfined-profile pattern. It does not disable the global restriction, change the sandbox flags, reuse an older installation path, or change another policy. The Chrome binary remains the pinned revision 1243 with SHA256 `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`.

Read-only validation, using the installed parser and an output inside the author's private evidence directory:

```sh
/usr/sbin/apparmor_parser --skip-kernel-load --skip-cache --stdout loginom-lab61-epoch-chromium.apparmor > proposed-policy.bin
```

Compilation success would establish parser acceptance only; native readiness and kernel application remain unverified. After independent approval, an authorized operator must apply only this exact profile, verify the loaded policy against its approved source and preserve all other policies/restrictions. The author then needs a separate fresh installation admission under its own lease. The original failed preflight remains immutable; a later READY cannot rewrite it. Model/reference/product and the ten cases stay closed pending Evaler's separate decision.
