export * as ProductUpdater from "./product-updater"

import { Product } from "@loginom-ai-agent/product"
import { Effect, Layer, type Context } from "effect"
import type { Interface, UpgradeError } from "./updater"

// Loginom AI Agent (B2.7d): the `installationNode` seam of 0.4 (`v0.4.0:packages/opencode/src/product/installation.ts`).
// Desktop owns the product update feed, and the CLI has no install source of its own: it never discovers or installs an
// OpenCode release, whatever method is detected or passed, so nothing here asks opencode.ai, GitHub or npm, or runs a
// package manager. `upgrade` and `/update` refuse; `update-notifier.ts` announces a new version from the product feed.
// `updater.ts` keeps the upstream implementation as `upstreamLayer` and binds this one as `layer`.
export function layer<Id>(binding: {
  readonly Service: Context.Service<Id, Interface>
  readonly UpgradeError: typeof UpgradeError
}) {
  const title = `Automatic CLI updates are not configured for ${Product.name}`
  const retry = `Install a newer ${Product.name} package.`
  const refusal = () =>
    new binding.UpgradeError({
      title,
      detail: `${Product.cliExecutable} does not download or install updates.`,
      retry,
    })
  return Layer.succeed(
    binding.Service,
    binding.Service.of({
      run: () => Effect.succeed(undefined),
      check: () => Effect.succeed({ type: "unavailable" as const, message: `${title}. ${retry}` }),
      apply: () => Effect.fail(refusal()),
      method: () => Effect.succeed(undefined),
      // `upgrade` explains with this why it cannot detect an installation method.
      managed: () => Effect.succeed(refusal()),
      latest: () => Effect.fail(refusal()),
      upgrade: () => Effect.fail(refusal()),
      removal: () => undefined,
    }),
  )
}
