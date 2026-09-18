# Standalone bundled dependency inventory — 2026-09-18

Status: inventory PASS; licenses/notices completeness OPEN.

The actual standalone Bun compile and private Node host build now retain
`build-inputs.json` from Bun's metafile. Missing metadata aborts the build.
This records bundled inputs, imports and outputs for subsequent notice collection;
it is not a complete SBOM or a legal compliance assessment.

Verified locally using pinned Bun 1.3.14:

- Standalone Linux x64 native compile and `--version` smoke PASS (0.1.0; an
  inventory-only development build, not the installed 02:40 candidate).
- CLI metafile: 3937 resolved inputs, 325 outputs; 3793 distinct inputs with
  positive `bytesInOutput`, belonging to 467 external npm package versions.
- Node host: 100 emitted inputs, three external npm package versions.
- Package-local agent and loginom-host `bun typecheck` PASS; diff whitespace PASS.

Inventories alongside this report were derived from positive output contributions.
For each external input, resolve its filesystem path, locate the last node_modules
segment and its package root (including scoped names), then read that root's
package.json. Do not stop at nested package.json files that only declare module
format. Deduplicate by name/version. `files` lists root-level files beginning with
license/licence/notice/copying/copyright, case-insensitively. These lists are discovery
results, not copied license texts or proof that other notice locations are absent.
26 CLI package versions have no matching root-level file; all three host packages do.

Evidence remains local:

- /dev/shm/loginom-cli-notices-inputs-20260918/loginom-ai-agent-cli-linux-x64/
- /dev/shm/loginom-host-notices-inputs-20260918/
- /tmp/loginom-cli-notices-inputs-build.log

The earlier 02:40 full archive has only the generic runtime notices, Node,
OpenCode and Dock license files plus dependency/browser source notices. It does
not contain this new compile graph. No existing artifact was rewritten.

Remaining: collect actual applicable texts and copyright notices for emitted
packages (including nested notices), inventory Bun/native embedded dependencies,
verify Chromium notices and Dock source distribution obligations, then build and
verify a new complete archive. Native OS, signing and real-provider acceptance
remain separate open gates. No release compliance PASS is asserted.

## Full archive with copied texts

`collect-build-notices.ts` is integrated into build-cli before manifest generation.
It copies 442 root-level text files, includes content SHA256 per file, and emits
an explicitly incomplete inventory of 467 npm package versions (26 missing).
License symlinks escaping their package root are rejected.

The first full build failed before publication: host metafile paths are relative
to the caller cwd, not necessarily the package directory. The caller now passes
its actual cwd; the repeated full build PASS. Package-local host typecheck PASS.

Candidate 0.1.4-cli.202609180320: native smoke, source stability, complete manifest
and extracted archive verification PASS. Independently checked all copied file
hashes and the archived inventory content. Saved archive SHA256 PASS:

- Archive: /tmp/loginom-ai-agent-cli-0.1.4-cli.202609180320-linux-x64.tar.gz
- SHA256: 758c7522a960f8de3992abb60cfd919d291fc453ba9970ad42b3df2a5888c48a
- Source snapshot: 3b1e3809217db579c92852729e94ecb717c4d3c968d248b8d61626ebcd294230
- Build log: /tmp/loginom-cli-notices-202609180320-retry-build.log
- Payload: /dev/shm/loginom-cli-notices-202609180320 (ephemeral)

Archive saving initially reached the checksum step but the local Python lacks
hashlib.file_digest. No artifact corruption occurred; a separate streaming SHA256
verification passed. This candidate was not installed. The notices release gate
remains OPEN for the recorded missing texts and exclusions.

## Pinned supplemental texts

Npm version metadata was retrieved for the 26 missing entries. Four entries now
have exact-commit upstream supplements in packages/loginom-host/licenses/upstream:
fff-bun and fff-bin-linux-x64-gnu 0.9.4, sigstore/verify 3.1.1, remeda 2.26.0.
The registry gitHead maps to each raw source URL; SHA256 is stored and verified
before copying at build time. The two fff packages share one source text.

Collector rerun against the actual compile graph: 467 packages, 446 copied files,
22 still missing. Independent verification of all 446 hashes and four gitHead
mappings PASS; package-local host typecheck PASS. The inventory remains incomplete.
No complete archive was rebuilt for this incremental supplement; 03:20 retains
its original 442 texts and 26 missing entries. Supplemental source files are
included in the next build automatically, without network access.

