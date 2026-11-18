# Server-backed extension registries: identity, trust, revocation, self-hosting

Research date: 2026-11-18. Primary sources only. Every source was read on that date at the revision pinned below.

**Tags on claims**

- **[doc]**: the operator's own published documentation or policy says it.
- **[code]**: I read it in the source code at the pinned commit.
- **[cfg]**: I read it in the operator's deployment configuration in git. This shows intent; I have not confirmed it is what runs.
- **[obs]**: I observed it live against the public service on 2026-11-18.
- **[infer]**: my own inference from the above.
- **[UNVERIFIED]**: I could not confirm it from a primary source.

**Pinned revisions**

| Source | Revision |
| --- | --- |
| `microsoft/vscode-docs` | `1830de0554cac80a2a8a3fc724fe7d74fa7889dc` (VS Code 1.147 docs) |
| `microsoft/vscode` | `36e8c0289a5f29eae15a933263220d9895302ff6` |
| `microsoft/vsmarketplace` | `cfff182a99d4500fd94e29e5a166ba57eb64e721` (Private Marketplace 1.0.57) |
| `microsoft/vscode-vsce` | `50a48d8a2250614e943a4c738bce6705976ce9ae` |
| `eclipse-openvsx/openvsx` | `c4849221281440511b16f4bde547c0371f0b7df6` (latest release v1.4.0) |
| `eclipse-openvsx/openvsx` wiki | `6c46e48b` |
| `EclipseFdn/open-vsx.org` | `548ae85a31cbe870b7b46a331a119e28c478b07d` (branch `aws-main`) |
| `EclipseFdn/open-vsx.org` wiki | `b52c4e6b` |
| `modelcontextprotocol/registry` | `115f85225c9fac5281d8a2dc8551cf49b004d2f9` (latest release v1.8.9) |

Link bases used below:

- `VSCD` = https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc
- `VSC` = https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6
- `VSM` = https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721
- `OVSX` = https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6
- `OVSXORG` = https://github.com/EclipseFdn/open-vsx.org/blob/548ae85a31cbe870b7b46a331a119e28c478b07d
- `MCP` = https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9

Full links are written out in each claim below.

---

## 1. Visual Studio Code Marketplace (Microsoft)

### Publisher identity

