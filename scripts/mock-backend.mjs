/**
 * 参考后端（零依赖，仅用于本地联调）。
 *
 *   node scripts/mock-backend.mjs
 *   QL_MOCK_SECRET=your-secret node scripts/mock-backend.mjs   # 开启 HMAC 校验
 *
 * 职责：
 *   POST /api/config      接收生成器提交的 config.json 全文，落盘
 *   GET  /api/config      原样返回最后一次提交的配置
 *   GET  /config.json     同上，给启动器「拉取在线配置」直接填这个地址
 *   OPTIONS *             完整的 CORS 预检响应
 *
 * 保存到系统临时目录，不污染仓库；地址打印在启动日志里。
 */
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { AUTH_HEADER_NAMES, AUTH_SCHEME, canonicalString } from '../src/backend/auth.js'

const PORT = Number(process.env.QL_MOCK_PORT || 8787)
const SECRET = process.env.QL_MOCK_SECRET || ''
const KEY_ID = process.env.QL_MOCK_KEY_ID || 'demo-key'
const SAVE_PATH = process.env.QL_MOCK_SAVE_PATH || path.join(os.tmpdir(), `ql-mock-config-${PORT}.json`)
const MAX_BODY = 2 * 1024 * 1024
const seenNonces = new Map()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': AUTH_HEADER_NAMES.join(', '),
  'Access-Control-Max-Age': '600',
  'Access-Control-Expose-Headers': 'Content-Type'
}

function json(res, status, obj, extra = {}) {
  const body = JSON.stringify(obj, null, 2)
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json;charset=utf-8', ...extra })
  res.end(body)
}

function sha256Hex(buf) { return crypto.createHash('sha256').update(buf).digest('hex') }
function hmacHex(secret, msg) { return crypto.createHmac('sha256', secret).update(msg).digest('hex') }
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** 按 README 的 QL-HMAC-SHA256-v1 校验，返回 null 或错误说明。 */
function verifyHmac(req, bodyBuf) {
  const h = req.headers
  if (h['x-ql-auth-mode'] !== 'hmac-sha256') return '缺少或错误的 X-QL-Auth-Mode'
  if (!safeEqual(h['x-ql-key-id'] || '', KEY_ID)) return 'X-QL-Key-Id 不匹配'
  const ts = Number(h['x-ql-timestamp'] || 0)
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return '时间戳超出 ±300 秒窗口'
  const nonce = String(h['x-ql-nonce'] || '')
  if (nonce.length < 8 || seenNonces.has(nonce)) return 'Nonce 缺失或重放'
  const bodyHash = sha256Hex(bodyBuf)
  if (!safeEqual(h['x-ql-body-sha256'] || '', bodyHash)) return 'X-QL-Body-Sha256 不匹配'
  const str = canonicalString({
    timestamp: ts, nonce, method: req.method,
    host: h.host || '', path: req.url || '/', bodySha256: bodyHash
  })
  if (!safeEqual(h['x-ql-signature'] || '', 'v1=' + hmacHex(SECRET, str))) return '签名不匹配'
  seenNonces.set(nonce, ts)
  for (const [k, v] of seenNonces) if (Math.floor(Date.now() / 1000) - v > 300) seenNonces.delete(k)
  return null
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) { reject(new Error('请求体超过 2 MB')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    console.log('[OPTIONS] 预检已放行', req.headers['access-control-request-headers'] || '')
    return
  }

  const urlPath = (req.url || '/').split('?')[0]

  if (req.method === 'GET' && (urlPath === '/api/config' || urlPath === '/config.json')) {
    if (!fs.existsSync(SAVE_PATH)) return json(res, 404, { ok: false, error: '还没有提交过配置' })
    const raw = fs.readFileSync(SAVE_PATH)
    res.writeHead(200, {
      ...CORS,
      'Content-Type': 'application/json;charset=utf-8',
      'Content-Length': raw.length,
      'Content-Disposition': 'inline; filename="config.json"'
    })
    res.end(raw)
    console.log('[GET] 返回已保存配置', raw.length, 'bytes')
    return
  }

  if (req.method === 'POST' && (urlPath === '/api/config' || urlPath === '/')) {
    let buf
    try { buf = await readBody(req) }
    catch (e) { return json(res, 413, { ok: false, error: e.message }) }

    if (SECRET) {
      const bad = verifyHmac(req, buf)
      if (bad) { console.log('[POST] 鉴权失败:', bad); return json(res, 401, { ok: false, error: bad }) }
    }

    const text = buf.toString('utf-8').replace(/^\uFEFF/, '').trim()
    if (!text.startsWith('{')) return json(res, 400, { ok: false, error: '请求体不是 JSON 对象（首字符不是 {）' })
    try { JSON.parse(text) }
    catch (e) { return json(res, 400, { ok: false, error: 'JSON 解析失败：' + e.message }) }

    fs.writeFileSync(SAVE_PATH, text + '\n', 'utf-8')
    const out = { ok: true, savedAt: new Date().toISOString(), bytes: buf.length, sha256: sha256Hex(buf), path: SAVE_PATH }
    console.log('[POST] 已保存配置', out.bytes, 'bytes', SECRET ? '（HMAC 校验通过）' : '（无鉴权）')
    return json(res, 200, out)
  }

  json(res, 404, { ok: false, error: '未知路由', hint: 'POST /api/config · GET /config.json' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('------------------------------------------------------------')
  console.log('QuickLaunch 参考后端已启动: http://127.0.0.1:' + PORT)
  console.log('  生成器提交地址  POST http://127.0.0.1:' + PORT + '/api/config')
  console.log('  启动器拉取地址  GET  http://127.0.0.1:' + PORT + '/config.json')
  console.log('  鉴权模式       ' + (SECRET ? AUTH_SCHEME + '（keyId=' + KEY_ID + '）' : '无鉴权（首版）'))
  console.log('  配置文件落盘   ' + SAVE_PATH)
  console.log('------------------------------------------------------------')
})
