import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createStore } from "solid-js/store"
import { createPromptState } from "@/context/prompt-state"
import type { Prompt, PromptStore } from "@/context/prompt"
import { dashboardPrompt } from "@loginom-ai-agent/dashboard/contract/prompt"
import type { ModelSelection } from "@/context/local"

let createPromptSubmit: typeof import("./submit").createPromptSubmit
let sendFollowupDraft: typeof import("./submit").sendFollowupDraft

const createdClients: string[] = []
const createdSessions: string[] = []
const sessionCreateInputs: Array<{
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
  location?: { directory: string }
}> = []
const enabledAutoAccept: Array<{ server: string; sessionID: string; directory: string }> = []
const optimistic: Array<{
  directory?: string
  sessionID?: string
  message: {
    agent: string
    model: { providerID: string; modelID: string }
    variant?: string
  }
}> = []
const optimisticSeeded: boolean[] = []
const storedSessions: Record<string, Array<{ id: string; title?: string }>> = {}
const promoted: Array<{ directory: string; sessionID: string }> = []
const sentShell: Array<{ sessionID: string; id?: string; command: string }> = []
const syncedDirectories: string[] = []
const promotedDrafts: Array<{ draftID: string; server: string; sessionId: string }> = []
const sentPrompts: string[] = []
const promptInputs: unknown[] = []
const sentCommands: unknown[] = []
const toasts: unknown[] = []
let lookupDashboard: (id: string) => Promise<boolean>
const snapshotReads: string[] = []
let onPrompt: (() => void) | undefined
const commands: Array<{ name: string }> = []
let serverSessionSyncs = 0

let params: { id?: string } = {}
let search: { draftId?: string } = {}
let selected = "/repo/worktree-a"
let variant: string | undefined
let permissionServer = "server-a"
let createSessionGate: Promise<void> | undefined

let promptValue: Prompt = [{ type: "text", content: "ls", start: 0, end: 2 }]
const [promptStore, setPromptStore] = createStore<PromptStore>({
  prompt: promptValue,
  cursor: 0,
  context: { items: [] },
})
const prompt = {
  store: [() => promptStore, setPromptStore] as [() => PromptStore, typeof setPromptStore],
  ready: Object.assign(() => true, { promise: Promise.resolve(true) }),
  current: () => promptValue,
  cursor: () => 0,
  dirty: () => true,
  model: {
    current: () => undefined,
    set: () => undefined,
  },
  reset: () => undefined,
  set: () => undefined,
  context: {
    add: () => undefined,
    remove: () => undefined,
    removeComment: () => undefined,
    updateComment: () => undefined,
    replaceComments: () => undefined,
    items: () => [],
  },
  capture: () => prompt,
}

const clientFor = (directory: string) => {
  createdClients.push(directory)
  return {
    api: {
      session: {
        create: async (input: (typeof sessionCreateInputs)[number]) => {
          await createSessionGate
          const location = input.location?.directory ?? directory
          createdSessions.push(location)
          sessionCreateInputs.push(input)
          return {
            id: `session-${createdSessions.length}`,
            projectID: "project",
            agent: input.agent,
            model: input.model,
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 1, updated: 1 },
            title: `New session ${createdSessions.length}`,
            location: { directory: location },
          }
        },
        prompt: async (input: unknown) => {
          sentPrompts.push(directory)
          promptInputs.push(input)
          onPrompt?.()
          return { data: undefined }
        },
        command: async (input: unknown) => {
          sentCommands.push(input)
        },
        shell: async (input: { sessionID: string; id?: string; command: string }) => {
          sentShell.push(input)
        },
      },
    },
    session: {
      command: async () => ({ data: undefined }),
      abort: async () => ({ data: undefined }),
    },
    worktree: {
      create: async () => ({ data: { directory: `${directory}/new` } }),
    },
  }
}

