import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import { hostError } from "@loginom-ai-agent/loginom-host/errors"
import { Effect } from "effect"
import type { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { BrowserRecovery } from "@/session/browser-recovery"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import { TaskScope } from "@/session/task-scope"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { Skill } from "@/skill"

type Lease = Awaited<ReturnType<typeof LoginomHost.acquire>>
type History = SessionV1.WithParts[]
type Pending = { scope: TaskScope.Info; grant: TaskScope.Activation; messageID: MessageID; callID: string }

export type AcquireInput = {
  sessionID: SessionID
  sessions: Session.Interface
  agents: Agent.Interface
  permission: Permission.Interface
}

// One agent run owns one Host lease. The lease is released when the run's scope
// closes, whether the run finished, failed or was cancelled.
const acquireRun = Effect.fnUntraced(function* (input: AcquireInput) {
  const { sessionID, sessions, agents, permission } = input
  const status: { failure?: string } = {}
  const loginom: Lease | undefined = yield* Effect.acquireRelease(
    Effect.promise(() =>
      LoginomHost.acquire(sessionID).catch((error) => {
        status.failure = "acquire: " + hostError(error)
        return undefined
      }),
    ),
    (lease) =>
      Effect.promise(async () => {
        await lease?.release()
      }),
  )
  let activation: Pending | undefined

  // The profile of a task is applied on a turn boundary: a grant requested by a
  // command or by a completed skill call becomes effective before the next model step.
  const beforeTurn = Effect.fnUntraced(function* (turn: { session: Session.Info; history: History }) {
    const { session, history } = turn
    const currentTask = TaskScope.derive({ sessionID, messages: history, revert: session.revert })
    const commandMessage = TaskScope.visible({ sessionID, messages: history, revert: session.revert }).find(
      (message) => message.info.id === currentTask?.taskMessageID,
    )
    const commandPart = commandMessage?.parts.find(
      (part) => part.type === "text" && TaskScope.activation(part.metadata?.skill_activation_pending),
    )
    const commandGrant =
      commandPart?.type === "text" ? TaskScope.activation(commandPart.metadata?.skill_activation_pending) : undefined
    if (currentTask && commandMessage?.info.role === "user" && commandPart?.type === "text" && commandGrant) {
      const part = history
        .find((message) => message.info.id === commandMessage.info.id)
        ?.parts.find((part) => part.id === commandPart.id)
      if (part?.type === "text") {
        const updated = yield* Effect.gen(function* () {
          const agent = yield* agents.get(commandMessage.info.agent)
          if (!agent || !loginom) return yield* Effect.die(Error("LOGINOM_SCOPE_DENIED"))
          yield* permission
            .ask({
              sessionID,
              permission: "skill",
              metadata: {},
              patterns: [commandGrant.name],
              always: [commandGrant.name],
              ruleset: Permission.merge(agent.permission, session.permission ?? []),
            })
            .pipe(Effect.orDie)
          yield* Effect.promise((signal) =>
            loginom.scope("bind", { taskMessageID: currentTask.taskMessageID, profile: currentTask.profile }, signal),
          )
          yield* Effect.promise((signal) =>
            loginom.scope(
              "request",
              { taskMessageID: currentTask.taskMessageID, profile: commandGrant.profile },
              signal,
            ),
          )
          return yield* Effect.gen(function* () {
            yield* Effect.promise((signal) =>
              loginom.scope(
                "apply",
                { taskMessageID: currentTask.taskMessageID, profile: commandGrant.profile },
                signal,
              ),
            )
            return yield* sessions.updatePart({
              ...part,
              metadata: { ...TaskScope.cleanMetadata(part.metadata), skill_activation: commandGrant },
            })
          }).pipe(Effect.uninterruptible)
        }).pipe(
          Effect.catchCause((cause) =>
            sessions
              .updatePart({ ...part, metadata: TaskScope.cleanMetadata(part.metadata) })
              .pipe(Effect.andThen(Effect.failCause(cause)), Effect.uninterruptible),
          ),
        )
        const message = history.find((message) => message.info.id === updated.messageID)
        if (message) message.parts = message.parts.map((part) => (part.id === updated.id ? updated : part))
      }
    }
    const pending = activation
    activation = undefined
    if (pending && loginom) {
      const task = TaskScope.derive({ sessionID, messages: history, revert: session.revert })
      const visible = TaskScope.visible({ sessionID, messages: history, revert: session.revert })
      const message = history.find((message) => message.info.id === pending.messageID)
      const part = message?.parts.find(
        (part) => part.type === "tool" && part.tool === "skill" && part.callID === pending.callID,
      )
      if (
        task?.taskMessageID === pending.scope.taskMessageID &&
        part?.type === "tool" &&
        part.state.status === "completed" &&
        visible.some((message) => message.parts.some((candidate) => candidate.id === part.id))
      ) {
        const state = part.state
        const updated = yield* Effect.gen(function* () {
          const applied = yield* Effect.promise((signal) =>
            loginom.scope("apply", { taskMessageID: task.taskMessageID, profile: pending.grant.profile }, signal),
          ).pipe(
            Effect.map(() => true),
            Effect.catchCause(() => Effect.succeed(false)),
          )
          return yield* sessions.updatePart({
            ...part,
            state: applied
              ? {
                  ...state,
                  metadata: { ...TaskScope.cleanMetadata(state.metadata), activation: pending.grant },
                }
              : {
                  status: "error",
                  input: state.input,
                  error: "LOGINOM_SCOPE_DENIED",
                  metadata: TaskScope.cleanMetadata(state.metadata),
                  time: { start: state.time.start, end: Date.now() },
                },
          })
        }).pipe(Effect.uninterruptible)
        if (message) message.parts = message.parts.map((part) => (part.id === updated.id ? updated : part))
      }
    }
  })

  // The reminder is sent once per recovery attempt and keeps the turn going; a second
  // end of turn is no progress, so the attempt is stopped instead of repeating the instruction.
  const endTurn = Effect.fnUntraced(function* (turn: {
    session: Session.Info
    history: History
    lastUser: SessionV1.User
  }) {
    const recovery = BrowserRecovery.active(turn.history)
    const task = TaskScope.derive({ sessionID, messages: turn.history, revert: turn.session.revert })
    if (recovery && !recovery.reminded) {
      const reminder: SessionV1.User = {
        id: MessageID.ascending(),
        sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: turn.lastUser.agent,
        model: turn.lastUser.model,
      }
      yield* sessions.updateMessage(reminder)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: reminder.id,
        sessionID,
        type: "text",
        text: BrowserRecovery.reminder(recovery.operationID),
        synthetic: true,
        metadata: { browser_recovery_reminder: recovery.attempt },
      } satisfies SessionV1.TextPart)
      return "continue" as const
    }
    if (recovery && loginom && task)
      yield* Effect.promise(() =>
        loginom
          .call(
            "dock_browser_recovery",
            {
              action: "stop",
              operation_id: recovery.operationID,
              reason: "The agent ended its turn again without finishing browser recovery.",
            },
            task.taskMessageID,
          )
          .catch(() => undefined),
      )
    return "exit" as const
  })

  // Called after the skill tool loaded a bundled skill: the profile is requested now
  // and applied by the next beforeTurn once the tool call is recorded as completed.
  const afterTool = (skill: Skill.Info, source: { scope: TaskScope.Info; messageID: MessageID; callID: string }) =>
    Effect.gen(function* () {
      const grant = TaskScope.bundledActivation(skill)
      if (!grant) return
      if (!loginom) return yield* Effect.die(Error("LOGINOM_SCOPE_DENIED"))
      yield* Effect.promise((signal) =>
        loginom
          .scope("request", { taskMessageID: source.scope.taskMessageID, profile: grant.profile }, signal)
          .catch(() => {
            throw Error("LOGINOM_SCOPE_DENIED")
          }),
      )
      activation = { ...source, grant }
    })

  const system = (): string[] =>
    status.failure
      ? [
          "Loginom tools are currently unavailable (" +
            status.failure +
            "). No new Loginom action was dispatched by this failed preparation. Report this concrete failure and preserve the existing scenario. Attachment admission is not confirmed by the presence of a chat attachment; do not claim input_artifacts were admitted or uploaded. After connection/recovery is resolved, continue in the same chat. Never ask for credentials in chat or substitute fabricated results.",
        ]
      : loginom
        ? [
            "Loginom is available through the bundled loginom_* tools. To create, change or execute a scenario, first activate the bundled loginom-automation skill. Browser Loginom tools are available after activation; then use loginom_dock_prepare for dynamic readiness and input artifacts. Help and diagnostics do not require loginom_dock_prepare. For a documentation-only request about a Loginom scenario, always activate package-docs before replying, including when the local .lgp is missing or only a server package is named. Then request the missing local package; never search for it in the browser. Dock tool names in skills have the loginom_ prefix here. Connection credentials are managed privately by the desktop; never ask the model to enter or reveal them.",
          ]
        : []

  return { loginom, status, beforeTurn, endTurn, afterTool, system }
})

export const turnLifecycle = { acquireRun }