Sixteen remaining entries had no gitHead in the retrieved npm version metadata;
others had no root license at the published commit under the inspected common
filenames. This is not evidence that their licenses are unavailable. README
references alone were not treated as full license texts. Remaining work includes
version-tag provenance, nested/root alternate names, Bun/native and resource audit.

## Version-tag sources and README attribution

Twelve provider-utils 4.0.x version tags were resolved with git ls-remote (peeled
annotated tags where present). Each commit's packages/provider-utils/package.json
name and version matched the npm version before its LICENSE was copied. The
immutable commit URLs, tag refs and metadata URLs are now in upstream/sources.json.
These LICENSE files are a Vercel copyright notice and Apache-2.0 reference, not the
full Apache standard text; collecting them does not close the full license audit.

The Drizzle v1.0.0-rc.2 tag did not match the package version in its source
package.json; no supplemental license was accepted from that lookup. No exact
matching tags were returned for the three missing AWS internal-package versions.
GitHub tree enumeration at the six remaining published commits found no own
LICENSE/NOTICE/COPYING paths (npm/agent only has a third-party test fixture license,
which was not substituted for its own license). SPDX attribution appears in README.

Collector now preserves root README files in a separate documentation list; these
never remove a package from the missing-license list. Actual graph run: 467 packages,
458 license/notice files, 464 README files, 10 missing package entries. Independent
verification of all 922 file hashes PASS; host typecheck PASS. Full archive rebuild
is pending; existing 03:20 archive is unchanged.

Remaining missing entries: three AWS packages, npmcli/agent 4.0.2,
abstract-logging 2.0.1, drizzle-orm 1.0.0-rc.2, opencode-poe-auth 0.0.1,
opentui-spinner 0.0.7, spdx-exceptions 2.5.0, spdx-license-ids 3.0.23.
This list is a collection gap, not a legal conclusion about their distribution.

## Bun notice and complete candidate 03:50

Pinned Bun reports version 1.3.14 and full revision
0d9b296af33f2b851fcbf4df3e9ec89751734ba4, matching the official bun-v1.3.14 tag.
The commit's LICENSE.md is retained verbatim in licenses/bun with source URL and
SHA256. build-cli rejects different Bun versions/revisions and notice hash changes.
Host typecheck PASS. The upstream document lists linked libraries and polyfills;
it does not supply all their license texts. Its relinking directions reference
submodules, while .gitmodules at this commit returned 404. Actual build files
include scripts/build/deps/webkit.ts. Relinking/source distribution remains open.

Complete development candidate 0.1.4-cli.202609180350 PASS: native version smoke,
source stability, manifest and extracted archive checks. Independent checks of
458 npm notice files, 464 README files and Bun notice SHA256 PASS; the archived
inventories/Bun files equal their payload counterparts. Ten npm entries remain
missing; all inventories still state incomplete. This candidate was not installed.

- Saved archive: /tmp/loginom-ai-agent-cli-0.1.4-cli.202609180350-linux-x64.tar.gz
- SHA256: b20eeb8f0a509253d9f3046459e86a35047f7ab0d15d246b07738941caca61a5
- Source snapshot: 7af29f18d5739e00cd8a10122d56cb0136da66f45e16414e6ba2080b01a3e0de
- Build log: /tmp/loginom-cli-notices-202609180350-build.log
- Ephemeral payload: /dev/shm/loginom-cli-notices-202609180350

The saved archive hash was independently checked after copying from tmpfs.
Older candidates retain their historical notice counts and source identities.

## Native dependency source notices

Fetched the exact Bun commit's scripts/build/deps sources and extracted repository
and commit pins for 20 GitHub dependencies plus its WebKit default commit.
Brotli's v1.1.0 tag was resolved to an immutable commit. Sources and build-script
URLs are recorded in packages/loginom-host/licenses/bun/native/sources.json.

Collected 26 root license/notice/author files for 18 components. Additional
immutable files provide JavaScriptCore COPYING.LIB, WebCore LICENSE-LGPL-2 and
picohttpparser.c (preserved whole, with its MIT notice at the start). Total 29
files across 20 components; all local content hashes independently verified.
Build-cli copies these into component directories and verifies every SHA256.
Host typecheck PASS. A full artifact build including these files is pending.

