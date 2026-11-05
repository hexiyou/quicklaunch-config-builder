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
    contents: `export * from './src/schema.js'; export * from './src/model.js'; export * from './src/validate.js'; export * from './src/merge.js';`,
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

/* ---------------------------------------------- 5. 合并导入 */
console.log('\n🔀 合并导入检查：')
let mPass = 0
let mFail = 0
const chk = (name, cond, extra) => {
  if (cond) { mPass += 1; console.log('  ✅ ' + name) }
  else { mFail += 1; console.log('  ❌ ' + name + (extra ? ' | ' + extra : '')); process.exitCode = 1 }
}

const baseJson = {
  name: 'BASE', version: 1, customTop: 'keep-me',
  items: [
    { id: 'a', name: 'A', type: 'app', target: 'app.exe', params: [{ name: 'who', label: '谁' }], legacy: 1 },
    { id: 'b', name: 'B', type: 'url', target: 'https://b.example', enabled: false }
  ],
  groups: [{ id: 'g1', name: 'G1' }],
  schedules: [{ id: 's1', run: 'a', at: '09:00', enabled: false }]
}
const incJson = {
  name: 'INCOMING', version: 99,
  items: [
    { id: 'b', name: 'B-NEW', type: 'cmd', target: 'ipconfig /all', fresh: true },
    { id: 'c', name: 'C', type: 'folder', target: '.' },
    { id: 'c', name: 'C2', type: 'folder', target: 'D:/' }        // 导入文件内部自身重复
  ],
  groups: [{ id: 'g2', name: 'G2' }, { id: 'g1', name: 'G1-NEW' }],
  schedules: [
    { id: 's1', run: 'c', at: '10:00' },
    { run: 'a', every: '1h' }                                     // 无 id（可选字段）
  ]
}
const base = m.stateFromJson(baseJson)
const inc = m.stateFromJson(incJson)
const baseFrozen = JSON.stringify(base)
const incFrozen = JSON.stringify(inc)

const previewKeep = m.analyzeMerge(base, inc, 'keep')
const previewReplace = m.analyzeMerge(base, inc, 'replace')
const { state: kState, stats: kStats } = m.mergeStates(base, inc, 'keep')
const { state: rState, stats: rStats } = m.mergeStates(base, inc, 'replace')

chk('纯函数：不修改 current / incoming', JSON.stringify(base) === baseFrozen && JSON.stringify(inc) === incFrozen)
chk('预览统计 == 执行统计（keep）', JSON.stringify(previewKeep.totals) === JSON.stringify(kStats.totals))
chk('预览统计 == 执行统计（replace）', JSON.stringify(previewReplace.totals) === JSON.stringify(rStats.totals))
chk('冲突清单去重且带分类', previewKeep.conflictIds.length === 4 && previewKeep.conflictIds.every(c => c.label && c.id),
  JSON.stringify(previewKeep.conflictIds))
chk('导入文件内部重复 ID 被识别', previewKeep.duplicates.some(d => d.kind === 'items' && d.id === 'c' && d.count === 2))

chk('keep：新 ID 追加、重复跳过', kState.items.map(x => x.id).join(',') === 'a,b,c', kState.items.map(x => x.id).join(','))
chk('keep：重复条目保持原有整条', kState.items[1].name === 'B' && kState.items[1].type === 'url' && kState.items[1].target === 'https://b.example')
chk('keep：分组 / 任务同样按 id 判重', kState.groups.length === 2 && kState.groups[0].name === 'G1' && kState.schedules.length === 2 && kState.schedules[0].at === '09:00')
chk('keep：顶层字段保持现有值', kState.meta.name === 'BASE' && kState.meta.version === 1 && kState.meta._extra.customTop === 'keep-me')

chk('replace：重复条目整条替换', rState.items[1].name === 'B-NEW' && rState.items[1].type === 'cmd' && rState.items[1]._extra.fresh === true)
chk('replace：保留原位置与原 _key', rState.items[1]._key === base.items[1]._key)
chk('replace：后出现的重复 ID 胜出', rState.items[2].name === 'C2' && rState.items[2].target === 'D:/')
chk('replace：未冲突条目的 params / 自定义键不受影响',
  rState.items[0].params?.[0]?.label === '谁' && rState.items[0]._extra.legacy === 1)
