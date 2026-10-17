## LAB-61 initial: address-specific Chromium admission proposal

Proposal only: not installed or loaded. Intent `LAB61-RICH-INITIAL-BUILD-a2ba3d0f-01a14b5b`; authorization comment `01a14b5e-7231-7a70-ae10-7ed262f352d0`. Independent exact-source OS review and a separately assigned operator apply must precede browser/lease/native admission. Model/reference/product and continuation of the ten cases remain closed.

The separately accepted product source is `a2ba3d0fc8de25c50e497233506b4a6e4f50e06d`; source ACCEPT `01a14b5b-c575-7dd6-ba88-c037135e4abd` closes BEN-INITIAL-OWNER-01 and preserves the preceding REJECT. This OS proposal is a separate documentary/policy commit; it does not change or rebuild the accepted product source.

The new version `0.1.17-lab61.initial.a2ba3d0f` was built with pinned Bun1.3.14/0d9b296af and Node24.19.0 into the new immutable root `/home/user/.local/share/loginom-evals-runtime/cli-rich-lab61-initial-a2ba3d0fc8de25c50e497233506b4a6e4f50e06d`. The unmodified builder verified the source snapshot, archive and extracted roundtrip. Independent installed verification matched all5389 CLI manifest entries, all4394 resource entries, and260 staged runtime source files. Offline binary --version reports the assigned version; no browser was started.

Verified product pins:

| Item | SHA256 |
| --- | --- |
| Build source tree | `04dd1fbfb63a21bb09c84b6c1d4fca4af459789fa6e0e5b365e3bd3710cd0416` |
| CLI manifest | `96763b4b8aaae92642cbd9c624df47a10b2d09bc0a47762c870e2671a51d7bf8` |
| CLI binary | `1e49d62432ac1803ad7e154a48b01f099cd443b44d72e257cb9166390706dfca` |
| Resource manifest | `5359de7aacf8590c8a77cb97d48f287c31e9402d0343f12e52712d519cfe23b5` |
| Chrome revision1243 | `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e` |
| Release archive | `dc76ad660e47d0d795f26f8b94fd1206b9894dd8d673c2242855da22e4a70038` |

The adjacent five-line policy follows accepted OS proposal `8c60514a0c7e4d790ff2c1a710bb82b2685cb13e` (`loginom-lab61-epoch-chromium.apparmor`, SHA256 `bf25939f9c3599827417fcbbdb2d269867c7fc9fba79249f4c02f5cfc2f973e9`). Only the profile name and exact attachment path differ. The new name is `loginom-lab61-initial-chromium`; attachment is the actual Chrome path under the new immutable root. ABI, tunables include, flags=(unconfined) and sole userns rule remain identical. No wildcard, sandbox-flag change, global sysctl change, extra capability or modification/reload of a previous policy is proposed.

The separate config `/home/user/.local/share/loginom-evals-runtime/operations/lab61-initial-a2ba3d0f.json` changes only `/roles/rich/cliBin` and `/roles/ben/cliBin` from the epoch config. Raw SHA256 `e91a5c0aa9b47ae61b85b8d7d12319dfc441a6fe6940f508ec28fe4c1d8b16d0`; canonical binding SHA256 `e7b0dbce4c637d220e244fadf7a50edfa55c79f549914aa8b45f7a19157c8e23`. Top-level CLI, baseline/EvalRunner, profile/work/result roots and all other config values are unchanged. A separate `lab61-initial-a2ba3d0f-pins.json` binds the installed manifests/binary/config and this exact proposal. This is offline coherence validation, not helper/native admission.

The only parser operation in this stage is:

```sh
/usr/sbin/apparmor_parser --skip-kernel-load --skip-cache --stdout loginom-lab61-initial-chromium.apparmor > proposed-policy.bin
```

Parser success establishes syntax/compilation only. No kernel load, cache write, privileged apply, browser, lease, native admission or health/FREE check is performed. The old d6/2e990 installations, helper, configs, AppArmor policy and global userns restriction remain unchanged. Reference14, initial1/3, CSV3/3, productNOT_RUN0, recovery0/probes0, original TASK/input/criteria and all historical outcomes are preserved.

After independent OS-source ACCEPT, the authorized operator still needs a separate exact address-specific apply/verify assignment. A fresh installation admission and subsequent case decision are separate Evaler stages; no successful native behavior or ten-case acceptance is claimed here.
