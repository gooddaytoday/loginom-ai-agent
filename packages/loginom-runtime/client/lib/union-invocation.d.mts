export type UnionInvocation = Readonly<{
  guard(): void
  invoke(): Promise<unknown>
  facts(): {
    deadline: number
    budget_ms: number
    pending: boolean
    failed: boolean
    first: { value: unknown } | undefined
    secondary: unknown[]
    nativeAuthority: false
    creationAuthority: false
    releaseAuthority: false
  }
}>

export function bindUnionInvocationProcessor(processor: object, message: object): void
export function registerUnionInvocationCarrier(owner: object): void
export function retainUnionInvocation(source: unknown): UnionInvocation | undefined
export function originalUnionInvocation(packet: unknown, owner: object): Readonly<{
  purpose: "union-original-invocation-v1"
  owner: object
  generation: number
  request: unknown
  operation: string
  signature: string
  signal: AbortSignal
  deadline: number
  callId: string
  session: string
  message: string
  userMessage: string
}>
