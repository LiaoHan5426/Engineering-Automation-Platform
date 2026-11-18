/** Read-only, incremental Windows fixture review. No commands or fixture payloads execute. */
import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/** A finding is evidence for manual review, except a directly observed encoding mismatch. */
export interface PlatformFinding {
  code: 'NATIVE_PATH_PROTOCOL_EXPECTATION' | 'RAW_CWD_JSON_REPLACEMENT' | 'POSIX_FIXTURE_SHELL'
  path: string
  line: number
  classification: 'problem' | 'review'
  message: string
  reason: string
}

/** Explicit incremental inputs. Deleted plan entries are ignored; no discovery is performed. */
export interface PlatformPreflightOptions {
  root: string
  platform: 'win32' | 'linux'
  files?: readonly string[]
  plan?: { entries: readonly { path: string; status: string }[] }
}

/** Stable JSON report, including empty and excluded input coverage. */
export interface PlatformPreflightReport {
  platform: 'win32' | 'linux'
  scope: 'empty' | 'incremental'
  checked: string[]
  skipped: { path: string; reason: string }[]
  findings: PlatformFinding[]
}

function visit(node: ts.Node, action: (node: ts.Node) => void): void {
  action(node)
  ts.forEachChild(node, child => visit(child, action))
}

/** Analyze one selected TS/TSX fixture without evaluating it or resolving external modules.
 * @param path Repository-relative display path.
 * @param text Source text.
 * @param platform Target platform, independent of the host.
 * @returns Conservative findings with one-based source lines.
 */
