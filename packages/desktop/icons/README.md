# Desktop application icons

`source.png` is the user-supplied Loginom AI logo (1254 × 1254), preserved unchanged.
The desktop icons in `prod`, `beta`, and `dev` all use this image without cropping
or recoloring. The source includes its own background and rounded tile.

Electron's `scripts/copy-icons.ts` copies the selected channel to
`resources/icons` before development and builds. Electron Builder uses PNGs for
Linux, `icon.ico` for Windows and its installer, and `icon.icns` for macOS.
`dock.png` is the 256 × 256 representation used by the unpackaged macOS app.

When replacing the source, regenerate the top-level PNG files in each channel
at their existing dimensions with Lanczos resampling and 8-bit color. Keep
`icon.png` at 512 × 512 and `128x128@2x.png` and `dock.png` at 256 × 256.
The Windows ICO includes 16, 24, 32, 48, 64, 128, and 256 pixel representations.
The macOS ICNS contains PNG representations of 16, 32, 64, 128, 256, 512, and
1024 pixels (`icp4`, `icp5`, `icp6`, `ic07`, `ic08`, `ic09`, and `ic10`).
Keep the 256 pixel ICNS representation identical to `dock.png`.

The legacy Android/iOS assets in the channel subdirectories are not used by the
desktop application and are outside this icon update.

Asset validation does not establish installed application appearance. A new
build and installation are required to update an existing desktop launcher.
