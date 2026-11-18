# GitHub and Russian git hosting for a PR-maintained public catalog

Research date: 2026-11-18. Sources were read on that date. Nothing was tested live: no account was registered, no PR or MR was opened, and no access was tested from inside Russia.

Labels:

- **[P]**: primary source, read directly (the owner's own page, document, statement or data).
- **[M]**: my own query of primary data (OONI API, OFAC list export).
- **[N]**: news report, with no primary source found.
- **[U]**: unverified or unresolved.
- **[NF]**: searched for and not found.
- **[A]**: my assessment or inference, not a source's claim.

How each label was checked:

- **[P] and [M]:** checked against raw page text, PDFs or API data, unless a claim says "(summary only)".
- **[N]:** read through an automated page summary, not raw text.

## Short answer

**Direct answers [A]:**

- **Can people in Russia use GitHub to publish and review?** Yes, with caveats. No GitHub policy bars ordinary users or companies in Russia from public repositories, PRs, Actions or Pages. The exception is anyone on the SDN list or linked to it. Access from Russia has become measurably less reliable in 2026, with no official block. There is political pressure to move off GitHub, but I found no official ban or requirement for companies.
- **Are GitVerse and GitFlic practical alternatives for a public catalog run through PRs?** Partly. GitVerse supports the whole loop, including Pages hosting. GitFlic supports fork, MR, review and CI, though I could not confirm hosted runners, and I found no static hosting. Both add friction for contributors outside Russia: sign-up rules (GitVerse), sanctions exposure of the operator or its group, and reachability from abroad, which I did not test.

**Key findings:**

- **Policy.** GitHub's trade-controls page does not list Russia among the regions where GitHub.com is restricted. Russia is named only for GitHub Enterprise Server and Copilot. Russia-related restrictions on GitHub.com apply to SDN-listed and other blocked parties "wherever located", not to Russia as a whole [P](https://docs.github.com/en/site-policy/other-site-policies/github-and-trade-controls).
- **Access.** github.com is reported not to be in the registry of prohibited sites ([N](https://verstka.media/v-rossii-nachali-ogranichivat-dostup-k-github), Verstka's analysis). Roskomnadzor has denied restricting GitHub, but only in statements to the press [N](https://www.vedomosti.ru/technology/news/2026/05/08/1196173-github-ne-ogranichivaetsya). In OONI data, the github.com failure rate from Russia rose from about 0.2–1.8% a month in 2025 to 2–5% a month in 2026. Single days peaked at 15–21% in May, July and September 2026 [M](https://api.ooni.io/api/v1/aggregation?probe_cc=RU&domain=github.com&since=2025-01-01&until=2026-11-18&test_name=web_connectivity&axis_x=measurement_start_day).
- **Alternatives.** GitVerse and GitFlic both offer public repositories, PR/MR from forks, review, CI and a REST API. I found static-site hosting only for GitVerse (`*.gitverse.site`, no custom domains) [P](https://gitverse.ru/docs/pages/faq).
- **Barriers for foreigners.**
  - **GitVerse.** The operator, АО «СберТех», is on the U.S. SDN list [M](https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV). Sign-up goes through GigaID, which takes phone numbers from only eight countries [P](https://gitverse.ru/docs/gitverse/account-profile/quick-start).
  - **GitFlic.** The operator, ООО «РеСолют», is not on the SDN list. The site footer names «Группа Астра», which is on the list. I could not verify the corporate link between the two [M](https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV), [P](https://gitflic.ru/price).
- **Russian law.** The only hosting-location rule I found is in the Russian software registry rules. Software in the registry must have its source storage and build machinery on Russian territory. The rule says nothing about public catalogs or mirrors [P](http://static.government.ru/media/files/c5npn3U2Pz2DiECPIrdUwM9J6emh82R1.pdf).

---

## 1. GitHub's policy for users in Russia

Source: the [GitHub and Trade Controls](https://docs.github.com/en/site-policy/other-site-policies/github-and-trade-controls) page and its [source file](https://github.com/github/docs/blob/main/content/site-policy/other-site-policies/github-and-trade-controls.md) [P]. The page shows no date.

- **Revision history.** The last substantive revision was [commit 891a1c8, 2025-09-05](https://github.com/github/docs/commit/891a1c8859b1ccbec9655cdbea0a03b603141833), "Revise GitHub's trade controls policy language". It removed Syria from the sanctioned-region list. The 2026 commits ([67ac1e2](https://github.com/github/docs/commit/67ac1e22b2b081fe04fdfc59b46d756d4b624ccb), [836fb8f](https://github.com/github/docs/commit/836fb8f1a60d620e10a8f2a1311e3c2eb24ba06a)) only change layout and front matter [P].
- **Russia in earlier versions.** Russia was not in the GitHub.com sanctioned-region list in the March 2024 version or the September 2025 version either. I checked this in the diffs of [5b35686](https://github.com/github/docs/commit/5b356869b124f0f40a2262fe649c30f02fb13932) and 891a1c8 [P].

| Who | What the page says | Label |
|---|---|---|
| **Russia, named** | Named only for **GitHub Enterprise Server**: it "may not be sold to, exported, or re-exported to" Country Group E:1, "currently include[s] … Russia". Also named for **Copilot**: it "may not be sold, exported, or re-exported to" listed destinations "without authorization", which include Russia. The page says nothing about GitHub.com, paid plans, Actions or Pages for mainland Russia. | [P](https://docs.github.com/en/site-policy/other-site-policies/github-and-trade-controls) |
| **Listed sanctioned regions** (Crimea, separatist areas of Donetsk and Luhansk; North Korea gets no service at all; Iran is licensed; Cuba is available) | **Organisations:** "The restriction suspends access to private repository services and paid services, such as … free or paid private repositories, secret gists, paid Action minutes, Sponsors, and GitHub Marketplace services." Paid organisations keep only public repositories, "downgraded to archived read-only repositories". Free organisations keep "full access to free public repositories for open source projects (and associated public Pages), public gists, and allotted free Action minutes". **Individuals:** limited free services "for personal communications only, and not for commercial purposes". Free individual users can make restricted private repositories public. | [P](https://docs.github.com/en/site-policy/other-site-policies/github-and-trade-controls) |
| **SDNs, other blocked parties, certain government officials** | "may be restricted from accessing or using GitHub, wherever located". "Users may not use GitHub.com for or on behalf of such parties". A flagged account "will not be able to use any GitHub features". Appeals go through Support. | [P](https://docs.github.com/en/site-policy/other-site-policies/github-and-trade-controls) |

- **How GitHub determines location.** It uses "a number of sources, including IP addresses and payment history". "Nationality and ethnicity are not used" [P](https://docs.github.com/en/site-policy/other-site-policies/github-and-trade-controls).
- **GitHub's 2022 statement.** On 2 March 2022 GitHub said it is "continuing to ensure free open source services are available to all, including developers in Russia". It also said it was complying with export controls [P](https://github.blog/news-insights/policy-news-and-insights/our-response-to-the-war-in-ukraine/).
- **April 2022 account blocks.** Accounts of SDN-linked Russian companies were reportedly blocked in April 2022, including Sber's "Sberbank-Technology" and Alfa-Bank's "alfa-laboratory" [N](https://gameworldobserver.com/2022/04/15/github-starts-blocking-accounts-of-russian-devs-and-companies-including-sanctioned-banks).
- **Paid plans for mainland Russia.** The trade-controls page does not address them [NF]. GitHub's billing docs list "Bank card or PayPal" as payment methods [P](https://docs.github.com/en/billing/how-tos/set-up-payment/manage-payment-info). Visa said on 5 March 2022 that "all transactions initiated with Visa cards issued in Russia will no longer work outside the country" [P, summary only: the site returned 403 to direct download](https://investor.visa.com/news/news-details/2022/Visa-Suspends-All-Russia-Operations/default.aspx). It follows that paying GitHub with a Russian-issued Visa card would likely fail. That is a practical payment obstacle, not a GitHub policy [A].
- **Newer GitHub statements.** I found no GitHub statement from 2024–2026 that restricts Russia-based accounts as a class. I also found no GitHub statement about the 2026 access problems in Russia [NF].

## 2. Blocking and slowdowns, 2025–2026

### Roskomnadzor's position

Roskomnadzor's denials appeared only as statements to the media. I found none on rkn.gov.ru or an official RKN channel [NF].

- **8 May 2026, to Vedomosti:** "доступ к ресурсам GitHub ведомством не ограничивается" ("the agency is not restricting access to GitHub resources") [N](https://www.vedomosti.ru/technology/news/2026/05/08/1196173-github-ne-ogranichivaetsya). The same quote is in [Interfax](https://www.interfax.ru/digital/1088499).
- **20 May 2026, to Interfax:** the Public Communication Network Monitoring and Management Center "recorded no problem with access and functionality of GitHub resources, API is operating without disruptions". It added that "user registration and project creation are carried out normally" [N](https://interfax.com/newsroom/top-stories/117686/).
- **14 July 2026:** Roskomnadzor said it does not restrict Google, GitHub or Apple [N](https://www.securitylab.ru/news/574808.php).

### Blocking registry

- **Domain not listed.** github.com is not in the registry of prohibited sites. More than 130 individual GitHub pages are, entered by courts, RKN, Rospotrebnadzor and the Interior Ministry. Of those, 61 were added in 2026 (to early May), 59 in 2025 and 16 in 2024. These counts are Verstka's own analysis of the registry [N](https://verstka.media/v-rossii-nachali-ogranichivat-dostup-k-github).
- **Official lookup not reached.** I tried the official lookup tool [blocklist.rkn.gov.ru](https://blocklist.rkn.gov.ru/), but the host did not answer from my environment, so the registry status is unverified by me [U].

### OONI measurements for Russia (Web Connectivity test) [M]

Query: [github.com, daily, 2025-01-01 to 2026-11-18](https://api.ooni.io/api/v1/aggregation?probe_cc=RU&domain=github.com&since=2025-01-01&until=2026-11-18&test_name=web_connectivity&axis_x=measurement_start_day). Chart view: [OONI Explorer](https://explorer.ooni.org/chart/mat?probe_cc=RU&since=2025-01-01&until=2026-11-18&time_grain=month&axis_x=measurement_start_day&test_name=web_connectivity&domain=github.com). The other domains use the same query with a different `domain=`: [raw.githubusercontent.com](https://api.ooni.io/api/v1/aggregation?probe_cc=RU&domain=raw.githubusercontent.com&since=2025-01-01&until=2026-11-18&test_name=web_connectivity&axis_x=measurement_start_day) and [api.github.com](https://api.ooni.io/api/v1/aggregation?probe_cc=RU&domain=api.github.com&since=2025-01-01&until=2026-11-18&test_name=web_connectivity&axis_x=measurement_start_day).

| Month | github.com n | github.com anomaly % | github.com anomaly+failure % | raw.githubusercontent.com anomaly+failure % | api.github.com anomaly+failure % |
|---|---|---|---|---|---|
| 2025-01 | 2356 | 0.7 | 0.9 | 0.4 | 0.7 |
| 2025-02 | 2023 | 0.1 | 0.2 | 0.5 | 0.1 |
| 2025-03 | 1783 | 0.2 | 0.4 | 0.3 | 0.3 |
| 2025-04 | 1764 | 0.2 | 0.2 | 0.4 | 0.3 |
| 2025-05 | 2156 | 0.3 | 0.4 | 0.2 | 1.0 |
| 2025-06 | 1598 | 0.8 | 1.4 | 1.0 | 0.9 |
| 2025-07 | 2280 | 0.7 | 1.1 | 0.9 | 0.1 |
| 2025-08 | 2330 | 0.2 | 1.8 | 1.3 | 1.1 |
| 2025-09 | 2862 | 0.8 | 1.3 | 1.3 | 0.5 |
| 2025-10 | 2637 | 0.2 | 1.2 | 1.1 | 0.8 |
| 2025-11 | 1966 | 0.8 | 1.3 | 1.0 | 1.3 |
| 2025-12 | 1515 | 0.7 | 1.3 | 1.1 | 1.3 |
| 2026-01 | 1067 | 0.5 | 2.8 | 3.6 | 1.5 |
| 2026-02 | 2145 | 1.8 | 3.5 | 4.5 | 2.8 |
| 2026-03 | 6580 | 1.2 | 2.0 | 2.6 | 3.5 |
| 2026-04 | 5714 | 1.2 | 3.0 | 2.7 | 2.3 |
| 2026-05 | 4613 | 2.6 | 4.7 | 3.6 | 2.7 |
| 2026-06 | 4272 | 2.9 | 5.2 | 5.4 | 2.7 |
| 2026-07 | 4761 | 4.5 | 5.2 | 3.2 | 1.8 |
| 2026-08 | 4099 | 2.0 | 3.0 | 4.0 | 2.5 |
| 2026-09 | 2760 | 2.9 | 3.1 | 1.4 | 3.4 |
| 2026-10 | 4136 | 2.5 | 3.0 | 2.1 | 2.8 |
| 2026-11 (to 17th) | 3157 | 2.6 | 3.4 | 3.1 | 2.2 |

- **Peak days for github.com (anomaly+failure).** 2026-05-05: 10.6%. 2026-05-06: 16.2%. 2026-05-07: 15.0%. 2026-07-14: 20.9%. 2026-09-19: 20.1%. The April 2026 daily mean was 3.1% [M].
- **Matching the press figures.** Press reports cite a jump from about 4% to 16% in early May ([Verstka](https://verstka.media/v-rossii-nachali-ogranichivat-dostup-k-github)). Those figures match anomaly+failure. Counting anomalies alone gives 13.5% on 6 May [M].
- **Confirmed blocking.** github.com, raw.githubusercontent.com and api.github.com had **zero** "confirmed" measurements, meaning a known blockpage was seen, in the whole period [M]. gist.github.com had **two** measurements flagged "confirmed" on 2026-10-15, out of 125 that day, from AS39028 and AS8324 ([query](https://api.ooni.io/api/v1/measurements?probe_cc=RU&domain=gist.github.com&confirmed=true&since=2026-10-01&until=2026-11-01)) [M]. They are probably false positives [A]:
  - Both matched `cp.e_unk_blk_11`, a national-scope pattern that looks for the Chinese text "禁止访问" ("access forbidden") anywhere in the page body [P](https://github.com/ooni/blocking-fingerprints/blob/main/fingerprints_http.csv).
  - Both also matched `cp.fp_x_redirect_just`, whose scope `fp` OONI defines as "fingerprint for false positives" [P](https://github.com/ooni/blocking-fingerprints/blob/main/Readme.md).
  - The Explorer pages for these measurements returned HTTP 429, so I did not open them: [measurement 1](https://explorer.ooni.org/m/20261015055904.917378_RU_webconnectivity_bd033ede5bb124d4), [measurement 2](https://explorer.ooni.org/m/20261015054607.553767_RU_webconnectivity_58a0afe767634bf8).
- **Caveats.** Volunteer probes ran 13–266 github.com measurements a day in 2026. An anomaly is not a confirmed block, and the share of measurements is not the share of users affected. I queried only the bare domains `github.io` (1 measurement in 2026) and `pages.github.com` (none), not individual `*.github.io` sites. GitHub Pages reachability from Russia is therefore unmeasured here [M].

### Incidents and other statements

- **14 July 2026.** A roughly two-hour disruption across Russia, with problem reports from 33 cities on Detector404 [N](https://www.securitylab.ru/news/574808.php). DownDetector had 106 complaints by 11:03 [N](https://www.vedomosti.ru/technology/news/2026/07/14/1213469-problemi-github). That day's GitHub status incident concerned Codespaces [N](https://www.securitylab.ru/news/574808.php), with the incident page at [githubstatus.com](https://www.githubstatus.com/incidents/dfpfsngcwywf) (not opened by me).
- **GitHub CTO post, 28 April 2026.** The post covers global capacity and reliability work and April incidents. "Russia" does not appear anywhere in its text [P](https://github.blog/news-insights/company-news/an-update-on-github-availability/). Skillbox cites it as GitHub's explanation for the Russian problems, but that link to Russia is Skillbox's, not GitHub's [N](https://skillbox.ru/media/code/blokirovka-github-v-rossii-chto-izvestno/).
- **Anton Gorelkin, 12 May 2026.** He is first deputy chair of the State Duma IT committee, a legislator and not a regulator. He recommended that developers "срочно переносить свои проекты на другие Git-репозитории" ("urgently move their projects to other Git repositories") and blamed GitHub's owners [P](https://t.me/webstrangler/4775). In a follow-up the same day he said he had not called for blocking [P](https://t.me/webstrangler/4777).
- **Other developer resources.** Roskomnadzor did not address these. git.kernel.org was disrupted in February 2026, Debian and Rust repositories in April, and pypi.org in June, where connections dropped at the TLS stage. These come from a compilation of news reports [N](https://te-st.org/2026/06/01/pypigithubout/).

## 3. GitVerse (Sber) and GitFlic

| | GitVerse (gitverse.ru) | GitFlic (gitflic.ru) |
|---|---|---|
| **Operator** | АО «СберТех», INN 7736632467. User agreement approved by order No. 439 of 09.10.2026 [P](https://gitverse.ru/files/polzovatelskoe-soglashenie.pdf) | ООО «РеСолют», INN 9704054697, OGRN 1217700127094 [P](https://gitflic.ru/docs/terms). Site footer reads "Группа Астра, 2026" [P](https://gitflic.ru/price) |
| **Public repos** | Yes, public or private visibility [P](https://gitverse.ru/docs/gitverse/basics/quick-start) | Yes. Free plan: public repositories have no user limit, private ones up to 5 people. 4 GB per repository, 100 MB per commit [P](https://gitflic.ru/price) |
| **PR / MR** | Pull requests ("запросы на слияние") with reviewers, branch protection with minimum approvals, drafts, stacks [P](https://gitverse.ru/docs/collaborative/repositories/guides/pull-requests). PRs from a fork into the original repository are documented [P](https://gitverse.ru/docs/collaborative/repositories/guides/pull-requests/pull-request) | Merge requests with approval rules and code owners. MRs from a fork are documented, and the merge-result pipeline runs in the main project [P](https://docs.gitflic.ru/latest/project/merge_request/), [P](https://docs.gitflic.ru/latest/project/fork/) |
| **CI** | YAML workflows in `.gitverse/workflows/`, with `uses:` actions such as `actions/checkout@v4`. Cloud, self-hosted and organisation runners [P](https://gitverse.ru/docs/cicd/introduction). Triggers include `pull_request`, `pull_request_target` and `pull_request_review` [P](https://gitverse.ru/docs/cicd/docs/triggers). Cloud-runner limits per user or organisation: 1000 min for public and 500 min for private repositories (verified organisations get 2000/1000), 30 min per job, 500 MB of artifacts kept 30 days. The reset period is not stated on the page [P](https://gitverse.ru/docs/cicd/docs/limits) | `gitflic-ci.yaml` pipelines run on agents (runners) that you register [P](https://docs.gitflic.ru/latest/cicd/agent/), [P](https://docs.gitflic.ru/latest/company/saas_runner_setup/). The pricing page lists CI/CD on the free plan with no minutes quota [P](https://gitflic.ru/price). Whether gitflic.ru provides shared hosted runners to free users is **not confirmed** in the docs [NF] |
| **Static site hosting** | **GitVerse Pages** on Free, Pro and Enterprise plans. Sites live at `https://<owner>.gitverse.site[/<repo>]` and build with Jekyll or a CI workflow. Artifact limit 500 MB, relative paths only [P](https://gitverse.ru/docs/pages/overview). "пользовательские домены не поддерживаются" (custom domains are not supported) [P](https://gitverse.ru/docs/pages/faq) | **No Pages-like service found** in the docs index [NF](https://docs.gitflic.ru/latest/). The closest is "Книга проекта" (project book), which renders Markdown documentation from `SUMMARY.md` [P](https://docs.gitflic.ru/latest/project/book/) |
| **API** | REST at `api.gitverse.ru` with a Bearer token. Endpoints include `POST /repos/{owner}/{repo}/pulls`, PR reviews, `PUT …/contents/{filename}`, forks, Actions runs, secrets and runners, and webhooks. I found only `GET …/pulls/{n}/merge` listed, with no merge-by-API endpoint [P](https://gitverse.ru/docs/developers/public-api) | REST at `api.gitflic.ru`. "Отправка любого REST-API метода требует авторизации" (every REST API method requires authorisation). Limit of 500 requests per hour on gitflic.ru. MR endpoints include create, approve and merge [P](https://docs.gitflic.ru/latest/api/intro/), [P](https://docs.gitflic.ru/latest/api/mergeRequest/) |
| **Sign-in** | "Регистрация новых пользователей GitVerse доступна только через GigaID" (new GitVerse users can register only through GigaID). Sber ID and Cloud.ru ID are temporarily available for existing users only [P](https://gitverse.ru/docs/gitverse/account-profile/quick-start) | Email and password with email confirmation, or one-click sign-in with VK ID or Yandex ID [P](https://docs.gitflic.ru/latest/common/registration/) |
| **Foreign users** | GigaID accepts phone numbers from Russia, Armenia, Belarus, India, Kazakhstan, Kyrgyzstan, Uzbekistan and Ethiopia [P](https://gitverse.ru/docs/gitverse/account-profile/quick-start). The GigaID site also offers sign-up "with a phone number, email, or Sber ID", but warns that "some services require a Russian phone number for sign-in" [P](https://id.ru/en/). **Unresolved:** whether someone outside those 8 countries can join GitVerse by email alone [U] | The terms have no citizenship, residency or country restriction (my reading of the agreement). Disputes go to Russian courts [P](https://gitflic.ru/docs/terms). Email sign-up needs no phone [P](https://docs.gitflic.ru/latest/common/registration/). Foreign sign-up not tested [U] |
| **Data location** | Agreement governed by Russian law [P](https://gitverse.ru/files/polzovatelskoe-soglashenie.pdf). Physical data location is not stated on the pages I read [NF] | "Все данные хранятся на территории РФ" (all data is stored in Russia) [P](https://gitflic.ru/price) |
| **U.S. SDN list** (OFAC export published 2026-11-12) | "JOINT STOCK COMPANY SBERBANK TECHNOLOGIES" is listed (RUSSIA-EO14024), Tax ID 7736632467, the same INN as the GitVerse operator [M](https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV) | ООО «РеСолют» is **not** found by name, INN or OGRN. "PUBLIC JOINT STOCK COMPANY ASTRA GROUP" (Tax ID 7726476459) **is** listed [M](https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV). I did not verify the corporate link between РеСолют and Astra Group beyond the footer [U] |

**Notes**

- **What SDN status means.** OFAC states that SDNs' "assets are blocked and U.S. persons are generally prohibited from dealing with them" [P](https://ofac.treasury.gov/faqs/18). I draw no legal conclusion about individual foreign contributors using either service.
- **GitVerse default content licence.** Under the GitVerse agreement (cl. 7.2–7.3), content may be used by others only for personal non-commercial purposes "если условиями соответствующей лицензии, размещаемой Пользователем, не указано иное" ("unless the licence the user publishes states otherwise") [P](https://gitverse.ru/files/polzovatelskoe-soglashenie.pdf). A public catalog there would need an explicit licence file to allow wider reuse [A].
- **Practicality for a public catalog maintained through PRs [A].**
  - **GitVerse** covers the full GitHub-style loop: fork, PR, review, CI on pull requests, and Pages hosting at `*.gitverse.site`. Its workflow syntax resembles GitHub Actions. The limits that matter are sign-up only through GigaID (with a phone-country restriction), no custom domain for Pages, and an operator on the SDN list.
  - **GitFlic** covers fork, MR, review and CI. Free email sign-up has no phone requirement. I found no static-site hosting. Its API is capped at 500 requests per hour on gitflic.ru, and shared runners are unconfirmed.
  - **API tokens.** Both APIs document the token header as required on every request ([GitVerse](https://gitverse.ru/docs/developers/public-api): "Обязательный заголовок"; [GitFlic](https://docs.gitflic.ru/latest/api/intro/)) [P].
  - **Both.** Reachability from outside Russia was not tested.

## 4. Requirements for Russian companies

- **Russian software registry: source storage must be in Russia.** Government Decree No. 2461 of 28.12.2022 (in force 1 January 2023) added sub-point «и» to п. 5 of the registry rules (Decree No. 1236): "технические средства хранения исходного текста и объектного кода программного обеспечения, а также технические средства компиляции исходного текста в объектный код программного обеспечения находятся на территории Российской Федерации" ("the technical means for storing the source and object code of the software, and the technical means for compiling the source into object code, are located on the territory of the Russian Federation") [P, official PDF](http://static.government.ru/media/files/c5npn3U2Pz2DiECPIrdUwM9J6emh82R1.pdf), with the announcement at [government.ru](http://government.ru/docs/47473/).
  - **Documentation requirement.** The same decree requires the application to include documentation describing these storage and compilation means (п. 11 «ж») [P](http://static.government.ru/media/files/c5npn3U2Pz2DiECPIrdUwM9J6emh82R1.pdf).
  - **Still in force.** The consolidated text, a copy in the Garant legal database including amendments up to 13 August 2026, still contains п. 5 «и» [copy](https://base.garant.ru/71252170/).
  - **Scope.** This is a condition for including a software product in the registry. The text does not mention public mirrors, a particular hosting service, or catalogs (my reading).
  - **EAEU registry.** The parallel registry for software from Eurasian Economic Union countries requires these means to be on the territory of EAEU member states [P](http://static.government.ru/media/files/c5npn3U2Pz2DiECPIrdUwM9J6emh82R1.pdf).
- **National open-source repository.** The experiment under Decree No. 1804 of 10.10.2022 was scheduled for 1 November 2022 to 30 April 2024 [P](https://rfrit.ru/repozitorii). I read only part of that page. In March 2024 the launch was reported postponed indefinitely for lack of funding [N](https://habr.com/ru/news/808557/), a link I did not open. In October 2024 the Ministry of Digital Development reportedly dropped the national repository idea in favour of a concept of Russian repositories under unified state requirements [N](https://www.securitylab.ru/news/552895.php). I found no adopted act that sets such requirements [NF].
- **October 2026 draft on trusted software.** The Ministry of Digital Development drafted requirements for trusted software, including "разработка, хранение исходного кода и сборка ПО в контролируемой среде на территории России" ("development, source-code storage and builds in a controlled environment on Russian territory"). The expert review for the trusted list is described as voluntary [N](https://rg.ru/2026/10/14/programma-bez-gvozdej.html). I did not find the draft text on regulation.gov.ru [NF].
- **Corporate policies.** I found no official ban or recommendation from the Ministry or Roskomnadzor telling companies to stop using GitHub [NF]. The only such call is the deputy's personal recommendation above [P](https://t.me/webstrangler/4775). I found no published corporate policies on this.

## Not verified or not tested

- **No live tests.** I did not register, sign in, or open a PR or MR on any platform.
- **Reachability.** I did not measure GitVerse or GitFlic from abroad, or `*.github.io` from Russia.
- **GitVerse email sign-up.** Not resolved: can a user from outside the 8 GigaID countries register with email only?
- **GitFlic runners.** Whether gitflic.ru provides shared hosted runners for free accounts.
- **GitFlic ownership.** The ownership link between ООО «РеСолют» and PJSC Astra Group.
- **Registry status of github.com.** Not checked: blocklist.rkn.gov.ru did not answer from my environment.
- **gist.github.com flags.** Whether the two "confirmed" OONI flags are real blocks; they are probably false positives.
- **Source quality.** Roskomnadzor's denials come only from media reports, and the page-block counts come only from Verstka's analysis.
