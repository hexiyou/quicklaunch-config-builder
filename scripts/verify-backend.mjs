/**
 * 后端提交链路的 Node 层回归（npm run verify:backend）
 * 覆盖：编译期注入、URL 覆盖、提交门禁、端点体检、请求体/请求头、
 *       CORS 错误分类、超时、无鉴权 / HMAC 签名 / 自定义 provider 扩展点。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import backendConfig from '../backend.config.js'
import { COMPILED, effectiveUrl } from '../src/backend/config.js'
import { inspectEndpoint, submitConfig, BASE_HEADERS } from '../src/backend/submit.js'
import {
  AUTH_SCHEME, canonicalString, buildHmacHeaders, createAuthProvider, sha256Hex
} from '../src/backend/auth.js'

const root = path.resolve(import.meta.dirname, '..')
let pass = 0, fail = 0
function ok(name, fn) {
  try { fn(); console.log('  PASS | ' + name); pass++ }
  catch (e) { console.log('  FAIL | ' + name + ' | ' + e.message); fail++ }
}
async function okAsync(name, fn) {
  try { await fn(); console.log('  PASS | ' + name); pass++ }
  catch (e) { console.log('  FAIL | ' + name + ' | ' + e.message); fail++ }
}

const HTTP_ENV = { pageProtocol: 'http:', pageHref: 'http://localhost:4173/index.html' }
const JSON_BODY = '{\n  "items": []\n}\n'

/* ------------------------------------------------------------ 编译期注入 */
ok('编译期默认值与源码一致', () => assert.equal(COMPILED.defaultUrl, backendConfig.defaultUrl))
const dist = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf-8')
ok('默认 URL 已作为字面量写进 dist/index.html', () => assert.ok(dist.includes(backendConfig.defaultUrl)))
ok('define 标识符已从产物中消失', () => assert.ok(!dist.includes('__QL_BACKEND_CONFIG__')))
ok('产物仍是离线单文件（无外链 script/link）', () => {
  assert.ok(!/<script[^>]+src=/.test(dist))
  assert.ok(!/<link[^>]+rel="stylesheet"[^>]+href=/.test(dist))
})
ok('产物包含云端提交 UI', () => {
  assert.ok(dist.includes('提交到后端'))
  assert.ok(dist.includes('仍然尝试'))
})

/* ------------------------------------------------------------ URL 覆盖 */
ok('页面留空时用编译期默认值', () => assert.equal(effectiveUrl('  '), backendConfig.defaultUrl))
ok('页面输入覆盖编译期默认值', () => assert.equal(effectiveUrl(' https://cfg.example.com/api '), 'https://cfg.example.com/api'))

/* ------------------------------------------------------------ 端点体检 */
ok('正常 http 端点可提交', () => assert.equal(inspectEndpoint(backendConfig.defaultUrl, HTTP_ENV).ok, true))
ok('相对地址被拒', () => assert.equal(inspectEndpoint('/api/config', HTTP_ENV).code, 'BAD_URL'))
ok('非 http(s) 协议被拒', () => assert.equal(inspectEndpoint('ftp://x/a', HTTP_ENV).code, 'BAD_SCHEME'))
ok('HTTPS 页面请求 HTTP 后端被判混合内容', () => assert.equal(
  inspectEndpoint('http://x/api', { pageProtocol: 'https:' }).code, 'MIXED_CONTENT'))
ok('file:// 本地打开默认阻止提交', () => assert.equal(
  inspectEndpoint(backendConfig.defaultUrl, { pageProtocol: 'file:' }).code, 'FILE_PROTOCOL'))
ok('file:// 下强制尝试可放行', () => assert.equal(
  inspectEndpoint(backendConfig.defaultUrl, { pageProtocol: 'file:' }, { allowFile: true }).ok, true))

/* ------------------------------------------------------------ 提交门禁 */
const calls = []
const okFetch = (url, opts) => {
  calls.push({ url, opts })
  return Promise.resolve({ ok: true, status: 200, text: async () => '{"ok":true}' })
}

