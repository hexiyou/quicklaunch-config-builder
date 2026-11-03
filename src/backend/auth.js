/**
 * 后端鉴权扩展点。
 *
 * 首版默认「无鉴权」：createAuthProvider({mode:'none'}) 返回空请求头，
 * 后端不需要任何校验。但提交链路统一走 provider.headers(...)，
 * 因此后续要加鉴权时，后端按 README 里的 QL-HMAC-SHA256-v1 协议实现即可，
 * 前端只需把 backend.config.js 的 auth.mode 改成 'hmac-sha256'（或注入自定义 provider），
 * 不必改动提交逻辑与界面。
 *
 * 三种扩展方式（优先级从高到低）：
 *   1. 运行时注入：globalThis.__QL_AUTH_PROVIDER__ = { mode, headers({url, body}) }
 *      —— 适合临时令牌 / 同域登录态，不需要重新构建。
 *   2. 编译期配置：backend.config.js 的 auth（mode / keyId / secret）。
 *   3. 在这里新增一个 mode 分支。
 */

/** 所有可能用到的自定义请求头，后端 CORS 的 Access-Control-Allow-Headers 需要放行它们。 */
export const AUTH_HEADER_NAMES = [
  'Content-Type',
  'X-QL-Client',
  'X-QL-Auth-Mode',
  'X-QL-Key-Id',
  'X-QL-Timestamp',
  'X-QL-Nonce',
  'X-QL-Body-Sha256',
  'X-QL-Signature'
]

export const AUTH_SCHEME = 'QL-HMAC-SHA256-v1'
export const SIGN_HEADER = 'X-QL-Signature'

const enc = new TextEncoder()

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function subtle() {
  const s = globalThis.crypto && globalThis.crypto.subtle
  if (!s) {
    throw new Error(
      '当前环境没有 Web Crypto（crypto.subtle）。HMAC 鉴权需要安全上下文：' +
      '请用 https:// 或 http://localhost 部署本工具；纯 http://局域网 IP 与 file:// 无法使用。'
    )
  }
  return s
}

export async function sha256Hex(text) {
  return toHex(await subtle().digest('SHA-256', enc.encode(String(text))))
}

/**
 * 待签名规范串（UTF-8，行之间用 \n，末尾不加换行）：
 *   QL-HMAC-SHA256-v1
 *   <timestamp unix 秒>
 *   <nonce>
 *   <HTTP METHOD 大写>
 *   <host 小写，含非默认端口>
 *   <pathname + search，与请求 URL 完全一致>
 *   <请求体 SHA-256 小写 hex>
 */
export function canonicalString(p) {
  return [
    AUTH_SCHEME,
    String(p.timestamp),
    p.nonce,
    String(p.method || 'POST').toUpperCase(),
    String(p.host || '').toLowerCase(),
    p.path,
    p.bodySha256
  ].join('\n')
}

export async function hmacSha256Hex(secret, message) {
  const key = await subtle().importKey(
    'raw', enc.encode(String(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  return toHex(await subtle().sign('HMAC', key, enc.encode(String(message))))
}

export function newNonce() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '')
  }
  const bytes = new Uint8Array(16)
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return toHex(bytes.buffer)
}

/**
 * 生成 QL-HMAC-SHA256-v1 的全部鉴权请求头。
 * timestamp / nonce 可注入，便于用固定测试向量做回归。
 */
export async function buildHmacHeaders(opts) {
  const { url, body, keyId, secret } = opts
  if (!secret) throw new Error('HMAC 鉴权未配置 secret（backend.config.js 或页面高级设置）')
  const u = new URL(url)
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000)
  const nonce = opts.nonce || newNonce()
  const bodySha256 = await sha256Hex(body)
  const str = canonicalString({
    timestamp, nonce, method: 'POST',
    host: u.host, path: u.pathname + u.search, bodySha256
  })
  const signature = await hmacSha256Hex(secret, str)
  return {
    'X-QL-Auth-Mode': 'hmac-sha256',
    'X-QL-Key-Id': String(keyId || ''),
    'X-QL-Timestamp': String(timestamp),
    'X-QL-Nonce': nonce,
    'X-QL-Body-Sha256': bodySha256,
    [SIGN_HEADER]: 'v1=' + signature
  }
}

/** 依据配置构造 provider。headers() 在真正发请求前才调用，保证时间戳新鲜。 */
export function createAuthProvider(config = {}) {
  const mode = config.mode || 'none'

  if (mode === 'none') {
    return { mode, label: '无鉴权（首版）', scheme: null, async headers() { return {} } }
  }
  if (mode === 'hmac-sha256') {
    return {
      mode,
      label: AUTH_SCHEME,
      scheme: AUTH_SCHEME,
      async headers({ url, body }) {
        return buildHmacHeaders({ url, body, keyId: config.keyId, secret: config.secret })
      }
    }
  }
  if (typeof config.headers === 'function') {
    return { mode: 'custom', label: config.label || '自定义 provider', scheme: config.scheme || null, headers: config.headers }
  }
  throw new Error('未知的鉴权模式：' + mode)
}

/** 运行时注入的 provider 优先，便于不重新构建就对接后端。 */
export function resolveAuthProvider(config = {}) {
  const injected = globalThis.__QL_AUTH_PROVIDER__
  if (injected && typeof injected.headers === 'function') {
    return {
      mode: injected.mode || 'custom',
      label: injected.label || '运行时注入 provider',
      scheme: injected.scheme || null,
      headers: injected.headers
    }
  }
  return createAuthProvider(config)
}
