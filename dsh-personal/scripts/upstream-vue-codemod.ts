/** Conservative, opt-in Vue selector repair; never updates upstream acceptance metadata. */
import { createHash } from 'node:crypto'
import { copyFile, lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

type Finding = { category: 'supported' | 'manual-review'; code: string; line: number; reason: string }
type Plan = { source: string; output: string; beforeHash: string; afterHash: string; findings: Finding[] }
type Patch = { start: number; end: number; text: string }

/** Hash the exact UTF-8 source bytes used by a conversion plan.
 * @param source Source text.
 * @returns SHA256 hexadecimal digest.
 */
export function sourceHash(source: string): string {
  return createHash('sha256').update(source, 'utf8').digest('hex')
}

function vueImports(file: ts.SourceFile): Map<string, string> {
  const result = new Map<string, string>()
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== 'vue' || statement.importClause?.isTypeOnly) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const item of bindings.elements) {
      if (!item.isTypeOnly) result.set(item.name.text, item.propertyName?.text ?? item.name.text)
    }
  }
  return result
}

// Only reads over the selector argument and live setup props are admitted. Calls
// are limited to the known account map lookup; arbitrary functions may have effects.
function pureRead(node: ts.Node, state: string, props: string): boolean {
  if (ts.isIdentifier(node)) return node.text === state || node.text === props
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)
    || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return true
  if (ts.isParenthesizedExpression(node)) return pureRead(node.expression, state, props)
  if (ts.isPropertyAccessExpression(node)) return pureRead(node.expression, state, props)
  if (ts.isElementAccessExpression(node)) return pureRead(node.expression, state, props) && pureRead(node.argumentExpression, state, props)
  if (ts.isConditionalExpression(node)) return [node.condition, node.whenTrue, node.whenFalse].every(child => pureRead(child, state, props))
  if (ts.isBinaryExpression(node)) {
    const operators = [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken]
    return operators.includes(node.operatorToken.kind) && pureRead(node.left, state, props) && pureRead(node.right, state, props)
  }
  if (ts.isPrefixUnaryExpression(node)) return node.operator === ts.SyntaxKind.ExclamationToken && pureRead(node.operand, state, props)
  if (ts.isCallExpression(node) && !node.questionDotToken && !node.typeArguments?.length
    && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'get'
    && ts.isPropertyAccessExpression(node.expression.expression)
    && ts.isIdentifier(node.expression.expression.expression)
    && node.expression.expression.expression.text === state && node.expression.expression.name.text === 'accounts'
    && node.arguments.length === 1) return pureRead(node.arguments[0]!, state, props)
  return false
}

/** Plan only explicitly attested scope-owned, Ref-returning hook members.
 * @param source Original source text, retained verbatim outside patches.
 * @param hooks Exact member names whose setup ownership and Ref result the caller has verified.
 * @param fileName Diagnostic filename (Windows paths are accepted).
 * @returns Source hashes, proposed output and supported/manual-review findings; any manual finding blocks the file.
 */
