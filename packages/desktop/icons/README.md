# Loginom AI Agent icons

`source.png` preserves the user's 1254×1254 RGB reference unchanged (SHA256
`79def81eab472169fd3278d6638e98a33f85fe8f176a4900a12567f11567d1fc`).
Editable SVG masters separate the full/compact mark and platform tiles. The
reference's opaque outer background is absent from desktop icons. The folded L
and dark AI are carefully redrawn as vector geometry.

From `packages/desktop`, using the repository's pinned Bun:

```sh
bun scripts/generate-icons.ts --preview # preview only, before integration
bun scripts/generate-icons.ts           # all committed assets
bun scripts/generate-icons.ts --check   # read-only reproducibility check
bun test scripts/icons.test.ts scripts/copy-icons.test.ts electron-builder.config.test.ts
bun scripts/copy-icons.ts prod
```

Rendering uses the pinned development dependency `sharp@0.33.5`. The generator
packs independently rendered PNG frames into ICO/ICNS; no runtime dependency is
added. Serve `preview/index.html` locally to compare the reference and variants
on light, dark and colored backgrounds.

- Windows: compact white tile; ICO frames 16, 24, 32, 48, 64, 128, 256.
- Linux: simple white tile, no outer shadow; explicit PNG set in each channel's
  `linux/`, sizes 16, 24, 32, 48, 64, 96, 128, 256, 512. `icon.png` is 512px.
- macOS: softly rounded tile and restrained shadow; ICNS classic slots 16–1024
  plus 16pt/32pt/128pt/256pt Retina slots. `dock.png` matches the 1024px ICNS
  frame and is used only in development; installed apps use their bundle ICNS.
- Small 16–32px frames and small macOS Retina slots use L. Larger system frames
  use L + AI. Favicons consistently use L, including scalable SVG.
- Apple touch is 180px and opaque. PWA assets are 192/512px with separate
  transparent `any` and opaque `maskable` images. Maskable artwork stays inside
  the central 80%-diameter safe circle. Desktop tile PNGs must not be reused as
  maskable images: that creates a tile inside the system mask.

Channels prod/beta/dev have identical art. `copy-icons.ts` stages only the four
active top-level application files and `linux/`, removing stale staging files.
Historical Store/Android/iOS assets remain unmodified and are not packaged.
Top-level 32/64/128 PNG aliases are regenerated for source compatibility.

Generated web assets live in `packages/ui/src/assets/loginom`, are copied as
regular files to both app public directories (Windows checkout compatibility),
and to the landing page's assets. Their `loginom-*-v1` URLs are separate from
legacy shared documentation favicons. Browser app and landing page have distinct
manifests and retain their respective product names. UI mark/splash uses the
same generated SVG; notifications use its PNG representation.

Source validation does not establish installed appearance. Linux requires a new
build and installation; native Windows/macOS visual acceptance must be performed
on those systems. See the approved platform-icons design and acceptance report.
