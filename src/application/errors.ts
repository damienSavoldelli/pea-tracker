export type ErrorStatus = 400 | 401 | 403 | 404 | 405 | 406 | 409 | 412 | 413 | 415 | 422 | 428 | 429 | 500 | 503;

export class ApplicationError extends Error {
  constructor(
    public readonly status: ErrorStatus,
    public readonly code: string,
    public readonly fieldPaths: string[] = [],
  ) {
    super(code);
  }
}
