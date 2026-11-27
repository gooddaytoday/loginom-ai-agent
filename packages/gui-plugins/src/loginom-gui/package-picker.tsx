import { createLatest, usePlugin } from "@opencode/plugin/gui"
import { MAX_PACKAGE_BYTES } from "@loginom-ai-agent/loginom-host/package-upload"
import { TextField } from "@opencode/ui/text-field"
import { Schema } from "effect"
import { createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js"
import type { PackageInput } from "./contract"
import type definition from "./index"
import { matches, visible, type Folder, type Package, type Recent } from "./package-model"
import { loginomClient, packageConnection, type Connection } from "./package-rpc"

const PERSONAL = "/user"
const SHARED = "/common"

const SessionLimit = Schema.is(Schema.Struct({ type: Schema.Literal("session_limit") }))

export default function Picker(props: {
  title: string
  upload: boolean
  initialFile?: File
  acceptsFile: boolean
  recent: (key: string) => readonly Recent[]
  select: (selection: PackageInput, connection?: Connection) => void
  showPage?: () => void
  close: () => void
}) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const [trail, setTrail] = createSignal<readonly Folder[]>([{ name: "", path: PERSONAL }])
  const [query, setQuery] = createSignal("")
  const [deep, setDeep] = createSignal<string>()
  const [byName, setByName] = createSignal(false)
  const [file, setFile] = createSignal<File | undefined>(props.initialFile)
  const [fileError, setFileError] = createSignal<
    "packages.invalidFile" | "packages.uploadFailed" | "packages.fileTooLarge"
  >()
  const [uploading, setUploading] = createSignal(false)
  const [retry, setRetry] = createSignal(0)
  const upload = new AbortController()
  onCleanup(() => upload.abort())

  const client = createMemo(() => loginomClient(ctx))
  const connection = createLatest(client, (current, signal) =>
    packageConnection(current, AbortSignal.any([signal, AbortSignal.timeout(12_000)])),
  )
  const connected = () => (client() && !connection.loading && !connection.error ? connection.latest : undefined)
  const listing = createLatest(
    () => {
      const current = connected()
      const path = trail().at(-1)?.path
      if (!current || !path || props.upload) return
      return { current, path, search: deep(), attempt: retry() }
    },
    (input, signal) => {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(input.search ? 180_000 : 145_000)])
      return input.search
        ? input.current.search(input.path, input.search, deadline)
        : input.current.list(input.path, deadline)
    },
  )

  const rows = createMemo(() => {
    const latest = listing.latest
    return latest && !listing.loading && !listing.error
      ? visible(latest, query(), byName(), ctx.locale.locale())
      : undefined
  })
  const recent = createMemo(() => {
    const current = connected()
    return current ? props.recent(current.key).filter((item) => matches(item.package.name, query())) : []
  })
  const listError = () => ctx.t(SessionLimit(listing.error) ? "packages.sessionLimit" : "packages.listFailed")
  const date = (value: number) =>
    Number.isFinite(value) ? new Intl.DateTimeFormat(ctx.locale.locale(), { dateStyle: "medium" }).format(value) : "—"
  const size = (bytes: number) => {
    const [value, unit] =
      bytes < 1024 ? [bytes, "byte"] : bytes < 1024 ** 2 ? [bytes / 1024, "kilobyte"] : [bytes / 1024 ** 2, "megabyte"]
    return new Intl.NumberFormat(ctx.locale.locale(), { maximumFractionDigits: 1, style: "unit", unit }).format(value)
  }
  const navigate = (next: readonly Folder[]) => {
    setDeep(undefined)
    setQuery("")
    setTrail(next)
  }
  const connect = () => {
    props.close()
    ctx.layout.settings("loginom")
  }
  const choose = (entry: Package) => props.select({ kind: "loginom", package: entry }, connected())

  function changeFile(input: HTMLInputElement) {
    const candidate = input.files?.item(0)
    input.value = ""
    if (!candidate) return
    setFileError(undefined)
    if (!/\.lgp$/i.test(candidate.name) || !candidate.size) return setFileError("packages.invalidFile")
    if (!props.upload) return props.select({ kind: "file", file: candidate })
    if (candidate.size > MAX_PACKAGE_BYTES) return setFileError("packages.fileTooLarge")
    setFile(candidate)
  }

  async function copy() {
    const candidate = file()
    const current = connected()
    if (!candidate || !current || uploading()) return
    if (candidate.size > MAX_PACKAGE_BYTES) return setFileError("packages.fileTooLarge")
    setUploading(true)
    setFileError(undefined)
    try {
      const entry = await current.upload(candidate, AbortSignal.any([upload.signal, AbortSignal.timeout(150_000)]))
      if (!upload.signal.aborted) props.select({ kind: "loginom", package: entry }, current)
    } catch {
      if (!upload.signal.aborted) setFileError("packages.uploadFailed")
    } finally {
      if (!upload.signal.aborted) setUploading(false)
    }
  }

  function FileButton() {
    let input: HTMLInputElement | undefined
    return (
      <>
        <input ref={input} type="file" accept=".lgp" hidden onChange={(event) => changeFile(event.currentTarget)} />
        <ui.Button disabled={uploading()} onClick={() => input?.click()}>
          {ctx.t("packages.file")}
        </ui.Button>
      </>
    )
  }

  function PackageRow(row: { entry: Package; detail?: string; meta?: boolean }) {
    return (
      <button type="button" class={rowClass} onClick={() => choose(row.entry)}>
        <ui.Icon name="file-document" />
        <span class="min-w-0 flex-1 break-words">
          <span class="block text-13-medium">{row.entry.name}</span>
          <Show when={row.detail}>
            <small class="text-12-regular text-text-weak">{row.detail}</small>
          </Show>
        </span>
        <Show when={row.meta}>
          <small class="shrink-0 text-12-regular text-text-weak">
            {date(Date.parse(row.entry.modified))} · {size(row.entry.size)}
          </small>
        </Show>
      </button>
    )
  }

  const rowClass =
    "flex w-full items-center gap-2 rounded-md p-2 text-start hover:bg-surface-base-hover focus-visible:bg-surface-base-hover"

  return (
    <ui.Dialog title={props.title} size="large">
      <div class="flex min-w-0 flex-col gap-3">
        <Switch>
          <Match when={props.upload}>
            <p class="text-13-regular text-text-weak">{ctx.t("packages.copyInfo")}</p>
            <div class="flex flex-wrap items-center gap-2">
              <FileButton />
              <Show when={file()}>{(entry) => <span class="min-w-0 break-all">{entry().name}</span>}</Show>
            </div>
            <div class="flex flex-wrap gap-2">
              <ui.Button onClick={props.close}>{ctx.t("packages.cancel")}</ui.Button>
              <Show when={connected()}>
                <ui.Button variant="contrast" disabled={!file() || uploading()} onClick={() => void copy()}>
                  {ctx.t(uploading() ? "packages.copying" : "packages.copy")}
                </ui.Button>
              </Show>
            </div>
          </Match>
          <Match when={connected()}>
            <TextField
              label={ctx.t("packages.search")}
              hideLabel
              placeholder={ctx.t("packages.search")}
              value={query()}
              onChange={(value) => {
                setDeep(undefined)
                setQuery(value)
              }}
            />
            <Show when={recent().length}>
              <section aria-label={ctx.t("packages.recent")}>
                <h3 class="mb-1 text-13-medium">{ctx.t("packages.recent")}</h3>
                <div class="rounded-lg border border-border-weak-base">
                  <For each={recent()}>
                    {(item) => (
                      <PackageRow
                        entry={item.package}
                        detail={`${item.package.folder} · ${item.action ?? ctx.t("packages.opened")}, ${date(item.usedAt)}`}
                      />
                    )}
                  </For>
                </div>
              </section>
            </Show>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap gap-1" role="group" aria-label={ctx.t("packages.roots")}>
                <For each={[PERSONAL, SHARED]}>
                  {(path) => (
                    <button
                      type="button"
                      class="rounded-md px-2 py-1 aria-pressed:bg-surface-base-hover"
                      aria-pressed={trail()[0]?.path === path}
                      onClick={() => navigate([{ name: "", path }])}
                    >
                      {ctx.t(path === PERSONAL ? "packages.personal" : "packages.shared")}
                    </button>
                  )}
                </For>
              </div>
              <ui.Button onClick={() => setByName(!byName())}>
                {ctx.t(byName() ? "packages.byName" : "packages.newest")}
              </ui.Button>
            </div>
            <Show when={trail().length > 1}>
              <nav class="flex flex-wrap gap-2 text-12-regular" aria-label={ctx.t("packages.folder")}>
                <For each={trail()}>
                  {(folder, index) => (
                    <button
                      type="button"
                      onClick={() => navigate(trail().slice(0, index() + 1))}
                      class="break-all underline"
                    >
                      {folder.name || ctx.t(folder.path === PERSONAL ? "packages.personal" : "packages.shared")}
                    </button>
                  )}
                </For>
              </nav>
            </Show>
            <div
              class="min-h-20 max-h-[30vh] overflow-y-auto rounded-lg border border-border-weak-base"
              aria-busy={listing.loading}
              role="group"
              aria-label={ctx.t("packages.contents")}
            >
              <Switch>
                <Match when={listing.loading}>
                  <p class="p-3" role="status">
                    {ctx.t("packages.loading")}
                  </p>
                </Match>
                <Match when={listing.error !== undefined}>
                  <div class="p-3">
                    <p role="alert">{listError()}</p>
                    <ui.Button onClick={() => setRetry(retry() + 1)}>{ctx.t("packages.retry")}</ui.Button>
                  </div>
                </Match>
                <Match when={rows()}>
                  {(items) => (
                    <>
                      <For each={items().folders}>
                        {(folder) => (
                          <button type="button" class={rowClass} onClick={() => navigate([...trail(), folder])}>
                            <ui.Icon name="folder" />
                            <span class="min-w-0 break-all">{folder.name}</span>
                          </button>
                        )}
                      </For>
                      <For each={items().packages}>
                        {(entry) => <PackageRow entry={entry} detail={deep() ? entry.folder : undefined} meta />}
                      </For>
                      <Show when={!items().folders.length && !items().packages.length}>
                        <p class="p-3 text-text-weak">
                          {ctx.t(query().trim() ? "packages.notFound" : "packages.empty")}
                        </p>
                      </Show>
                    </>
                  )}
                </Match>
              </Switch>
            </div>
            <div class="flex flex-wrap items-center gap-x-2 text-12-regular text-text-weak">
              <Show when={rows()}>
                {(items) => (
                  <span role="status">
                    {ctx.t(deep() ? "packages.deepCount" : query().trim() ? "packages.matchCount" : "packages.count", {
                      packages: items().packages.length,
                      folders: items().folders.length,
                    })}
                  </span>
                )}
              </Show>
              <Show when={query().trim() && !deep()}>
                <button type="button" class="underline" onClick={() => setDeep(query().trim())}>
                  {ctx.t("packages.deepSearch")}
                </button>
              </Show>
              <Show when={deep()}>
                <button type="button" class="underline" onClick={() => setDeep(undefined)}>
                  {ctx.t("packages.thisFolder")}
                </button>
              </Show>
            </div>
            <Show when={rows()?.slow}>
              <p role="status">{ctx.t("packages.slow")}</p>
            </Show>
          </Match>
        </Switch>
        <Show when={connection.loading}>
          <p role="status">{ctx.t("loading")}</p>
        </Show>
        <div class="flex flex-wrap items-center gap-2">
          <Show when={!props.upload && props.acceptsFile}>
            <FileButton />
          </Show>
          <Show when={!connection.loading && !connected()}>
            <ui.Button onClick={connect}>{ctx.t("packages.connect")}</ui.Button>
          </Show>
          <Show when={connected() && props.showPage}>
            {(showPage) => (
              <ui.Button
                onClick={() => {
                  props.close()
                  showPage()()
                }}
              >
                {ctx.t("packages.openPage")}
              </ui.Button>
            )}
          </Show>
        </div>
        <Show when={fileError()}>
          {(error) => (
            <p role="alert" class="text-text-danger-base">
              {ctx.t(error())}
            </p>
          )}
        </Show>
      </div>
    </ui.Dialog>
  )
}
