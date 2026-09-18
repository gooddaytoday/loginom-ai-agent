# Bun corresponding-source collection — 2026-09-18

The separate companion at `/tmp/loginom-cli-bun-source-companion` contains 24
pinned archives, 2167407693 compressed bytes. All source and delivered-copy hashes
passed the builder, followed by independent `sha256sum -c SHA256SUMS` (24/24).
Missing required input fails before output creation. Host typecheck PASS.

Twenty direct native dependency archives were downloaded from their official
repositories at the exact commits already recorded for the pinned Bun build.
All 27 previously collected raw upstream notice texts matched the files inside
these archives. This collection preserves nested notices and per-file source
headers without relying on a filename or copyright-marker scan.

The complete Bun upstream archive includes 13085 regular files, 53 build modules
and 15 dependency patches. Unlike the earlier src-only archives, it also includes
build.zig, scripts/build.ts and the actual dependency recipes. Its SHA256 is
`aa045c1f3ddd3eb41ed8452d8a73eaab3b3322386416ebb1b160a6af6978d3e5`.
The other inputs are the already verified WebKit archive, official ICU 75.1
source release and Node 24.3.0 headers. Exact URLs, commits, sizes and hashes live
in packages/loginom-host/licenses/bun/source-companion.json.

Submodule review: HdrHistogram benchmark, lol-html html5lib-tests and picohttpparser
picotest are upstream test submodules, not included. Bun's lsquic DirectBuild
explicitly compiles the separately pinned lshpack/lsqpack sources; both archives
are supplied. The old make/zig instructions in Bun LICENSE are retained unchanged
as upstream text, but are not represented as verified current build instructions.
Use the build scripts supplied with the exact Bun revision.

The collection is not yet an offline rebuild closure: lol-html's transitive Rust
crates, Rust/toolchain inputs and actual rebuild/relinking validation remain open.
The machine has no clang or cargo on PATH; Bun's current recipe requires LLVM 21
and its pinned Zig fork. An isolated toolchain must be prepared for the next stage.
No downloaded sources were executed during this collection. No publication or
release-compliance approval is claimed. Existing binary candidate hashes remain
unchanged; the companion is supplied alongside them.
