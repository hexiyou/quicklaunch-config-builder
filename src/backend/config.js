/**
 * 编译期配置 + 运行时覆盖。
 *
 * __QL_BACKEND_CONFIG__ 由 vite.config.js 的 define 在构建时替换成字面量对象；
 * 直接用 Node 跑测试脚本时它不存在（typeof 守卫），会退到与 backend.config.js
 * 保持一致的 FALLBACK，保证 src/backend/*.js 在浏览器和 Node 里都能被导入。
 */
const FALLBACK = {
  defaultUrl: 'http://127.0.0.1:8787/api/config',
  timeoutMs: 10000,
  auth: { mode: 'none', keyId: '', secret: '' }
}

export const COMPILED = (
  typeof __QL_BACKEND_CONFIG__ !== 'undefined' && __QL_BACKEND_CONFIG__
) || FALLBACK

const RUNTIME_URL_KEY = 'ql-backend-url-v1'

/** 页面输入框里保存的覆盖值；没填过就是空串。浏览器禁用存储时静默降级。 */
export function loadRuntimeUrl() {
  try {
    if (typeof localStorage === 'undefined') return ''
    return localStorage.getItem(RUNTIME_URL_KEY) || ''
  } catch (e) { return '' }
}

export function saveRuntimeUrl(value) {
  try {
    if (typeof localStorage === 'undefined') return
    const v = String(value || '').trim()
    if (v) localStorage.setItem(RUNTIME_URL_KEY, v)
    else localStorage.removeItem(RUNTIME_URL_KEY)
  } catch (e) { /* 隐私模式 / 配额满：只影响记忆，不影响本次提交 */ }
}

/** 页面输入非空则覆盖编译期默认值，否则用编译期默认值。 */
export function effectiveUrl(runtimeUrl) {
  return String(runtimeUrl || '').trim() || COMPILED.defaultUrl
}

/** 页面运行环境（可注入，便于测试）。 */
export function currentEnv() {
  const loc = typeof location === 'undefined' ? null : location
  return {
    pageProtocol: loc ? loc.protocol : 'http:',
    pageHref: loc ? loc.href : ''
  }
}
