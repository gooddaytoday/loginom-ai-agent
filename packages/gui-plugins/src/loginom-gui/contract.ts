import { Contract } from "@opencode/plugin/gui"
import type { Package } from "./package-model"

export type PackageInput = { kind: "loginom"; package: Package } | { kind: "file"; file: File }
export type PackageAction = {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly acceptsFile?: boolean
  run(input: PackageInput): void
}

export const PackagePicker = Contract.define<
  {
    open(action: PackageAction): void
    register(action: PackageAction): () => void
  },
  "loginom-gui.package-picker"
>("loginom-gui.package-picker")
