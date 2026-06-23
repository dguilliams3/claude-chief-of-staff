/// <reference types="node" />
/**
 * AST-based code standards gate for function/file statement budgets.
 *
 * Uses the TypeScript Compiler API so comments, docstrings, blank lines, and
 * standalone braces stay out of the metric.
 *
 * Usage:
 *   node --import tsx scripts/check-code-standards.ts
 *   node --import tsx scripts/check-code-standards.ts <path-or-glob> [more-paths-or-globs...]
 *   node --import tsx scripts/check-code-standards.ts --functions-only
 *   node --import tsx scripts/check-code-standards.ts --files-only
 *
 * Tested by: `scripts/__tests__/check-code-standards.test.ts`
 * Do NOT: Replace this with line counting; line counts punish comments and miss nesting.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import ts from "typescript";

export const MAX_FUNCTION_STATEMENTS = 75;
export const MAX_FILE_STATEMENTS = 200;

export interface FunctionCount {
  filePath: string;
  functionName: string;
  startLine: number;
  statementCount: number;
}

export function countStatementsInNode(node: ts.Node): number {
  let count = 0;

  function visit(child: ts.Node): void {
    if (ts.isStatement(child) && !ts.isBlock(child)) count++;
    child.forEachChild(visit);
  }

  visit(node);
  return count;
}

export function countFunctionsInFile(filePath: string): {
  functions: FunctionCount[];
  fileTotal: number;
} {
  const text = fs.readFileSync(filePath, "utf-8");
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  const functions: FunctionCount[] = [];
  let fileTotal = 0;

  function visit(node: ts.Node): void {
    if (ts.isStatement(node) && !ts.isBlock(node)) fileTotal++;

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      const name =
        (ts.isFunctionDeclaration(node) && node.name?.text) ||
        (ts.isMethodDeclaration(node) && node.name?.getText()) ||
        "<anonymous>";
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      const body = node.body;
      if (body) {
        functions.push({
          filePath,
          functionName: name,
          startLine: line + 1,
          statementCount: countStatementsInNode(body),
        });
      }
    }

    node.forEachChild(visit);
  }

  visit(source);
  return { functions, fileTotal };
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const patterns = args.filter((arg) => !arg.startsWith("--"));
  const targets =
    patterns.length > 0
      ? patterns
      : ["{agent,app/src,server}/**/*.{ts,tsx}"];
  const checkFunctions =
    args.includes("--functions-only") ||
    (!args.includes("--functions-only") && !args.includes("--files-only"));
  const checkFiles =
    args.includes("--files-only") ||
    (!args.includes("--functions-only") && !args.includes("--files-only"));

  const files = Array.from(
    new Set(
      (
        await Promise.all(
          targets.map((pattern) =>
            glob(pattern, {
              ignore: [
                "**/node_modules/**",
                "**/dist/**",
                "**/.wrangler/**",
                "**/*.test.ts",
                "**/*.test.tsx",
              ],
            }),
          ),
        )
      ).flat(),
    ),
  );

  let violations = 0;

  for (const file of files) {
    const { functions, fileTotal } = countFunctionsInFile(file);

    if (checkFunctions) {
      for (const fn of functions) {
        if (fn.statementCount > MAX_FUNCTION_STATEMENTS) {
          console.log(
            `Function budget exceeded: ${fn.filePath}:${fn.startLine} ${fn.functionName} (${fn.statementCount} statements > ${MAX_FUNCTION_STATEMENTS})`,
          );
          violations++;
        }
      }
    }

    if (checkFiles && fileTotal > MAX_FILE_STATEMENTS) {
      console.log(
        `File budget exceeded: ${file} (${fileTotal} statements > ${MAX_FILE_STATEMENTS})`,
      );
      violations++;
    }
  }

  console.log(`\n${violations} code standards violations found.`);
  process.exit(violations === 0 ? 0 : 1);
}

function isCliEntryPoint(): boolean {
  const entryPath = process.argv[1];
  return Boolean(entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href);
}

if (isCliEntryPoint()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