export function planVueCodemod(source: string, hooks: readonly string[], fileName = 'input.tsx'): Plan {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const host = ts.createCompilerHost({ noLib: true, noResolve: true })
  host.getSourceFile = requested => requested.replaceAll('\\', '/') === fileName.replaceAll('\\', '/') ? file : undefined
  const program = ts.createProgram([fileName], { noLib: true, noResolve: true }, host)
  const checker = program.getTypeChecker()
  const boundVueName = (node: ts.Expression): string | undefined => {
    if (!ts.isIdentifier(node)) return undefined
    const declaration = checker.getSymbolAtLocation(node)?.declarations?.[0]
    return declaration && ts.isImportSpecifier(declaration) ? imports.get(node.text) : undefined
  }
  const findings: Finding[] = []
  const patches: Patch[] = []
  const imports = vueImports(file)
  const configured = new Set(hooks)
  const identifiers = new Set<string>()
  function collect(node: ts.Node): void {
    if (ts.isIdentifier(node)) identifiers.add(node.text)
    ts.forEachChild(node, collect)
  }
  collect(file)
  const report = (node: ts.Node, code: string, reason: string, category: Finding['category'] = 'manual-review') => {
    findings.push({ category, code, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, reason })
  }
  const syntax = ts.transpileModule(source, { fileName, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.Preserve, module: ts.ModuleKind.ESNext } }).diagnostics ?? []
  if (syntax.some(item => item.category === ts.DiagnosticCategory.Error)) {
    report(file, 'parse-error', 'Source has syntax errors; no edits are planned.')
  }
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /^(react|react-dom)(\/|$)/.test(node.moduleSpecifier.text)) {
      report(node, 'react-semantics', 'React components, hooks, slots and effects require a separate semantic migration.')
    }
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || !configured.has(node.expression.name.text)) {
      ts.forEachChild(node, visit)
      return
    }
    const call = node
    const member = node.expression
    let setup: ts.ArrowFunction | ts.FunctionExpression | undefined
    let ancestor: ts.Node | undefined = call.parent
    while (ancestor) {
      if ((ts.isArrowFunction(ancestor) || ts.isFunctionExpression(ancestor))
        && ts.isCallExpression(ancestor.parent) && ancestor.parent.arguments[0] === ancestor
        && ts.isIdentifier(ancestor.parent.expression) && boundVueName(ancestor.parent.expression) === 'defineComponent') {
        setup = ancestor
        break
      }
      ancestor = ancestor.parent
    }
    if (!setup || !ts.isBlock(setup.body) || setup.parameters.length !== 1
      || !ts.isIdentifier(setup.parameters[0]!.name) || !ts.isIdentifier(member.expression)
      || member.expression.text !== setup.parameters[0]!.name.text) {
      report(call, 'unproven-owner', 'Expected a configured hook on the single props parameter of a Vue defineComponent setup callback.')
      return
    }
    const body = setup.body
    const props = setup.parameters[0]!.name.text
    const propsSymbol = checker.getSymbolAtLocation(setup.parameters[0]!.name)
    if (!propsSymbol || checker.getSymbolAtLocation(member.expression) !== propsSymbol) {
      report(call, 'shadowed-props', 'Hook receiver is shadowed by a local binding, not setup props.')
      return
    }
    // A hook already invoked by setup is in the correct lifecycle position.
    let direct: ts.Node = call
    while (direct.parent !== body && direct.parent) direct = direct.parent
    let owner: ts.Node = call.parent
    const functions: ts.Node[] = []
    while (owner !== setup && owner.parent) {
      if (ts.isFunctionLike(owner)) functions.push(owner)
      owner = owner.parent
    }
    if (functions.length === 0) return
    const callback = functions[0]
    const render = callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      && callback.parameters.length === 0 && ts.isReturnStatement(direct) && direct.expression === callback
    const computed = callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      && callback.parameters.length === 0 && ts.isCallExpression(callback.parent)
      && callback.parent.arguments[0] === callback && ts.isIdentifier(callback.parent.expression)
      && boundVueName(callback.parent.expression) === 'computed' && ts.isVariableStatement(direct)
      && direct.declarationList.declarations.some(declaration => declaration.initializer === callback.parent)
    if (functions.length !== 1 || (!render && !computed) || call.questionDotToken || member.questionDotToken
      || call.typeArguments?.length || call.arguments.length !== 1) {
      report(call, 'unsupported-position', 'Only an unconditional returned render callback or direct setup computed getter is supported.')
      return
    }
    const selector = call.arguments[0]!
    if (!ts.isArrowFunction(selector) || selector.modifiers?.length || selector.parameters.length !== 1
      || !ts.isIdentifier(selector.parameters[0]!.name) || selector.parameters[0]!.initializer
      || selector.parameters[0]!.dotDotDotToken || !pureRead(selector.body, selector.parameters[0]!.name.text, props)) {
      report(call, 'selector-dependency', 'Selector must be a pure expression over its state parameter and live props; render locals, block bodies and arbitrary calls need review.')
      return
    }
    let shadowed = false
    function checkProps(node: ts.Node): void {
      if (ts.isIdentifier(node) && node.text === props
        && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
        && checker.getSymbolAtLocation(node) !== propsSymbol) shadowed = true
      ts.forEachChild(node, checkProps)
    }
    checkProps(selector.body)
    if (shadowed) {
      report(call, 'shadowed-props', 'Selector props identifier resolves to a render-local binding.')
      return
    }
    let priorStatements = false
    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && ts.isBlock(callback.body)) {
      let statement: ts.Node = call
      while (statement.parent && statement.parent !== callback.body) statement = statement.parent
      const before = callback.body.statements.slice(0, callback.body.statements.indexOf(statement as ts.Statement))
      priorStatements = before.some(item => !ts.isVariableStatement(item)
        || !(item.declarationList.flags & ts.NodeFlags.Const)
        || item.declarationList.declarations.some(declaration => {
          if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return true
          let expression = declaration.initializer
          if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'value') expression = expression.expression
          const selectorRead = ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
            && configured.has(expression.expression.name.text)
            && checker.getSymbolAtLocation(expression.expression.expression) === propsSymbol
          return !selectorRead && !pureRead(expression, '', props)
        }))
    }
    if (priorStatements || (callback && 'modifiers' in callback && callback.modifiers?.length)) {
      report(call, 'conditional-selector', 'Render/getter control flow or async execution needs lifecycle review.')
      return
    }
    let parent: ts.Node = call.parent
    while (parent !== callback && parent.parent) {
      if (ts.isIfStatement(parent) || ts.isConditionalExpression(parent) || ts.isBinaryExpression(parent)
        || ts.isSwitchStatement(parent) || ts.isCaseBlock(parent) || ts.isIterationStatement(parent, false)
        || ts.isTryStatement(parent)) {
        report(call, 'conditional-selector', 'Conditional or repeated selector creation needs explicit lifecycle review.')
        return
      }
      parent = parent.parent
    }
    if (body.statements.some((statement, index) => statement !== direct
      && !(ts.isReturnStatement(statement) && index === body.statements.length - 1
        && statement.expression && (ts.isArrowFunction(statement.expression) || ts.isFunctionExpression(statement.expression)))
      && ![ts.SyntaxKind.VariableStatement, ts.SyntaxKind.ExpressionStatement, ts.SyntaxKind.FunctionDeclaration].includes(statement.kind))) {
      report(call, 'setup-control-flow', 'Setup control flow is outside the supported straight-line form.')
      return
    }
    let index = 1
    while (identifiers.has('__vueSelector' + index)) index++
    const name = '__vueSelector' + index
    identifiers.add(name)
    const position = direct.getStart(file)
    const lineStart = source.lastIndexOf('\n', position - 1) + 1
    const indent = source.slice(lineStart, position).match(/^\s*/)?.[0] ?? ''
    const newline = source.includes('\r\n') ? '\r\n' : '\n'
    patches.push({ start: position, end: position, text: 'const ' + name + ' = ' + call.getText(file) + newline + indent })
    patches.push({ start: call.getStart(file), end: call.end, text: name })
    report(call, render ? 'render-selector' : 'computed-selector', 'Move scope-owned selector creation to setup; keep existing Ref reads in the callback.', 'supported')
  }
  visit(file)
  let output = source
  if (!findings.some(item => item.category === 'manual-review')) {
    for (const patch of patches.sort((a, b) => b.start - a.start || b.end - a.end)) {
      output = output.slice(0, patch.start) + patch.text + output.slice(patch.end)
    }
  }
  return { source, output, beforeHash: sourceHash(source), afterHash: sourceHash(output), findings }
}

