import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { ComposerAddItem, Page } from "@opencode/plugin/gui/builtin"
import { createSignal, lazy, Suspense } from "solid-js"
import { PackagePicker, type PackageAction, type PackageInput } from "./contract"
import type definition from "./index"
import { History, remember, type Package } from "./package-model"
import type { Connection } from "./package-rpc"

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Settings = lazy(() => import("./page"))
  const Picker = lazy(() => import("./package-picker"))
  const Packages = lazy(() => import("./packages-page"))
  const history = ctx.storage.store("packages-recent", { schema: History, initial: { connection: "", items: [] } })
  const [selected, setSelected] = createSignal<{ entry: Package; connection: Connection }>()
  const [prefill, setPrefill] = createSignal<File>()
  const [actions, setActions] = createSignal<readonly PackageAction[]>([])

  function open(options: {
    action?: PackageAction
    showPage?: () => void
    upload?: true
    file?: File
    select?: (input: PackageInput, connection?: Connection) => void
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
                draft.items = remember(draft.connection === connection.key ? draft.items : [], {
                  package: input.package,
                  usedAt: Date.now(),
                  ...(options.action ? { action: options.action.title } : {}),
                })
                draft.connection = connection.key
              })
            }
            dialog.close()
            options.action?.run(input)
            options.select?.(input, connection)
          }}
        />
      </Suspense>
    ))
  }

  const openPackage = (input: PackageInput, connection?: Connection) => {
    if (input.kind === "loginom" && connection) {
      setPrefill(undefined)
      setSelected({ entry: input.package, connection })
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
        select: (input, connection) => {
          openPackage(input, connection)
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