- **[doc]** The Marketplace runs on Azure DevOps, which provides its authentication, hosting and extension management. [publishing-extension.md L62](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L62)
- **[doc]** To create a publisher, you sign in to the management page with a Microsoft account and choose a unique ID and a unique display name. The ID cannot be changed later. [L226-L245](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L226-L245)
- **[doc] Publishing credentials.**
  - Global Azure DevOps PATs are retired on 2026-12-01. [L65](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L65)
  - The recommended path is federated identity: GitHub Actions "Trusted Publishing" over OIDC, or Microsoft Entra ID from Azure Pipelines. Other OIDC providers are not supported. [L67-L84](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L67-L84)
  - A Trusted Publishing policy names the GitHub repo owner, the repo, the workflow file and an optional environment. The exchanged credential expires after 15 minutes. [L86-L141](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L86-L141)
  - The page source still carries a hidden `TODO: Document the minimum stable @vscode/vsce version that supports --oidc`. [L134](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L134)
  - **[code]** `vsce publish --oidc` exists. [vscode-vsce src/main.ts L211](https://github.com/microsoft/vscode-vsce/blob/50a48d8a2250614e943a4c738bce6705976ce9ae/src/main.ts#L211)
- **[doc] Verified publisher badge (blue check).**
  - Proof: a DNS TXT record on a domain that is not a subdomain, serves HTTPS, and answers 200 to a HEAD request.
  - Track record: at least one extension on the Marketplace for 6 months, and a domain registered for at least 6 months.
  - Review: the Marketplace team decides "within 5 business days" and checks "content eligibility, legitimacy, trust and positive reputation".
  - Loss: the badge is revoked if the display name changes or the Terms of Use are violated.
  - Source: [L463-L516](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L463-L516); the same badge meaning is in [extension-runtime-security.md L41](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L41).
- **[doc] Client-side publisher trust.** Since VS Code 1.97, the first install from a third-party publisher shows a trust prompt. Publishers installed before that are trusted automatically. CLI installs do not trust the publisher automatically. [extension-runtime-security.md L18-L31](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L18-L31)

### Signing

- **[doc]** "The Visual Studio Marketplace signs all extensions when they're published. VS Code checks this signature when you install an extension to verify the integrity and the source of the extension package." [extension-runtime-security.md L64](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L64)
  - The signature is made by the registry, not by the author: "Marketplace repository signs all VS Code extensions … the repository signature verification is enforced at install time". [Microsoft blog, 2025-06-11](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/)
- **[doc] Author signing.** As of June 2025, Microsoft listed author signing as roadmap only: "Require publisher-signing for all Microsoft-owned extensions and enable tooling and guidance for third-party publishers to sign their extensions." [Microsoft blog, 2025-06-11](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/)
  - **[code]** `vsce` already accepts publisher-supplied signature files (`--manifestPath`, `--signaturePath`, `--sigzipPath`, `--sign-tool`) and has a `verify-signature` command. [vscode-vsce src/main.ts L225-L228, L359-L364](https://github.com/microsoft/vscode-vsce/blob/50a48d8a2250614e943a4c738bce6705976ce9ae/src/main.ts#L225-L228)
  - **[UNVERIFIED]** I found no published policy on whether the Marketplace or VS Code treats an author signature differently from the repository signature.
- **[code] How the client verifies.**
  - VS Code downloads the gallery's `Microsoft.VisualStudio.Services.VsixSignature` asset. [extensionGalleryService.ts L128](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/extensionGalleryService.ts#L128)
  - It passes that asset to the native module `@vscode/vsce-sign`. [extensionSignatureVerificationService.ts L70, L90](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/node/extensionSignatureVerificationService.ts#L70)
  - Install is refused and the download deleted on: integrity failure, tampered entry, untrusted certificate, revoked certificate, or `NotSigned` when the gallery declares that all packages are signed. [node/extensionManagementService.ts L340-L384](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/node/extensionManagementService.ts#L340-L384)
  - The public gallery manifest sets `allPublicRepositorySigned: true`. [common/extensionGalleryManifestService.ts L225-L227](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/extensionGalleryManifestService.ts#L225-L227)
  - Private extensions require a signature only if the manifest sets `allPrivateRepositorySigned`. [extensionManagement.ts L825-L830](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/extensionManagement.ts#L825-L830)
  - The result is not enforced in dev builds or on Linux ARMHF. Verification is not run when the user sets `extensions.verifySignature: false`. [extensionManagement.ts L742](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/extensionManagement.ts#L742), [node/extensionManagementService.ts L341-L353](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/node/extensionManagementService.ts#L341-L353)
- **[obs]** `@vscode/vsce-sign` 2.1.1 on npm is closed: the license field is `SEE LICENSE IN LICENSE.txt`, there is no repository field, the package ships per-platform binaries, and `github.com/microsoft/vsce-sign` returns 404. [npm registry metadata](https://registry.npmjs.org/@vscode/vsce-sign/latest)
  - **[UNVERIFIED]** Its trust roots and certificate chain. The Open VSX CLI README describes VS Code's verifier as "trusting a single baked-in Marketplace key". [openvsx cli/README.md L124](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/cli/README.md?plain=1#L124) That is a third party's description, not Microsoft's.

### Checks before publication (published policy)

- **[doc]** The current docs list these Marketplace protections [extension-runtime-security.md L48-L66](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L48-L66):
  - **Malware scan.** "several antivirus engines", run for every new extension and every update; "Until the scan is all clear, the extension won't be published".
  - **Dynamic detection** in a sandbox ("clean room VM").
  - **Unusual usage monitoring.**
  - **Name-squatting prevention** for official publishers and popular extensions.
  - **Secret scanning.** Publishing is blocked if a secret is found. `vsce` also scans `.env` files at packaging time.
- **[doc]** The June 2025 blog adds detail [Microsoft blog, 2025-06-11](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/):
  - The initial scan uses "the same advanced tech found in Microsoft Defender and other top antivirus engines".
  - Each package is rescanned "shortly after it's published", and the whole Marketplace is rescanned periodically.
  - Packages flagged by rescan or dynamic detection "are manually reviewed by security engineers to avoid false positives before removing them". This human review happens after a flag, not before every publication.
- **[doc]** `vsce` refuses user-provided SVG images. [publishing-extension.md L51-L58](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L51-L58)
- I found no published claim of human review before every publication.

### Revocation

- **[doc]** "If a malicious extension is reported and verified … the extension is removed from the Marketplace and added to a *block list*. If the extension has been installed, it's automatically uninstalled by VS Code." [extension-runtime-security.md L62](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L62)
  - Reports go through the "Report a concern" link. The first response comes "within one business day". [L70-L79](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L70-L79)
  - The blog adds that Microsoft may "ban the publisher". [Microsoft blog](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/)
- **[code] How the kill list works in VS Code.**
  - The client fetches an "extensions control manifest" from `product.extensionsGallery.controlUrl`. Its fields are `malicious` (an extension ID or a whole publisher), `learnMoreLinks`, `deprecated` and `search`. [extensionGalleryService.ts L641-L661, L684, L1992-L2068](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/extensionGalleryService.ts#L1992-L2068)
  - A bare publisher entry matches every extension of that publisher. [extensionManagementUtil.ts L207-L214](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/extensionManagementUtil.ts#L207-L214)
  - **Install:** a listed extension is refused. [abstractExtensionManagementService.ts L714-L716](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/abstractExtensionManagementService.ts#L714-L716)
  - **Installed copies:** every five minutes the enablement service stores the list and marks matches `DisabledByMalicious`. [extensionEnablementService.ts L471-L473, L898-L914](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/workbench/services/extensionManagement/browser/extensionEnablementService.ts#L898-L914) Also every five minutes, `MaliciousExtensionChecker` uninstalls them with `remove: true` and shows a sticky warning. [extensionsViewlet.ts L1117-L1177](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/workbench/contrib/extensions/browser/extensionsViewlet.ts#L1117-L1177) Installed copies are therefore both disabled and removed.
  - **Fetch failure:** the install-time check falls back to an empty list. [abstractExtensionManagementService.ts L1021-L1029](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/abstractExtensionManagementService.ts#L1021-L1029) The enablement service keeps the last stored list. [extensionEnablementService.ts L904-L914](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/workbench/services/extensionManagement/browser/extensionEnablementService.ts#L904-L914)
- **[obs]** The control URL is [`https://main.vscode-cdn.net/extensions/marketplace.json`](https://main.vscode-cdn.net/extensions/marketplace.json). I saw it in the product configuration embedded in https://vscode.dev on 2026-11-18. I did not inspect the desktop `product.json`, so its value there is **[UNVERIFIED]**.
  - That file had 283 `malicious` entries and 553 `deprecated` entries on 2026-11-18.
- **[doc]/[obs]** Microsoft publishes a removal history, [RemovedPackages.md](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/RemovedPackages.md). Its header says "Every package entering VS Marketplace is scanned upfront and regularly rescanned". [L4](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/RemovedPackages.md?plain=1#L4)
  - I counted 2,572 rows on 2026-11-18 (last commit 2026-11-17): 1,232 impersonation, 799 malware, 351 untrustworthy, 146 spam, and smaller categories.
  - **[infer]** The client kill list (283) is much smaller than the removal history (2,572). Not every removed extension is pushed to installed clients.
- **[doc] Publisher-initiated removal.**
  - *Unpublish* keeps the item discoverable "via an existing API".
  - *Remove* is irreversible and reserves the name permanently, even against the original publisher.
  - The latest version cannot be deleted on its own.
  - Source: [publishing-extension.md L300-L345](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L300-L345)

### Self-hosting: Private Marketplace

- **[doc] What it is.** The Private Marketplace hosts internal extensions on your own infrastructure. It can "upstream" the public Marketplace and "rehost" public VSIX files "including in air-gapped environments". [docs/enterprise/extensions.md L110-L133](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/enterprise/extensions.md?plain=1#L110-L133)
- **[doc] Client requirements** [same section, L114-L118](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/enterprise/extensions.md?plain=1#L114-L118):
  - VS Code desktop 1.99 or later.
  - A signed-in account with GitHub Enterprise, Copilot Enterprise or Copilot Business.
  - VS Code Server and VS Code for the Web are not supported.
  - "Rehosting extension files does not remove the subscription and sign-in requirements." [L131](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/enterprise/extensions.md?plain=1#L131)
- **[doc] What it takes to run** (deployment guide):
  - One stateless Docker image, `mcr.microsoft.com/vsmarketplace/vscode-private-marketplace:1.0.57`, with "no external database required". [README L16, L92-L97](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L92-L97)
  - Storage is either a mounted file volume or Azure Artifacts. Azure Artifacts works only when the container runs in Azure. [L700](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L700)
  - TLS is required, either via a reverse proxy or a `.pfx` file. [L101-L111](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L101-L111)
  - Network isolation is the recommended access control. [L113-L119](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L113-L119)
  - Clients are pointed at the instance with the `ExtensionGalleryServiceUrl` device policy. [L593-L620](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L593-L620)
  - Upstream modes are `None`, `Search` and `SearchAndAssets`; the default is `None`. [L364-L399, L853](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L364-L399)
  - For "air-gapped or firewalled" clients, the guide's "Most restrictive" setup turns upstreaming off and rehosts downloaded VSIX files. [L47](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L47)
- **[doc] Limits.**
  - VS Code connects to one marketplace at a time. [L585](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L585)
  - Rehosted public extensions show up as "private". [L587](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L587)
  - Private extensions have no deprecation flow, and Artifactory is not supported. [L817-L830, L904-L906](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L817-L830)
  - The container must be allowed to reach `marketplace.visualstudio.com` and `*.gallerycdn.vsassets.io` when upstreaming. [L426-L440](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L426-L440)
- **[obs]** The repository holds docs, Bicep templates, a PowerShell publishing script and a terms-of-use PDF. It contains no server source: [privatemarketplace/latest](https://github.com/microsoft/vsmarketplace/tree/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest).
- **[code] The subscription gate in the client.**
  - With `ExtensionGalleryServiceUrl` set, VS Code first resolves the account. "Eligible" means the GitHub account's `access_type_sku` is in the product's `accessSKUs`. [extensionGalleryAccountService.ts L164-L166](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/workbench/services/extensionManagement/electron-browser/extensionGalleryAccountService.ts#L164-L166)
  - A Microsoft sign-in path also exists, where a work or school tenant is eligible. [L228](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/workbench/services/extensionManagement/electron-browser/extensionGalleryAccountService.ts#L228)
  - Without an eligible account, the marketplace shows `RequiresSignIn` or `AccessDenied`. [electron-browser/extensionGalleryManifestService.ts L140-L233](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/workbench/services/extensionManagement/electron-browser/extensionGalleryManifestService.ts#L140-L233)
- **[infer] Air-gap caveats.**
  1. The docs say rehosting works air-gapped, yet sign-in is still required. Whether a GitHub or Microsoft sign-in can succeed with no route to github.com is **[UNVERIFIED]**.
  2. The kill list URL comes from the product configuration, not from the private marketplace URL ([extensionGalleryService.ts L684](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/extensionGalleryService.ts#L684)). An offline client therefore gets no new malicious-list entries; it keeps only the last list it stored.
  3. Whether the closed container sets `allPrivateRepositorySigned` is **[UNVERIFIED]**. The guide never mentions signing, so rehosted or internal VSIX files may be installed unsigned.
- **Contradiction.**
  - **[doc]** README §2.3: "VS Code does not support authentication with the Marketplace (public or private)." [L115](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L115)
  - **[code]** The current client sends `Authorization: Bearer <token>` when it fetches a private marketplace manifest. [electron-browser/extensionGalleryManifestService.ts L266](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/workbench/services/extensionManagement/electron-browser/extensionGalleryManifestService.ts#L266)
  - Either the README is behind the code, or the server ignores the token. **[UNVERIFIED]** which.
- **[doc] Licence limit on mirroring the public Marketplace.** Marketplace offerings "are intended for use only with In-Scope Products and Services". Harvesting or scraping other than through "Microsoft's publicly supported interfaces" is prohibited. [Marketplace Terms of Use, updated September 2025](https://cdn.vsassets.io/v/M264_20251020.18/_content/Microsoft-Visual-Studio-Marketplace-Terms-of-Use.pdf), reached via https://aka.ms/vsmarketplace-ToU
  - **[infer]** Microsoft's sanctioned self-hosting path is the Private Marketplace. A generic mirror for a non-Microsoft client is excluded.
- **[doc] Fleet controls without self-hosting.** `extensions.allowed` (VS Code 1.96 and later) allows or blocks by publisher, ID, version and platform, and disables blocked extensions that are already installed. [docs/enterprise/extensions.md L11-L21](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/enterprise/extensions.md?plain=1#L11-L21)

### Operating cost and complexity

- **[doc]** Microsoft publishes no cost or staffing figures for the public Marketplace. The June 2025 blog mentions a "dedicated support team", "security engineers", and "reviewed 136 extensions … removed 110" in the year to date. [Microsoft blog](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/)
- **[doc]** Private Marketplace:
  - It is a "benefit" for GitHub Enterprise and Copilot Enterprise/Business subscribers, with no user limits and no extension limits. [README L870-L878](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L870-L878)
  - What you run: one container, file storage, TLS termination, network isolation, and monitoring through Application Insights or OTLP. [L101-L119, L633-L656](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L633-L656)
  - The guide includes no abuse-handling component. Anything published into it is the organisation's responsibility. **[infer]**

---

## 2. Open VSX (Eclipse Foundation)

The Eclipse Foundation's terminology: the *Open VSX project* is the open-source server, and the *Open VSX Registry* (open-vsx.org) is the instance the Foundation operates. [Eclipse blog, 2026-01-28](https://blogs.eclipse.org/post/christopher-guindon/strengthening-supply-chain-security-open-vsx)

### Publisher identity

- **[doc] Steps to publish on open-vsx.org** [openvsx wiki: Publishing-Extensions](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions):
  1. Create an eclipse.org account whose "GitHub Username" matches the GitHub login used on open-vsx.org.
  2. Log in with GitHub OAuth, link the Eclipse account, and sign the Publisher Agreement.
  3. Create an access token.
  4. Create the namespace with `ovsx create-namespace`.
- **[doc] Namespace ownership and the verified mark.**
  - Creating a namespace makes you a *contributor*, not the owner.
  - Ownership is claimed "publicly by creating an issue" in `EclipseFdn/open-vsx.org`, so it can be refuted in public.
  - An extension version shows as *verified* when its namespace has an owner and the publishing user is a member. Otherwise it shows a warning icon.
  - Source: [openvsx wiki: Namespace-Access](https://github.com/eclipse-openvsx/openvsx/wiki/Namespace-Access)
  - Admins check that the requester has logged in and signed the Publisher Agreement. The goal includes ensuring that "if an extension exists on both the VS Code Marketplace and the Open VSX Registry, it is published by the same person or org". [open-vsx.org wiki: Guidelines-on-Namespace-Requests](https://github.com/EclipseFdn/open-vsx.org/wiki/Guidelines-on-Namespace-Requests)
  - The detailed admin steps are in "internal Standard Operating Principles", which are not public. **[UNVERIFIED]** what evidence is required.
- **[doc]** The privileged `@open-vsx` service account re-publishes open-source extensions that their authors have not published. It may publish into namespaces it is not a member of; such versions show as unverified. [openvsx wiki: Namespace-Access](https://github.com/eclipse-openvsx/openvsx/wiki/Namespace-Access)
- **[doc] Trusted publishing** (OIDC, following the OpenSSF model).
  - Only a namespace *owner* with a signed agreement can register a trusted publisher, and only for an extension that already exists.
  - Each extension has one trusted publisher at a time, and issued tokens are scoped to that extension and expire within minutes.
  - Source: [openvsx wiki: Trusted-Publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing)
  - **[cfg]** open-vsx.org enables the `github` provider with a 5-minute token lifetime. Access tokens are prefixed `ovsxat_` and expire after 90 days. [application-production.yml L15-L39](https://github.com/EclipseFdn/open-vsx.org/blob/548ae85a31cbe870b7b46a331a119e28c478b07d/configuration/application-production.yml#L15-L39)
- **[doc]** After leaked tokens in October 2025, the Foundation added a token prefix "in collaboration with MSRC" for secret scanners, and shorter token lifetimes. [Eclipse blog, 2025-10-27](https://blogs.eclipse.org/post/mika%C3%ABl-barbero/open-vsx-security-update-october-2025)

### Signing

- **[code]** Signing is done by the registry with Ed25519, and is optional per deployment.
  - The property `ovsx.integrity.key-pair` (`create`, `renew` or `delete`) makes the server generate a keypair and a `.sigzip` per extension version. [doc/configuration.md L871-L879](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/configuration.md?plain=1#L871-L879)
  - The `.sigzip` contains `.signature.sig`, and verification requires an Ed25519 key. [ExtensionVersionIntegrityService.java L61, L85, L150](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/server/src/main/java/org/eclipse/openvsx/publish/ExtensionVersionIntegrityService.java#L85)
  - The public key is served at `/api/-/public-key/{publicId}`. [RegistryAPI.java L1938](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/server/src/main/java/org/eclipse/openvsx/RegistryAPI.java#L1938)
  - The VS Code-compatible adapter exposes the signature as `Microsoft.VisualStudio.Services.VsixSignature` and the key as `Microsoft.VisualStudio.Services.PublicKey`. [adapter/ExtensionQueryResult.java L116-L117](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/server/src/main/java/org/eclipse/openvsx/adapter/ExtensionQueryResult.java#L116-L117)
- **[obs]** On 2026-11-18, [`https://open-vsx.org/api/redhat/java`](https://open-vsx.org/api/redhat/java) listed `signature` (`.sigzip`), `sha256` and `publicKey` files for the latest version. Signing is on in production.
- I found no author signing.
- **[doc] Client verification.**
  - `ovsx verify <file.vsix>` checks a downloaded package against the registry's key. `ovsx verify-signature` does the same fully offline with an explicit key. [cli/README.md L114-L124](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/cli/README.md?plain=1#L114-L124)
  - The same README notes that each Open VSX registry "hold[s] their own signing key", unlike VS Code's single baked-in key.
- **Not found in sources read: an IDE that verifies Open VSX signatures at install.**
  - **[code]** VS Code's client reads only the signature asset and has no code that consumes the `PublicKey` asset. [extensionGalleryService.ts L128, L632](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/common/extensionGalleryService.ts#L632)
  - Whether VS Code forks (VSCodium, Cursor, and others) verify Open VSX signatures at install is **[UNVERIFIED]**; I did not read fork sources.

### Checks before publication (published policy)

- **[doc] Project level.** An operator can enable three publish-time checks, each enforced or monitor-only [openvsx wiki: Extension-Scanning](https://github.com/eclipse-openvsx/openvsx/wiki/Extension-Scanning):
  - secret detection;
  - a blocklist of file SHA-256 hashes;
  - namespace or name similarity, against typosquatting.
- **[doc] The operator's rollout of pre-publish checks.**
  - Jan 2026: the plan was to "Begin monitoring … in February" and to "Move toward enforcement in March", built with the consultancy Yeeth Security. "Human review will remain part of the process, especially for edge cases." Suspicious uploads are to be quarantined for review. [Eclipse blog, 2026-01-28](https://blogs.eclipse.org/post/christopher-guindon/strengthening-supply-chain-security-open-vsx)
  - Oct 2026: describes "pre-publication malware scanning" as existing. It adds an *asynchronous post-publish* check: an extension whose `namespace.extension` matches a VS Code Marketplace extension is quarantined "under review" when the Open VSX namespace has no owner. [Eclipse blog, 2026-10-15](https://blogs.eclipse.org/post/brian-king/stronger-safety-nets-vs-code-marketplace-namespace-matching-open-vsx)
- **[doc] Admin flow for quarantine.**
  - Scans end as PASSED, QUARANTINED (an enforced threat scanner matched, for example YARA or ClamAV), AUTO REJECTED (an enforced publish check failed: name-squatting, blocklist or secret) or ERROR.
  - Admins act on quarantined items by hand.
  - Source: [open-vsx.org wiki: Extension-Scans](https://github.com/EclipseFdn/open-vsx.org/wiki/Extension-Scans) (last edited 2026-02-19)
- **[cfg] What production config enables.** This file's own header says the values "need confirming against current production infra". [application-production.yml L1-L12](https://github.com/EclipseFdn/open-vsx.org/blob/548ae85a31cbe870b7b46a331a119e28c478b07d/configuration/application-production.yml#L1-L12) Read as intent, not as confirmed deployment. [L69-L205](https://github.com/EclipseFdn/open-vsx.org/blob/548ae85a31cbe870b7b46a331a119e28c478b07d/configuration/application-production.yml#L69-L205)
  - Enforced: blocklist, gitleaks-based secret detection, and a namespace-ownership check against the VS Code Marketplace gallery.
  - Monitor-only: name similarity (`enforced: false`).
  - Enforced remote scanners: ClamAV, YARA, and "Argus" (`api.yeethsecurity.com`, "multi-engine malware and AI analysis").
- **[code]** The namespace-ownership scanner blocks publishing into a namespace that is "already claimed by some publisher in a referenced external gallery (by default the upstream VS Code Marketplace), unless the publishing namespace is verified". [NamespaceOwnershipCheckScanner.java L38-L44](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/server/src/main/java/org/eclipse/openvsx/scanning/NamespaceOwnershipCheckScanner.java#L38-L44)
  - **[infer]** The Oct 2026 blog calls this namespace check asynchronous and post-publish, while this scanner and the config describe it as a publish check. They may be two different checks. **[UNVERIFIED]** which runs where.
- **[code]** Publishing an ID on the extension-control `malicious` list is refused: "is a known malicious extension". [PublishExtensionVersionHandler.java L342-L345](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/server/src/main/java/org/eclipse/openvsx/publish/PublishExtensionVersionHandler.java#L342-L345)

### Revocation

- **[code] Registry-side takedown.**
  - A nightly job fetches a hard-coded URL, `https://github.com/open-vsx/publish-extensions/raw/master/extension-control/extensions.json`. [ExtensionControlService.java L187](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/server/src/main/java/org/eclipse/openvsx/extension_control/ExtensionControlService.java#L187)
  - It **purges** every extension listed as `malicious`, optionally with the extensions that depend on it. [ExtensionControlJobRequestHandler.java L71-L109](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/server/src/main/java/org/eclipse/openvsx/extension_control/ExtensionControlJobRequestHandler.java#L71-L109)
  - `ovsx.extension-control.enabled` defaults to `true` and cannot be combined with mirror mode. [doc/configuration.md L845-L869](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/configuration.md?plain=1#L845-L869)
  - **[infer]** A self-hosted instance with defaults reaches out to github.com every night. Offline, that job fails.
- **[obs]** On 2026-11-18 that control file had 955 `malicious` and 140 `deprecated` entries. Its last commit was on 2026-11-11 (`c04e39cfe4`). [extension-control/extensions.json](https://github.com/open-vsx/publish-extensions/blob/master/extension-control/extensions.json)
  - Its top-level keys (`malicious`, `deprecated`, `search`, `migrateToPreRelease`, …) match VS Code's control-manifest format.
- **Not found in sources read: remote disable of installed copies.**
  - Open VSX's own guide to configuring a VS Code build sets `serviceUrl`, `itemUrl` and `resourceUrlTemplate`, but no `controlUrl`. [openvsx wiki: Using-Open-VSX-in-VS-Code](https://github.com/eclipse-openvsx/openvsx/wiki/Using-Open-VSX-in-VS-Code)
  - **[infer]** A Code-OSS fork *could* point `controlUrl` at the file above, because the format matches. Whether any fork does so is **[UNVERIFIED]**.
- **[doc] Operator practice.**
  - After the October 2025 GlassWorm incident, "All known malicious extensions were removed … immediately upon notification", and the leaked tokens were revoked. [Eclipse blog, 2025-10-27](https://blogs.eclipse.org/post/mika%C3%ABl-barbero/open-vsx-security-update-october-2025)
  - Questions about potentially malicious extensions go to the Open VSX Program Manager via `marketplace@eclipse-foundation.org`. [open-vsx.org wiki: Guidelines-on-Extension-Requests](https://github.com/EclipseFdn/open-vsx.org/wiki/Guidelines-on-Extension-Requests)
- **[doc] Publisher Agreement revocation.** Revoking the agreement deactivates the publisher's tokens and *all* versions they published. [open-vsx.org wiki: Guidelines-on-Revoking-Publisher-Contributions](https://github.com/EclipseFdn/open-vsx.org/wiki/Guidelines-on-Revoking-Publisher-Contributions)
- **[doc] Delete vs purge.**
  - *Delete* keeps the version number reserved forever.
  - *Purge* is admin-only and frees it.
  - Namespace owners may delete any version in their namespace; other members may delete only their own.
  - Source: [openvsx wiki: Deleting-Extensions](https://github.com/eclipse-openvsx/openvsx/wiki/Deleting-Extensions)

### Self-hosting

- **[doc] Components** [doc/deployment.md L11](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/deployment.md?plain=1#L11), [openvsx wiki: Deploying-Open-VSX](https://github.com/eclipse-openvsx/openvsx/wiki/Deploying-Open-VSX):
  - a Spring Boot server image, with the web UI as a separate image;
  - PostgreSQL;
  - Elasticsearch, or database search, or no search at all;
  - file storage: local filesystem, Azure Blob, GCS or S3;
  - an OAuth2 login provider, GitHub by default. It can be removed to disable login.
  - Self-hosted instances do not need the Publisher Agreement: it is "Disabled by default". [doc/configuration.md L1215-L1250](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/configuration.md?plain=1#L1215-L1250)
- **[doc] Upstream mode.** A private instance forwards requests it cannot answer to another instance, for example open-vsx.org. [doc/deployment.md L57-L59](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/deployment.md?plain=1#L57-L59)
- **[doc] Mirror mode** [doc/mirror.md](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/mirror.md):
  - It copies *metadata* only. Package files are downloaded, verified and discarded. [L7](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/mirror.md?plain=1#L7)
  - It must point at object storage that already holds the upstream's files. "Local file storage does not work in mirror mode." [L110](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/mirror.md?plain=1#L110)
  - A partial mirror purges every local extension it does not match, including ones published locally. [L72](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/mirror.md?plain=1#L72)
- **[doc] Air-gapped use.** "Mirror mode cannot populate a registry that has no route to the upstream." The documented recipe is [L123-L143](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/mirror.md?plain=1#L123-L143):
  1. Run the mirror on a networked machine.
  2. Move the database and object storage to the isolated environment.
  3. Turn mirror mode off there.
  - The simpler route is to publish VSIX files you already hold with `ovsx` into a normal instance.
- **[doc] Licence position.** The operator says the Microsoft Marketplace "is intended for Microsoft's own distributions", and lists "option to mirror, federate, or self host" as part of Open VSX's sovereignty case. [Eclipse blog, 2026-03-18](https://blogs.eclipse.org/post/thomas-froment/open-vsx-and-software-sovereignty-era-ai-driven-developer-tools)

### Operating cost and complexity

- **[doc] Scale and staffing** [Eclipse Foundation blog, 2025-09-23](https://eclipse-foundation.blog/2025/09/23/businesses-built-on-open-infrastructure-have-a-responsibility-to-sustain-it/):
  - Open VSX "handles over 100 million downloads each month, a nearly 4x increase since early 2024".
  - "fewer than 50 people are doing the work".
  - "the current model of unlimited, no-cost use cannot continue indefinitely".
  - Rate limiting is being introduced.
  - The January 2026 post says the team is hiring for security and platform roles and thanks Alpha-Omega for funding. [Eclipse blog, 2026-01-28](https://blogs.eclipse.org/post/christopher-guindon/strengthening-supply-chain-security-open-vsx)
- **[doc] Rate limits.**
  - Free tier: under 3 requests per second (10,800 per hour), with HTTP 429 above it. Enterprise: 15 RPS. Enterprise XL: 50 RPS. Above that: custom. [open-vsx.org wiki: Rate-limiting](https://github.com/EclipseFdn/open-vsx.org/wiki/Rate-limiting)
  - Published prices: Enterprise **€100,000/year** (15 RPS); Enterprise XL **€500,000/year** (50 RPS, SLA, service credits). Free use remains for individuals and open-source projects. [Managed Open VSX pricing](https://managed.open-vsx.org/pricing/)
  - **[infer]** These tiers buy higher throughput on the shared public registry, not a private instance. The custom "Platform" tier does list "Custom registry architecture". [same page](https://managed.open-vsx.org/pricing/)
- **[cfg] Production footprint** [charts/openvsx/templates](https://github.com/EclipseFdn/open-vsx.org/tree/548ae85a31cbe870b7b46a331a119e28c478b07d/charts/openvsx/templates):
  - Helm chart on Kubernetes;
  - Elasticsearch;
  - a Redis cluster;
  - ClamAV-REST and YARA-REST services;
  - CloudNativePG analytics;
  - database backup and backup-drill cron jobs;
  - an S3 replica check;
  - KEDA autoscaling;
  - Grafana Alloy monitoring.
- **[doc, dated]** An older page lists 2 server pods, 3 Elasticsearch pods, a 39 GB Postgres and 1.5 TB of Azure Blob storage. [open-vsx.org wiki: Deployment-Details](https://github.com/EclipseFdn/open-vsx.org/wiki/Deployment-Details) It was last edited 2024-10-28 and predates the AWS move: the current branch is `aws-main`, with CDN `openvsx.eclipsecontent.org`. Treat its numbers as stale.
- **[doc] Abuse handling is manual and public.** Namespace claims and disputes are GitHub issues, and admins review quarantine. [Guidelines-on-Namespace-Requests](https://github.com/EclipseFdn/open-vsx.org/wiki/Guidelines-on-Namespace-Requests), [Extension-Scans](https://github.com/EclipseFdn/open-vsx.org/wiki/Extension-Scans)

---

## 3. Official MCP Registry (`modelcontextprotocol/registry`)

**Note on what it is.** The registry is a *metaregistry*. It stores `server.json` metadata that points to packages on npm, PyPI, NuGet, crates.io, OCI registries or MCPB release files, and does not host code. [about.mdx L32-L38](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L32-L38)

- It is "currently in preview" and data resets are possible. [authentication.mdx L6-L8](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/authentication.mdx?plain=1#L6-L8)
- It launched in preview on 2025-09-08, and the v0.1 API was frozen on 2025-10-24. [docs/design/roadmap.md L9-L13](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/design/roadmap.md?plain=1#L9-L13)
- The `docs/modelcontextprotocol-io/*.mdx` files are published at `https://modelcontextprotocol.io/registry/<page>`, for example [registry/about](https://modelcontextprotocol.io/registry/about) and [registry/moderation-policy](https://modelcontextprotocol.io/registry/moderation-policy). Each page returned 200 on 2026-11-18 **[obs]**.

### Publisher identity

- **[doc] The server name encodes the namespace, and the login method decides which namespace you get.**
  - GitHub login gives `io.github.<user>/*`, or `io.github.<org>/*`.
  - Domain login (DNS or HTTP) gives `com.example.*/*`.
  - Source: [authentication.mdx L10-L21](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/authentication.mdx?plain=1#L10-L21)
- **[doc] GitHub organisation namespaces.**
  - They require org **Owner** role. [L52-L54](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/authentication.mdx?plain=1#L52-L54)
  - The interactive `mcp-publisher login github` "cannot currently publish to an organization namespace" (issue #1468). Use GitHub Actions OIDC or a PAT with `read:org`. [L56-L71](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/authentication.mdx?plain=1#L56-L71)
- **[code] GitHub Actions OIDC** grants `io.github.<repository_owner>/*`. [github_oidc.go L293](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/internal/api/handlers/v0/auth/github_oidc.go#L293)
- **[doc] DNS and HTTP proofs.**
  - DNS: a `v=MCPv1; k=ed25519|ecdsap384; p=<pubkey>` TXT record at the domain **apex**. [L75-L80](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/authentication.mdx?plain=1#L75-L80)
  - HTTP: the same record at `/.well-known/mcp-registry-auth`. The fetch follows no redirects, refuses private and loopback addresses, and comes from Google Cloud. [L214, L345-L380](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/authentication.mdx?plain=1#L345-L380)
  - Keys can live in Google KMS or Azure Key Vault.
  - Removing a proof record stops new tokens, but issued registry tokens stay valid until expiry, "currently five minutes after issuance". [L384-L396](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/authentication.mdx?plain=1#L384-L396)
- **[code] Scope by proof type.**
  - DNS proof grants the domain *and its subdomains*. [dns.go L91-L113](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/internal/api/handlers/v0/auth/dns.go#L91-L113)
  - HTTP proof grants the exact domain only. [http.go L366](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/internal/api/handlers/v0/auth/http.go#L366)
  - HTTP proof is refused for `*.github.io`, so it cannot be used to claim a GitHub org. [common.go L398-L408](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/internal/api/handlers/v0/auth/common.go#L398-L408)
- **[doc] Package-ownership back-link.** Each referenced package must point back to the server name [package-types.mdx L40-L42, L78-L80, L217-L223](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/package-types.mdx?plain=1#L40-L48):
  - npm: `mcpName` in `package.json`;
  - PyPI, NuGet, crates.io: an `mcp-name:` string in the README;
  - OCI: the label `io.modelcontextprotocol.server.name`.
  - Only public upstream registries are accepted: "Private registries and alternative mirrors are not allowed." [official-registry-requirements.md L28-L50](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/reference/server-json/official-registry-requirements.md?plain=1#L28-L50)
  - **[code]** The npm check fetches the package metadata and compares `mcpName`. [internal/validators/registries/npm.go L58-L94](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/internal/validators/registries/npm.go#L58-L94)
- There is no verified-publisher badge. The namespace itself is the identity claim. [about.mdx L70-L74](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L70-L74)

### Signing

- **Not found in sources read:** any signing of `server.json` or packages, by the registry or by authors.
  - For MCPB files only, `server.json` must carry `fileSha256`. "The MCP Registry does not validate this hash; however, MCP clients **do** validate the hash before installation." [package-types.mdx L255-L261](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/package-types.mdx?plain=1#L255-L261)
  - **[UNVERIFIED]** Which clients actually check the hash. This is the registry's claim about third-party clients.
  - For npm, PyPI, OCI and the others, integrity and scanning are left to the upstream registries. [about.mdx L76-L82](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L76-L82)
- **[doc]** Sigstore appears only for the `mcp-publisher` *binary*: the GitHub Actions examples verify its release with `cosign`. That is not package signing. [github-actions.mdx L14](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/github-actions.mdx?plain=1#L14)
- **[infer] How the client checks identity.** It cannot verify anything cryptographically. The trust chain is TLS to the registry, plus the namespace proof the registry checked at publish time. **[infer]**

### Checks before publication (published policy)

- **[doc] Security scanning is delegated.** "The MCP Registry delegates security scanning to" upstream package registries and downstream aggregators. [about.mdx L76-L82](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L76-L82)
- **[doc] Spam controls** [about.mdx L84-L93](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L84-L93):
  - namespace authentication;
  - field length and regex limits;
  - manual takedown.
  - Stricter rate limiting, AI spam detection and community reporting are "under consideration".
- **[doc] Moderation stance.** "consumers should assume minimal-to-no moderation"; the registry has "limited active moderation capabilities". [moderation-policy.mdx L20-L22](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/moderation-policy.mdx?plain=1#L20-L22)
- No malware scanning, secret scanning or human review before publication is described in the docs read; scanning is delegated. [about.mdx L76-L82](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L76-L82)
- **[code]** A namespace denylist exists, but it is empty at this commit. [internal/auth/blocks.go L5](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/internal/auth/blocks.go#L5)
- **[doc]** The design note on stricter `server.json` validation is a *proposal*. [docs/design/proposed-enhanced-validation.md L3](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/design/proposed-enhanced-validation.md?plain=1#L3)

### Revocation

- **[doc] What is removed.** Illegal content, malware, spam and non-functioning servers. Low quality, vulnerable or duplicate servers are not removed. [moderation-policy.mdx L26-L44](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/moderation-policy.mdx?plain=1#L26-L44)
- **[doc] How removal works.**
  - Removal sets `status: "deleted"`, but the metadata "remains accessible via the MCP Registry API". "In extreme cases" metadata is overwritten or erased. [L47-L51](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/moderation-policy.mdx?plain=1#L47-L51)
  - Publishers can set `deleted` themselves, and can restore it. Metadata "is never permanently removed". [faq.mdx L22-L35](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/faq.mdx?plain=1#L22-L35)
  - Abuse reports go to the upstream package registry and to a GitHub issue titled `Abuse report: `. [L52-L56](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/faq.mdx?plain=1#L52-L56)
  - Admins change status through an authenticated API, using accounts with a `@modelcontextprotocol.io` address. [docs/administration/admin-operations.md L5-L12, L53-L79](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/administration/admin-operations.md?plain=1#L53-L79)
- **[doc] Propagation is pull-based.**
  - Aggregators are told to keep `status` current. Incremental `updated_since` syncs "include deleted servers". [registry-aggregators.mdx L70, L74-L78](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/registry-aggregators.mdx?plain=1#L74-L78)
  - Host applications are not meant to read the official registry directly. [about.mdx L66](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L66)
- **[obs]** The live API returns registry metadata under `_meta["io.modelcontextprotocol.registry/official"]`, with `status`, `statusChangedAt`, `publishedAt` and `isLatest`. Observed on `GET` [`https://registry.modelcontextprotocol.io/v0.1/servers?limit=1`](https://registry.modelcontextprotocol.io/v0.1/servers?limit=1).
- There is no mechanism to disable already-installed servers on clients. Any kill switch is the consuming subregistry's or host's job. **[infer]** from the above.

### Self-hosting and subregistries

- **[doc] Two separate things.**
  - The **API spec** (OpenAPI) is meant to be implemented by subregistries, including private registries.
  - The **official codebase** "is **not** designed for self-hosting, and the registry maintainers cannot provide support". [about.mdx L56-L62](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L56-L62)
  - Private servers are not accepted in the official registry; the docs recommend you "host your own private MCP registry". [L46](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L46)
- **[doc] Subregistry contract.**
  - Implement the [OpenAPI spec](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/reference/api/openapi.yaml).
  - Optionally add your own data under a namespaced `_meta` key, for example scan results.
  - Sync from the official registry about hourly, with cursor pagination and `updated_since`. The official registry offers "no uptime or data durability guarantees".
  - Source: [registry-aggregators.mdx L12, L80-L116](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/registry-aggregators.mdx?plain=1#L80-L116)
  - Authentication for third-party registries "SHOULD" follow the MCP Authorization spec, with suggested scopes `mcp-registry:read` and `mcp-registry:write`. [docs/reference/api/registry-authorization.md](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/reference/api/registry-authorization.md)
- **[doc] Licence.** Registry data is CC0 1.0, so mirroring it is licence-clean. [terms-of-service.mdx L50](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/terms-of-service.mdx?plain=1#L50)
- **[doc] Running the code anyway** [README.md L46-L70](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/README.md?plain=1#L46-L70):
  - The image is `ghcr.io/modelcontextprotocol/registry` and needs an external PostgreSQL.
  - By default it seeds from the production API.
  - "For offline development you can seed from a file without validation" with `MCP_REGISTRY_ENABLE_REGISTRY_VALIDATION=false`.
  - **[infer]** In an air-gapped fork you must turn package validation off, because validation fetches npm, PyPI and so on. The public-registries-only rule must also be dropped to list private packages.
- **[doc] Client-side hook.** VS Code has an `McpGalleryServiceUrl` enterprise policy (VS Code 1.101 and later) to point it at an MCP registry. [docs/enterprise/policies.md L361](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/enterprise/policies.md?plain=1#L361)
  - **[UNVERIFIED]** Whether VS Code expects exactly the official OpenAPI shape; I did not read that client code.

### Operating cost and complexity

- **[doc]** "a community supported project … limited active moderation capabilities". [moderation-policy.mdx L22](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/moderation-policy.mdx?plain=1#L22)
- No cost or staffing figures are published (none found).
- **[cfg] Production footprint** [deploy/Pulumi.gcpProd.yaml L15-L34](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/deploy/Pulumi.gcpProd.yaml#L15-L34), [deploy/README.md](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/deploy/README.md):
  - GKE in GCP project `mcp-registry-prod`;
  - `e2-standard-4` nodes, autoscaling from 3 to 8;
  - an isolated PostgreSQL with 3 CPU;
  - deployed with Pulumi and NGINX Gateway Fabric;
  - monitored with VictoriaMetrics and Grafana.
- **[infer]** It is cheap compared with the two VSIX registries, because it stores metadata only, does no scanning, and moderates minimally. The cost of trust is pushed to subregistries.

---

## Comparison table

| | VS Code Marketplace | Open VSX (open-vsx.org) | Official MCP Registry |
| --- | --- | --- | --- |
| **Publisher account** | Microsoft account / Azure DevOps; GitHub OIDC or Entra for CI ([doc](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L62-L84)) | GitHub OAuth plus linked eclipse.org account, signed Publisher Agreement ([doc](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)) | GitHub (device flow, PAT, Actions OIDC), DNS TXT or HTTP well-known with Ed25519/P-384 ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/authentication.mdx?plain=1#L10-L21)) |
| **Namespace ownership** | Publisher ID is first-come; badge needs domain TXT, 6 months of history and manual review ([doc](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/api/working-with-extensions/publishing-extension.md?plain=1#L463-L516)) | Creator becomes contributor; owner granted on a public GitHub issue reviewed by admins ([doc](https://github.com/eclipse-openvsx/openvsx/wiki/Namespace-Access)) | Name is reverse-DNS of the proven GitHub account or domain; org needs Owner role ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/authentication.mdx?plain=1#L52-L54)) |
| **Verified mark** | Blue check ([doc](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L41)) | Shield when the namespace has an owner and the publisher is a member ([doc](https://github.com/eclipse-openvsx/openvsx/wiki/Namespace-Access)) | None; the namespace is the claim ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L70-L74)) |
| **Signing** | Registry signs every package; author signing on the roadmap ([doc](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L64)) | Registry Ed25519 `.sigzip` per version, per-instance key, observed live in production ([code](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/configuration.md?plain=1#L871-L879)) | None; MCPB `fileSha256` only, not validated by the registry ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/package-types.mdx?plain=1#L255-L261)) |
| **Client verification** | VS Code enforces at install via closed `vsce-sign`; can be turned off ([code](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/platform/extensionManagement/node/extensionManagementService.ts#L340-L384)) | `ovsx verify` CLI ([doc](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/cli/README.md?plain=1#L114-L124)); IDE-side verification not found in sources read | None in the registry; "clients do validate" the MCPB hash is a claim [UNVERIFIED] |
| **Malware scan before publication** | Yes: multi-engine AV, sandbox, rescans ([doc](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L52-L54)) | Yes since 2026, per the operator ([doc](https://blogs.eclipse.org/post/brian-king/stronger-safety-nets-vs-code-marketplace-namespace-matching-open-vsx)); ClamAV, YARA, Argus in config ([cfg](https://github.com/EclipseFdn/open-vsx.org/blob/548ae85a31cbe870b7b46a331a119e28c478b07d/configuration/application-production.yml#L69-L205)) | No; delegated to upstream registries and aggregators ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L76-L82)) |
| **Secret scan** | Yes, blocks publishing ([doc](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L66)) | Yes, gitleaks rules, enforced ([cfg](https://github.com/EclipseFdn/open-vsx.org/blob/548ae85a31cbe870b7b46a331a119e28c478b07d/configuration/application-production.yml#L89-L110)) | No |
| **Name-squatting** | Yes ([doc](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/configure/extensions/extension-runtime-security.md?plain=1#L60)) | Similarity check is monitor-only; Marketplace namespace match leads to quarantine ([cfg](https://github.com/EclipseFdn/open-vsx.org/blob/548ae85a31cbe870b7b46a331a119e28c478b07d/configuration/application-production.yml#L80-L120), [doc](https://blogs.eclipse.org/post/brian-king/stronger-safety-nets-vs-code-marketplace-namespace-matching-open-vsx)) | Structural, through the proven namespace; no similarity check |
| **Human review** | After an automated flag or a report ([doc](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/)) | Quarantine queue and edge cases ([doc](https://blogs.eclipse.org/post/christopher-guindon/strengthening-supply-chain-security-open-vsx)) | Manual takedown on report only ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L91)) |
| **Takedown** | Removed and block-listed; public removal log ([doc](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/RemovedPackages.md)) | Purged by a nightly job from a public `extension-control` file ([code](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/server/src/main/java/org/eclipse/openvsx/extension_control/ExtensionControlJobRequestHandler.java#L71-L109)) | `status: deleted`; metadata stays readable ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/moderation-policy.mdx?plain=1#L47-L51)) |
| **Remote disable of installed copies** | Yes: VS Code polls the control manifest every 5 minutes, then disables and uninstalls ([code](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/workbench/contrib/extensions/browser/extensionsViewlet.ts#L1117-L1177)) | Not found in sources read; the file format matches VS Code's, so forks could consume it [infer] | No; left to aggregators and hosts |
| **Self-host** | Private Marketplace: closed container, needs a GitHub Enterprise or Copilot Business/Enterprise sign-in ([doc](https://github.com/microsoft/vscode-docs/blob/1830de0554cac80a2a8a3fc724fe7d74fa7889dc/docs/enterprise/extensions.md?plain=1#L110-L131)) | Full open-source server, plus upstream and mirror modes ([doc](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/deployment.md?plain=1#L57-L59)) | Implement the OpenAPI spec as a subregistry; the official code is "not designed for self-hosting" ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/about.mdx?plain=1#L56-L62)) |
| **Air-gapped** | Rehosting is claimed for air-gap, but sign-in is still required [UNVERIFIED offline]; the kill list needs the Microsoft CDN [code] | Documented: mirror while online, move the DB and storage, turn mirror off; or `ovsx publish` VSIX files ([doc](https://github.com/eclipse-openvsx/openvsx/blob/c4849221281440511b16f4bde547c0371f0b7df6/doc/mirror.md?plain=1#L123-L143)); default extension-control job calls github.com [code] | Fork: seed from file with validation off ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/README.md?plain=1#L50)); data is CC0 ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/terms-of-service.mdx?plain=1#L50)) |
| **Self-host stack** | 1 stateless container, file share or Azure Artifacts, TLS proxy ([doc](https://github.com/microsoft/vsmarketplace/blob/cfff182a99d4500fd94e29e5a166ba57eb64e721/privatemarketplace/latest/README.md?plain=1#L92-L119)) | Spring server, web UI, PostgreSQL, Elasticsearch (optional), blob or local storage, OAuth2 (optional) ([doc](https://github.com/eclipse-openvsx/openvsx/wiki/Deploying-Open-VSX)) | Go server and PostgreSQL ([doc](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/README.md?plain=1#L57)) |
| **Operator-stated cost and effort** | Not published; dedicated support and security engineers ([doc](https://developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/)) | Over 100M downloads/month, fewer than 50 contributors, rate limits; paid tiers €100k and €500k per year ([doc](https://eclipse-foundation.blog/2025/09/23/businesses-built-on-open-infrastructure-have-a-responsibility-to-sustain-it/), [doc](https://managed.open-vsx.org/pricing/)) | Not published; "community supported", minimal moderation; GKE 3–8 nodes ([cfg](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/deploy/Pulumi.gcpProd.yaml#L15-L34)) |

---

## Not verified / open points

1. **Microsoft `vsce-sign` internals.** The trust roots and certificate chain are not public: the npm package is closed and the repo returns 404.
2. **Desktop VS Code `controlUrl`.** Seen only in the vscode.dev web build's product config.
3. **Private Marketplace offline.** Whether its sign-in gate can work with no route to GitHub, and whether the closed container declares `allPrivateRepositorySigned`.
4. **Private Marketplace authentication.** README §2.3 says VS Code does not authenticate to marketplaces; the current code sends a Bearer token. I did not determine which is current for the server side.
5. **open-vsx.org production config.** Whether the scanner set in `application-production.yml` matches what runs; the file header itself says "need confirming".
6. **Two Open VSX namespace checks.** Whether the namespace-ownership publish check in code and the "async post-publish" check in the Oct 2026 blog are the same mechanism.
7. **Open VSX in IDE clients.** Whether any VS Code fork verifies Open VSX `.sigzip` signatures at install, or consumes the Open VSX `extension-control` file as a client kill list.
8. **MCP integrity claim.** The claim that "MCP clients do validate" MCPB `fileSha256` is about third-party clients and was not checked.
9. **Internal Open VSX procedures.** The admin "Standard Operating Principles" for namespace claims are internal and not public.
10. **Costs.** No operating-cost figures were found for the VS Code Marketplace or the MCP Registry.

## Link spot-check (re-opened before finishing, 2026-11-18)

1. **VS Code removes installed malicious extensions.** I re-opened [extensionsViewlet.ts at `36e8c028`](https://github.com/microsoft/vscode/blob/36e8c0289a5f29eae15a933263220d9895302ff6/src/vs/workbench/contrib/extensions/browser/extensionsViewlet.ts#L1117-L1177).
   - The rendered GitHub page truncates the file before line 1117, so I confirmed the lines through the raw file at the same SHA.
   - L1117 `export class MaliciousExtensionChecker`.
   - L1132 `timeout(1000 * 60 * 5) // every five minutes`.
   - L1149 `uninstallExtensions(... { remove: true })`.
   - L1166 "…was found to be problematic and has been uninstalled".
   - The link leads to the owner's source (microsoft/vscode). **OK.**
2. **MCP moderation and removal semantics.** I re-opened the rendered page https://modelcontextprotocol.io/registry/moderation-policy and the repo file [moderation-policy.mdx at `115f8522`](https://github.com/modelcontextprotocol/registry/blob/115f85225c9fac5281d8a2dc8551cf49b004d2f9/docs/modelcontextprotocol-io/moderation-policy.mdx?plain=1#L47-L51).
   - Both contain "consumers should assume minimal-to-no moderation" (L20).
   - Both contain "we set the server's `status` to `"deleted"`, but the server's metadata remains accessible via the MCP Registry API" (L49).
   - The rendered page is the operator's own docs site (modelcontextprotocol.io), built from this repo file. **OK.**

Also re-checked: the Microsoft security blog link (`developer.microsoft.com/blog/security-and-trust-in-visual-studio-marketplace/`) returns 200. Note that `devblogs.microsoft.com/blog/...` redirects to it.
