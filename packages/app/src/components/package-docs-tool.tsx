import { createEffect, createMemo, createResource, For, onCleanup } from "solid-js"
import { GenericTool } from "@opencode-ai/session-ui/basic-tool"
import { registerTool, type ToolProps } from "@opencode-ai/session-ui/message-part"
import { useData } from "@opencode-ai/session-ui/context"
import { AttachmentCardV2 } from "@opencode-ai/session-ui/v2/attachment-card-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { ServerConnection } from "@/context/server"
import { completedOutputFiles, completedPackageDocument } from "@/utils/package-docs-document"

for (const name of ["loginom_dock_node_apply", "loginom_dock_node_wait", "loginom_dock_node_status", "loginom_dock_node_resume", "loginom_dock_node_read"])
  registerTool({ name, render: GeneratedFileTool })

export function PackageDocsTool(props: ToolProps) {
  const data = useData()
  const platform = usePlatform()
  const server = useServerSDK()
  const document = createMemo(() =>
    platform.revealPath && ServerConnection.local(server().server)
      ? completedPackageDocument({ ...props, directory: data.directory })
      : undefined,
  )
  return (
    <>
      <GenericTool {...props} />
      <For each={document() ? [document()!] : []}>
        {(file) => <GeneratedFileCard path={data.directory.replace(/\/$/, "") + "/" + file.filename} name={file.filename} />}
      </For>
    </>
  )
}

function GeneratedFileTool(props: ToolProps) {
  const files = createMemo(() => completedOutputFiles(props))
  return <>
    <GenericTool {...props} />
    <div class="flex flex-wrap gap-2">
      <For each={files()}>{(file) => <GeneratedFileCard path={file.path} name={file.name} />}</For>
    </div>
  </>
}

function GeneratedFileCard(props: { path: string; name: string }) {
  const platform = usePlatform()
  const server = useServerSDK()
  const language = useLanguage()
  const local = () => !!platform.revealPath && ServerConnection.local(server().server)
  const [available, { refetch, mutate }] = createResource(() => props.path, async (path) =>
    local() ? platform.revealPath!(path, { checkOnly: true }).catch(() => false) : false,
  )
  createEffect(() => {
    const refresh = () => void refetch()
    window.addEventListener("focus", refresh)
    onCleanup(() => window.removeEventListener("focus", refresh))
  })
  const title = () => available() ? props.path : language.t("session.file.unavailable")
  return <button
    type="button"
    data-tid="generated-file-card"
    class="border-0 bg-transparent p-0 text-left disabled:opacity-50"
    title={title()}
    aria-label={language.t("session.header.reveal.containingFolder") + ": " + props.name}
    disabled={!available()}
    onClick={() => void platform.revealPath?.(props.path).then((found) => mutate(found), () => mutate(false))}
  >
    <AttachmentCardV2 title={props.name} hover={title()} clickable={available()}>
      {props.name.split(".").at(-1)?.toUpperCase()}
    </AttachmentCardV2>
  </button>
}