/** Apply one reviewed plan with an exclusive preserved original and byte/hash verification.
 * @param fileName Exact file to modify; symlinks are rejected.
 * @param plan Previously reviewed conversion plan.
 * @param expectedHash Required original SHA256 supplied by the caller.
 * @returns Original backup path, or undefined for an unchanged plan.
 */
export async function applyVuePlan(fileName: string, plan: Plan, expectedHash: string): Promise<string | undefined> {
  if (plan.findings.some(item => item.category === 'manual-review')) throw new Error('manual-review: file has unsupported findings')
  if (expectedHash !== plan.beforeHash || sourceHash(plan.source) !== plan.beforeHash
    || sourceHash(plan.output) !== plan.afterHash) throw new Error('hash-mismatch: plan or expected source changed')
  const absolute = path.resolve(fileName)
  if (!(await lstat(absolute)).isFile()) throw new Error('not-regular-file: symlinks and directories are excluded')
  const canonical = await realpath(absolute)
  const original = await readFile(canonical)
  if (!original.equals(Buffer.from(plan.source, 'utf8')) || sourceHash(original.toString('utf8')) !== expectedHash) {
    throw new Error('source-changed: file differs from the reviewed plan')
  }
  if (plan.source === plan.output) return undefined
  const backup = canonical + '.vue-codemod.' + expectedHash + '.bak'
  await copyFile(canonical, backup, constants.COPYFILE_EXCL)
  if (!(await readFile(backup)).equals(original)) throw new Error('backup-mismatch: original retained; no replacement attempted')
  const temporary = canonical + '.vue-codemod.' + process.pid + '.tmp'
  const handle = await open(temporary, 'wx', (await lstat(canonical)).mode)
  try {
    await handle.writeFile(plan.output, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    if (!(await readFile(canonical)).equals(original)) throw new Error('source-changed: file changed during apply')
    if (sourceHash(await readFile(temporary, 'utf8')) !== plan.afterHash) throw new Error('output-mismatch: temporary output changed')
    await rename(temporary, canonical)
    if (sourceHash(await readFile(canonical, 'utf8')) !== plan.afterHash) throw new Error('output-mismatch: preserved original is at ' + backup)
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  return backup
}

/** Run explicit per-file dry-run/apply requests without shell expansion.
 * @param args CLI arguments: --hook NAME, --file PATH [--expect SHA256], optional --apply.
 * @returns Exit code: 0 reviewed/unchanged, 2 manual-review, 1 invalid arguments or IO failure.
 */
export async function runVueCodemod(args: readonly string[]): Promise<number> {
  const files: { name: string; expected?: string }[] = []
  const hooks: string[] = []
  let apply = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--apply') { apply = true; continue }
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error('arguments: missing value for ' + arg)
    if (arg === '--file') files.push({ name: value })
    else if (arg === '--hook' && /^[A-Za-z_$][\w$]*$/.test(value)) hooks.push(value)
    else if (arg === '--expect' && files.length && /^[a-f0-9]{64}$/.test(value)) files[files.length - 1]!.expected = value
    else throw new Error('arguments: unsupported option or value ' + arg)
  }
  if (!files.length || !hooks.length) throw new Error('arguments: explicit --file and attested --hook are required')
  if (apply && files.some(file => !file.expected)) throw new Error('arguments: --apply requires --expect SHA256 for every --file')
  if (new Set(files.map(file => path.resolve(file.name))).size !== files.length) throw new Error('arguments: duplicate file')
  let review = false
  for (const file of files) {
    const source = await readFile(file.name, 'utf8')
    const plan = planVueCodemod(source, hooks, file.name)
    const manual = plan.findings.some(item => item.category === 'manual-review')
    review ||= manual
    const backup = apply && !manual ? await applyVuePlan(file.name, plan, file.expected!) : undefined
    console.log(JSON.stringify({ file: path.resolve(file.name), mode: apply ? 'apply' : 'dry-run',
      status: manual ? 'manual-review' : plan.source === plan.output ? 'unchanged' : apply ? 'applied' : 'planned',
      beforeHash: plan.beforeHash, afterHash: plan.afterHash, findings: plan.findings, backup,
      output: !apply && plan.source !== plan.output ? plan.output : undefined }))
  }
  return review ? 2 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runVueCodemod(process.argv.slice(2)).then(code => { process.exitCode = code }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