beforeAll(async () => {
  const rootClient = clientFor("/repo/main")

  mock.module("@solidjs/router", () => ({
    useNavigate: () => () => undefined,
    useParams: () => params,
    useLocation: () => ({}),
    useSearchParams: () => [search, () => undefined],
  }))

  mock.module("@opencode-ai/sdk/v2/client", () => ({
    createOpencodeClient: (input: { directory: string }) => {
      createdClients.push(input.directory)
      return clientFor(input.directory)
    },
  }))

  mock.module("@/utils/toast", () => ({
    showToast: (toast: unknown) => toasts.push(toast),
  }))

  mock.module("@opencode-ai/core/util/encode", () => ({
    base64Encode: (value: string) => value,
  }))

  mock.module("@/context/local", () => ({
    useLocal: () => ({
      model: {
        current: () => ({ id: "model", provider: { id: "provider" } }),
        variant: { current: () => variant },
      },
      agent: {
        current: () => ({ name: "agent" }),
      },
      session: {
        promote(directory: string, sessionID: string) {
          promoted.push({ directory, sessionID })
        },
      },
    }),
  }))

  mock.module("@/context/permission", () => {
    const state = (server: string) => ({
      enableAutoAccept(sessionID: string, directory: string) {
        enabledAutoAccept.push({ server, sessionID, directory })
      },
    })
    return { usePermission: () => ({ currentServerState: () => state(permissionServer) }) }
  })

  mock.module("@/context/server", () => ({
    useServer: () => ({ key: "server-key" }),
  }))

  mock.module("@/context/tabs", () => ({
    useTabs: () => ({
      draft: () => ({ server: "project-server" }),
      promoteDraft: (draftID: string, session: { server: string; sessionId: string }) => {
        promotedDrafts.push({ draftID, ...session })
      },
    }),
  }))

  mock.module("@/context/prompt", () => ({
    usePrompt: () => prompt,
  }))

  mock.module("@/context/layout", () => ({
    useLayout: () => ({
      handoff: {
        setTabs: () => undefined,
      },
    }),
  }))

  mock.module("@/context/sdk", () => ({
    useSDK: () => {
      const sdk = {
        scope: "local",
        directory: "/repo/main",
        client: rootClient,
        api: rootClient.api,
        url: "http://localhost:4096",
        createClient(opts: any) {
          return clientFor(opts.directory)
        },
      }
      return () => sdk
    },
  }))

  mock.module("@/context/sync", () => ({
    useSync: () => () => ({
      data: { command: commands },
      session: {
        optimistic: {
          add: (value: {
            directory?: string
            sessionID?: string
            message: { agent: string; model: { providerID: string; modelID: string; variant?: string } }
          }) => {
            optimistic.push(value)
            optimisticSeeded.push(
              !!value.directory &&
                !!value.sessionID &&
                !!storedSessions[value.directory]?.find((item) => item.id === value.sessionID)?.title,
            )
          },
          remove: () => undefined,
        },
      },
      set: () => undefined,
    }),
  }))

  mock.module("@/context/server-sync", () => ({
    useServerSync: () => () => ({
      session: {
        remember: () => undefined,
        set: () => undefined,
        sync: async () => {
          serverSessionSyncs++
        },
      },
      child: (directory: string) => {
        syncedDirectories.push(directory)
        storedSessions[directory] ??= []
        return [
          { session: storedSessions[directory] },
          (...args: unknown[]) => {
            if (args[0] !== "session") return
            const next = args[1]
            if (typeof next === "function") {
              storedSessions[directory] = next(storedSessions[directory]) as Array<{ id: string; title?: string }>
              return
            }
            if (Array.isArray(next)) {
              storedSessions[directory] = next as Array<{ id: string; title?: string }>
            }
          },
        ]
      },
    }),
  }))

  mock.module("@/context/platform", () => ({
    usePlatform: () => ({
      fetch: fetch,
      getDashboardTarget: async (id: string) => {
        snapshotReads.push(id)
        return { nodeName: "A", directory: "/repo/main", action: "edit", fresh: false }
      },
      checkDashboardTarget: (id: string) => lookupDashboard(id),
    }),
  }))

  mock.module("@/context/language", () => ({
    useLanguage: () => ({
      t: (key: string) => key,
    }),
  }))

  const mod = await import("./submit")
  createPromptSubmit = mod.createPromptSubmit
  sendFollowupDraft = mod.sendFollowupDraft
})