await okAsync('有校验错误时不发请求', async () => {
  const n = calls.length
  const r = await submitConfig({ json: JSON_BODY, errors: 2, env: HTTP_ENV, fetchImpl: okFetch })
  assert.equal(r.code, 'VALIDATION_FAILED')
  assert.equal(r.requested, false)
  assert.equal(calls.length, n)
  assert.match(r.message, /未发起请求/)
})
await okAsync('空 JSON 不发请求', async () => {
  const r = await submitConfig({ json: '', errors: 0, env: HTTP_ENV, fetchImpl: okFetch })
  assert.equal(r.code, 'EMPTY_BODY')
})
await okAsync('file:// 环境不发请求且提示可切换到 HTTP 部署', async () => {
  const n = calls.length
  const r = await submitConfig({ json: JSON_BODY, errors: 0, env: { pageProtocol: 'file:' }, fetchImpl: okFetch })
  assert.equal(r.code, 'FILE_PROTOCOL')
  assert.equal(r.requested, false)
  assert.equal(calls.length, n)
  assert.match(r.message, /file:\/\//)
})

/* ------------------------------------------------------------ 正常提交 */
await okAsync('提交成功：请求体是完整 JSON 文本，请求头符合 CORS 约定', async () => {
  const r = await submitConfig({ json: JSON_BODY, errors: 0, env: HTTP_ENV, fetchImpl: okFetch })
  assert.equal(r.ok, true)
  assert.equal(r.code, 'OK')
  assert.equal(r.status, 200)
  const c = calls[calls.length - 1]
  assert.equal(c.url, backendConfig.defaultUrl)
  assert.equal(c.opts.method, 'POST')
  assert.equal(c.opts.body, JSON_BODY)
  assert.equal(c.opts.mode, 'cors')
  assert.equal(c.opts.credentials, 'omit')
  assert.equal(c.opts.headers['Content-Type'], 'application/json;charset=utf-8')
  assert.equal(c.opts.headers['X-QL-Client'], BASE_HEADERS['X-QL-Client'])
  assert.ok(!c.opts.headers['X-QL-Signature'], '首版无鉴权不应带签名头')
})
await okAsync('页面输入地址优先于编译期默认值', async () => {
  const r = await submitConfig({
    json: JSON_BODY, errors: 0, env: HTTP_ENV, fetchImpl: okFetch,
    runtimeUrl: 'https://cfg.example.com/api/config'
  })
  assert.equal(r.url, 'https://cfg.example.com/api/config')
  assert.equal(calls[calls.length - 1].url, 'https://cfg.example.com/api/config')
})
await okAsync('后端返回非 2xx 时结构化报错', async () => {
  const r = await submitConfig({
    json: JSON_BODY, errors: 0, env: HTTP_ENV,
    fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'internal error' })
  })
  assert.equal(r.code, 'HTTP_ERROR')
  assert.equal(r.status, 500)
  assert.match(r.message, /500/)
})
await okAsync('网络/CORS 失败被捕获且给出排查指引', async () => {
  const r = await submitConfig({
    json: JSON_BODY, errors: 0, env: HTTP_ENV,
    fetchImpl: async () => { throw new TypeError('Failed to fetch') }
  })
  assert.equal(r.code, 'NETWORK_ERROR')
  assert.equal(r.ok, false)
  assert.match(r.message, /CORS/)
})
await okAsync('请求超时被分类为 TIMEOUT', async () => {
  const r = await submitConfig({
    json: JSON_BODY, errors: 0, env: HTTP_ENV, timeoutMs: 20,
    fetchImpl: (url, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })
  })
  assert.equal(r.code, 'TIMEOUT')
})

/* ------------------------------------------------------------ 鉴权扩展 */
await okAsync('none provider 返回空请求头', async () => {
  const p = createAuthProvider({ mode: 'none' })
  assert.deepEqual(await p.headers({ url: backendConfig.defaultUrl, body: JSON_BODY }), {})
})

const VECTOR = {
  url: 'http://127.0.0.1:8787/api/config?src=web',
  body: '{"hello":"世界"}',
  keyId: 'demo-key',
  secret: 'ql-demo-secret',
  timestamp: 1770000000,
  nonce: '0f1e2d3c4b5a6978'
}
let vector = null
await okAsync('HMAC provider 生成完整 X-QL-* 请求头', async () => {
  const h = await buildHmacHeaders(VECTOR)
  vector = h
  assert.equal(h['X-QL-Auth-Mode'], 'hmac-sha256')
  assert.equal(h['X-QL-Timestamp'], String(VECTOR.timestamp))
  assert.equal(h['X-QL-Nonce'], VECTOR.nonce)
  assert.equal(h['X-QL-Key-Id'], VECTOR.keyId)
  assert.equal(h['X-QL-Body-Sha256'], await sha256Hex(VECTOR.body))
  assert.match(h['X-QL-Signature'], /^v1=[0-9a-f]{64}$/)
})
await okAsync('签名与独立实现的 HMAC-SHA256 一致', async () => {
  const u = new URL(VECTOR.url)
  const bodySha256 = crypto.createHash('sha256').update(VECTOR.body, 'utf-8').digest('hex')
  const str = canonicalString({
    timestamp: VECTOR.timestamp, nonce: VECTOR.nonce, method: 'POST',
    host: u.host, path: u.pathname + u.search, bodySha256
  })
  const expect = 'v1=' + crypto.createHmac('sha256', VECTOR.secret).update(str, 'utf-8').digest('hex')
  assert.equal(vector['X-QL-Signature'], expect)
  assert.ok(str.startsWith(AUTH_SCHEME + '\n'))
})
await okAsync('自定义 provider 运行时注入生效且可卸载', async () => {
  globalThis.__QL_AUTH_PROVIDER__ = {
    mode: 'custom', label: '短期令牌',
    headers: async () => ({ Authorization: 'Bearer short-lived-token' })
  }
  const r = await submitConfig({ json: JSON_BODY, errors: 0, env: HTTP_ENV, fetchImpl: okFetch })
  assert.equal(r.ok, true)
  assert.equal(calls[calls.length - 1].opts.headers.Authorization, 'Bearer short-lived-token')
  delete globalThis.__QL_AUTH_PROVIDER__
  const r2 = await submitConfig({ json: JSON_BODY, errors: 0, env: HTTP_ENV, fetchImpl: okFetch })
  assert.ok(!r2.headers.Authorization)
})

console.log('\n测试向量（供 README / 后端实现对照）：')
console.log(JSON.stringify({
  url: VECTOR.url, body: VECTOR.body, secret: VECTOR.secret,
  timestamp: VECTOR.timestamp, nonce: VECTOR.nonce, headers: vector
}, null, 2))
console.log(`\n后端链路检查：${pass} 通过 / ${fail} 失败`)
if (fail) process.exitCode = 1
