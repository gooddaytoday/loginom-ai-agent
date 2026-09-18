# Installed browser/runtime crash acceptance — Linux 04:30

Actual install.sh installed 0.1.4-cli.202609180430 into the ordinary user home.
Both manual cases used the installed launcher without a development bundle override,
real bundled Chromium/Loginom and a scripted model provider. Each used its own new
profile and original CSV attachment. A verified upload, running import receipt and
durable recovery record preceded the targeted SIGKILL. Unsaved drafts were used;
no existing business package was changed or recovery acknowledged.

Browser case PASS: /tmp/loginom-cli-owner-crash-OQYQvV. CLI code 4, watchdog false,
24 tracked processes, alive [], guard released; status code 0, recoverable-error.
Recovery efe755b1-1d82-43d3-82e2-a74c5aee8f45.json remains.

Runtime case PASS: /tmp/loginom-cli-owner-crash-gj6jFM. CLI code 1, watchdog false,
24 tracked processes, alive [], guard retained because cleanup was unconfirmed;
subsequent status code 3/PROFILE_BUSY. Recovery
4bc70b5b-3f67-4cee-ba23-d1f79737727f.json remains. Guard was not removed manually.

Actual uninstall returned 0 and launcher/payload were removed. Both test profiles
and recovery records remain for inspection. This wrapper did not hash every profile
file across uninstall, unlike the earlier dedicated preservation acceptance.

- Driver: packages/loginom-host/script/cli-owner-crash.ts
- Wrapper: /tmp/loginom-installed-crashes-0430.py
- Wrapper result: /tmp/loginom-installed-crashes-0430-summary.json
- Logs: /tmp/loginom-installed-browser-0430.log and /tmp/loginom-installed-runtime-0430.log
- Archive SHA256: 02b4597ea8e2e3f3b9f7afa3257e605eb545eb7ee57f9562883171b1d1de76f1
- Source snapshot: d84670772ad9c4a9e250fbc9257fac281887e4ae495c759f8e886faf8b3681e0

These results replace the earlier development-bundle-only limitation for these
specific Linux cases. They do not cover every crash timing, real model inference,
Windows/macOS or release signing. No additional provider calls were intentionally
scheduled after the fault; business-state completion is not inferred from cleanup.