beforeEach(() => {
  createdClients.length = 0
  createdSessions.length = 0
  sessionCreateInputs.length = 0
  enabledAutoAccept.length = 0
  optimistic.length = 0
  optimisticSeeded.length = 0
  promoted.length = 0
  promotedDrafts.length = 0
  sentPrompts.length = 0
  promptInputs.length = 0
  sentCommands.length = 0
  commands.length = 0
  promptValue = [{ type: "text", content: "ls", start: 0, end: 2 }]
  params = {}
  search = {}
  sentShell.length = 0
  syncedDirectories.length = 0
  selected = "/repo/worktree-a"
  variant = undefined
  permissionServer = "server-a"
  createSessionGate = undefined
  serverSessionSyncs = 0
  onPrompt = undefined
  lookupDashboard = async () => true
  snapshotReads.length = 0
  toasts.length = 0
  for (const key of Object.keys(storedSessions)) delete storedSessions[key]
})

describe("prompt submit worktree selection", () => {
  test("reads the latest worktree accessor value per submit", async () => {
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)
    selected = "/repo/worktree-b"
    await submit.handleSubmit(event)

    expect(createdClients).toEqual(["/repo/worktree-a", "/repo/worktree-b"])
    expect(createdSessions).toEqual(["/repo/worktree-a", "/repo/worktree-b"])
    expect(sessionCreateInputs).toEqual([
      {
        agent: "agent",
        model: { id: "model", providerID: "provider", variant: undefined },
        location: { directory: "/repo/worktree-a" },
      },
      {
        agent: "agent",
        model: { id: "model", providerID: "provider", variant: undefined },
        location: { directory: "/repo/worktree-b" },
      },
    ])
    expect(sentShell).toEqual([
      expect.objectContaining({ sessionID: "session-1", id: expect.stringMatching(/^evt_/), command: "ls" }),
      expect.objectContaining({ sessionID: "session-2", id: expect.stringMatching(/^evt_/), command: "ls" }),
    ])
    expect(syncedDirectories).toEqual(["/repo/worktree-a", "/repo/worktree-a", "/repo/worktree-b", "/repo/worktree-b"])
    expect(serverSessionSyncs).toBe(0)
    expect(promoted).toEqual([
      { directory: "/repo/worktree-a", sessionID: "session-1" },
      { directory: "/repo/worktree-b", sessionID: "session-2" },
    ])
    expect(syncedDirectories).toEqual(["/repo/worktree-a", "/repo/worktree-a", "/repo/worktree-b", "/repo/worktree-b"])
  })

  test("applies auto-accept to newly created sessions", async () => {
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => true,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(enabledAutoAccept).toEqual([{ server: "server-a", sessionID: "session-1", directory: "/repo/worktree-a" }])
  })

  test("keeps auto-accept bound to the submission server", async () => {
    let release = () => {}
    createSessionGate = new Promise<void>((resolve) => {
      release = resolve
    })
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => true,
      mode: () => "shell",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const result = submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)
    permissionServer = "server-b"
    release()
    await result

    expect(enabledAutoAccept).toEqual([{ server: "server-a", sessionID: "session-1", directory: "/repo/worktree-a" }])
  })

  test("promotes drafts using the selected project's server", async () => {
    search = { draftId: "draft-1" }
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(promotedDrafts).toEqual([{ draftID: "draft-1", server: "project-server", sessionId: "session-1" }])
  })

  test("includes the selected variant on optimistic prompts", async () => {
    params = { id: "session-1" }
    variant = "high"

    const submit = createPromptSubmit({
      prompt,
      info: () => ({ id: "session-1" }),
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)
    await Bun.sleep(0)

    expect(optimistic).toHaveLength(1)
    expect(optimistic[0]).toMatchObject({
      message: {
        agent: "agent",
        model: { providerID: "provider", modelID: "model", variant: "high" },
      },
    })
    expect(sentPrompts).toEqual(["/repo/main"])
    expect(promptInputs[0]).toMatchObject({
      sessionID: "session-1",
      text: "ls",
      files: [],
      agents: [],
    })
    expect((promptInputs[0] as { id?: string }).id).toStartWith("msg_")
    expect((promptInputs[0] as { legacyParts?: { id: string; type: string; text?: string }[] }).legacyParts).toEqual([
      { id: expect.stringMatching(/^prt_/), type: "text", text: "ls" },
    ])
  })

  test("submits slash commands through the current session API", async () => {
    params = { id: "session-1" }
    variant = "high"
    commands.push({ name: "review" })
    promptValue = [{ type: "text", content: "/review staged changes", start: 0, end: 22 }]

    const submit = createPromptSubmit({
      prompt,
      info: () => ({ id: "session-1" }),
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(sentCommands).toEqual([
      {
        sessionID: "session-1",
        id: expect.stringMatching(/^msg_/),
        command: "review",
        arguments: "staged changes",
        agent: "agent",
        model: { id: "model", providerID: "provider", variant: "high" },
        files: [],
      },
    ])
    expect(serverSessionSyncs).toBe(0)
  })

  for (const delivery of ["initial", "followup"] as const) {
    test.each([undefined, "/home/user/demo #1.lgp"])(
      `${delivery} slash commands preserve Loginom package paths or request missing paths (%s)`,
      async (sourcePath) => {
        params = { id: "session-1" }
        commands.push({ name: "review" })
        const images: Extract<Prompt[number], { type: "image" }>[] = [
          {
            type: "image",
            id: "package-1",
            filename: "demo !`printf injected` Ж.lgp",
            mime: "application/x-loginom-package",
            sourcePath,
            blob: { id: "package-1", url: "data:application/x-loginom-package;base64,UEsDBA==" },
          },
          ...(sourcePath
            ? []
            : [
                {
                  type: "image" as const,
                  id: "package-2",
                  filename: "other.lgp",
                  mime: "application/x-loginom-package",
                  blob: { id: "package-2", url: "data:application/x-loginom-package;base64,UEsDBA==" },
                },
              ]),
          {
            type: "image",
            id: "image-1",
            filename: "preview.png",
            mime: "image/png",
            blob: { id: "image-1", url: "data:image/png;base64,cHJldmlldw==" },
          },
        ]
        promptValue = [{ type: "text", content: "/review staged changes", start: 0, end: 22 }, ...images]

        if (delivery === "followup") {
          await sendFollowupDraft({
            api: clientFor("/repo/main").api.session as unknown as Parameters<typeof sendFollowupDraft>[0]["api"],
            serverSync: {} as Parameters<typeof sendFollowupDraft>[0]["serverSync"],
            sync: { data: { command: commands } } as unknown as Parameters<typeof sendFollowupDraft>[0]["sync"],
            draft: {
              sessionID: "session-1",
              sessionDirectory: "/repo/main",
              prompt: promptValue,
              context: [],
              agent: "agent",
              model: { providerID: "provider", modelID: "model" },
            },
          })
        }

        if (delivery === "initial") {
          const submit = createPromptSubmit({
            prompt,
            info: () => ({ id: "session-1" }),
            imageAttachments: () => images,
            commentCount: () => 0,
            autoAccept: () => false,
            mode: () => "normal",
            working: () => false,
            editor: () => undefined,
            queueScroll: () => undefined,
            promptLength: (value) =>
              value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
            addToHistory: () => undefined,
            resetHistoryNavigation: () => undefined,
            setMode: () => undefined,
            setPopover: () => undefined,
          })
          await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)
        }

        expect(sentCommands).toHaveLength(1)
        const command = sentCommands[0] as {
          command: string
          arguments: string
          files: { uri: string; name: string }[]
          legacyParts: { type: string; text?: string; synthetic?: boolean; mime?: string; url?: string }[]
        }
        expect(command.command).toBe("review")
        expect(command.arguments).toBe("staged changes")
        expect(command.files).toContainEqual({ uri: "data:image/png;base64,cHJldmlldw==", name: "preview.png" })
        expect(command.files.some((file) => file.uri.startsWith("data:application/x-loginom-package"))).toBe(false)
        if (sourcePath) {
          expect(command.files).toHaveLength(2)
          expect(command.files).toContainEqual({ uri: "file:///home/user/demo%20%231.lgp", name: "demo #1.lgp" })
          expect(command.legacyParts).toContainEqual(
            expect.objectContaining({ type: "file", mime: "application/x-loginom-package" }),
          )
        }
        if (!sourcePath) {
          expect(command.files).toHaveLength(1)
          const notes = command.legacyParts.filter((part) => part.type === "text")
          expect(notes).toHaveLength(2)
          expect(notes.every((part) => part.synthetic)).toBe(true)
          expect(notes[0]?.text).toContain("demo !`printf injected` Ж.lgp has no disk path")
          expect(notes[1]?.text).toContain("other.lgp has no disk path")
          expect(notes[0]?.text).toContain("Ask the user for an absolute path to the .lgp file.")
        }
      },
    )
  }

  for (const delivery of ["initial", "followup", "command"] as const) {
    test(`${delivery} sends local references without resolving a blob URL`, async () => {
      const sent = Promise.withResolvers<void>()
      onPrompt = sent.resolve
      params = { id: "session-1" }
      if (delivery === "command") commands.push({ name: "review" })
      const reference = {
        kind: "local_reference" as const,
        sourcePath: "/tmp/данные %#.csv",
        filename: "данные %#.csv",
        size: 5 * 1024 ** 3,
        lastModified: 123,
        mime: "text/plain",
        receipt: "d".repeat(64),
      }
      const images: Extract<Prompt[number], { type: "image" }>[] = [
        {
          type: "image",
          id: "native",
          filename: reference.filename,
          mime: reference.mime,
          sourcePath: reference.sourcePath,
          reference,
          // Resolving this URL would fail: a reference has no retrievable blob.
          blob: { id: "reference:" + reference.receipt, url: "blob:must-not-fetch" },
        },
      ]
      promptValue = [
        { type: "text", content: delivery === "command" ? "/review sales" : "sales", start: 0, end: 5 },
        ...images,
      ]
      if (delivery !== "initial")
        await sendFollowupDraft({
          api: clientFor("/repo/main").api.session as unknown as Parameters<typeof sendFollowupDraft>[0]["api"],
          serverSync: {} as Parameters<typeof sendFollowupDraft>[0]["serverSync"],
          sync: {
            data: { command: commands },
            session: { optimistic: { add: () => undefined, remove: () => undefined } },
          } as unknown as Parameters<typeof sendFollowupDraft>[0]["sync"],
          draft: {
            sessionID: "session-1",
            sessionDirectory: "/repo/main",
            prompt: promptValue,
            context: [],
            agent: "agent",
            model: { providerID: "provider", modelID: "model" },
          },
        })
      if (delivery === "initial") {
        const submit = createPromptSubmit({
          prompt,
          info: () => ({ id: "session-1" }),
          imageAttachments: () => images,
          commentCount: () => 0,
          autoAccept: () => false,
          mode: () => "normal",
          working: () => false,
          editor: () => undefined,
          queueScroll: () => undefined,
          promptLength: () => 5,
          addToHistory: () => undefined,
          resetHistoryNavigation: () => undefined,
          setMode: () => undefined,
          setPopover: () => undefined,
        })
        await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)
      }
      if (delivery !== "command") await sent.promise
      const serialized = JSON.stringify(delivery === "command" ? sentCommands : promptInputs)
      expect(serialized).toContain("file:///tmp/")
      expect(serialized).toContain(reference.receipt)
      expect(serialized).not.toContain("blob:must-not-fetch")
      expect(serialized).not.toMatch(/data:|base64/)
    })
  }

  test("uses an injected model selection", async () => {
    params = { id: "session-1" }
    const model = {
      current: () => ({ id: "draft-model", provider: { id: "draft-provider" } }),
      variant: { current: () => "draft-variant" },
    } as unknown as ModelSelection
    const submit = createPromptSubmit({
      prompt,
      info: () => ({ id: "session-1" }),
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      model,
    })

    await submit.handleSubmit({ preventDefault: () => undefined } as unknown as Event)

    expect(optimistic[0]).toMatchObject({
      message: {
        model: { providerID: "draft-provider", modelID: "draft-model", variant: "draft-variant" },
      },
    })
  })

  test("seeds new sessions before optimistic prompts are added", async () => {
    const submit = createPromptSubmit({
      prompt,
      info: () => undefined,
      imageAttachments: () => [],
      commentCount: () => 0,
      autoAccept: () => false,
      mode: () => "normal",
      working: () => false,
      editor: () => undefined,
      queueScroll: () => undefined,
      promptLength: (value) => value.reduce((sum, part) => sum + ("content" in part ? part.content.length : 0), 0),
      addToHistory: () => undefined,
      resetHistoryNavigation: () => undefined,
      setMode: () => undefined,
      setPopover: () => undefined,
      newSessionWorktree: () => selected,
      onNewSessionWorktreeReset: () => undefined,
      onSubmit: () => undefined,
    })

    const event = { preventDefault: () => undefined } as unknown as Event

    await submit.handleSubmit(event)

    expect(storedSessions["/repo/worktree-a"]).toHaveLength(1)
    expect(storedSessions["/repo/worktree-a"]?.[0]).toMatchObject({ id: "session-1", title: "New session 1" })
    expect(optimisticSeeded).toEqual([true])
  })
})

