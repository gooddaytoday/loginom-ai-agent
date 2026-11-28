import { SettingsPage, type Plugin } from "@opencode/plugin/gui"
import { ComposerAddItem, Page, type ComposerAddInput } from "@opencode/plugin/gui/builtin"
import { createSignal, lazy, Show, Suspense, type Accessor, type Setter } from "solid-js"
import { PackagePicker, type PackageAction, type PackageInput, type PackageSelection } from "./contract"
import type definition from "./index"
import { remember } from "./package-model"

function packageInput(selection: PackageSelection): PackageInput {
  return selection.kind === "loginom" ? { kind: "loginom", package: selection.package } : selection
}

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const Settings = lazy(() => import("./page"))
  const Catalog = lazy(() => import("./catalog-page"))
  const Picker = lazy(() => import("./package-picker"))
  const Packages = lazy(() => import("./packages-page"))
  const history = ctx.stores.recent
  const [selected, setSelected] = createSignal<PackageSelection>()
  const [actions, setActions] = createSignal<readonly PackageAction[]>([])
  const drafts = new WeakMap<object, [Accessor<PackageSelection | undefined>, Setter<PackageSelection | undefined>]>()

  const draftPackage = (draft: ComposerAddInput["draft"]) => {
    const existing = drafts.get(draft)

    if (existing) return existing
    const selection = createSignal<PackageSelection>()
    drafts.set(draft, selection)

    return selection
  }

  function open(options: {
    action?: PackageAction
    showPage?: () => void
    upload?: true
    file?: File
    select?: (input: PackageSelection) => void
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
          recent={() => history.value}
          close={dialog.close}
          showPage={options.showPage}
          select={(input) => {
            if (input.kind === "loginom") {
              history.update((draft) => {
                const usage = {
                  package: input.package,
                  usedAt: Date.now(),
                }

                const recent = options.action ? { ...usage, action: options.action.title } : usage
                draft.items = remember(draft.connection === input.connection ? draft.items : [], recent)
                draft.connection = input.connection
              })
            }

            dialog.close()
            options.action?.run(packageInput(input))
            options.select?.(input)
          }}
        />
      </Suspense>
    ))
  }

  const upload = (file?: File) => open({ upload: true, file, select: setSelected })

  const pick = (select: (input: PackageInput) => void, showPage: () => void) =>
    open({ select: (selection) => select(packageInput(selection)), showPage })

  ctx.provide(PackagePicker, {
    open: (action) => open({ action }),
    pick,
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
    run({ draft, openPage }) {
      open({ select: draftPackage(draft)[1], showPage: () => openPage("packages") })
    },
    renderSelection({ draft, openPage }) {
      const [selection, setSelection] = draftPackage(draft)

      return (
        <Show when={selection()}>
          {(item) => {
            const name = () => {
              const input = item()

              return input.kind === "loginom" ? input.package.name : input.file.name
            }

            return (
              <div class="flex min-w-0 items-center gap-2 rounded-lg border border-border-weak-base px-2 py-1">
                <ctx.ui.Icon name="file-document" />
                <span class="min-w-0 flex-1 truncate" title={name()}>{name()}</span>
                <ctx.ui.Button onClick={() => { setSelected(item()); openPage("packages") }}>
                  {ctx.t("packages.diagram")}
                </ctx.ui.Button>
                <ctx.ui.Button aria-label={ctx.t("packages.removeSelection")} onClick={() => setSelection(undefined)}>
                  <ctx.ui.Icon name="close" />
                </ctx.ui.Button>
              </div>
            )
          }}
        </Show>
      )
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
          actions={actions()}
          choose={() => open({ select: setSelected })}
          upload={upload}
          run={(action, selection) => {
            const saved = history.value
            const entry = selection.package

            if (saved?.connection === selection.connection && saved.items.some((item) => item.package.path === entry.path)) {
              history.update((draft) => {
                if (draft.connection === selection.connection) {
                  draft.items = remember(draft.items, { package: entry, usedAt: Date.now(), action: action.title })
                }
              })
            }

            action.run(packageInput(selection))
          }}
        />
      </Suspense>
    ),
  })

  ctx.add(Page, {
    id: "catalog",
    nav: {},
    get title() {
      return ctx.t("catalog.title")
    },
    render: () => (
      <Suspense>
        <Catalog />
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