chk('replace：整条替换后可选字段开关跟着新配置',
  m.buildConfig(rState).items[1].enabled === undefined && m.buildConfig(rState).items[1].type === 'cmd')
chk('replace：定时任务与分组按新配置覆盖', rState.schedules[0].at === '10:00' && rState.groups[0].name === 'G1-NEW')
chk('schedules 无 id 一律追加', rState.schedules.length === 2 && !rState.schedules[1].id && rStats.totals.noId === 1)
chk('顶层 name / version / 自定义键不被导入文件改写',
  m.buildConfig(rState).name === 'BASE' && m.buildConfig(rState).version === 1 && m.buildConfig(rState).customTop === 'keep-me')
chk('合并不会产生 id 重复类校验错误',
  m.validateAll(rState).filter(x => x.level === 'error' && /重复/.test(x.msg)).length === 0)

let roundOk = true
let roundErr = ''
try { assert.deepStrictEqual(m.buildConfig(m.stateFromJson(m.buildConfig(rState))), m.buildConfig(rState)) }
catch (e) { roundOk = false; roundErr = e.message.slice(0, 140) }
chk('合并结果再导出仍逐字段无损', roundOk, roundErr)

const curNoGroups = m.stateFromJson({ name: 'X', items: [] })
const incWithGroups = m.stateFromJson({ groups: [{ id: 'g9' }] })
chk('导入带来新分组时自动打开 groups 键', m.mergeStates(curNoGroups, incWithGroups, 'keep').state.includeGroups === true)
const curOff = m.stateFromJson({ items: [], groups: [{ id: 'g1' }] })
curOff.includeGroups = false
chk('只覆盖已有分组时不擅自打开 groups 开关',
  m.mergeStates(curOff, m.stateFromJson({ groups: [{ id: 'g1', name: 'new' }] }), 'replace').state.includeGroups === false)
chk('导入带来新任务时自动打开 schedules 键',
  m.mergeStates(m.stateFromJson({ items: [] }), m.stateFromJson({ schedules: [{ id: 's9', run: 'a', at: '08:00' }] }), 'keep').state.includeSchedules === true)

const incNoId = m.stateFromJson({ items: [{ type: 'app', target: 'x' }], groups: [{ name: '无名' }] })
const pNoId = m.analyzeMerge(base, incNoId, 'keep')
chk('items / groups 无 ID 也一律追加',
  pNoId.totals.noId === 2 && m.mergeStates(base, incNoId, 'keep').state.items.length === base.items.length + 1)
console.log(`  → 合并用例 ${mPass} 通过 / ${mFail} 失败`)

/* ---------------------------------------------- 6. multipart / 动态值跟进 */
console.log('\n📎 multipart 与动态值检查：')
let qPass = 0
let qFail = 0
const ck = (name, cond, extra) => {
  if (cond) { qPass += 1; console.log('  ✅ ' + name) }
  else { qFail += 1; console.log('  ❌ ' + name + (extra ? ' | ' + extra : '')); process.exitCode = 1 }
}

ck('ITEM_FIELDS 含 multipart，且只对 webhook 生效',
  !!m.ITEM_FIELD_MAP.multipart && m.ITEM_FIELD_MAP.multipart.applies.join(',') === 'webhook')
ck('TEMPLATE_FIELDS 已补 multipart', m.TEMPLATE_FIELDS.includes('multipart'))
ck('TEMPLATE_RULES 生效字段列了 multipart', m.TEMPLATE_RULES.some(r => r.includes('/ multipart')))
ck('DYNAMIC_VALUES 补齐 4 个 file 系列',
  ['{{#file:路径}}', '{{#file-raw:路径}}', '{{#filebase64:路径}}', '{{#filehash:sha256:路径}}']
    .every(t => m.DYNAMIC_VALUES.some(d => d.tpl === t)))
ck('DYNAMIC_RULES 口径改为 headers + body',
  m.DYNAMIC_RULES.some(r => r.includes('headers 与 body 都展开')) &&
  !m.DYNAMIC_RULES.some(r => r.includes('只展开请求头')))
ck('新建 webhook 条目默认不写 multipart', !('multipart' in m.serializeItem(m.createItem('webhook'))))

