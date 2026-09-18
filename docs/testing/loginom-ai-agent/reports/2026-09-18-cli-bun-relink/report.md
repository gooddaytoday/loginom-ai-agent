# Isolated Bun rebuild preparation — 2026-09-18

The Dockerfile in this directory produced image
`sha256:2dc56396b12b691b1a20e13c5d9d854ad2cc554656b58dad7f16913b9143fbad`.
The Ubuntu base digest is pinned. LLVM 21.1.8 and Rust nightly-2025-12-10 with
rust-src match the requirements read from the exact Bun source revision.
Observed versions are recorded in toolchain-summary.json. Apt package versions
are recorded by observation; the Dockerfile does not claim immutable apt mirrors.
No host packages or Desktop installation were changed.

The full Bun source was extracted to `/tmp/loginom-bun-relink-src` with member
path/link checks. BUN_BUILD_PREFETCH_DIR contains 21 verified source archives
under the URL keys used by Bun's own fetcher. The Cargo cache is seeded with the
43 verified lol-html crate archives. Downloaded repository instructions were not
applied as instructions to this project.

`bun scripts/build.ts --profile=release-local --configure-only` passed without
network: 22 dependencies, 88 code-generation rules and 1130 object files.
`bun scripts/build.ts --profile=release-local --target=tinycc -j2` passed without
network: fetched the pinned TinyCC from the prepared cache, applied Bun's tcc.h
patch, ran the generator and compiled all ten TinyCC objects. One upstream
const-qualifier warning was emitted; exit 0. The first configure attempt used
UID 1000 and failed with EACCES; using the observed source owner 1001 fixed the
invocation without changing source permissions or code.

Both commands ran non-root with capabilities dropped and no-new-privileges,
2 CPUs (affinity 0,1), 12 GiB memory, no extra swap. Source work is isolated in
/tmp; WebKit and toolchain Bun mounts are read-only. GIT_SHA is the verified
source archive's original commit, not a newly invented Git revision.

Full WebKit rebuild was started with `--target=WebKit -j2` using the same
limits and network disabled. Its CMake configure/generate passed; compilation
is still in progress at this checkpoint. Full Bun relink has not run.
The local WebKit recipe uses container system ICU 78.2, whereas the distributed
upstream Bun reports ICU 75.1. This exercise tests rebuilding with local libraries,
not byte-for-byte reproduction of the upstream release. The exact ICU 75.1 source
remains in the distribution companion. No full rebuild PASS is claimed yet.

Live work paths: `/tmp/loginom-bun-relink-toolchain/webkit.log`,
`/tmp/loginom-bun-relink-src/build/release`; container `loginom-bun-relink-webkit`.
Revalidate container/process state before resuming; a log file alone is not proof
that a build is still running.