export function inspectPlatformSource(path: string, text: string, platform: 'win32' | 'linux'): PlatformFinding[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const findings: PlatformFinding[] = []
  if (platform !== 'win32') return findings
  const nativeNames = new Set<string>()
  const namespaces = new Set<string>()
  const declarations = new Map<string, ts.Expression[]>()
  visit(source, node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && /^(node:)?path$/.test(node.moduleSpecifier.text)) {
      const clause = node.importClause
      if (clause?.name) namespaces.add(clause.name.text)
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (/^(join|resolve)$/.test((element.propertyName ?? element.name).text)) nativeNames.add(element.name.text)
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const values = declarations.get(node.name.text) ?? []
      values.push(node.initializer)
      declarations.set(node.name.text, values)
    }
  })
  function traces(node: ts.Node, kind: 'native' | 'cwd', seen = new Set<string>()): boolean {
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return false
      const values = declarations.get(node.text)
      if (values?.length === 1) return traces(values[0]!, kind, new Set([...seen, node.text]))
      if (!values && kind === 'cwd' && /cwd$/i.test(node.text)) return true
    }
    if (kind === 'cwd' && ts.isPropertyAccessExpression(node) && /cwd$/i.test(node.name.text)) return true
    if (ts.isCallExpression(node)) {
      const expression = node.expression
      if (kind === 'native' && (ts.isIdentifier(expression) && nativeNames.has(expression.text)
        || ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)
        && namespaces.has(expression.expression.text) && /^(join|resolve)$/.test(expression.name.text))) return true
      if (kind === 'cwd' && expression.getText(source) === 'process.cwd') return true
      // Conversion functions, including JSON.stringify(...).slice(...), terminate raw-value tracing.
      return false
    }
    if (ts.isPropertyAccessExpression(node)) return false
    let found = false
    ts.forEachChild(node, child => { if (traces(child, kind, seen)) found = true })
    return found
  }
  function knownNativeCwd(node: ts.Node, seen = new Set<string>()): boolean {
    if (ts.isCallExpression(node)) return node.expression.getText(source) === 'process.cwd'
    if (!ts.isIdentifier(node) || seen.has(node.text)) return false
    const values = declarations.get(node.text)
    return values?.length === 1 && knownNativeCwd(values[0]!, new Set([...seen, node.text]))
  }
  function add(node: ts.Node, code: PlatformFinding['code'], classification: PlatformFinding['classification'], message: string, reason: string): void {
    findings.push({ code, path, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, classification, message, reason })
  }
  visit(source, node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      const receiver = node.expression.expression.getText(source)
      if (/^(toBe|toEqual|toStrictEqual|toHaveValue|toContainText|toHaveText)$/.test(method)
        && /clipboard|mention|file:/i.test(receiver)
        && node.arguments.some(arg => traces(arg, 'native'))) {
        add(node, 'NATIVE_PATH_PROTOCOL_EXPECTATION', 'review', 'Native path reaches a literal clipboard, mention, or file URI expectation.',
          'Confirm the producer protocol: disk paths preserve native separators; mention/URI or slash-based clipboard values require their explicit protocol conversion. Local name tracing is not whole-program data flow.')
      }
      if (/^(replace|replaceAll)$/.test(method) && node.arguments[0] && traces(node.arguments[0], 'cwd')
        && receiver.startsWith('JSON.stringify(')) {
        add(node.arguments[0], 'RAW_CWD_JSON_REPLACEMENT', knownNativeCwd(node.arguments[0]) ? 'problem' : 'review', 'Raw cwd is matched against JSON.stringify output.',
          'JSON escapes Windows backslashes. Encode the match with JSON.stringify(cwd).slice(1, -1); verify the intended placeholder is actually substituted.')
      }
    }
    if (ts.isPropertyAssignment(node) && node.name.getText(source).replace(/['"]/g, '') === 'replacements'
      && ts.isArrayLiteralExpression(node.initializer)) {
      for (const pair of node.initializer.elements) {
        if (ts.isArrayLiteralExpression(pair) && pair.elements[0] && traces(pair.elements[0], 'cwd')) {
          add(pair.elements[0], 'RAW_CWD_JSON_REPLACEMENT', 'review', 'Scenario replacements use a raw cwd match.',
            'Check whether captureStableAria or the JSON snapshot helper serializes before scenario replacements. If so use JSON.stringify(cwd).slice(1, -1), and verify the placeholder count; raw-text helpers have different semantics.')
        }
      }
    }
    let command: ts.Expression | undefined
    let explicitBash = false
    if (ts.isPropertyAssignment(node) && /^(command|script)$/.test(node.name.getText(source).replace(/['"]/g, '')) && ts.isObjectLiteralExpression(node.parent)) {
      command = node.initializer
      explicitBash = ts.isCallExpression(node.parent.parent) && /(?:^|\.)(?:bash|ops_bash)$/.test(node.parent.parent.expression.getText(source))
        || node.parent.properties.some(property => ts.isPropertyAssignment(property)
        && /^(shell|executable|executor|tool)$/.test(property.name.getText(source).replace(/['"]/g, ''))
        && ts.isStringLiteralLike(property.initializer) && /(^|[/\\])bash(?:\.exe)?$/.test(property.initializer.text))
    }
    if (ts.isCallExpression(node) && /^(exec|execSync)$/.test(node.expression.getText(source))) {
      command = node.arguments[0]
      const options = node.arguments[1]
      if (options && ts.isObjectLiteralExpression(options)) explicitBash = options.properties.some(property => ts.isPropertyAssignment(property)
        && property.name.getText(source) === 'shell' && ts.isStringLiteralLike(property.initializer)
        && /(^|[/\\])bash(?:\.exe)?$/.test(property.initializer.text))
    }
    if (command && ts.isStringLiteralLike(command) && !explicitBash
      && /(?:^|[;\n&|]\s*)\s*(?:printf\s|export\s+[A-Za-z_]|cat\s+<<)|<<-?\s*['"]?[A-Za-z_]/.test(command.text)) {
      add(command, 'POSIX_FIXTURE_SHELL', 'review', 'POSIX-only fixture syntax has no explicit Bash executor in this command.',
        'Confirm the actual executor and Windows shell. Prefer process.execPath with argv for portable fixture setup, or declare Bash explicitly. This check never executes the command or infers a shell from the host.')
    }
  })
  return findings
}

/** Read only the selected incremental files; reject escaping paths and symlinks.
 * @param options Explicit root, target platform, and file or plan entries.
 * @returns Deterministic report, including skipped deleted or out-of-kind entries.
 */
export function runPlatformPreflight(options: PlatformPreflightOptions): PlatformPreflightReport {
  if (options.files !== undefined && options.plan !== undefined) throw new Error('PREFLIGHT_INPUT: choose files or plan')
  const root = realpathSync(options.root)
  const entries = options.files?.map(path => ({ path, status: 'M' })) ?? options.plan?.entries ?? []
  const report: PlatformPreflightReport = { platform: options.platform, scope: entries.length ? 'incremental' : 'empty', checked: [], skipped: [], findings: [] }
  const selected = new Set<string>()
  for (const entry of entries) {
    const path = entry.path.replace(/\\/g, '/')
    if (/^[a-z][a-z0-9+.-]*:/.test(path) && path.includes('://')) throw new Error('PREFLIGHT_PATH: protocol URLs are not disk paths')
    const absolute = resolve(root, path)
    const display = relative(root, absolute).replace(/\\/g, '/')
    if (display === '..' || display.startsWith('../') || isAbsolute(display)) throw new Error('PREFLIGHT_PATH: path escapes root')
    if (entry.status === 'D' || !/\.tsx?$/.test(display) || !/(^|\/)(scripts|tests|__tests__)\/|\.(spec|test|e2e)\.tsx?$/.test(display)) {
      report.skipped.push({ path: display, reason: entry.status === 'D' ? 'deleted' : 'not a TS/TSX test or script' })
      continue
    }
    const actual = relative(root, realpathSync(absolute))
    if (actual === '..' || actual.startsWith('../') || actual.startsWith('..\\') || isAbsolute(actual)) throw new Error('PREFLIGHT_PATH: symlink escapes root')
    selected.add(display)
  }
  for (const path of [...selected].sort()) {
    report.checked.push(path)
    report.findings.push(...inspectPlatformSource(path, readFileSync(resolve(root, path), 'utf8'), options.platform))
  }
  report.skipped.sort((a, b) => a.path.localeCompare(b.path))
  report.findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.code.localeCompare(b.code))
  return report
}

/** Parse the finite CLI; only reads existing files and emits JSON.
 * @param argv CLI arguments: --root, --platform, repeated --file, or --plan.
 * @returns Report JSON with a trailing newline.
 */
export function renderPlatformPreflight(argv: readonly string[]): string {
  let root = process.cwd()
  let platform: 'win32' | 'linux' = process.platform === 'win32' ? 'win32' : 'linux'
  const files: string[] = []
  let planFile: string | undefined
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) throw new Error('PREFLIGHT_INPUT: expected flag value')
    if (flag === '--root') root = resolve(value)
    else if (flag === '--file') files.push(value)
    else if (flag === '--plan') planFile = value
    else if (flag === '--platform' && (value === 'win32' || value === 'linux')) platform = value
    else throw new Error('PREFLIGHT_INPUT: unknown flag or platform')
  }
  if (planFile && files.length) throw new Error('PREFLIGHT_INPUT: choose --file or --plan')
  let plan: PlatformPreflightOptions['plan']
  if (planFile) {
    const parsed: unknown = JSON.parse(readFileSync(resolve(root, planFile), 'utf8'))
    if (!parsed || typeof parsed !== 'object' || !('entries' in parsed) || !Array.isArray(parsed.entries)) throw new Error('PREFLIGHT_INPUT: plan.entries must be an array')
    const entries: { path: string; status: string }[] = []
    for (const entry of parsed.entries) {
      if (!entry || typeof entry !== 'object' || !('path' in entry) || typeof entry.path !== 'string'
        || !('status' in entry) || typeof entry.status !== 'string') throw new Error('PREFLIGHT_INPUT: invalid plan entry')
      entries.push({ path: entry.path, status: entry.status })
    }
    plan = { entries }
  }
  return JSON.stringify(runPlatformPreflight({ root, platform, ...(plan ? { plan } : { files }) }), null, 2) + '\n'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(renderPlatformPreflight(process.argv.slice(2)))
  } catch (error) {
    process.stderr.write('upstream-platform-preflight: ' + (error instanceof Error ? error.message : String(error)) + '\n')
    process.exitCode = 1
  }
}
