import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  collectImportAliasViolations,
  collectUniqueTypeNameViolations,
  countFunctionsInFile,
  filterBaselineViolations,
  main,
  MAX_FILE_STATEMENTS,
  MAX_FUNCTION_STATEMENTS,
} from "../check-code-standards";

const fixtureDirs: string[] = [];

function writeFixture(fileName: string, source: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), "check-code-standards-"));
  fixtureDirs.push(directory);
  const filePath = path.join(directory, fileName);
  writeFileSync(filePath, source);
  return filePath;
}

function makeStatements(count: number, indent = ""): string {
  return Array.from(
    { length: count },
    (_, index) => `${indent}const value${index} = ${index};`,
  ).join("\n");
}

afterEach(() => {
  for (const directory of fixtureDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("countFunctionsInFile", () => {
  it("counts a known function budget exactly", () => {
    const filePath = writeFixture(
      "function-budget.ts",
      `function withinBudget() {
${makeStatements(MAX_FUNCTION_STATEMENTS, "  ")}
}
`,
    );

    expect(countFunctionsInFile(filePath).functions).toContainEqual(
      expect.objectContaining({
        functionName: "withinBudget",
        statementCount: MAX_FUNCTION_STATEMENTS,
      }),
    );
  });

  it("counts a known file budget exactly", () => {
    const filePath = writeFixture(
      "file-budget.ts",
      `${makeStatements(MAX_FILE_STATEMENTS)}\n`,
    );

    expect(countFunctionsInFile(filePath).fileTotal).toBe(MAX_FILE_STATEMENTS);
  });

  it("reports violations across multiple CLI targets", async () => {
    const firstPath = writeFixture(
      "first.ts",
      `function first() {
${makeStatements(MAX_FUNCTION_STATEMENTS + 1, "  ")}
}
`,
    );
    const secondPath = writeFixture(
      "second.ts",
      `function second() {
${makeStatements(MAX_FUNCTION_STATEMENTS + 2, "  ")}
}
`,
    );
    const originalArgv = process.argv;
    const originalExit = process.exit;
    const originalLog = console.log;
    const messages: string[] = [];
    let exitCode: number | undefined;

    process.argv = [
      "node",
      "check-code-standards.ts",
      "--functions-only",
      firstPath,
      secondPath,
    ];
    process.exit = ((code?: string | number | null) => {
      exitCode = typeof code === "number" ? code : Number(code ?? 0);
      throw new Error("process.exit intercepted");
    }) as typeof process.exit;
    console.log = (message?: unknown) => {
      messages.push(String(message));
    };

    try {
      await expect(main()).rejects.toThrow("process.exit intercepted");
    } finally {
      process.argv = originalArgv;
      process.exit = originalExit;
      console.log = originalLog;
    }

    expect(exitCode).toBe(1);
    expect(
      messages.filter((message) => message.startsWith("Function budget exceeded:")),
    ).toHaveLength(2);
  });

  it("ignores comments, blank lines, and standalone braces", () => {
    const filePath = writeFixture(
      "non-statements.ts",
      `function commentsAndBlocks() {
  /**
   * This docstring must not affect the count.
   */

  {
    const insideBlock = 1;
  }
}
`,
    );

    expect(countFunctionsInFile(filePath).functions).toContainEqual(
      expect.objectContaining({
        functionName: "commentsAndBlocks",
        statementCount: 1,
      }),
    );
  });

  it("flags aliased imports outside the baseline", () => {
    const filePath = writeFixture(
      "import-alias.ts",
      `import { stopAllPolling as stopConversationPolling } from "./conversation";
`,
    );

    expect(collectImportAliasViolations(filePath)).toEqual([
      expect.objectContaining({
        rule: "import-alias",
        fingerprint:
          expect.stringContaining(
            "import-alias|",
          ),
      }),
    ]);
  });

  it("flags duplicate exported type names across files", () => {
    const firstPath = writeFixture(
      "first.ts",
      `export interface ConversationIdentityUpdate {
  id: string;
}
`,
    );
    const secondPath = writeFixture(
      "second.ts",
      `export type ConversationIdentityUpdate = {
  id: string;
};
`,
    );

    const violations = collectUniqueTypeNameViolations([firstPath, secondPath]);

    expect(violations).toHaveLength(2);
    expect(
      violations.every((violation) => violation.rule === "unique-type-name"),
    ).toBe(true);
  });

  it("grandfathers exact baseline fingerprints but fails on new ones", () => {
    const violations = [
      {
        rule: "import-alias" as const,
        fingerprint:
          "import-alias|app/src/store/authSlice.ts|named|./conversationSlice|stopAllPolling|stopConversationPolling",
        message: "first",
      },
      {
        rule: "import-alias" as const,
        fingerprint:
          "import-alias|agent/__tests__/claude-cli.test.ts|named|node:child_process|execFile|mockedExecFile",
        message: "second",
      },
    ];

    const { grandfathered, current } = filterBaselineViolations(
      violations,
      new Set([violations[0].fingerprint]),
    );

    expect(grandfathered).toEqual([violations[0]]);
    expect(current).toEqual([violations[1]]);
  });
});