This is a source-default inventory across platforms, not proof of exact binary
linkage. libwebp's pinned GitHub source returned 404; WebKit per-file attribution,
nested notices, other embedded code, polyfills and source/relinking remain open.
No substitute version was used for the unavailable pin. The existing 03:50 archive
retains only its original Bun root notice and is unchanged.

A validation command was accidentally launched from the repository root and ran
turbo typecheck (32 successful, mostly cached). This was outside the prescribed
package-local workflow. The required loginom-host package-local typecheck was
then run separately and passed; that result supports the claim above.

## libwebp source resolution and Chromium credits

The same libwebp commit b7e29b9d75bd31422b00c2a446d49d7af06c328d resolved at
chromium.googlesource.com/webm/libwebp despite the GitHub mirror returning 404.
COPYING, AUTHORS and PATENTS were decoded from gitiles base64 and their decoded
SHA256 recorded. Native collection now contains 32 files across 21 components;
no version substitution occurred. Nested/source/relinking exclusions remain.

The actual bundled Linux Chromium 153.0.8010.12 exposes 757 license sections at
chrome://credits/. Captured its full body text (8,338,577 characters) using the
bundled Playwright and Chromium with chromiumSandbox:true, headless:true and a
fresh temporary browser context; browser.close completed. Its binary SHA256
was independently checked against Product's pinned browserSha256. The exact text
is retained gzip-compressed in licenses/chromium (731700 bytes) with compressed
and uncompressed hashes, platform/revision and capture origin metadata.

build-cli validates the Linux browser pin and both content hashes before exporting
readable credits.txt into the artifact. Windows/macOS are not claimed covered.
Shared notices wording now identifies embedded chrome://credits and the Linux
export; earlier wording incorrectly implied a separate complete browser-side
notice file. Browser-side FFmpeg/Widevine licenses are still preserved.

Package-local host typecheck and independent binary/credits hash checks PASS.
The next complete archive build must verify this new content; 03:50 is unchanged.
Capturing credits does not establish corresponding-source distribution compliance.

## Complete archive 04:10

Candidate 0.1.4-cli.202609180410 includes all current notices additions. Native
version smoke, source stability, full manifest and extracted archive checks PASS.
Independent verification of all 32 native notice hashes and Chromium credit hash
PASS; archived inventory/credits files equal the original payload. Saved archive
checksum was independently verified. No installed/runtime acceptance was run on
this notices candidate; earlier runtime results remain tied to earlier artifacts.

- Archive: /tmp/loginom-ai-agent-cli-0.1.4-cli.202609180410-linux-x64.tar.gz
- SHA256: e275ca545348d5316e34c1669efbe1da756b56c7150cc50ae3a769aee4cb831e
- Source snapshot: 02f2bd202b9051985d57bffb5bc3062b49a33d0b9ea5114249c2d1fbdb073137
- Build log: /tmp/loginom-cli-notices-202609180410-build.log
- Ephemeral payload: /dev/shm/loginom-cli-notices-202609180410

License audit and other release gates remain incomplete as described above.

## Collector boundary regression

Added a real Bun.build fixture test (no mocked metafile) with a scoped dependency
containing nested module-format package.json and a second dependency with only a
README license label. Assertions prove root package identity/version, copied text,
README hash and continued missing-license status. Replacing the first dependency's
LICENSE with a symlink to an outside file causes explicit rejection, produces no
successful inventory and leaves the outside file unchanged. Native Windows
symlink setup is not exercised by this test (skipped there).

Package-local test: 1 PASS / 12 assertions; host typecheck PASS. The test uses and
removes only its own temporary fixture. No product runtime behavior changed and
no new artifact rebuild was required for this test-only addition.

## Drizzle published build provenance

Npm publishes SLSA provenance for drizzle-orm 1.0.0-rc.2 identifying commit
eec7260841c468ab4c2f2dc9d8ebb69105da0c34. Registry dist.integrity and the actual
streamed package tarball SHA512 both match the attested subject. The LICENSE at
that immutable commit was stored with SHA256 and provenance URL. This is stronger
version linkage than the earlier mismatching tag lookup; signature authenticity
was not independently verified and no such verification is claimed.

Collector on the actual graph now copies 459 notices and 464 README files; nine
npm package entries remain missing. All 923 output hashes and host typecheck PASS.
The existing 04:10 archive still has 458 notices; a new full build is pending.