function dashboardDraft(prompt: string) {
  const state = createPromptState({ prompt })
  state.context.add({ type: "dashboard", id: "target-a", nodeName: "A", action: "edit" })
  return state
}

function sendQueuedReview(checkDashboard?: (id: string) => Promise<void>) {
  commands.push({ name: "review" })
  return sendFollowupDraft({
    checkDashboard,
    api: clientFor("/repo/main").api.session as unknown as Parameters<typeof sendFollowupDraft>[0]["api"],
    serverSync: {} as Parameters<typeof sendFollowupDraft>[0]["serverSync"],
    sync: { data: { command: commands } } as unknown as Parameters<typeof sendFollowupDraft>[0]["sync"],
    draft: {
      sessionID: "ses",
      sessionDirectory: "/repo/main",
      prompt: [{ type: "text", content: "/review chart", start: 0, end: 13 }],
      context: [{ type: "dashboard", key: "dashboard", id: "target-a", nodeName: "A", action: "edit" }],
      agent: "build",
      model: { modelID: "m", providerID: "p" },
    },
  })
}

test("a queued slash command includes its pinned dashboard in the accepted message", async () => {
  await sendQueuedReview()
  expect(sentCommands[0]).toMatchObject({
    arguments: "chart",
    legacyParts: [
      expect.objectContaining({
        type: "text",
        synthetic: true,
        text: dashboardPrompt("edit", false),
      }),
    ],
  })
})

