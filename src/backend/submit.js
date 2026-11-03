/**
 * 把生成的 config.json 文本提交到后端。
 *
 * 设计原则：这是「附加功能」，任何失败都只返回结构化结果，绝不抛异常、绝不改动
 * 本地编辑状态。复制 / 下载 / 校验 / 编辑完全不依赖本模块，也不依赖网络。
 */
import { COMPILED, effectiveUrl, currentEnv } from './config.js'
import { resolveAuthProvider } from './auth.js'

/** 基础请求头。自定义头会触发 CORS 预检，后端必须放行，见 README。 */
export const BASE_HEADERS = {
  'Content-Type': 'application/json;charset=utf-8',
  'Accept': 'application/json, text/plain, */*',
  'X-QL-Client': 'quicklaunch-config-builder/1.0'
}

/**
 * 发请求前的端点体检。返回 { ok, code, message, url }。
 * 可注入 env，便于在 Node 里覆盖各种部署环境做回归。
 */
export function inspectEndpoint(runtimeUrl, env = currentEnv(), opts = {}) {
  const raw = String(runtimeUrl || '').trim()
  if (!raw) {
    return { ok: false, code: 'EMPTY_URL', url: raw, message: '后端地址为空，请在页面填入后端 API URL，或在 backend.config.js 配置默认值后重新构建。' }
  }

  let u
  try { u = new URL(raw) }
  catch (e) {
    return { ok: false, code: 'BAD_URL', url: raw, message: '后端地址不是合法的绝对 URL：' + raw + '。请填完整的 http(s):// 地址。' }
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, code: 'BAD_SCHEME', url: raw, message: '后端地址只支持 http:// 或 https://，当前是 ' + u.protocol }
  }
  if (env.pageProtocol === 'https:' && u.protocol === 'http:') {
    return { ok: false, code: 'MIXED_CONTENT', url: raw, message: '本工具通过 HTTPS 部署，浏览器会拦截对 HTTP 后端的请求（混合内容）。请把后端也切到 HTTPS。' }
  }
  if (env.pageProtocol === 'file:' && !opts.allowFile) {
    return {
      ok: false, code: 'FILE_PROTOCOL', url: raw,
      message: '当前页面是用浏览器直接打开的本地 HTML（file://），浏览器通常会对这种 opaque origin 拦截跨域请求，' +
        '已阻止本次提交。请通过 HTTP 服务部署本工具（npm run preview）后再提交；' +
        '或者点「仍然尝试」（仅当你的后端允许 Origin: null 时才可能成功）。本地生成 / 复制 / 下载功能不受影响。'
    }
  }
  if (env.pageProtocol !== 'file:' && env.pageProtocol !== 'http:' && env.pageProtocol !== 'https:') {
    return { ok: false, code: 'UNSUPPORTED_PROTOCOL', url: raw, message: '当前页面协议 ' + env.pageProtocol + ' 不支持发起跨域提交，请改用 HTTP(S) 部署。' }
  }
  return { ok: true, code: 'OK', url: raw, message: '' }
}

function networkErrorMessage(env, url, err) {
  const reason = err && err.name === 'AbortError' ? '请求超时' : (err && err.message ? err.message : String(err))
  let extra = ''
  if (env.pageProtocol === 'file:') {
    extra = ' 当前是 file:// 本地打开，Origin 为 null，绝大多数后端会直接拒绝。'
  } else if (env.pageProtocol === 'https:') {
    extra = ' HTTPS 页面请确认后端同样是 HTTPS。'
  }
  return '提交失败：浏览器没能完成请求（' + reason + '）。' + extra +
    ' 常见原因：后端未启动；URL 写错；跨域 CORS 未配置（OPTIONS 预检需要返回 ' +
    'Access-Control-Allow-Origin / Allow-Methods / Allow-Headers）；后端证书不受信任；代理或防火墙拦截。' +
    ' 目标地址：' + url
}

