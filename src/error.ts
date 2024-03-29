/** Module for Error datatypes. */

/** Represents Error used by `Output`. */
export class OutputError extends Error {}
/** Represents errors that cannot be reached. */
export class UnreachableError extends Error {
  constructor() {
    super("Reached unreachable error.");
  }
}
/** Represents errors expected to be covered by other errors. */
export class CoveredError extends OutputError {}
/** Represents Error with unexpected and expected elements. */
export class UnexpectedError extends OutputError {
  constructor(unexpected: string, expected: string) {
    super(`Unexpected ${unexpected}. ${expected} were expected instead.`);
  }
}
/** Represents Error due to things not implemented yet. */
export class TodoError extends OutputError {
  constructor(token: string) {
    super(`${token} is not yet implemented.`);
  }
}
/** Represents Error caused by unrecognized elements. */
export class UnrecognizedError extends OutputError {
  constructor(token: string) {
    super(`${token} is unrecognized.`);
  }
}
