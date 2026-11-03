/**
 * 模型层回归检查（不需要浏览器，node scripts/verify.mjs）
 *
 * 1. 把 wv2-launcher/config.json 灌进模型再导出，逐字段比对是否无损；
 * 2. 在这份真实配置上跑校验引擎，打印发现的问题；
 * 3. 把 8 种 type 各新建一条，确认必填字段与类型专属字段都正确输出。
 */
import fs from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'
import assert from 'node:assert/strict'

const root = path.resolve(import.meta.dirname, '..')
const sourcePath = path.resolve(root, '../wv2-launcher/config.json')

const result = await build({
  stdin: {
    contents: `export * from './src/schema.js'; export * from './src/model.js'; export * from './src/validate.js';`,
    resolveDir: root,
    loader: 'js'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent'
})
const code = result.outputFiles[0].text
const m = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))

/* ---------------------------------------------- 1. 真实配置往返无损 */
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'))
const st = m.stateFromJson(source)
const out = m.buildConfig(st)

try {
  assert.deepStrictEqual(out, source)
  console.log('✅ 往返无损：导入现有 config.json → 导出，逐字段完全一致')
} catch (e) {
  console.log('❌ 往返有差异，下面列出不一致的条目：')
  const a = out.items, b = source.items
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    try { assert.deepStrictEqual(a[i], b[i]) }
    catch (err) {
      console.log(`  items[${i}] id=${b[i]?.id}`)
      const keys = new Set([...Object.keys(a[i] || {}), ...Object.keys(b[i] || {})])
      for (const k of keys) {
        if (JSON.stringify(a[i]?.[k]) !== JSON.stringify(b[i]?.[k])) {
          console.log(`    ${k}: 导出=${JSON.stringify(a[i]?.[k])} 原始=${JSON.stringify(b[i]?.[k])}`)
        }
      }
    }
  }
  for (const key of ['name', 'version', 'groups', 'schedules']) {
    try { assert.deepStrictEqual(out[key], source[key]) }
    catch (err) { console.log(`  顶层 ${key} 不一致`) }
  }
  process.exitCode = 1
}

/* ---------------------------------------------- 2. 校验引擎 */
const found = m.validateAll(st)
const errors = found.filter(x => x.level === 'error')
const warns = found.filter(x => x.level === 'warn')
console.log(`\n📋 现有配置校验：${errors.length} 错误 / ${warns.length} 提醒`)
for (const e of [...errors, ...warns].slice(0, 20)) {
  console.log(`  [${e.level}] ${e.where} · ${e.field}: ${e.msg}`)
}
if (errors.length) process.exitCode = 1

/* ---------------------------------------------- 3. 8 种 type 新建 */
console.log('\n🧩 新建条目检查：')
for (const t of m.ITEM_TYPES) {
  const it = m.createItem(t.value)
  it.id = 'demo-' + t.value
  it.name = '演示 ' + t.value
  it.target = t.targetHint
  it._include.subtitle = true
  it.subtitle = '来自生成器'
  const obj = m.serializeItem(it)
  const keys = Object.keys(obj)
  const ok = ['id', 'name', 'type', 'target'].every(k => k in obj) && obj.type === t.value
  console.log(`  ${ok ? '✅' : '❌'} ${t.value.padEnd(9)} → ${keys.join(', ')}`)
  if (!ok) process.exitCode = 1
}

/* ---------------------------------------------- 4. 模板体检 */
const tpl = m.createItem('webhook')
tpl.target = 'https://example.com/{{who}}'
tpl._include.params = true
tpl.params = [m.stateFromJson({ items: [{ params: [{ name: 'who', label: '谁' }] }] }).items[0].params[0]]
console.log('\n🔤 模板体检：')
console.log('   已声明 who    → 变量', m.itemTemplateVars(tpl), '(应被识别，且不报未声明错误)')
tpl.params = []
console.log('   未声明 params → 变量', m.itemTemplateVars(tpl), '(应在校验里给出 warn)')

console.log('\n完成。')