/**
 * 提交一份 JSON 文本。
 *
 * @param {object} o
 * @param {string} o.json        完整 config.json 文本（请求体原样发送）
 * @param {string} o.runtimeUrl  页面输入框的值，空则使用编译期默认值
 * @param {number} o.errors      当前校验错误数，>0 直接拦截且不发请求
 * @param {object} o.auth        鉴权配置，默认取编译期配置
 * @param {boolean} o.allowFile  file:// 环境下是否仍强制尝试
 * @param {Function} o.fetchImpl 可注入的 fetch（测试用）
 * @param {object} o.env         可注入的页面环境（测试用）
 * @param {number} o.timeoutMs   超时毫秒数
 * @returns {Promise<{ok:boolean, code:string, message:string, requested:boolean, ...}>}
 */
export async function submitConfig(o = {}) {
  const json = String(o.json ?? '')
  const env = o.env || currentEnv()
  const url = effectiveUrl(o.runtimeUrl)
  const timeoutMs = Number(o.timeoutMs ?? COMPILED.timeoutMs) || 10000
  const base = { ok: false, url, requested: false, status: 0, responseText: '', message: '' }

  // ① 格式校验门禁：有错误时连请求都不发起（界面按钮与这里双重保险）
  const errors = Number(o.errors || 0)
  if (errors > 0) {
    return { ...base, code: 'VALIDATION_FAILED', message: '还有 ' + errors + ' 处校验错误，未发起请求。请到「校验」页修好错误（或看顶栏红色计数）后再提交。' }
  }
  if (!json.trim()) {
    return { ...base, code: 'EMPTY_BODY', message: '生成的 JSON 为空，未发起请求。' }
  }

  // ② 端点体检
  const check = inspectEndpoint(url, env, { allowFile: !!o.allowFile })
  if (!check.ok) return { ...base, code: check.code, message: check.message }

  // ③ 鉴权请求头（首版为空对象）
  let authHeaders = {}
  let provider
  try {
    provider = resolveAuthProvider(o.auth || COMPILED.auth)
    authHeaders = (await provider.headers({ url, body: json, method: 'POST' })) || {}
  } catch (e) {
    return { ...base, code: 'AUTH_ERROR', message: '鉴权请求头生成失败，未发起请求：' + (e && e.message ? e.message : e) }
  }
  const headers = { ...BASE_HEADERS, ...authHeaders }

  // ④ 真正发请求
  const doFetch = o.fetchImpl || globalThis.fetch
  if (typeof doFetch !== 'function') {
    return { ...base, code: 'NO_FETCH', message: '当前环境不支持 fetch，未发起请求。本地生成功能不受影响。' }
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : 0
  const started = Date.now()
  let res
  try {
    res = await doFetch(url, {
      method: 'POST',
      mode: 'cors',            // 显式跨域
      credentials: 'omit',     // 首版无鉴权，不带 Cookie；带通配符 CORS 才能工作
      headers,
      body: json,              // 整个 JSON 串就是请求体
      ...(controller ? { signal: controller.signal } : {})
    })
  } catch (e) {
    const aborted = controller && controller.signal.aborted
    return {
      ...base, requested: true, headers, ms: Date.now() - started,
      code: aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: aborted
        ? '提交超时（' + timeoutMs + ' ms），请求已取消。请检查后端地址与网络。'
        : networkErrorMessage(env, url, e)
    }
  } finally {
    if (timer) clearTimeout(timer)
  }

  let responseText = ''
  try { if (res && typeof res.text === 'function') responseText = String(await res.text() || '') }
  catch (e) { /* 响应体读不到不影响状态判断 */ }
  const status = Number(res && res.status) || 0
  const ok = !!(res && res.ok)
  return {
    ...base, requested: true, headers, ms: Date.now() - started,
    ok, status, responseText: responseText.slice(0, 4000),
    code: ok ? 'OK' : 'HTTP_ERROR',
    message: ok
      ? '提交成功（HTTP ' + status + '，' + (Date.now() - started) + ' ms）'
      : '后端返回 HTTP ' + status + '，提交未被受理。响应：' + (responseText.slice(0, 300) || '(空)')
  }
}
