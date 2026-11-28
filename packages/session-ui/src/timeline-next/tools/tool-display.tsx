import { ToolGroupRow } from "../../components/tool-group-row"
import { toolGroupSummary } from "../../message/tool-group"
import { useI18n } from "@opencode/ui/context/i18n"
import { createMemo, Match, Show, Switch, type Component } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useData } from "../../context"
import { stoppedShell } from "../../tools/run-machine"
import {
  sessionLink,
  toolDisplayError,
  toolErrorSubtitle,
  toolInput,
  toolMetadata,
  useToolDisplayRenderer,
  type ToolProps,
} from "../../tools/tool-renderer"
import { ErrorCard } from "./error-card"
import { GlobTool, GrepTool, ListTool, WebFetchTool, WebSearchTool } from "./explore"
import { PatchTool } from "./patch"
import { ShellTool } from "./shell"

/** The tools the New timeline draws its own way. Every other tool draws as it does in the current timeline. */
const tools = new Map<string, Component<ToolProps>>([
  ["list", ListTool],
  ["glob", GlobTool],
  ["grep", GrepTool],
  ["webfetch", WebFetchTool],
  ["websearch", WebSearchTool],
  ["shell", ShellTool],
  ["patch", PatchTool],
])

/**
 * One call. A call that failed shows as an error card. One the user stopped (`stopped`, from the rules) shows as one
 * that ran does, a shell saying it was stopped on its row. `tool` is the tool's current name, from the rules.
 */
export function ToolDisplay(props: ToolProps & { id: string; error?: string; stopped?: boolean }) {
  const data = useData()
  const i18n = useI18n()

  if (props.tool === "todowrite") return null
  const hideQuestion = () => props.tool === "question" && (props.status === "streaming" || props.status === "running")

  const taskId = createMemo(() => {
    if (props.tool !== "subagent") return undefined

    return toolMetadata(props.metadata).sessionID || undefined
  })

  const taskHref = createMemo(() => sessionLink(taskId(), data.sessionHref))

  const taskSubtitle = createMemo(() => {
    if (props.tool !== "subagent") return undefined

    return toolInput(props.input).description || taskId()
  })

  const errorSubtitle = createMemo(() => toolErrorSubtitle(props, i18n))
  const error = createMemo(() => toolDisplayError(props))
  const stopped = createMemo(() => stoppedShell({ ...props, metadata: toolMetadata(props.metadata) }))

  const renderer = useToolDisplayRenderer(
    () => props.tool,
    (title) => (
      <ErrorCard
        tool={props.tool}
        title={title}
        error={i18n.t("ui.toolErrorCard.rendererFailed")}
        defaultOpen={props.defaultOpen}
        open={props.open}
        onOpenChange={props.onOpenChange}
      />
    ),
    (name) => tools.get(name),
  )

  return (
    <Show when={!hideQuestion()}>
      <div data-component="tool-part-wrapper" data-timeline-part-id={props.id}>
        <Switch>
          <Match when={toolGroupSummary(props.metadata)}>
            {(summary) => <ToolGroupRow summary={summary()} detail={error() ?? props.output} />}
          </Match>
          <Match when={stopped()}>
            {(stopped) => <Dynamic component={renderer.render()} {...props} output={stopped().output} />}
          </Match>
          <Match when={props.stopped}>
            <Dynamic
              component={renderer.render()}
              {...props}
              error={undefined}
              metadata={props.tool === "shell" ? { ...props.metadata, interrupted: true } : props.metadata}
            />
          </Match>
          <Match when={!renderer.handlesFailure() && error()}>
            {(error) => {
              if (props.tool === "question" && error().replace("Error: ", "").includes("dismissed this question")) {
                return (
                  <div style="width: 100%; display: flex; justify-content: flex-end;">
                    <span class="text-13-regular text-v2-text-text-faint cursor-default">
                      {i18n.t("ui.messagePart.questions.dismissed")}
                    </span>
                  </div>
                )
              }

              return (
                <ErrorCard
                  tool={props.tool}
                  error={error()}
                  title={renderer.title()}
                  defaultOpen={props.defaultOpen}
                  open={props.open}
                  onOpenChange={props.onOpenChange}
                  subtitle={taskSubtitle() ?? errorSubtitle()}
                  href={taskHref()}
                  onSubtitleClick={(event) => {
                    if (!data.navigateToSession) return

                    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
                    const id = taskId()

                    if (!id) return
                    event.preventDefault()
                    data.navigateToSession(id)
                  }}
                />
              )
            }}
          </Match>
          <Match when={true}>
            <Dynamic component={renderer.render()} {...props} />
          </Match>
        </Switch>
      </div>
    </Show>
  )
}
