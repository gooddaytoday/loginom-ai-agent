export type ExecutionOrigin = Readonly<{ signal: AbortSignal; born: bigint; deadline: bigint }>
export function currentExecutionOrigin(): ExecutionOrigin | undefined
export function assertExecutionOrigin(origin: ExecutionOrigin): ExecutionOrigin
export function withExecutionOrigin<T>(controller: AbortController, run: (signal: AbortSignal) => Promise<T>): Promise<T>

export function adoptExecutionOrigin(born: bigint, deadline: bigint): void

export function sealExecutionOrigin(origin: ExecutionOrigin): void
