# Loginom AI Agent platform icons

Approved scope: preserve the supplied red L/dark AI identity, redraw clean vector
artwork, retain a white tile with transparent surroundings, and adapt the tile
to Windows, Linux and macOS. Small system representations (16–32 px, including
the corresponding macOS Retina slots) use L; larger representations use L + AI.
Favicons always use L. Home-screen icons use the complete mark.

Windows receives a multiresolution ICO, Linux explicit PNG sizes and macOS an
ICNS compatible with macOS 14+. Packaged macOS uses the bundle icon; only
development overrides Dock with a matching high-resolution PNG. Channels keep
the same artwork. Legacy mobile/store assets are not shipping targets.

Update application splash/empty-state/notification marks while retaining the
Loginom AI wordmark. Update the Loginom Dock landing page and browser app icons,
with separate versioned resources so documentation-site shared favicons remain
unchanged. Provide opaque, safe-zone-aware maskable and Apple home-screen assets.
Update the browser app manifest's remaining OpenCode name and reference both
ordinary and maskable icons. Keep the landing page's Loginom Dock identity.

Show a local comparison before integration. Generate all assets reproducibly,
validate binary containers/transparency/size selection, run relevant package
checks and web builds. Commit only this task's inputs and build Desktop DEB and
AppImage from a clean snapshot with pinned resources, version 0.1.6, prod channel,
and publishing disabled. Install the DEB; inspect the installed launchers/icons
and run GUI checks with an isolated profile without stopping the user's app.

Native Windows/macOS appearance, website deployment, CLI updates, push and public
release are outside this task. Record actual results and remaining limitations
in an acceptance report and preserve unrelated dirty documentation.
The canonical Linux checkpoint must record the installed version, source commit,
verification results and pending native Windows/macOS checks.