test("a rejected dashboard prompt restores the user's words and target for retry", async () => {
  params = { id: "session-1" }
  const state = dashboardDraft("Edit chart")
  const submit = dashboardSubmit(state)
  onPrompt = () => {
    throw new Error("request rejected")
  }
  await submit.handleSubmit(new Event("submit"))
  await Bun.sleep(0)
  expect(promptInputs[0]).toMatchObject({
    legacyParts: [
      expect.objectContaining({ text: "Edit chart" }),
      expect.objectContaining({ synthetic: true, text: dashboardPrompt("edit", false) }),
    ],
  })
  expect(state.current()[0]).toMatchObject({ content: "Edit chart" })
  expect(state.context.items()[0]).toMatchObject({ type: "dashboard", id: "target-a" })
})

function dashboardSubmit(
  state: ReturnType<typeof createPromptState>,
  options?: Partial<Parameters<typeof createPromptSubmit>[0]>,
) {
  return createPromptSubmit({
    prompt: state,
    info: () => ({ id: "session-1" }),
    imageAttachments: () => [],
    commentCount: () => 0,
    autoAccept: () => false,
    mode: () => "normal",
    working: () => false,
    editor: () => undefined,
    queueScroll: () => {},
    promptLength: () => 10,
    addToHistory: () => {},
    resetHistoryNavigation: () => {},
    setMode: () => {},
    setPopover: () => {},
    ...options,
  })
}