Additional source-header checks did not find full license notices in the inspected
npmcli/agent, abstract-logging and opentui-spinner entry files. SPDX README already
contains attribution/reference information and is preserved separately. AWS package
version metadata returned neither gitHead nor provenance URL; no commit was guessed.

## Embedded Bun compatibility source notices

Inspected 17 direct src/js/node entry files corresponding to names in Bun's
polyfill list at the pinned runtime commit. assert.ts, events.ts and url.ts carry
complete copyright/MIT notices. Those three files are preserved whole under a
separate bun-node-compat source group; all content hashes were verified. This
brings the collection to 35 files: 32 native dependency notices plus three embedded
JS source files. The unchanged native-notice build loop includes the added group.
Other entry files had no matching inline markers; this is not proof that their
implementations or transitive sources lack attribution requirements. No version
or npm implementation was substituted for Bun's actual source.

Package-local host typecheck PASS. A complete archive containing the recent Drizzle
and embedded-source additions is still pending. A user-input request for native
Windows/macOS environments and a separately configured real-provider CLI profile
is outstanding; Linux and scripted-provider checks cannot replace those gates.

## Installed notices acceptance 04:10

Executed the artifact's actual install.sh and uninstall.sh using the ordinary
user home (no HOME override or source installer API). Launcher resolved into the
versioned payload. Restricted-PATH help/version returned success without creating
the selected profile. Independently verified installed hashes for all 32 native
notice files and Chromium credits (757 sections). Uninstall returned 0, removed
launcher/payload and preserved the explicitly created profile fixture's hash.
No Loginom/model invocation occurred in this notices-specific acceptance.

Evidence: /tmp/loginom-notices-installed-3cqze87t/summary.json.
Manual driver: /tmp/loginom-notices-install-check.py. Installation was removed.

Before installation, two redundant extracted candidates were removed to free disk:
/tmp/loginom-cli-cleanup-202609180038 and /tmp/loginom-cli-staging-202609180020.
Their manifests passed, corresponding saved archive SHA256 passed, archive manifest
bytes matched, and a read-only privileged /proc inspection found no user-process
references. Archives/checksums and all recovery/profile evidence were retained.
Initial checks failed harmlessly on a missing verifier argument and inaccessible
/proc maps; corrected checks completed before removal. Free space rose to ~1.6 GB.

## Current complete notices candidate 04:30

Development candidate 0.1.4-cli.202609180430 includes Drizzle and the three embedded
Bun source additions. Native version smoke, source stability, manifest and extracted
archive verification PASS. Actual install.sh/uninstall.sh in the normal user home
PASS. Restricted-PATH help/version did not create the selected profile. Independently
verified installed hashes for all 459 npm notices, 464 README files, 35 native/JS
source notice files and Chromium credits (757 sections). Nine npm collection gaps
remain. Uninstall exit 0 removed launcher/payload and preserved the profile fixture.
No Loginom/model execution was run on this notices-only candidate.

- Archive: /tmp/loginom-ai-agent-cli-0.1.4-cli.202609180430-linux-x64.tar.gz
- SHA256: 02b4597ea8e2e3f3b9f7afa3257e605eb545eb7ee57f9562883171b1d1de76f1
- Source snapshot: d84670772ad9c4a9e250fbc9257fac281887e4ae495c759f8e886faf8b3681e0
- Build log: /tmp/loginom-cli-notices-202609180430-build.log
- Installed evidence: /tmp/loginom-notices-installed-5s7dn5o_/summary.json
- Ephemeral payload: /dev/shm/loginom-cli-notices-202609180430

Saved archive hash independently verified after copying. No installation remains.
All release/license/native/provider limitations still apply; packaging completeness
is separate from complete license/source-distribution compliance.

## abstract-logging author-linked MIT supplement

Its exact published-commit README links jsumners.mit-license.org. The endpoint
returned 403, so it was not treated as a successful license download. The linked
service's public repository provides users/jsumners.json (copyright James Sumners)
and licenses/MIT.ejs. Their exact service commit is pinned in upstream/sources.json.
The service documentation explains that user records supply author details.

A derived plain-text supplement preserves all four template paragraphs, replacing
only the copyright placeholder with the explicit author name and omitting an
unknown year. HTML whitespace was normalized. Transformation, source URLs and
template/output hashes are recorded; this is not a verbatim package LICENSE.
No new copyright holder or year was invented. This collection result does not
assert legal sufficiency of the entire distribution.

