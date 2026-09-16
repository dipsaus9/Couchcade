/** One rule violation, ready to print as `<file>:<line>: <message>`. */
export interface StyleViolation {
  /** Repo-root-relative path, forward slashes. */
  readonly file: string;
  readonly line: number;
  readonly message: string;
}
