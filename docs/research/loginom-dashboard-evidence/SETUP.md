# Temporary Loginom dashboard research stand

This directory preserves the setup notes, Dockerfiles, HTTP configuration,
checksums and screenshot from the 2026-11-03 investigation. The original build
context was `/home/kiselev/storage/tmp/dashboard-research-20261103/`.
Downloaded Loginom distributions, prerequisite libraries, account configuration
and raw build logs are not included. The build commands below require that
prepared context; this directory alone is not a self-contained distribution.

Current master was established via GitLab projects/77/repository/branches/master.
The matching successful master pipeline 204732 / build_staging job 1358774 supplied
an existing artifact archive. No CI job was created, retried, cancelled or changed.

Build: Loginom 7.5.0-alpha+build.4732, master
`fe412e7de97270adba53238f1f792d85174a4b26` (2026-11-02).
Exact checksums and image/container identities are in `manifest.json`.

The artifact was downloaded by Python urllib inside one process: token read directly
from an existing integration/e2e token file into a PRIVATE-TOKEN request header.
No token was passed via CLI arguments or emitted to tool output. No .env was read.
The only extracted archive branches were Dist/Server, Dist/Client,
Dist/ClientDebug, Dist/BatchLauncher. Archive paths were checked to remain inside
this temporary folder.

Both release/minified and debug client files remain available under
`artifacts/Dist/Client/client/` and `artifacts/Dist/ClientDebug/client/`.
Server binary is the exact archive binary. The July master server image supplies
Debian 13 prerequisite libraries; repository integration server libraries were
copied over it, including the current libxml2.so.16. This is not a clean production
build of the artifact's Dockerfile; it is a temporary test image with the exact
current server binary and clients. Dockerfiles are saved beside this document.

## Local commands actually used

```sh
docker build -t dashboard-research-20261103-server:fe412e7d -f Dockerfile.server .
docker build -t dashboard-research-20261103-studio:fe412e7d -f Dockerfile.studio .
docker network create --subnet 10.254.76.0/28 dashboard-research-20261103-net
docker run -d --name dashboard-research-20261103-server --hostname dashboard-research-20261103-server --network dashboard-research-20261103-net dashboard-research-20261103-server:fe412e7d
docker run -d --name dashboard-research-20261103-studio --hostname dashboard-research-20261103-studio --network dashboard-research-20261103-net -p 127.0.0.1::80 dashboard-research-20261103-studio:fe412e7d
docker port dashboard-research-20261103-studio
```

The automatic Docker address pool was exhausted. The explicit free /28 network
was chosen after inspecting all existing Docker subnets. No other network,
container, volume or image was stopped or removed. Both containers have Mounts=[].
Server ports are exposed only to this dedicated network; studio port 32808 is
bound only to 127.0.0.1.

## URLs and checks

- Minified: http://127.0.0.1:32808/app/?testable=true
- Debug: http://127.0.0.1:32808/app-debug/?testable=true
- Both index pages and Version.js returned HTTP 200.
- Both /app/ws/ and /app-debug/ws/ returned HTTP 101 Switching Protocols.
- Both client versions report build 4732.
- Minified bg/app/Uses.js: 3034 bytes / 1 line; debug: 4806 bytes / 136 lines.
- Server /app/loginomd checksum equals the downloaded archive binary.

Application login uses the unchanged official artifact test users; credentials
are not recorded here. Browser login and node execution are verified separately
by the parent researcher.

## Fixtures copied (no user storage was copied)

To user/research/ and admin/research/ inside server storage:

- SimpleWorkflow.lgp from e2e-tests/testdata/workflow/toolbar/SimpleWorkflow.lgp
- CalendarGenerator.lgp from integration/testdata/Custom/agent-validation/task53_calendar_generator.lgp

The first fixture contains built-in test values and several workflow nodes.
CalendarGenerator.lgp is an unverified legacy fixture with no package references.
The browser researcher confirmed that it is partially incompatible with this
master: node "Периоды в переменную" lacks the CountOrder attribute, and three
links were not restored. Do not use it as evidence of successful node execution.
The original fixture was left unchanged. SimpleWorkflow.lgp execution is still
being investigated separately.

## Shutdown after research (not performed)

```sh
docker rm -f dashboard-research-20261103-studio dashboard-research-20261103-server
docker network rm dashboard-research-20261103-net
```

Do not invoke the full existing integration install scripts for this stand:
functions.sh docker_prep stops all containers matching name=loginom;
install removes branch-specific images/containers; loginom_install removes
~/builds/<branch>. For master it also selects ClientDebug rather than Client.

## Additional sales fixture: JavaScript source verified live

At the browser researcher's request, only `sales.lgp` was copied to
`user/research/sales.lgp` and `admin/research/sales.lgp` inside the server.
Source: `/home/kiselev/git/loginom-ai-agent/evals/tasks/local-path-scenarios/local-lgp-edit/data/Пакет #1/sales.lgp`.
It contains an ordinary JavaScript node `JS: Category, amount` with embedded
SourceText, plus calculator/reform/export nodes. The browser researcher confirmed
successful execution of this source node on this stand's current master minified
client. The source node's output `DataSource` reported `Category` string,
`amount` integer, rowCount 3; an offset=1 read returned Beta/20 followed by Alpha/25.
No claim is made that the other nodes or export were executed.

An independent read of the host fixture's XML archive confirms the literal rows
Alpha/10, Beta/20, Alpha/25 in exactly that order and its output schema dtString /
dtInteger. The ordinary TBGJavaScriptEngine's node GUID is
bee595ca-d654-4594-b941-c50a69511e0f. This agrees with the observed offset=1 result.

The host fixture and both copied user/admin files have the same SHA256:
`4313b47f09cc875993e8acc42ef2d35baec7d7dc61589af817d413b37261e7bf`.
The container checksums were read directly with sha256sum. No related exports,
external data files or user storage were copied.