test("an expired dashboard keeps the draft and tells the user to reopen it in Loginom", async () => {
  params = { id: "session-1" }
  const state = dashboardDraft("Edit chart")
  lookupDashboard = async (id) => {
    expect(id).toBe("target-a")
    throw new Error("404")
  }

  await dashboardSubmit(state).handleSubmit(new Event("submit"))
  expect(promptInputs).toHaveLength(0)
  expect(state.current()[0]).toMatchObject({ content: "Edit chart" })
  expect(state.context.items()[0]).toMatchObject({ id: "target-a" })
  expect(toasts).toContainEqual(expect.objectContaining({ title: "dashboard.target.snapshotGone", variant: "error" }))
})

test("queueing a validated dashboard keeps a newer selection and text in the editor", async () => {
  params = { id: "session-1" }
  const state = dashboardDraft("Edit first")
  const gate = Promise.withResolvers<boolean>()
  lookupDashboard = () => gate.promise
  const queued: import("./submit").FollowupDraft[] = []
  const submit = dashboardSubmit(state, { shouldQueue: () => true, onQueue: (draft) => queued.push(draft) })
  const pending = submit.handleSubmit(new Event("submit"))
  state.context.add({ type: "dashboard", id: "target-b", nodeName: "B", action: "edit" })
  state.set([{ type: "text", content: "Edit second", start: 0, end: 11 }])
  gate.resolve(true)
  await pending

  expect(queued[0]?.context[0]).toMatchObject({ id: "target-a" })
  expect(queued[0]?.prompt[0]).toMatchObject({ content: "Edit first" })
  expect(state.context.items()[0]).toMatchObject({ id: "target-b" })
  expect(state.current()[0]).toMatchObject({ content: "Edit second" })
})

