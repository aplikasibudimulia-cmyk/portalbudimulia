const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default

const globals = new Set([
  'window', 'document', 'console', 'localStorage', 'sessionStorage',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'Date', 'Math', 'JSON', 'Array', 'Object', 'String', 'Number', 'Boolean',
  'RegExp', 'Map', 'Set', 'Promise', 'Error', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'btoa',
  'atob', 'navigator', 'location', 'fetch', 'FormData', 'Blob', 'URL',
  'alert', 'confirm', 'prompt', 'Intl', 'crypto', 'process', 'import',
  'Audio', 'FileReader', 'Event', 'CustomEvent', 'AbortController', 'IntersectionObserver',
  'ResizeObserver', 'MutationObserver', 'HTMLCanvasElement', 'CanvasRenderingContext2D',
  'Image', 'Uint8Array', 'ArrayBuffer', 'DataView', 'WebSocket', 'caches', 'indexedDB',
  'Notification', 'ServiceWorkerRegistration', 'performance', 'URLSearchParams',
  'File', 'PopStateEvent', 'DOMParser', 'XMLSerializer', 'Node', 'TextEncoder', 'TextDecoder',
  'Headers', 'Request', 'Response'
])

function walk(dir) {
  let results = []
  const list = fs.readdirSync(dir)
  list.forEach(file => {
    const full = path.join(dir, file)
    const stat = fs.statSync(full)
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full))
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      results.push(full)
    }
  })
  return results
}

console.log('[Codebase Safety Check] Running AST verification on src/ ...')
const allFiles = walk('src')
const issues = []

allFiles.forEach(file => {
  const code = fs.readFileSync(file, 'utf8')
  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx']
    })
    traverse(ast, {
      Program(p) {
        p.traverse({
          Identifier(idPath) {
            if (!idPath.isReferencedIdentifier()) return
            const name = idPath.node.name
            if (globals.has(name)) return
            if (!idPath.scope.hasBinding(name)) {
              issues.push({ file, name, line: idPath.node.loc.start.line })
            }
          }
        })
      }
    })
  } catch (e) {
    issues.push({ file, name: 'Syntax / Parse Error: ' + e.message, line: e.loc?.line || 0 })
  }
})

if (issues.length > 0) {
  console.error('\n❌ [CRITICAL SAFETY CHECK FAILED] Found ' + issues.length + ' unresolved or undeclared reference(s):')
  issues.forEach(iss => console.error(`  - ${iss.file}:${iss.line} -> ${iss.name}`))
  console.error('\nBuild ABORTED to protect students and production users from runtime crashes.\n')
  process.exit(1)
} else {
  console.log(`✅ [Codebase Safety Check] PASSED: Scanned ${allFiles.length} files. 0 undeclared variables found. Ready for build!\n`)
  process.exit(0)
}
