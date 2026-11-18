# 05. Signing and trust for an offline add-on catalog

Research date: 2026-11-18. Primary sources only. Content of third-party repositories was read as data.

**Versions read** (GitHub links are pinned to these commits unless noted):

| Source | Version / commit |
| --- | --- |
| TUF specification | v1.0.37, dated 2026-10-08 ([spec header](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L1-L18)) |
| TUF TAPs | `21efd97` |
| python-tuf | `develop` @ `df27f75` (latest tag v7.0.1) |
| go-tuf | `master` @ `91a8c4b` (latest tag v2.4.2) |
| tough / tuftool (Rust) | `develop` @ `98d8eb8` |
| cosign | `main` @ `0743bfc`; latest release v3.1.4, published 2026-10-20 ([release](https://github.com/sigstore/cosign/releases/tag/v3.1.4)) |
| Sigstore docs | `main` @ `f742977`, rendered at docs.sigstore.dev |
| Fulcio | `main` @ `b01d056` (latest tag v1.10.1) |
| DSSE | v1.0.2 (2024-05-10) |
| in-toto attestation | `main` @ `50bf017` (latest tag v1.2.0) |
| minisign | 0.12; signify man page dated 2026-07-16 |

**Labels used below.** **[spec]** is normative text. **[code]** is source I read. **[docs]** is what a project says about itself. **[inference]** is my own conclusion and has no source. Nothing in these notes was run or tested.

## Short answer

- **TUF is the only option here that has every required piece as a written standard.** It covers threshold keys, an offline root, root rotation, revocation by re-signing, delegations for trust levels, and freshness.
- **Freshness is TUF's hard part offline.** A spec-conformant client aborts when `timestamp.json` has expired. The reference clients enforce that, so an air-gapped site either needs freshly signed metadata delivered on a schedule or a documented deviation from the spec.
- **Sigstore keyless signing is not a fit for this catalog's trust model.** Signing needs online OIDC and Fulcio. Offline verification of keyless signatures still needs a `trusted_root.json` that changes over time.
- **cosign with self-managed keys and no transparency log does work offline.** It adds a signature container (the Sigstore bundle), not a trust model.
- **Plain Ed25519 (minisign or signify) is simple, but has no rotation, revocation or freshness.** Wrapping a signed JSON index in DSSE and in-toto statements can express "reviewed by vendor" and "tested". Revocation, rotation and freshness then have to be designed by hand, which rebuilds a subset of TUF.
- **Russia: no act I read names GOST, or any algorithm, for a vendor's update or package signatures.** The FSTEC acts require the operator to check the integrity and authenticity of updates and forbid uncontrolled installation. Where cryptography protects information in a state information system, the FSB requires FSB-certified crypto tools. See §5 for the scope of what was read.

---

## 1. TUF (The Update Framework)

### 1.1 Roles and thresholds [spec]

- **Root.** It delegates trust to the keys of all other top-level roles. Clients must ship with trusted root keys. Root private keys "MUST be kept very secure and thus should be kept offline" ([§ Root role](https://theupdateframework.github.io/specification/v1.0.37/#root)).
- **Targets.** It signs metadata describing target files, not the files themselves. It can delegate full or partial trust to other roles, and those roles can delegate further ([§ Targets role](https://theupdateframework.github.io/specification/v1.0.37/#targets)).
- **Snapshot.** It lists the latest version of all targets metadata, including delegated roles. This prevents mix-and-match attacks ([§ Snapshot role](https://theupdateframework.github.io/specification/v1.0.37/#snapshot)).
- **Timestamp.** "an automated process periodically signs a timestamped statement containing the hash of the snapshot file". The timestamp key "must be kept online" ([§ Timestamp role](https://theupdateframework.github.io/specification/v1.0.37/#timestamp)).
- **Thresholds.** Every role, including each delegated role, has keyids and a threshold. Each key counts at most once toward the threshold ([§ targets.json, DELEGATIONS](https://theupdateframework.github.io/specification/v1.0.37/#file-formats-targets); [§ Update the timestamp role, step 2](https://theupdateframework.github.io/specification/v1.0.37/#update-timestamp)).
- **Offline keys.** "All keys, except those for the timestamp and mirrors roles, should be stored securely offline". The spec does not prescribe how keys are stored ([§ Key management and migration](https://theupdateframework.github.io/specification/v1.0.37/#key-management-and-migration)).

### 1.2 Key rotation [spec]

- **Replacing a key.** To replace any top-level key, root signs a new `root.json`. A new root is signed with both the old and the new root keys and is published by version, for example `3.root.json` ([§ Key management](https://theupdateframework.github.io/specification/v1.0.37/#key-management-and-migration)).
- **Catching up from an old root.** A client walks `N+1.root.json` forward. Each new root must be signed by a threshold of its predecessor's keys and of its own keys, so an outdated client can retrace several rotations ([§ Update the root role](https://theupdateframework.github.io/specification/v1.0.37/#update-root); [§ Key management](https://theupdateframework.github.io/specification/v1.0.37/#key-management-and-migration)).
- **Rotated timestamp or snapshot keys.** The client deletes its trusted timestamp and snapshot metadata, which recovers from fast-forward attacks ([§ Update the root role, step 11](https://theupdateframework.github.io/specification/v1.0.37/#update-root)).

### 1.3 Revocation [spec]

- **A delegation.** "Any delegation can be revoked at any time: the delegating role needs only to sign new metadata that no longer contains that delegation" ([§ Targets role](https://theupdateframework.github.io/specification/v1.0.37/#targets)).
- **A delegated developer key.** The delegating role replaces the key in its own signed metadata ([§ Key management](https://theupdateframework.github.io/specification/v1.0.37/#key-management-and-migration)).
- **A bad package version.** The spec has no "revoked" flag. A version is withdrawn by removing it from the targets metadata (or from a delegated role's metadata). Snapshot and timestamp then move forward. [inference: this follows from the client fetching only targets listed in current, timely metadata ([§ Fetch target, step 2](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L1555-L1560)). Any "this version is known bad, uninstall it" message would go in the opaque `custom` field described in §4.1, which the application interprets.]
- **Rollback.** Rollback protection prevents an attacker from serving an older metadata set that still lists the withdrawn version.
  - Clients "MUST NOT replace a metadata file with a version number less than the one currently trusted" ([VERSION field definition, raw spec L725–L728](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L725-L728)).
  - The same rule appears in the rollback goal ([§ Goals](https://theupdateframework.github.io/specification/v1.0.37/#goals-to-protect-against-specific-attacks)) and in the timestamp check ([§ Update the timestamp role, step 3](https://theupdateframework.github.io/specification/v1.0.37/#update-timestamp)).
- **Self-revocation (TAP 20).** TAP 20 is **Accepted**. It lets a key holder revoke its own role without waiting for the delegator ([TAP index](https://github.com/theupdateframework/taps/blob/21efd9762c6bae5c6f61199d1fce7756c9dd18d2/README.md); [TAP 20](https://github.com/theupdateframework/taps/blob/21efd9762c6bae5c6f61199d1fce7756c9dd18d2/tap20.md)). It is not part of the v1.0.37 text. The spec's TAP-support list names only TAPs 6, 9, 10 and 11 ([spec lines 216–230](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L216-L230)).

### 1.4 Freshness and the air-gap problem

**What the spec requires [spec].**
- Every metadata file has `expires`, and "Clients MUST NOT trust an expired file" ([§ root.json, EXPIRES](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L730-L735)).
- An expired timestamp fails the update: "If the new timestamp metadata file has expired, discard it, abort the update cycle, and report the potential freeze attack" ([§ Update the timestamp role, step 4](https://theupdateframework.github.io/specification/v1.0.37/#update-timestamp)).
- The same check applies to root, snapshot and targets ([raw spec, lines 1363–1366, 1474–1478, 1521–1525](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L1363-L1525)).
- A target is fetched only if current targets metadata describes it ([§ Fetch target](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L1555-L1560)).
- The spec has no fallback to cached metadata after expiry.

**What the spec acknowledges [spec].**
- A repository can freeze clients by withholding new root metadata, but "these freeze attacks are limited by the expiration time of the latest root metadata" ([§ Key management](https://theupdateframework.github.io/specification/v1.0.37/#key-management-and-migration)).
- Under "Future directions", the spec lists an application-enablable "no, my clock is *supposed* to be wrong" mode as an open question ([§ Support for bogus clocks](https://theupdateframework.github.io/specification/v1.0.37/#support-for-bogus-clocks)).

**What the clients do [code].**

| Client | Behaviour | Source |
| --- | --- | --- |
| python-tuf `ngclient` | Raises `ExpiredMetadataError("timestamp.json is expired")`. Has no offline mode. | [trusted_metadata_set.py L283–L286](https://github.com/theupdateframework/python-tuf/blob/df27f75755de061b1e67885b554b18e5b9989eb6/tuf/ngclient/_internal/trusted_metadata_set.py#L283-L286); [config.py](https://github.com/theupdateframework/python-tuf/blob/df27f75755de061b1e67885b554b18e5b9989eb6/tuf/ngclient/config.py) has no such option |
| python-tuf, issue #2359 | Open issue (2023): "regardless of the validity of already-stored materials, online access is always required" | [#2359](https://github.com/theupdateframework/python-tuf/issues/2359) |
| python-tuf, PR #2472 | "Offline mode" PR closed without merge on 2023-11-22 | [PR #2472](https://github.com/theupdateframework/python-tuf/pull/2472) |
| python-tuf, issue #388 | Open since 2016: "Can TUF be used to update offline systems?" | [#388](https://github.com/theupdateframework/python-tuf/issues/388) |
| python-tuf, custom transport | Downloads go through a pluggable `FetcherInterface`, so metadata can come from a local folder instead of HTTP. Expiry is still enforced. | [updater.py L105–L130](https://github.com/theupdateframework/python-tuf/blob/df27f75755de061b1e67885b554b18e5b9989eb6/tuf/ngclient/updater.py#L105-L130) |
| go-tuf v2 | `UnsafeLocalMode` makes no network calls and "deviate[s] from the TUF specification section 5.3 to 5.7". The source comment says "expiration dates are verified"; I did not trace that into `UpdateTimestamp` myself. | [config.go L48–L50](https://github.com/theupdateframework/go-tuf/blob/91a8c4ba652ef58584985a97eec90afd0684c24e/metadata/config/config.go#L48-L50); [updater.go L116–L156](https://github.com/theupdateframework/go-tuf/blob/91a8c4ba652ef58584985a97eec90afd0684c24e/metadata/updater/updater.go#L116-L156) |
| tough (Rust) | `ExpirationEnforcement::Unsafe`: "available for certain offline use cases, does NOT provide TUF security guarantees" | [tough/src/lib.rs L83–L100](https://github.com/awslabs/tough/blob/98d8eb8b2ce63515d9b4981c938ef6453c5b5771/tough/src/lib.rs#L83-L100) |

**A reference point for expiry periods [spec].** PEP 458 recommends that root and targets expire in one year. It recommends that timestamp and snapshot expire in one day, "because a CDN or mirror SHOULD synchronize itself with PyPI every day" ([PEP 458, Metadata Expiry Times](https://peps.python.org/pep-0458/#metadata-expiry-times)).

**Answer to "what happens when the timestamp expires in an air-gapped network" [inference from the rows above].** A conformant client refuses every install and update from that repository until it receives a fresh `timestamp.json`, and a fresh `snapshot.json` if that has also expired. Realistic options:

1. **Ship a separate offline channel with longer expiry.** Sign timestamp and snapshot for the offline-bundle channel with longer expiry (weeks). The administrator re-imports a fresh bundle before it lapses. This stays spec-conformant, but it widens the window in which a stale catalog is accepted.
2. **Let the administrator fetch a fresh timestamp.** On a schedule, the administrator brings in a fresh `timestamp.json` (a few KB) through the import path.
3. **Document a deviation.** On expiry, keep using the last verified metadata for already-installed items. Keep rollback protection: never accept a lower version. Show "catalog stale since …". This is what tough's `Unsafe` mode and python-tuf #2359 aim at. It is outside the spec.

**How Debian apt handles the same tension.** apt's `Check-Valid-Until` "controls if APT should try to detect replay attacks". apt also offers `Valid-Until-Min`, which "can be used to increase the valid time on seldom updated (local) mirrors … instead of disabling the check entirely" ([sources.list(5), Debian trixie](https://manpages.debian.org/trixie/apt/sources.list.5.en.html)).

### 1.5 Mirrors [spec]

- Every repository has one or more mirrors. Mirror information may be hard-coded in the client or published as `mirrors.json`, which can optionally be signed by a mirrors role ([§ Mirrors role](https://theupdateframework.github.io/specification/v1.0.37/#mirrors)).
- Mirrors may be full or partial ([§ The repository](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L397-L416)).
- `mirrors.json` is ordered: the first matching mirror is tried first ([§ mirrors.json](https://theupdateframework.github.io/specification/v1.0.37/#file-formats-mirrors)).
- Security does not depend on the mirror.
  - A mirror "cannot prevent updates from good mirrors" ([§ Goals](https://theupdateframework.github.io/specification/v1.0.37/#goals-to-protect-against-specific-attacks)).
  - "At worst, such an adversary can deny updates to users if no good mirrors are accessible" ([§ Threat model, raw spec L366–L371](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L366-L371)).
- [inference] An internal mirror, a file share or a USB copy of the repository directory are all just mirrors. No git host is involved.

### 1.6 What it takes to operate

- **Libraries [docs/code].**
  - python-tuf has a metadata API and a client (`ngclient`) ([repo](https://github.com/theupdateframework/python-tuf)).
  - go-tuf v2 has the same pieces ([repo](https://github.com/theupdateframework/go-tuf)).
  - Sigstore's docs name both as ways to write a TUF repository ([custom components](https://docs.sigstore.dev/cosign/system_config/custom_components/)).
- **Repository tools [docs].**
  - **tuftool** is a CLI for generating and signing TUF repositories, using local key files or AWS KMS ([tuftool README](https://github.com/awslabs/tough/blob/98d8eb8b2ce63515d9b4981c938ef6453c5b5771/tuftool/README.md)).
  - **tuf-on-ci** supports hardware keys and threshold signing events. Its maintenance manual requires GitHub Actions, GitHub Pages and a GitHub App or `GITHUB_TOKEN` ([README](https://github.com/theupdateframework/tuf-on-ci/blob/d98bc152e5e3b7fbe325e51e4dac38a9e3185443/README.md); [REPOSITORY-MAINTENANCE.md](https://github.com/theupdateframework/tuf-on-ci/blob/d98bc152e5e3b7fbe325e51e4dac38a9e3185443/docs/REPOSITORY-MAINTENANCE.md)). That conflicts with "no hosting platform assumed".
  - **Repository Service for TUF** is a service-based alternative ([repo](https://github.com/repository-service-tuf/repository-service-tuf)). Not evaluated.
- **Operational burden [inference].**
  - An offline root ceremony, for example 2-of-3 hardware keys, run each time root changes.
  - Offline targets keys for the vendor role.
  - One online key (timestamp, often snapshot too) re-signing on a schedule shorter than the expiry period.
  - A process to re-issue timestamp and snapshot for the offline channel.

---

## 2. Sigstore / cosign

### 2.1 Keyless signing [docs]

- **Flow.** The client makes an ephemeral key pair and sends Fulcio a certificate request together with an OIDC identity token. Fulcio issues "a short-lived certificate bound to the provided identity and public key" ([Sigstore overview](https://docs.sigstore.dev/about/overview/)). The signing event is logged in Rekor ([cosign signing overview](https://docs.sigstore.dev/cosign/signing/overview/)).
- **Certificate lifetime.** Fulcio certificates are "valid for 10 minutes" ([Fulcio overview](https://docs.sigstore.dev/certificate_authority/overview/)).
- **Proof of signing time.** Verification usually happens after the certificate has expired. The bundle "must include at least one transparency log's signed entry timestamp or an RFC3161 timestamp to provide proof that signing occurred during the certificates validity window" ([Bundle format](https://docs.sigstore.dev/about/bundle/)).
- **OIDC token.** It must have `aud: "sigstore"`, and its `iss` must be one of the issuers in the Fulcio configuration ([OIDC usage in Fulcio](https://docs.sigstore.dev/certificate_authority/oidc-in-fulcio/)).

### 2.2 Supported OIDC providers [docs/code]

- **Narrative list on the public docs** ([OIDC usage in Fulcio](https://docs.sigstore.dev/certificate_authority/oidc-in-fulcio/)):
  - Dex at `oauth2.sigstore.dev` (fronting GitHub, Google and Microsoft), and Google directly
  - GitHub Actions and GitLab CI
  - SPIFFE
  - Kubernetes on AWS, Azure and Google Cloud
- **Issuer list in the Fulcio repository's [`config/identity/config.yaml`](https://github.com/sigstore/fulcio/blob/b01d056a925d1f15d1315676d454adf46b6b6629/config/identity/config.yaml)** ([integration guide: "Add the new issuer to the configuration"](https://github.com/sigstore/fulcio/blob/b01d056a925d1f15d1315676d454adf46b6b6629/docs/oidc.md)). [inference] This is the list for the public instance.
  - accounts.google.com and oauth2.sigstore.dev (Dex)
  - GitHub Actions and gitlab.com, plus several other GitLab hosts
  - Buildkite, Buddy, CircleCI and Codefresh
  - Chainguard (`issuer.enforce.dev`), Hellō (`issuer.hello.coop`), Kaggle, IBM (`sigstore.verify.ibm.com`) and the Eclipse Foundation. These names come from the `description` fields in the file.
  - Kubernetes issuers on AKS, EKS and GKE
- **Private Fulcio.** It accepts whatever issuers its operator configures. Cosign's own example uses `--oidc-provider="url=https://idp.internal,…"` ([custom components](https://docs.sigstore.dev/cosign/system_config/custom_components/)).
- [inference] None of the public-instance issuers is a Russian identity provider. Vendor-side keyless signing against the public instance therefore depends on Google, Microsoft, GitHub or GitLab accounts.

### 2.3 Self-managed keys and fully offline use [docs/code]

- **Key types.** `cosign generate-key-pair` creates a password-encrypted key pair. KMS-backed keys are also supported. "Cosign supports RSA, ECDSA, and ED25519 keys" ([Signing with self-managed keys](https://docs.sigstore.dev/cosign/key_management/signing_with_self-managed_keys/)).
- **Signing defaults [code].** Read on `main` @ `0743bfc`. The same logic is present at tag v3.1.4: the `use-signing-config` default and deprecation, the Rekor skip, the error text and the config loading ([v3.1.4 signblob.go L112–L114](https://github.com/sigstore/cosign/blob/v3.1.4/cmd/cosign/cli/options/signblob.go#L112-L114); [v3.1.4 common.go](https://github.com/sigstore/cosign/blob/v3.1.4/cmd/cosign/cli/signcommon/common.go)).
  - `sign-blob` uses a TUF-provided signing config by default (`--use-signing-config` defaults to `true`). That flag is deprecated, with "an offline signing flag will be added in the future" ([options/signblob.go L78–L80](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/cmd/cosign/cli/options/signblob.go#L78-L80)).
  - Upload to Rekor is skipped only when the signing config lists no Rekor URL ([signcommon/common.go L119–L128](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/cmd/cosign/cli/signcommon/common.go#L119-L128)).
  - `--tlog-upload=false` is rejected together with a signing config. The error tells the user to provide a signing config without a transparency log service ([common.go L524–L525](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/cmd/cosign/cli/signcommon/common.go#L524-L525)).
  - With `--signing-config <file>` and `--key`, cosign reads the config from the file. It fetches the trusted root from TUF only if the config lists services or no key is given ([common.go L536–L600](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/cmd/cosign/cli/signcommon/common.go#L536-L600)).
  - [inference, not tested] Signing fully offline with your own key therefore means passing a local signing config that lists no services.
- **Verification [docs/code].**
  - `verify-blob --key … --bundle …` is supported. The trusted root "Cosign fetches … from TUF, unless you provide one via --trusted-root" ([cosign_verify-blob.md](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/doc/cosign_verify-blob.md)).
  - `--insecure-ignore-tlog` exists for signatures that were never uploaded ([same page](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/doc/cosign_verify-blob.md)).
  - v3.0.4: "Don't require a trusted root to verify offline with a key (#4613)" ([CHANGELOG](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/CHANGELOG.md)).
  - The `--offline` flag was deprecated in v3.0.3 ([same CHANGELOG](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/CHANGELOG.md)).
  - **Contradiction.** The cosign README's "Verify a container in an air-gapped environment" section still shows `--offline`. It labels itself "**This section is out of date.**" ([README](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/README.md#verify-a-container-in-an-air-gapped-environment)). Its commands should not be treated as current.
  - **Changelog gap.** `CHANGELOG.md` on `main` ends at v3.0.5, while tags go up to v3.1.4. I did not read release notes for v3.1.x.
- **Offline keyless verification [docs].** It needs the trusted root from the public TUF repository. "The contents of this file will change without notification. By not using TUF, you will need to build your own mechanism to keep your airgapped copy of this file up-to-date" ([cosign README, air-gapped section](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/README.md#verify-a-container-in-an-air-gapped-environment)).

### 2.4 Running without public Sigstore infrastructure [docs]

- **Ways to point cosign at custom Fulcio, Rekor and CT log** ([custom components](https://docs.sigstore.dev/cosign/system_config/custom_components/)):
  - (1) the `scaffolding` project
  - (2) your own TUF repository, built with go-tuf or python-tuf
  - (3) `cosign trusted-root create` plus `--trusted-root`, with a static `signing-config.json`. "Both configuration files are static. Generate them once and distribute to signing and verification hosts."
  - (4) environment variables
- **scaffolding** targets Kubernetes. It "is meant to make it easier to test projects that utilize sigstore" ([scaffolding README](https://github.com/sigstore/scaffolding/blob/main/README.md)).
- **Rekor v2 (rekor-tiles)** ships a `rekor-server-posix` binary: "POSIX-based storage (lightweight, no cloud dependencies)" ([rekor-tiles README](https://github.com/sigstore/rekor-tiles/blob/accb9fd3dc86abb0dde10cb04bca36a99fe0b9e2/README.md)).
- **Fulcio** supports KMS providers and PKCS#11 HSMs ([Fulcio README](https://github.com/sigstore/fulcio/blob/b01d056a925d1f15d1315676d454adf46b6b6629/README.md)). Its certificate specification "applies to all instances of Fulcio, including the production instance and all private instances" ([same README](https://github.com/sigstore/fulcio/blob/b01d056a925d1f15d1315676d454adf46b6b6629/README.md)).
- [inference] A private stack means operating Fulcio, an OIDC provider, Rekor and/or a timestamp authority, and a CT log, plus a TUF repository or a static trusted root. That is more infrastructure than the whole catalog. For a single vendor signer, it buys transparency and identity binding rather than offline robustness.

### 2.5 Revocation [docs]

- **Recovery from compromised Sigstore services.** The TUF root of trust "provides strong revocation abilities for all services managed by Sigstore". Compromised material "can be marked as such, with an indication of the compromise time" ([threat model](https://docs.sigstore.dev/about/threat-model/)).
- **Compromised OIDC accounts.** "OIDC account compromise is not handled by Sigstore" ([threat model](https://docs.sigstore.dev/about/threat-model/)).
- **Revoking an artifact.** The docs suggest a policy, not a mechanism: "a small organization may be able to meet their security needs by requiring signatures from one fixed party, with a blocklist for revoked artifacts" ([threat model](https://docs.sigstore.dev/about/threat-model/)).

---

## 3. Plain Ed25519 signatures and signed JSON indexes

### 3.1 minisign [docs]

- **Algorithm.** Ed25519. The current signature format is prehashed: `ED` = `ed25519(Blake2b-512(<file data>))`. "New implementations must use the hashed signature format" ([minisign docs](https://jedisct1.github.io/minisign/)).
- **Trusted comment.** The second comment line "cannot be modified without the secret key". It is covered by a global signature: `ed25519(<signature> || <trusted_comment>)` ([minisign docs](https://jedisct1.github.io/minisign/)). [inference] It can carry metadata such as the catalog version, but it is one line and not structured.
- **Key ID and key storage.** The key ID is 8 random bytes. The secret key is stored encrypted, with a scrypt-based KDF (`Sc`, `crypto_pwhash_scryptsalsa208sha256_*_SENSITIVE`) ([minisign docs](https://jedisct1.github.io/minisign/)).
- **Not covered.** The documentation does not mention rotation, revocation, expiry or multiple keys ([minisign docs](https://jedisct1.github.io/minisign/); the words "revok", "rotat" and "expir" do not occur in the page text).
- **signify compatibility.** "Minisign creates signatures that can be verified by `signify`", but not the reverse ([minisign docs](https://jedisct1.github.io/minisign/)).

### 3.2 signify [docs]

- **What it does.** Creates and verifies signatures. It has a checksum mode (`-C`) that verifies a signed SHA256 list and then each file. It can embed signatures in gzip archives (`-z`) ([signify(1)](https://man.openbsd.org/signify)).
- **Not covered.** The man page does not cover rotation or revocation ([signify(1)](https://man.openbsd.org/signify); the same three words do not occur).
- **OpenBSD's rotation practice.**
  - "we generate a new key pair for the release after next". The next key ships inside the current signed release ([Unangst, BSDCan 2015, on openbsd.org](https://www.openbsd.org/papers/bsdcan-signify.html)).
  - On revocation: "Revocation is probably a cure worse than the disease" ([same paper](https://www.openbsd.org/papers/bsdcan-signify.html)).

### 3.3 DSSE envelope [spec]

- **Envelope.** `{payload, payloadType, signatures:[{keyid, sig}]}`. "An envelope MAY have more than one signature" ([DSSE envelope v1.0.2](https://github.com/secure-systems-lab/dsse/blob/75a79b6ed61c63dabf291657e076d120d95a39a1/envelope.md)).
- **What is signed.** The signature covers `PAE(UTF8(PAYLOAD_TYPE), SERIALIZED_BODY)`, so the payload type is authenticated ([DSSE protocol](https://github.com/secure-systems-lab/dsse/blob/75a79b6ed61c63dabf291657e076d120d95a39a1/protocol.md)).
- **Key ID.** `KEYID` is an "unauthenticated hint" and "**MUST NOT** be used for security decisions" ([DSSE protocol](https://github.com/secure-systems-lab/dsse/blob/75a79b6ed61c63dabf291657e076d120d95a39a1/protocol.md)).
- **Thresholds.** A `(t, n)`-ENVELOPE is defined as valid if at least `t` of `n` unique trusted keys verify; `t` is application-specific ([DSSE protocol, Multi-signature Verification](https://github.com/secure-systems-lab/dsse/blob/75a79b6ed61c63dabf291657e076d120d95a39a1/protocol.md#multi-signature-verification)).
- **Use for TUF metadata.** python-tuf can read TUF metadata wrapped in DSSE (`EnvelopeType.SIMPLE`, marked "experimental") ([config.py](https://github.com/theupdateframework/python-tuf/blob/df27f75755de061b1e67885b554b18e5b9989eb6/tuf/ngclient/config.py)).

### 3.4 in-toto attestations [spec]

- **Statement v1.** `{"_type":"https://in-toto.io/Statement/v1", "subject":[{name, digest}], "predicateType":"<URI>", "predicate":{…}}`. Each subject MUST have a `digest` ([Statement spec](https://github.com/in-toto/attestation/blob/50bf01716982189898823e90586075f37cd9bb7d/spec/v1/statement.md)).
- **Vetted predicates that fit "reviewed" and "tested"** ([predicates index](https://github.com/in-toto/attestation/blob/50bf01716982189898823e90586075f37cd9bb7d/spec/predicates/README.md)):
  - **Simple Verification Result (SVR)**, `https://in-toto.io/attestation/svr/v0.2`. "communicates that an artifact has been evaluated against one or more policies". It has `verifier.id`, `verifier.policies`, `timeCreated` and `properties` ([svr.md](https://github.com/in-toto/attestation/blob/50bf01716982189898823e90586075f37cd9bb7d/spec/predicates/svr.md)).
  - **Test Result**, `https://in-toto.io/attestation/test-result/v0.1`. It has `result: PASSED|WARNED|FAILED` and `configuration` ([test-result.md](https://github.com/in-toto/attestation/blob/50bf01716982189898823e90586075f37cd9bb7d/spec/predicates/test-result.md)).
  - **SLSA Verification Summary (VSA)**, `https://slsa.dev/verification_summary/v1`. It records a verifier's decision about an artifact ([vsa.md](https://github.com/in-toto/attestation/blob/50bf01716982189898823e90586075f37cd9bb7d/spec/predicates/vsa.md); [SLSA v1.2 VSA](https://slsa.dev/spec/v1.2/verification_summary)).

### 3.5 Minimal secure scheme without TUF [inference]

Everything below is my design reasoning. Where it borrows a mechanism, the owner is linked.

1. **Pinned root of trust.** Ship 2–3 vendor root public keys in the app, with a threshold (for example 2-of-3). Keep the private keys offline on hardware tokens. This mirrors [TUF root](https://theupdateframework.github.io/specification/v1.0.37/#root) and [DSSE (t, n)](https://github.com/secure-systems-lab/dsse/blob/75a79b6ed61c63dabf291657e076d120d95a39a1/protocol.md#multi-signature-verification).
2. **A signed key list (`keys.json`, version N) issued by the root keys.** It names the online "catalog" key, the "review" key and any community-publisher keys. Rotate by publishing N+1, signed by both the old and new root thresholds, as [TUF root chaining](https://theupdateframework.github.io/specification/v1.0.37/#key-management-and-migration) does.
3. **A signed `catalog.json`.** It carries a monotonic `version` and an `expires`. For each package version it lists the content digest, the trust level, a list of attestation references and a `revoked` list. The client rejects any catalog with a lower version than the one it last stored. This mirrors [TUF rollback protection](https://theupdateframework.github.io/specification/v1.0.37/#update-timestamp).
4. **Detached attestations per package.** Use DSSE envelopes carrying in-toto statements: SVR for "reviewed by vendor", Test Result for "tested on examples". Each is signed by its own key.
5. **An air-gap policy for `expires`.** Decide explicitly what happens on expiry; compare apt's `Valid-Until-Min` above.

Conclusion: this is a subset of TUF, with no delegation, snapshot or mirror logic. It is reasonable only if the team accepts maintaining its own security-critical format.

---

## 4. How vendor review is expressed as a separate signature in real systems

### 4.1 TUF delegations [spec / proposal]

- **Delegation fields.**
  - Delegations carry `paths` or `path_hash_prefixes`, a per-role `threshold` and `terminating` ([§ targets.json](https://theupdateframework.github.io/specification/v1.0.37/#file-formats-targets)).
  - A terminating delegation "causes any further statements about a package that are not made by the delegated party or its descendants to be ignored" ([raw spec L1040–L1055](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L1040-L1055)).
  - Each target entry can carry an opaque `custom` object that "will be made available to the client application" ([raw spec L1000–L1009](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L1000-L1009)).
- **The client API does not say which role signed [code].** python-tuf `Updater.get_targetinfo()` returns only a `TargetFile` ([updater.py L187](https://github.com/theupdateframework/python-tuf/blob/df27f75755de061b1e67885b554b18e5b9989eb6/tuf/ngclient/updater.py#L187)). go-tuf `GetTargetInfo()` returns only `*metadata.TargetFiles` ([updater.go L202](https://github.com/theupdateframework/go-tuf/blob/91a8c4ba652ef58584985a97eec90afd0684c24e/metadata/updater/updater.go#L202)).
- **Mapping onto the three trust levels [inference].** The trust level has to be encoded in the **target path namespace**, not in `custom`, because a community role could write any `custom` value. Delegated `paths` restrict which role may sign which prefix.
  - `vendor/*` → signed by top-level `targets` or a vendor role (offline keys)
  - `reviewed/*` → delegated to a `vendor-review` role (vendor key), which re-lists the same digest as the community item after review
  - `community/*` → delegated to a `community` role (an online key or per-author keys), with `terminating: true`
  - The client reads the level from the prefix of the path it resolved.
- **Requiring both author and vendor signatures.**
  - **TAP 3 "Multi-role delegations"** (Status: Accepted). It lets "a target … be delegated to a combination of roles … all of whom must sign the same hashes and length of the target" ([TAP 3](https://github.com/theupdateframework/taps/blob/21efd9762c6bae5c6f61199d1fce7756c9dd18d2/tap3.md)). It is not in the v1.0.37 text ([spec TAP-support list](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L216-L230)).
  - **TAP 4.** Similar AND logic across separate repositories ([TAP 4](https://github.com/theupdateframework/taps/blob/21efd9762c6bae5c6f61199d1fce7756c9dd18d2/tap4.md)).
- **PyPI's designs.**
  - **PEP 458** (Status: **Accepted**). All projects are signed by PyPI's online keys through `bins` delegations ([PEP 458](https://peps.python.org/pep-0458/)).
  - **PEP 480** (Status: **Draft**, so proposed, not deployed). It adds `claimed` (offline key), `recently-claimed` (online key) and `unclaimed` delegations, with developers signing their own projects ([PEP 480, Maximum Security Model](https://peps.python.org/pep-0480/#maximum-security-model)). This is the closest published analog to the three trust levels.

### 4.2 in-toto / SLSA attestations [spec]

- **The verifier is a named party.** The SLSA VSA consumer procedure requires "Verify that the `verifier` matches the public key (or equivalent) used to verify the signature" and states "Consumers MUST accept only specific (signer, verifier) pairs" ([SLSA v1.2 VSA](https://slsa.dev/spec/v1.2/verification_summary)). A "reviewed by vendor" attestation maps directly: the vendor is the verifier, and `verificationResult` is PASSED.
- **The limit.** "A VSA does not protect against compromise of the verifier, such as by a malicious insider" ([SLSA v1.2 VSA](https://slsa.dev/spec/v1.2/verification_summary)).
- **SVR.** It is the framework-neutral variant and explicitly allows "expiration" to be added by verifiers ([svr.md](https://github.com/in-toto/attestation/blob/50bf01716982189898823e90586075f37cd9bb7d/spec/predicates/svr.md)).

### 4.3 Sigstore bundles [docs]

- **Contents.** A bundle holds verification material (a certificate, or a public-key **hint** "delivered out of band"), optional transparency-log entries and timestamps, and the content (a message signature or a DSSE envelope) ([Bundle format](https://docs.sigstore.dev/about/bundle/)).
- **Attesting with cosign.** `cosign attest-blob` and `verify-blob-attestation` sign and verify in-toto statements in a bundle. The documented example uses a local key, `--key cosign.key` ([cosign CHANGELOG v2.6.0](https://github.com/sigstore/cosign/blob/0743bfcff5f81ec49ffcea2f61b98938f6ba70ec/CHANGELOG.md)).
- [inference] One package can therefore carry several bundles: an author signature, a vendor-review attestation and a test attestation.

### 4.4 Marketplaces in production [docs]

- **VS Code Marketplace.**
  - "The Visual Studio Marketplace signs all extensions when they're published". VS Code verifies that signature at install ([Extension runtime security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)).
  - Publishers can get a blue check by proving domain ownership ([same page](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)).
  - A malicious extension "is removed from the Marketplace and added to a block list". If it is already installed, "it's automatically uninstalled by VS Code" ([same page](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)).
  - A VSIX install from a local share is supported, and "auto update for that extension is disabled by default" ([Extension Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)).
  - The pattern: one platform signature, separate identity verification, and a pushed revocation list.
- **npm registry.**
  - The registry signs `${package.name}@${package.version}:${package.dist.integrity}` with ECDSA P-256.
  - Its keys are published at `/-/npm/v1/keys` with an `expires` field ([npm registry signatures](https://docs.npmjs.com/about-registry-signatures)).
  - [inference] The registry signature looks like a separate layer from the publisher's provenance. The page lists "Generating provenance statements" only as a separate navigation entry and does not relate the two ([npm docs](https://docs.npmjs.com/about-registry-signatures)).

---

## 5. Russian enterprise context: GOST for signatures

### How this section was researched

- **Official source used.** The Official Internet Portal of Legal Information, `publication.pravo.gov.ru`. It publishes original and amending acts as scanned PDFs, not consolidated texts. I read the listed pages of those scans.
- **Sites I could not reach.** `fstec.ru` (connection refused or timeout), `government.ru`, `pravo.gov.ru`, `digital.gov.ru` and `reestr.digital.gov.ru` did not answer from this network.
- **Finding aid.** I used the consolidated texts on legalacts.ru only to locate clauses. They are not cited as sources, and any clause seen only there is marked.
- **Three separate questions.**
  - (A) Does an act prescribe an algorithm for a vendor's update or package signature?
  - (B) Does an act require checking the integrity or source of updates, without naming an algorithm?
  - (C) Does an act require certified (FSB) cryptography when crypto protects information or makes a signature legally significant?

### What the acts read say

**1. FSTEC Order No. 239 of 25.12.2017 (security of significant objects of critical information infrastructure).**
- Mandatory measures in the original appendix ([official publication](http://publication.pravo.gov.ru/document/0001201803270041), PDF p. 28):
  - ОПО.1 "Поиск, получение обновлений программного обеспечения от доверенного источника"
  - ОПО.2 "Контроль целостности обновлений программного обеспечения"
  - Both are marked "+" for all three significance categories. → (B)
- **Item 29.3.3**, added by FSTEC Order No. 35 of 20.02.2020 and in force from 01.01.2023 ([official publication](http://publication.pravo.gov.ru/document/0001202009140010), PDF pp. 2 and 5). It applies to applied software introduced into a significant object. The developer must define "способов получения пользователями программного обеспечения его обновлений, проверки их целостности и подлинности". No algorithm is named. → (B)
- **Item 31, as amended by the same Order No. 35** ([PDF p. 6](http://publication.pravo.gov.ru/document/0001202009140010)). A significant object must not allow "наличие удаленного доступа к программным и программно-аппаратным средствам … для обновления или управления со стороны лиц, не являющихся работниками субъекта". [inference] A vendor-driven push or auto-update into such objects is a problem. An administrator-imported offline bundle is not.
- **Edition.** The finding aid shows a consolidated edition dated 28.08.2024. I did not check later amendments on the official portal.

**2. FSTEC Order No. 117 of 11.04.2025 (information security in state and other public-sector information systems)** ([official publication](http://publication.pravo.gov.ru/document/0001202506170011)).
- **Item 1.** The requirements are for protection "(некриптографическими методами)" (PDF p. 3).
- **Item 7.** Where crypto tools are used, the FSB's requirements apply (PDF p. 4). → (C)
- **Item 39** (PDF p. 18). Update management must include "проведение проверки подлинности и целостности обновлений", testing before production and an operator permission to apply them. "Бесконтрольная установка обновлений программных, программно-аппаратных средств не допускается." No algorithm is named. → (B)
- **Effective date.** The finding aid gives 01.03.2026, replacing FSTEC Order No. 17. I did not read that on the official scan.

**3. FSB Order No. 321 of 22.08.2026 (cryptographic protection of information in state information systems)** ([official publication](http://publication.pravo.gov.ru/document/0001202608310027); all 11 pages read).
- It repeals FSB Order No. 117 of 18.03.2025.
- **Item 1.** Information must be protected with crypto tools when:
  - a law requires it
  - it is sent over channels outside the controlled area
  - "необходимо признание электронных документов, подписанных электронной подписью, равнозначными документам на бумажном носителе"
  - non-cryptographic methods cannot exclude access to channels or storage
- **Item 3.** The crypto tools must be "СКЗИ, сертифицированные ФСБ России".
- **Remaining items.** They set crypto-tool classes (КС1, КС2, КС3, КВ, КА) by information significance and system scale (items 7–17 and the appendix table). They require internal control at least once every three years (item 18).
- The order names certified tools and classes, not algorithms. It says nothing about signing software or updates. → (C)

**4. Federal Law No. 58-FZ of 07.04.2025 (amending the critical-infrastructure law 187-FZ)** ([official publication](http://publication.pravo.gov.ru/document/0001202504070004)).
- On the official scan I read pp. 1–3 and 13–14. The government sets requirements for software and hardware used on significant objects, and the order and timing of the transition to them.
- **Article 2 as published has only parts 1–4.** Parts 3.1–3.11, including part 3.7, were inserted later by an act I did not identify.
- **Part 3.7** defines the list of *trusted Russian software*. Decree 1931 refers to it (§5 item 5 below). I read its text only in the finding aid:
  - Russian ownership of the exclusive rights
  - inclusion in the software registry
  - meeting information-security requirements "установленным Правительством … по согласованию с" the FSB and FSTEC
  - no state secrets
- I did not locate the government act that sets those information-security requirements. → (A) open

**5. Government Decree No. 1931 of 28.11.2025 (rules of the trusted-software list)** ([official publication](http://publication.pravo.gov.ru/document/0001202511290018), PDF pp. 2–5).
- It is procedural: the list is kept by the Ministry of Digital Development, and expert review is done by accredited testing centres.
- The only signature it requires is a qualified electronic signature on the application documents. It says nothing about signing software or updates.

**6. Registry rules (Decree No. 1236 of 16.11.2015), as amended by Decree No. 1937 of 28.11.2025** ([1236](http://publication.pravo.gov.ru/document/0001201511200006); [1937](http://publication.pravo.gov.ru/document/0001202512080042), PDF pp. 1–2, 5).
- **New sub-item "м" of item 5.** The software must be "совместимо не менее чем с 2 операционными системами, соответствующими требованиям к доверенному программному обеспечению".
- **When "м" applies to registry entries.** Decree 1937 item 6 sets the dates. "Средства анализа данных" are covered from 01.01.2027, applied software from 01.06.2027.
- **Sub-item "ж" of item 5.** The finding aid shows "программное обеспечение не имеет принудительного обновления и управления из-за рубежа". I did not verify it on the official text and did not identify the act that introduced it.
- This is not a signature requirement, but it shapes the add-on update design.

### Answer

- **(A) Algorithm prescribed.** **Not found.** No act listed above prescribes GOST R 34.10/34.11, or any other algorithm, for signatures on vendor software, updates or packages.
  - Read: FSTEC 239 (original appendix p. 28 and amendment 35 in full), FSTEC 117 (pp. 3–4 and 18), FSB 321 (in full), 58-FZ (pp. 1–3 and 13–14), Decree 1931 (pp. 2–5), Decree 1937 (pp. 1–2 and 4–5).
  - **The most likely place for such a rule** is the government act on information-security requirements for trusted software, under 187-FZ art. 2 part 3.7(3). I did not locate it.
  - Not read: Federal Law 63-FZ on electronic signatures; FSTEC Order 76 of 2020 (trust levels for security tools); FSB rules for certifying crypto tools; GOST R 56939-2024, which FSTEC 117 references for secure development; the Bank of Russia's financial-sector standards; sector rules issued under 187-FZ; the government act on information-security requirements for trusted software.
  - So this is a negative finding over the listed acts, not proof that no such requirement exists.
- **(B) Check updates.** **Yes, without an algorithm.**
  - In significant critical-infrastructure objects, the operator gets updates from a trusted source and checks their integrity. The developer must define how users check update integrity and authenticity (FSTEC 239).
  - In state and public-sector systems, update authenticity and integrity are checked and uncontrolled installation is forbidden (FSTEC 117).
- **(C) Certified crypto.** **Yes, conditionally.** Where the customer protects information in a state information system with cryptography, or needs legally significant electronic documents, it must use FSB-certified crypto tools (FSB 321).
  - [inference] If a customer's threat model treats integrity of installed add-ons as a cryptographic protection measure, the customer may ask for verification with a certified tool. That would in practice mean a GOST signature next to, or instead of, Ed25519.
  - I found no act that applies this to vendor package signatures automatically.
- **Algorithm agility for a GOST signature [spec].**
  - "TUF is not restricted to any particular signature SCHEMEs, KEYTYPEs, or cryptographic library" ([raw spec L589–L591](https://github.com/theupdateframework/specification/blob/e2bc7d83d0740aaae8dd7133dd4f237ce3d86b16/tuf-spec.md?plain=1#L589-L591)).
  - DSSE's `Sign()` "is an arbitrary digital signature format" ([DSSE protocol](https://github.com/secure-systems-lab/dsse/blob/75a79b6ed61c63dabf291657e076d120d95a39a1/protocol.md)).
  - [inference] Both formats can therefore carry a second, GOST-based signature without changing format. minisign and signify are Ed25519-only ([minisign](https://jedisct1.github.io/minisign/)).

---

## Comparison table

Legend: **yes / partial / no**. Cells are my synthesis of the sections above; follow the section links for sources.

| Mechanism | Works offline (install from file or internal mirror) | Needs a third-party service | Key management burden | Revocation | Fit for 3 trust levels (vendor / vendor-reviewed / community) |
| --- | --- | --- | --- | --- | --- |
| **TUF, spec-conformant client** (§1) | **Partial.** Yes from file or mirror, but only while timestamp, snapshot and targets are unexpired. An air-gapped site needs fresh metadata imported on schedule ([§5.4.4](https://theupdateframework.github.io/specification/v1.0.37/#update-timestamp)). | **No.** Any static host, file share or USB. You run the repository and an online timestamp signer. tuf-on-ci needs GitHub; tuftool does not. | **High.** Offline threshold root ceremony, offline targets keys, online timestamp key, scheduled re-signing. | **Strong.** Remove a target or delegation; rotate keys through root chaining; rollback protection; expiry bounds how long a revocation can be withheld. | **Good, by convention.** One delegated role per path prefix (`vendor/`, `reviewed/`, `community/`). Client APIs return the target, not the signing role, so the level comes from the path. An AND of author and vendor (TAP 3) is Accepted but not in the spec text. |
| **TUF with an offline expiry deviation** (tough `Unsafe`, or a custom "stale but no rollback" mode) (§1.4) | **Yes**, indefinitely. | **No.** | Same as above. | **Weaker.** Only as fresh as the last import, and no freeze-attack detection ([tough](https://github.com/awslabs/tough/blob/98d8eb8b2ce63515d9b4981c938ef6453c5b5771/tough/src/lib.rs#L83-L100)). | Same as above. |
| **Sigstore keyless, public instance** (§2.1–2.2) | **Partial.** Verification works offline with the bundle plus a copied `trusted_root.json` that "will change without notification". Signing needs network. | **Yes.** Public Fulcio, Rekor, CT log, an OIDC provider (Google, Microsoft, GitHub, GitLab and others) and Sigstore's TUF CDN. | **Low for signers** (no long-lived keys). **Verifiers** must pin identity and issuer. | **No artifact revocation.** The docs suggest "a blocklist for revoked artifacts". Service keys are revocable through Sigstore's TUF. | **Partial.** Identity says who signed. Levels still need a signed policy or catalog; review needs a separate attestation. |
| **Sigstore keyless, private stack** (§2.4) | **Partial.** Same as above, but against your own trusted root. | **No external**, but you operate Fulcio, an OIDC IdP, Rekor and/or a TSA, a CT log, and TUF or a static trusted root. | **Very high**, as infrastructure. | Same as above. | Same as above. |
| **cosign with self-managed keys, no transparency log** (§2.3) | **Yes** [code read, not tested]. Sign with a local signing config that lists no services; verify with `--key` and `--insecure-ignore-tlog`. | **No.** KMS optional. Note: cosign v3 defaults to fetching the public signing config from TUF. | **Medium.** Key storage is yours; rotation is not built in. | **None built in.** It must live in your catalog. | **Partial.** Gives a standard bundle and DSSE/in-toto attestations. Levels come from which key signed. |
| **minisign / signify** (§3.1–3.2) | **Yes.** | **No.** | **Low** to start. Rotation is manual; OpenBSD ships the next key in the current signed release. | **None** ("Revocation is probably a cure worse than the disease", OpenBSD). | **Poor alone.** One key per level is possible; metadata is one trusted-comment line. |
| **Own signed JSON index + DSSE/in-toto** (Ed25519, §3.3–3.5) | **Yes.** Freshness follows your own `expires` policy. | **No.** | **Medium–high.** You design and maintain the format, a key list with rotation, and a root threshold. | **As designed.** A `revoked` list inside a versioned signed catalog, plus a stored highest version. | **Good.** SVR for "reviewed", Test Result for "tested", a separate key per level. The security of a self-made format is your responsibility. |

[inference] Recommendation for the decision this feeds:
- **Format.** Use TUF (python-tuf or go-tuf) with three delegated roles, and in-toto SVR or Test Result attestations stored as targets with their digests.
- **Air-gapped channel.** Give the offline bundle a separate channel with longer timestamp expiry, plus an explicit, logged administrator override. Never accept a lower version.
- **Algorithm.** Keep the signature scheme pluggable so a GOST signature can be added for customers that require certified crypto.
- **Sigstore.** Use it only where a customer explicitly wants transparency logs.

## What I could not verify

- **Russian official sites.** `fstec.ru`, `government.ru`, `pravo.gov.ru`, `digital.gov.ru` and `reestr.digital.gov.ru` were unreachable. Consolidated editions were not checked on an official source.
- **Russian clauses seen only in the finding aid.**
  - The text of part 3.7 on trusted software, which is not in 58-FZ as published; the inserting act was not identified
  - Registry rules item 5 "ж" (no forced update from abroad)
  - FSTEC 117's effective date
  - The 28.08.2024 edition of FSTEC 239
- **Cosign v3.1.x.**
  - Release notes for v3.1.x were not read; `CHANGELOG.md` on `main` stops at v3.0.5.
  - Fully offline signing with a no-services signing config was read in code, not run.
  - Whether `cosign signing-config create` accepts zero services was not checked.
- **TAP 3 support.** Whether python-tuf or go-tuf implement TAP 3 was not checked. A grep of the python-tuf metadata API found TAP 15's `SuccinctRoles`, not multi-role delegations.
- **Fulcio issuers.** That `config/identity/config.yaml` is the exact production issuer list is inferred from Fulcio's integration guide, not stated as such.
- **Quotes from page summaries, since re-checked.** Quotes from the minisign docs, the signify man page, the OpenBSD paper, the npm docs and the VS Code Marketplace page were first taken from page summaries. All were then found verbatim by grepping the raw HTML. The words "revok", "rotat" and "expir" do not occur on the minisign page or the signify man page.
- **Nothing was executed.** No TUF repository or cosign workflow was built or run. All behaviour comes from specs, docs or source.

## Link re-check (two links opened again, raw HTML, 2026-11-18)

1. **VS Code extension runtime security** ([code.visualstudio.com/…/extension-runtime-security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)). The page, owned by the VS Code docs, contains verbatim: "the extension is removed from the Marketplace and added to a block list. If the extension has been installed, it's automatically uninstalled by VS Code" and "The Visual Studio Marketplace signs all extensions when they're published." **Confirmed.**
2. **SLSA v1.2 Verification Summary** ([slsa.dev/spec/v1.2/verification_summary](https://slsa.dev/spec/v1.2/verification_summary)). The page, owned by the SLSA spec, has "Status: Approved" and contains verbatim "Consumers MUST accept only specific (signer, verifier) pairs", "Verify that the verifier matches the public key (or equivalent) used to verify the signature in step 1" and "A VSA does not protect against compromise of the verifier, such as by a malicious insider." **Confirmed.**

Also checked against the official scans on publication.pravo.gov.ru:
- FSTEC 239, ОПО.1 and ОПО.2 (p. 28)
- FSTEC 35, items 29.3.3 and 31 (pp. 5–6)
- FSTEC 117, items 1, 7 and 39 (pp. 3, 4, 18)
- FSB 321, in full (items 1 and 3 on pp. 3–4)
- 58-FZ, pp. 13–14 (Article 2 has parts 1–4 only)
- Decree 1937, sub-item "м" and its dates (pp. 2, 5)