Actual graph collector: 460 notices, 464 README, eight missing entries. All 924
output hashes and host typecheck PASS. Archive 04:30 remains unchanged (459 notices,
nine missing entries); the source addition awaits the next full archive build.

## Declared standard texts with preserved package attribution

Added CC0-1.0 and CC-BY-3.0 texts from an immutable SPDX license-list-data commit,
combined with verbatim published-commit README for spdx-license-ids 3.0.23 and
spdx-exceptions 2.5.0. These match their npm license metadata; README attribution
is preserved, not reconstructed. Standard source URLs/hashes and transformations
are recorded explicitly.

For AWS credential-provider-http 3.972.43, credential-provider-login 3.972.45 and
nested-clients 3.997.13, verified downloaded npm tarball SHA512 against registry
integrity and compared package.json/README bytes with every matching installed
package root. All matched and declare Apache-2.0. Supplements preserve those exact
files followed by the full standard Apache-2.0 text. No absent gitHead or additional
copyright holder was inferred. This resolves text collection gaps without asserting
complete legal/source-distribution compliance.

Actual graph collection: 465 notices and 464 README files, all 929 hashes PASS;
host typecheck PASS. Remaining missing texts: npmcli/agent 4.0.2,
opencode-poe-auth 0.0.1, opentui-spinner 0.0.7. Their metadata/README remain available
but full attributable supplements are not supplied by this change. Archive 04:30
remains unchanged; these additions await a complete rebuild.

## Candidate 05:00 and remaining external acceptance inputs

Full 0.1.4-cli.202609180500 build/native version/source stability/manifest/extracted
archive PASS. Actual install/uninstall PASS with restricted-PATH help/version and
no selected-profile creation. Independently verified all installed 465 npm notice,
464 README, 35 native/JS notice hashes and Chromium credits. Uninstall preserved
the profile fixture and removed launcher/payload. Three npm text gaps remain;
compliance/release status is still incomplete. No Loginom/model run on this candidate.

- Saved archive: /tmp/loginom-ai-agent-cli-0.1.4-cli.202609180500-linux-x64.tar.gz
- SHA256: ad42b2cf58e6b35193e702d07dc843b4b2ae306f39b10694227fb715f1e5cf12
- Source snapshot: 51f465562d7e39519ff1318c79f87051fe915c0461dcc7de0a010990c34ed3d3
- Build log: /tmp/loginom-cli-notices-202609180500-build.log
- Installed evidence: /tmp/loginom-notices-installed-qujutvkt/summary.json
- Ephemeral payload: /dev/shm/loginom-cli-notices-202609180500

Read-only existence checks found no auth.json or CLI config in the default
prod/beta/dev CLI profiles. Common OpenAI/Anthropic/Google/Gemini/OpenRouter/Azure
credential environment variables were absent (values were not inspected or printed).
This does not exclude a nondefault user profile, whose path is still requested.
Desktop auth was not read or copied. Available execution remains Linux x86_64;
native Windows/macOS and real-provider evidence still cannot be claimed.

## Remaining declared-license text supplements — 2026-09-18

Verified registry gitHead trees for @npmcli/agent 4.0.2, opencode-poe-auth 0.0.1,
and opentui-spinner 0.0.7. They do not contain their own root license file;
agent's only license file belongs to a test fixture and was not misattributed.
Downloaded each published tarball, verified registry SHA512 integrity, and compared
package.json/README bytes with all installed copies (1, 4, and 1 respectively).

Added the exact published metadata and README followed by the unmodified standard
ISC/MIT text from SPDX commit 31ba1a50e5397e00a304dbadc76531740e89ee48. Package
license declarations are preserved, as are standard-text placeholders. No author,
year, or missing copyright notice was invented. sources.json pins URLs, gitHead,
tarball integrity, individual hashes, transformation and attributionReview.
These are declared-license supplements, not upstream-authored package LICENSEs.

Collection against the clean 1657a6c07 build graph: 467 package records,
468 notice files plus 464 README files; all 932 output hashes verified,
missing-text list empty. Collector regression: 1 passed / 12 assertions;
package bun typecheck PASS. Inventory status remains incomplete: this closes
standard-text collection, not missing attribution review, nested/native auditing,
AGPL corresponding-source or LGPL relinking/distribution obligations.

