import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { createResource, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import {
  activeDiagnosticsSession,
  DIAGNOSTICS_DEFAULTS,
  DIAGNOSTICS_GROUPS,
  summarizeDiagnostics,
  type DiagnosticsGroup,
} from "@/utils/diagnostics"
import { showToast } from "@/utils/toast"

const GROUP_LABEL = {
  chat: "diagnostics.group.chat",
  runtime: "diagnostics.group.runtime",
  logs: "diagnostics.group.logs",
  dumps: "diagnostics.group.dumps",
} as const
const REASON_LABEL = {
  "archive-budget": "diagnostics.reason.budget",
  "file-count": "diagnostics.reason.budget",
  "secret-in-path": "diagnostics.reason.unsafe",
  "secret-after-redaction": "diagnostics.reason.unsafe",
  "redaction-failed": "diagnostics.reason.unsafe",
  "unreadable-or-not-redactable": "diagnostics.reason.unreadable",
  "dump-too-large": "diagnostics.reason.budget",
} as const

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

export function DialogDiagnostics() {
  const dialog = useDialog()
  const language = useLanguage()
  const platform = usePlatform()
  const session = activeDiagnosticsSession()
  const [include, setInclude] = createStore({ ...DIAGNOSTICS_DEFAULTS, chat: !!session })
  const [showFiles, setShowFiles] = createSignal(false)
  const [preview, setPreview] = createSignal<{ name: string; text: string; truncated: boolean }>()
  const [saving, setSaving] = createSignal(false)
  let chat: Promise<unknown> | undefined

  // Every change of groups rebuilds the archive; Save writes the last shown one.
  const [ready] = createResource(
    () => ({ ...include }),
    async (groups) => {
      setPreview(undefined)
      const loaded = session && groups.chat ? await (chat ??= session.chat()).catch(() => undefined) : undefined
      return platform.diagnostics!.prepare({ sessionID: session?.sessionID, chat: loaded, include: groups })
    },
  )

  const open = async (name: string) => {
    const current = ready()
    if (!current) return
    const result = await platform.diagnostics!.preview(current.id, name)
    if (result) setPreview({ name, ...result })
  }

  const save = async () => {
    const current = ready()
    if (!current || saving()) return
    setSaving(true)
    try {
      const path = await platform.diagnostics!.save(current.id)
      if (!path) return
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("diagnostics.saved.title"),
        description: path,
      })
      dialog.close()
    } catch (error) {
      showToast({
        variant: "error",
        title: language.t("diagnostics.failed.title"),
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  const reason = (value?: string) =>
    value && value in REASON_LABEL ? language.t(REASON_LABEL[value as keyof typeof REASON_LABEL]) : (value ?? "")

  return (
    <Dialog
      title={language.t("diagnostics.title")}
      description={session?.title ?? (session ? session.sessionID : language.t("diagnostics.noChat"))}
      size="large"
    >
      <div class="flex flex-col gap-4 px-6 pb-4" data-component="diagnostics-dialog">
        <div class="flex flex-col gap-2">
          <For each={DIAGNOSTICS_GROUPS.filter((group) => group !== "chat" || !!session)}>
            {(group: DiagnosticsGroup) => {
              const summary = () => summarizeDiagnostics(ready.latest?.files ?? []).find((item) => item.group === group)
              return (
                <div data-tid={`diagnostics-group-${group}`}>
                  <Checkbox checked={include[group]} onChange={(value: boolean) => setInclude(group, value)}>
                    {language.t(GROUP_LABEL[group])}
                  </Checkbox>
                  <div class="pl-7 text-12-regular text-text-weak">
                    <Show when={summary()}>
                      {(item) =>
                        language.t("diagnostics.group.summary", {
                          included: item().included,
                          omitted: item().omitted,
                          size: size(item().bytes),
                        })
                      }
                    </Show>
                    <Show when={group === "dumps" && include.dumps}>
                      <div class="text-text-warning">{language.t("diagnostics.dumps.warning")}</div>
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
        <div class="text-12-regular text-text-weak">{language.t("diagnostics.dataWarning")}</div>
        <Show when={ready.error}>
          <div class="text-12-regular text-text-danger">{language.t("diagnostics.failed.title")}</div>
        </Show>
        <Show when={ready.latest}>
          {(current) => (
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between text-12-regular">
                <span>{language.t("diagnostics.total", { size: size(current().size) })}</span>
                <Button variant="ghost" size="small" onClick={() => setShowFiles(!showFiles())} data-tid="diagnostics-files-toggle">
                  {language.t(showFiles() ? "diagnostics.files.hide" : "diagnostics.files.show")}
                </Button>
              </div>
              <Show when={showFiles()}>
                <div class="max-h-48 overflow-auto text-12-regular" data-tid="diagnostics-files">
                  <For each={current().files}>
                    {(file) => (
                      <div class="flex items-center justify-between gap-2 py-0.5">
                        <span class="truncate" classList={{ "text-text-weak": file.status !== "included" }}>
                          {file.name}
                        </span>
                        <span class="shrink-0 text-text-weak">
                          {file.status === "included" ? size(file.size ?? 0) : reason(file.reason)}
                        </span>
                        <Show when={file.status === "included" && file.group !== "dumps"}>
                          <Button variant="ghost" size="small" onClick={() => void open(file.name)}>
                            {language.t("diagnostics.files.open")}
                          </Button>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={preview()}>
                {(item) => (
                  <pre
                    class="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-raised-base p-2 text-11-regular"
                    data-tid="diagnostics-preview"
                  >
                    {item().text}
                    {item().truncated ? "\n…" : ""}
                  </pre>
                )}
              </Show>
            </div>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="large" onClick={() => dialog.close()}>
            {language.t("diagnostics.cancel")}
          </Button>
          <Button
            variant="primary"
            size="large"
            disabled={ready.loading || !ready.latest || saving()}
            onClick={() => void save()}
            data-tid="diagnostics-save"
          >
            {language.t("diagnostics.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
