export type RuleIssue = {
  code: string;
  message: string;
  path: Array<number | string>;
};

export class RuleError extends Error {
  readonly issues: RuleIssue[];
  readonly statusCode = 400;

  constructor(issue: RuleIssue | RuleIssue[]) {
    const issues = Array.isArray(issue) ? issue : [issue];
    super(issues[0]?.message || "Value does not match the Rule.");
    this.issues = issues;
    this.name = "RuleError";
  }
}

export function fail(
  code: string,
  message: string,
  path: Array<number | string>,
): never {
  throw new RuleError({ code, message, path });
}
