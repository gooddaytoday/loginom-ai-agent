export function receivePrivateAdmission(argv?: string[]): Promise<void>
export function retainRunCommandCreation(args: object, signal: AbortSignal | undefined): object | undefined
export function assertRunCommandCreation(token: object, args: object, signal: AbortSignal): bigint
export function retainPromptSender(token: object | undefined, input: object, kind: "prompt" | "command"): unknown
export function associatePromptRequest(token: object | undefined, request: Request): Request
export function relayPromptRequest(source: Request, target: Request): Request
export function admitPromptInput<T extends object>(source: object, input: T): T
export function relayPromptInput<T extends object>(source: object, target: T): T
export function promptSDKContext(input: object): object | undefined
export function assertSDKContext(token: object): object
export function retainSDKInvocation(request: unknown, options: object): object | undefined
export function assertSDKInvocation(token: object, request: unknown, options: object): {deadline: bigint, runCommandSignal: AbortSignal, sdkSignal: AbortSignal}
