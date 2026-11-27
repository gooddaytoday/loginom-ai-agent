import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { ComposerAddItem, Page } from "@opencode/plugin/gui/builtin"
import { createSignal, lazy, Suspense } from "solid-js"
import { PackagePicker, type PackageAction, type PackageInput } from "./contract"
import type definition from "./index"
import { History, remember, type Package } from "./package-model"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Settings = lazy(() => import("./page"))
  const Picker = lazy(() => import("./package-picker"))
  const Packages = lazy(() => import("./packages-page"))
  const history = ctx.storage.store("packages-recent", { schema: History, initial: { connection: "", items: [] } })
  const [selected, setSelected] = createSignal<Package>()
  const [prefill, setPrefill] = createSignal<File>()
  const [actions, setActions] = createSignal<readonly PackageAction[]>([])

  function open(options: {
    action?: PackageAction
    showPage?: () => void
    upload?: true
    file?: File
    select?: (input: PackageInput) => void
  }) {
    ctx.dialogs.open((dialog) => (
      <Suspense>
        <Picker
          title={
            options.action
              ? ctx.t("packages.actionTitle", { action: options.action.title })
              : ctx.t(options.upload ? "packages.fromComputer" : "packages.fromLoginom")
          }
          upload={!!options.upload}
          initialFile={options.file}
          acceptsFile={options.action?.acceptsFile ?? !options.action}
          recent={(connection) => (history.value?.connection === connection ? history.value.items : [])}
          close={dialog.close}
          showPage={options.showPage}
          select={(input, connection) => {
            if (input.kind === "loginom" && connection) {
              history.update((draft) => {
                draft.items = remember(draft.connection === connection ? draft.items : [], {
                  package: input.package,
                  usedAt: Date.now(),
                  ...(options.action ? { action: options.action.title } : {}),
                })
                draft.connection = connection
              })
            }
            dialog.close()
            options.action?.run(input)
            options.select?.(input)
          }}
        />
      </Suspense>
    ))
  }

  const openPackage = (input: PackageInput) => {
    if (input.kind === "loginom") {
      setPrefill(undefined)
      setSelected(input.package)
    }
    if (input.kind === "file") setPrefill(input.file)
  }
  const upload = (file?: File) => open({ upload: true, file, select: openPackage })

  ctx.provide(PackagePicker, {
    open: (action) => open({ action }),
    register(action) {
      setActions((list) => [...list.filter((item) => item.id !== action.id), action])
      return () => setActions((list) => list.filter((item) => item !== action))
    },
  })

  ctx.add(ComposerAddItem, {
    get title() {
      return ctx.t("packages.pickFromLoginom")
    },
    icon: "file-document",
    run(openPage) {
      const showPage = () => openPage("packages")
      open({
        showPage,
        select: (input) => {
          openPackage(input)
          showPage()
        },
      })
    },
  })
  ctx.add(Page, {
    id: "packages",
    get title() {
      return ctx.t("packages.title")
    },
    render: () => (
      <Suspense>
        <Packages
          selected={selected()}
          file={prefill()}
          actions={actions()}
          choose={() => open({ select: openPackage })}
          upload={() => upload(prefill())}
          run={(action, entry) => {
            const saved = history.value
            if (saved?.items.some((item) => item.package.path === entry.path)) {
              history.update((draft) => {
                draft.items = remember(draft.items, { package: entry, usedAt: Date.now(), action: action.title })
              })
            }
            action.run({ kind: "loginom", package: entry })
          }}
        />
      </Suspense>
    ),
  })

  ctx.add(SettingsPage, {
    id: "loginom",
    icon: "arrow-up-right",
    get title() {
      return ctx.t("title")
    },
    render: () => (
      <Suspense>
        <Settings />
      </Suspense>
    ),
  })
}

export default setup
