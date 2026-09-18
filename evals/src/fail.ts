export class EvalFailure extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 2,
  ) {
    super(message)
    this.name = "EvalFailure"
  }
}
