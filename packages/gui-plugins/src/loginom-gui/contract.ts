import { Contract, Ipc } from "@opencode/plugin/gui"
import { Schema } from "effect"
import type { Package } from "./package-model"

export type PackageConnectionIdentity = { readonly server: string; readonly key: string; readonly generation: number }

export type PackageInput = { kind: "loginom"; package: Package } | { kind: "file"; file: File }

export type RemotePackageSelection = Extract<PackageInput, { kind: "loginom" }> & {
  connection: PackageConnectionIdentity
}

export type PackageSelection = Extract<PackageInput, { kind: "file" }> | RemotePackageSelection

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
    pick(select: (input: PackageInput) => void, showPage: () => void): void
    register(action: PackageAction): () => void
  },
  "loginom-gui.package-picker"
>("loginom-gui.package-picker")

export const DashboardTarget = Schema.Struct({
  id: Schema.String,
  directory: Schema.String,
  nodeName: Schema.String,
  action: Schema.Literals(["create", "edit"]),
  notice: Schema.optional(Schema.Struct({ kind: Schema.String })),
})

export const DashboardLink = Schema.Union([Schema.Struct({ id: Schema.String, code: Schema.String }), DashboardTarget])

export const DashboardPreview = Ipc.define({
  id: "loginom-gui.dashboard",
  methods: {
    open: {
      input: Schema.Struct({ url: Schema.String }),
      output: Schema.Struct({ id: Schema.String }),
    },
    close: {
      input: Schema.Struct({ id: Schema.String }),
      output: Schema.Void,
    },
  },
})
