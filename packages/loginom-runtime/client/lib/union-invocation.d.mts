export function originalUnionInvocation(packet: unknown, owner: object): Readonly<{
  purpose: 'union-original-invocation-v1'; owner: object; generation: number;
  request: unknown; operation: string; signature: string; signal: AbortSignal;
  deadline: number; callId: string; session: string; message: string; userMessage: string;
}>;
