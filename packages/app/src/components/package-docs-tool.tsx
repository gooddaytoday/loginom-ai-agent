import { createMemo, Show } from "solid-js"
import { GenericTool } from "@loginom-ai-agent/session-ui/basic-tool"
import type { ToolProps } from "@loginom-ai-agent/session-ui/message-part"
import { useData } from "@loginom-ai-agent/session-ui/context"
import { useI18n } from "@loginom-ai-agent/ui/context/i18n"
import { Button } from "@loginom-ai-agent/ui/button"
import { usePlatform } from "@/context/platform"
import { useServerSDK } from "@/context/server-sdk"
import { ServerConnection } from "@/context/server"
import { completedPackageDocument } from "@/utils/package-docs-document"

export function PackageDocsTool(props: ToolProps) {
  const data = useData()
  const platform = usePlatform()
  const server = useServerSDK()
  const i18n = useI18n()
  const document = createMemo(() =>
    platform.openLocalFile && ServerConnection.local(server().server)
      ? completedPackageDocument({ ...props, directory: data.directory })
      : undefined,
  )
  return (
    <>
      <GenericTool {...props} />
      <Show when={document()}>
        {(document) => (
          <Button
            data-component="package-docs-document"
            variant="secondary"
            size="small"
            aria-label={i18n.t("ui.sessionReview.openFile") + ": " + document().filename}
            onClick={() => platform.openLocalFile?.(document().url)}
          >
            {i18n.t("ui.sessionReview.openFile")}: {document().filename}
          </Button>
        )}
      </Show>
    </>
  )
}
