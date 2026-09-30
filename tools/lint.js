/** UX 先提取 script，再使用 ESLint 检查；模板和 CSS 由 AIoT 构建校验。 */
const fs = require('fs')
const path = require('path')
const { Linter } = require('eslint')
const linter = new Linter()
const rules = {
  'no-undef': 'error',
  'no-unreachable': 'error',
  'no-dupe-args': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-invalid-regexp': 'error',
  'no-unexpected-multiline': 'error',
  'no-func-assign': 'error',
  'no-class-assign': 'error',
  'no-const-assign': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'constructor-super': 'error',
  'valid-typeof': 'error',
  'use-isnan': 'error'
}
let errors = 0
let files = 0
function check(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) { check(filename); continue }
    if (!/\.(js|ux)$/.test(filename)) continue
    let code = fs.readFileSync(filename, 'utf8')
    let offset = 0
    if (filename.endsWith('.ux')) {
      const match = /<script\b[^>]*>([\s\S]*?)<\/script>/.exec(code)
      if (!match) { console.error(filename + ': 缺少 script'); errors++; continue }
      offset = code.slice(0, match.index + match[0].indexOf('>') + 1).split('\n').length - 1
      code = match[1]
    }
    files++
    const messages = linter.verify(code, {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      env: { es2022: true, commonjs: true },
      globals: { console: 'readonly', TextEncoder: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly' },
      rules
    }, { filename })
    for (const message of messages) {
      errors++
      console.error(`${filename}:${message.line + offset}:${message.column} ${message.message} (${message.ruleId || '语法'})`)
    }
  }
}
check(path.join(__dirname, '..', 'src'))
console.log(`ESLint 已检查 ${files} 个 JS / UX 脚本，${errors} 个错误`)
process.exitCode = errors ? 1 : 0