test("an expired queued dashboard rejects delivery without sending its command", async () => {
  const ids: string[] = []
  await expect(
    sendQueuedReview(async (id) => {
      ids.push(id)
      throw new Error("dashboard.target.snapshotGone")
    }),
  ).rejects.toThrow("dashboard.target.snapshotGone")
  expect(ids).toEqual(["target-a"])
  expect(sentCommands).toHaveLength(0)
})

test("repeat Enter during a dashboard lookup submits the captured draft once", async () => {
  params = { id: "session-1" }
  const state = dashboardDraft("Edit A")
  const gate = Promise.withResolvers<boolean>()
  const ids: string[] = []
  lookupDashboard = (id) => {
    ids.push(id)
    return gate.promise
  }
  const submit = dashboardSubmit(state)
  const sends = [submit.handleSubmit(new Event("submit")), submit.handleSubmit(new Event("submit"))]
  gate.resolve(true)
  await Promise.all(sends)
  expect(ids).toEqual(["target-a"])
  expect(promptInputs).toHaveLength(1)
})

test("a failed send restores the text and target alongside a newly added file", async () => {
  params = { id: "session-1" }
  const state = dashboardDraft("Edit A")
  onPrompt = () => {
    state.context.add({ type: "file", path: "new.txt" })
    throw new Error("network failure")
  }
  await dashboardSubmit(state).handleSubmit(new Event("submit"))
  expect(state.current()[0]).toMatchObject({ content: "Edit A" })
  expect(state.context.items()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "file", path: "new.txt" }),
      expect.objectContaining({ type: "dashboard", id: "target-a" }),
    ]),
  )
})