const skeleton = m.createItem('webhook')
m.ensureUsable(skeleton, m.ITEM_FIELD_MAP.multipart)
ck('打开开关给出「完整式 + 一条待填文件行」骨架',
  skeleton.multipart && Array.isArray(skeleton.multipart.files) &&
  skeleton.multipart.files.length === 1 && skeleton.multipart.files[0].field === 'file' &&
  skeleton.multipart.fields && typeof skeleton.multipart.fields === 'object')

const mpCases = [
  ['完整式', { fields: { note: 'hi', tag: 'nightly' }, files: [{ field: 'photo', path: 'C:\\a.png', filename: 'a.png', type: 'image/png' }] }],
  ['单文件简写', { field: 'file', path: 'C:\\a.png' }],
  ['文件数组简写', [{ field: 'a', path: '1.png' }, { field: 'b', path: '2.png' }]],
  ['path 的 file 别名 + 自定义键', { field: 'f', file: 'C:\\a.png', customKey: 42 }]
]
for (const [label, mp] of mpCases) {
  const j = { items: [{ id: 'up', name: '上传', type: 'webhook', target: 'https://api.example.com/upload', multipart: mp }] }
  let ok = true, err = ''
  try { assert.deepStrictEqual(m.buildConfig(m.stateFromJson(j)), j) }
  catch (e) { ok = false; err = e.message.slice(0, 160) }
  ck(label + '：导入→导出逐字段无损', ok, err)
  const errs = m.validateAll(m.stateFromJson(j)).filter(x => x.level === 'error')
  ck(label + '：校验 0 错误', errs.length === 0, errs.map(x => x.msg).join(' / '))
}

const badStates = [
  ['没有任何可用文件', { files: [{ field: 'a' }] }, /没有可用的文件/],
  ['files 某项缺 path', { fields: { note: 'x' }, files: [{ field: 'a', path: '' }] }, /缺 path/],
  ['空对象', {}, /没有可用的文件/],
  ['值不是对象', 'oops', /必须是对象/]
]
for (const [label, mp, re] of badStates) {
  const st = m.stateFromJson({ items: [{ id: 'up', name: '上传', type: 'webhook', target: 'https://x', multipart: mp }] })
  const errs = m.validateAll(st).filter(x => x.level === 'error')
  ck('校验拦截：' + label, errs.some(x => x.field?.startsWith('multipart') && re.test(x.msg)), JSON.stringify(errs.map(x => x.msg)))
}

const both = m.stateFromJson({ items: [{
  id: 'up', name: '上传', type: 'webhook', target: 'https://x',
  body: '{"a":1}', multipart: { field: 'f', path: 'C:\\a.png' }
}] })
ck('body 与 multipart 共存给出提醒而非报错',
  m.validateAll(both).some(x => x.level === 'warn' && x.field === 'multipart' && /body 会被忽略/.test(x.msg)))

const tplMp = m.stateFromJson({ items: [{
  id: 'up', name: '上传', type: 'webhook', target: 'https://x',
  multipart: { fields: { note: '来自 {{who}}' }, files: [{ field: 'f', path: '{{file}}' }] }
}] }).items[0]
ck('multipart 里的 {{参数}} 被模板体检扫到', m.itemTemplateVars(tplMp).sort().join(',') === 'file,who', JSON.stringify(m.itemTemplateVars(tplMp)))
ck('未声明 params 时 multipart 的变量只警告不拦',
  m.validateAll(m.stateFromJson({ items: [{ id: 'up', name: '上传', type: 'webhook', target: 'https://x', multipart: { fields: { n: '{{who}}' }, files: [] } }] }))
    .some(x => x.level === 'warn' && x.field === 'params'))

const dynIt = m.stateFromJson({ items: [{
  id: 'up', name: '上传', type: 'webhook', target: 'https://x',
  headers: { 'X-Auth': '{{#file:C:\\token.txt}}' }, body: '{{#filebase64:C:\\a.png}}'
}] }).items[0]
ck('{{#…}} 动态值不被误判成参数变量', m.itemTemplateVars(dynIt).length === 0, JSON.stringify(m.itemTemplateVars(dynIt)))
console.log(`  → multipart / 动态值用例 ${qPass} 通过 / ${qFail} 失败`)

console.log('\n完成。')