An initial ad-hoc hash verifier passed ArrayBuffer to createHash.update and failed;
it was corrected to Uint8Array and all 932 checks passed. No product code changed.
The installed 0.1.4-cli.20260918review artifact predates these supplements; a new
full archive is required before claiming their inclusion in a distribution.

## Nested npm notices — 2026-09-18

The build collector now includes nested LICENSE/NOTICE/COPYING/COPYRIGHT files
under package-relative paths. Directory symlinks are not traversed; nested
node_modules belong to separately selected package roots. Code files such as
bin/license.js are excluded. CopyrightNotice.txt remains recognized.

Records distinguish package and nested scope. A vendored component's license does
not satisfy the containing package's missing own license or suppress its pinned
supplement. Existing canonical-path escape checks also apply to nested files.

Against the final edc68138d artifact's real build graphs: 467 packages, 483 notices
(15 nested) plus 464 README files, all 947 hashes independently verified; missing
own-package texts remains empty. Vendor files include zod-to-json-schema, qs and
cp attribution. One actual-build fixture test/16 assertions and host typecheck
PASS. An initial filename boundary incorrectly excluded CopyrightNotice.txt; the
actual inventory comparison caught this and the corrected test/collector preserves it.

This closes regular-directory nested npm notice collection, not all embedded
native/per-file attribution or corresponding-source/relinking requirements. The
prior final archive is unchanged; these additions require a new complete build.

## Complete Bun src/js source and embedded notices

Downloaded the official Bun source archive for pinned commit
`0d9b296af33f2b851fcbf4df3e9ec89751734ba4`; SHA256
`aa045c1f3ddd3eb41ed8452d8a73eaab3b3322386416ebb1b160a6af6978d3e5`.
Its LICENSE.md exactly matches the already pinned upstream notice hash.
The complete source download remains at
`/tmp/loginom-bun-source-audit/bun-0d9b296af.tar.gz`.

Added a deterministic compressed archive of every src/js entry: 188 regular files
(2259119 bytes) and the internal AGENTS.md -> CLAUDE.md link. Link target remains
inside the included tree. All file bytes and the link target are unchanged;
paths, file hashes, source URL/hash and normalization are in the paired inventory.
No source instructions from this archive were applied to the project.

Compressed source SHA256:
`05472737c62a7029151c1307f379b97bbf81f5094dadff112be7da43cbc0a82d`.
Inventory SHA256:
`e0535426b621b9a8efea2de3e52dabb173a50454d6fc23fdfdb2b4571114644b`.
The archive is 519500 bytes. Its entry/hash set was compared with the source
archive; all 189 match. Existing individual assert/events/url supplements remain.
All 37 native/source notice input file hashes and host typecheck PASS.

The build copies this as licenses/bun/native/bun-js-sources/src-js.tar.gz with an
inventory and explains it in the notices README. It includes unmarked files as
well as 31 files containing explicit copyright/SPDX/permission markers, avoiding
an attribution selection based solely on those markers. This is complete src/js
source collection, not proof of the native Bun/WebKit dependency closure, exact
binary linkage or relinking. Native/per-file and corresponding-source audit remains
incomplete. The prior nested-notices archive has not been modified or relabelled.

## Bun SQLite and Node compatibility headers

The pinned Bun runtime reports Node compatibility 24.3.0 and SQLite 3.53.0.
Its sqlite_source_id() matches SQLITE_SOURCE_ID in the exact Bun archive's
sqlite3.c. Added all six regular files from src/jsc/bindings/sqlite, including
Bun bindings and unchanged original notices. Compressed archive SHA256
`1a4b45f175379c175da44ec340a82d77546bcc65de04418abfb582c1fc552a4a`
(2632576 bytes); every entry hash verified against original bytes.

Bun's nodejs-headers.ts pins 24.3.0 and removes openssl/uv headers. Downloaded
that official headers archive and source archive; both SHA256s match the official
SHASUMS256.txt. The supplied archive follows those exclusions and adds the exact
source LICENSE: 111 files, 316504 compressed bytes, SHA256
`ef0ba45f7a6facbf6cd87dc9da750ae3621e998ead6482ecd6c8edde1b7e725f`.
Paired inventory records origin URLs, source/checksum hashes and transformation.
This is Bun compatibility material; the independent host still uses Node 24.19.0.

