import { Product, productChannel, productName } from "@loginom-ai-agent/product"

// Fork (catalog CAT-09): the window keeps the 0.4 application name and id of its product channel. userData is
// `<appData>/<id>` (lifecycle/configure.ts), so settings, window state, the Loginom connection and the safeStorage key
// (`Local State` on Windows, the Keychain item named after the application on macOS) stay where 0.4 left them. A run
// from source keeps the dev identity, as in 0.4.
export function appIdentity(input: { readonly packaged: boolean; readonly channel: string }) {
  const channel = input.packaged ? productChannel(input.channel) : "dev"

  return { name: productName(channel), id: Product.channels[channel] }
}