test("a shell command leaves the selected dashboard for the next model request", async () => {
  params = { id: "session-1" }
  const state = dashboardDraft("pwd")
  const ids: string[] = []
  lookupDashboard = async (id) => {
    ids.push(id)
    throw new Error("404")
  }
  await dashboardSubmit(state, { mode: () => "shell" }).handleSubmit(new Event("submit"))
  expect(sentShell[0]).toMatchObject({ command: "pwd" })
  expect(promptInputs).toHaveLength(0)
  expect(ids).toHaveLength(0)
  expect(state.context.items()[0]).toMatchObject({ id: "target-a" })
})

test("repeat Enter while creating a session for a dashboard produces one message", async () => {
  const gate = Promise.withResolvers<void>()
  createSessionGate = gate.promise
  const state = dashboardDraft("Edit A")
  const submit = dashboardSubmit(state, { info: () => undefined })
  const first = submit.handleSubmit(new Event("submit"))
  await Bun.sleep(0)
  const repeated = submit.handleSubmit(new Event("submit"))
  gate.resolve()
  await Promise.all([first, repeated])
  expect(createdSessions).toHaveLength(1)
  expect(promptInputs).toHaveLength(1)
})

test("a dashboard that expires during session creation stays in the draft", async () => {
  const gate = Promise.withResolvers<void>()
  createSessionGate = gate.promise
  let available = true
  lookupDashboard = async () => {
    if (!available) throw new Error("404")
    return true
  }
  const state = dashboardDraft("Edit A")
  const sending = dashboardSubmit(state, { info: () => undefined }).handleSubmit(new Event("submit"))
  await Bun.sleep(0)
  available = false
  gate.resolve()
  await sending
  expect(promptInputs).toHaveLength(0)
  expect(state.current()[0]).toMatchObject({ content: "Edit A" })
  expect(state.context.items()[0]).toMatchObject({ id: "target-a" })
})

test("the promoted chat cannot submit the same draft during its final dashboard lookup", async () => {
  const first = dashboardDraft("Edit A")
  const chat = createPromptState()
  const gate = Promise.withResolvers<boolean>()
  let reads = 0
  lookupDashboard = async () => (++reads === 1 ? true : gate.promise)
  const original = dashboardSubmit(first, {
    info: () => undefined,
    prompt: { ...first, capture: (scope) => (scope ? chat.capture() : first.capture()) },
  })
  const sending = original.handleSubmit(new Event("submit"))
  await Bun.sleep(0)
  expect(chat.current()[0]).toMatchObject({ content: "Edit A" })
  params = { id: "session-1" }
  const repeated = dashboardSubmit(chat).handleSubmit(new Event("submit"))
  gate.resolve(true)
  await Promise.all([sending, repeated])
  expect(promptInputs).toHaveLength(1)
})

test("sending a dashboard checks its local folder without fetching the consumed snapshot", async () => {
  params = { id: "session-1" }
  const ids: string[] = []
  lookupDashboard = async (id) => {
    ids.push(id)
    return true
  }
  await dashboardSubmit(dashboardDraft("Edit chart")).handleSubmit(new Event("submit"))
  expect(ids).toEqual(["target-a"])
  expect(snapshotReads).toEqual([])
  expect(promptInputs).toHaveLength(1)
})