All 23 default dependency recipe files under Bun scripts/build/deps now have
component records in the notice inputs. This is source recipe coverage, not an
emitted binary linker map. Existing WebKit nested/per-file and corresponding
source/relinking limitations remain. All 41 native/source file hashes verified;
host typecheck PASS. No archive with these new inputs has yet been built.

## Complete in-tree Bun native source and notices

Added every remaining src entry outside the separately supplied src/js and
src/jsc/bindings/sqlite: 2899 entries, including the internal src/AGENTS.md ->
CLAUDE.md symlink; 46977868 regular-file bytes, unchanged. The deterministic
compressed archive is 8547929 bytes, SHA256
`9df85634489c0f7b1a6076a3c0f456c31bfdd30ba2fef065bec2793358868b64`.
Paired inventory SHA256
`8f021c54503bd494ba4a9c2d587046b2718be27b396fed47c65512e5fb4a6c6c`.
It records the exact source URL/archive hash and transformation.

The union of the three Bun source archives was independently compared with every
non-directory src entry in the original pinned source archive: 3094 names/hashes,
no missing, extra or duplicate entries. This preserves all in-tree material,
including the 527 files found by the earlier attribution-marker scan and files
without those markers. Source instructions were not applied to this project.
All 43 native/source input hashes and host typecheck PASS.

This closes in-tree Bun source/notice collection; external dependency material,
WebKit and actual relinking verification remain separate. A new complete binary
archive has not yet been built with this addition. The previous installed source
candidate remains unchanged.

## ICU 75.1 and runtime-reported native revisions

The pinned Linux Bun reports ICU 75.1, matching the pinned WebKit Dockerfile's
ICU source release. Downloaded the official icu4c-75_1-src.tgz, SHA256
`cb968df3e4d2e87e8b11c49a5d01c787bd13b9545280fc6642f826527618caef`.
Its version header is 75.1. Both named license files (LICENSE and license.html)
are copied unchanged. The full LICENSE matches the ICU release tag's root file;
icu4c/LICENSE in Git is a link to that root. The tag resolves to commit
`7750081bda4b3bc1768ae03849ec70f67ea10625`.

Recorded actual process.versions from pinned Bun. Twelve reported native component
commits match the existing source records, with no mismatch: BoringSSL, libarchive,
mimalloc, picohttpparser, WebKit, zlib, tinycc, lolhtml, c-ares, libdeflate, lshpack,
zstd. Compatibility values such as openssl/v8/uv are preserved as reported values,
not interpreted as independent linked-library identities. Host typecheck PASS.
This adds ICU material and strengthens provenance; it is not a complete linker map.

The full pinned WebKit Git checkout is now available separately in /tmp. GitHub's
codeload endpoint refused archive generation (422); Git fetch/checkout succeeded
without changing the requested commit. Local commit tree equals GitHub API tree
`a7212e5d3aeb41afb46db3f955fb77b60900cfd6`. Its separate source archive is still
being generated; no archive hash or complete distribution PASS is claimed yet.

## Complete TinyCC source and verified WebKit archive

Added the unmodified TinyCC source archive for the revision reported by pinned
Bun, `12882eee073cfe5c7621bcfadf679e1372d4537b`, and its per-file inventory.
All 523 source files match the inventory. Archive SHA256:
`6b50485fcbbfa90a99c56e8e2b6a92014dcd34377d5edb23e1938dc9ec96f0aa`.
All 47 native/source input hashes and host typecheck PASS. The build's existing
source-copy mechanism includes these inputs; a fresh binary build is pending.

The complete WebKit archive passed strict verification against all 464897 Git
blob entries, including 40 symlinks and executable modes. Commit/tree match the
pinned revision and upstream API. See webkit-source-verification.json for hashes.
The first export failed exact comparison because upstream attributes converted
LF to CRLF in a .bat file. A canonical archive was regenerated using temporary
.git/info/attributes disabling export/content transformations, without changing
tracked source or weakening verification. The original export is retained in
/tmp separately. No downloaded source was executed.

The canonical archive remains outside Git at the recorded /tmp path; it is not
published or integrated into the distributable yet. Complete source availability
does not establish successful relinking. Distribution integration, remaining
external source coverage, and actual relinking remain open.
