/// <reference types="node" />
/**
 * AST-based code standards gate for statement budgets and import/type naming rules.
 *
 * Uses the TypeScript Compiler API so comments, docstrings, blank lines, and
 * standalone braces stay out of the metric. The public fork carries no
 * grandfather list here; every surfaced violation is real current debt.
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
export type CodeStandardsRule =
  | "function-budget"
  | "file-budget"
  | "import-alias"
  | "unique-type-name";

export interface CodeStandardsViolation {
  rule: CodeStandardsRule;
  fingerprint: string;
  message: string;
}

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

export function normalizeRepoPath(filePath: string): string {
  return path.relative(process.cwd(), filePath).replace(/\\/g, "/");
}

export function countFunctionsInFile(filePath: string): {
  functions: FunctionCount[];
  fileTotal: number;
  source: ts.SourceFile;
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
  return { functions, fileTotal, source };
}

export function collectBudgetViolations(filePath: string): CodeStandardsViolation[] {
  const relativePath = normalizeRepoPath(filePath);
  const { functions, fileTotal } = countFunctionsInFile(filePath);
  const violations: CodeStandardsViolation[] = [];

  for (const fn of functions) {
    if (fn.statementCount > MAX_FUNCTION_STATEMENTS) {
      violations.push({
        rule: "function-budget",
        fingerprint: `function-budget|${relativePath}|${fn.functionName}`,
        message: `Function budget exceeded: ${relativePath}:${fn.startLine} ${fn.functionName} (${fn.statementCount} statements > ${MAX_FUNCTION_STATEMENTS})`,
      });
    }
  }

  if (fileTotal > MAX_FILE_STATEMENTS) {
    violations.push({
      rule: "file-budget",
      fingerprint: `file-budget|${relativePath}`,
      message: `File budget exceeded: ${relativePath} (${fileTotal} statements > ${MAX_FILE_STATEMENTS})`,
    });
  }

  return violations;
}

export function collectImportAliasViolations(filePath: string): CodeStandardsViolation[] {
  const relativePath = normalizeRepoPath(filePath);
  const { source } = countFunctionsInFile(filePath);
  const violations: CodeStandardsViolation[] = [];

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;

    const moduleText =
      ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "<unknown>";

    const namedBindings = statement.importClause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        if (!element.propertyName) continue;
        const importedName = element.propertyName.text;
        const localName = element.name.text;
        const { line } = source.getLineAndCharacterOfPosition(element.getStart());
        violations.push({
          rule: "import-alias",
          fingerprint: `import-alias|${relativePath}|named|${moduleText}|${importedName}|${localName}`,
          message: `Import alias banned: ${relativePath}:${line + 1} { ${importedName} as ${localName} } from "${moduleText}"`,
        });
      }
    }

    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      const namespaceName = namedBindings.name.text;
      const { line } = source.getLineAndCharacterOfPosition(namedBindings.getStart());
      violations.push({
        rule: "import-alias",
        fingerprint: `import-alias|${relativePath}|namespace|${moduleText}|${namespaceName}`,
        message: `Namespace import banned: ${relativePath}:${line + 1} * as ${namespaceName} from "${moduleText}"`,
      });
    }
  }

  return violations;
}

export interface ExportedTypeDefinition {
  name: string;
  filePath: string;
  line: number;
}

export function collectExportedTypeDefinitions(filePath: string): ExportedTypeDefinition[] {
  const relativePath = normalizeRepoPath(filePath);
  const { source } = countFunctionsInFile(filePath);
  const definitions: ExportedTypeDefinition[] = [];

  function isExported(node: ts.Node): boolean {
    return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
  }

  for (const statement of source.statements) {
    const addDefinition = (nameNode?: ts.Identifier) => {
      if (!nameNode) return;
      const { line } = source.getLineAndCharacterOfPosition(nameNode.getStart());
      definitions.push({
        name: nameNode.text,
        filePath: relativePath,
        line: line + 1,
      });
    };

    if (ts.isInterfaceDeclaration(statement) && isExported(statement)) {
      addDefinition(statement.name);
    } else if (ts.isTypeAliasDeclaration(statement) && isExported(statement)) {
      addDefinition(statement.name);
    } else if (ts.isClassDeclaration(statement) && isExported(statement)) {
      addDefinition(statement.name);
    } else if (ts.isEnumDeclaration(statement) && isExported(statement)) {
      addDefinition(statement.name);
    }
  }

  return definitions;
}

export function collectUniqueTypeNameViolations(files: string[]): CodeStandardsViolation[] {
  const definitions = files.flatMap((filePath) => collectExportedTypeDefinitions(filePath));
  const grouped = new Map<string, ExportedTypeDefinition[]>();

  for (const definition of definitions) {
    const bucket = grouped.get(definition.name) ?? [];
    bucket.push(definition);
    grouped.set(definition.name, bucket);
  }

  return Array.from(grouped.entries())
    .filter(([, bucket]) => bucket.length > 1)
    .flatMap(([name, bucket]) =>
      bucket.map((definition) => ({
        rule: "unique-type-name" as const,
        fingerprint: `unique-type-name|${name}|${definition.filePath}`,
        message: `Exported type name must be unique: ${definition.filePath}:${definition.line} ${name} duplicates ${bucket.length - 1} peer definition(s)`,
      })),
    );
}

export async function resolveTargetFiles(targets: string[]): Promise<string[]> {
  return Array.from(
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
  const files = await resolveTargetFiles(targets);
  const allViolations: CodeStandardsViolation[] = [];

  for (const file of files) {
    if (checkFunctions || checkFiles) {
      const budgetViolations = collectBudgetViolations(file).filter((violation) =>
        violation.rule === "function-budget" ? checkFunctions : checkFiles,
      );
      allViolations.push(...budgetViolations);
    }

    allViolations.push(...collectImportAliasViolations(file));
  }

  allViolations.push(...collectUniqueTypeNameViolations(files));

  for (const violation of allViolations) {
    console.log(violation.message);
  }

  console.log(`\n${allViolations.length} code standards violations found.`);
  process.exit(allViolations.length === 0 ? 0 : 1);
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
