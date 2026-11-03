/**
 * 真实端到端联调（npm run verify:e2e，可选）
 *
 * 与 ui-check 的区别：ui-check 从 file:// 打开、fetch 被打桩；
 * 本脚本用两个不同端口起「前端 HTTP 服务」与「参考后端」，通过 CDP 驱动
 * 无头 Chrome 在真实跨源环境走一遍 POST 预检 → 提交 → GET 回读，
 * 验证 CORS 配置真的可用（不是只在文档里写写）。
 * 需要本机有 Chrome / Edge，且先 npm run build。
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { submitConfig } from '../src/backend/submit.js'
import { buildHmacHeaders } from '../src/backend/auth.js'

const root = path.resolve(import.meta.dirname, '..')
const BACKEND_PORT = 8799
const HMAC_PORT = 8800
const FRONT_PORT = 4188
const CDP_PORT = 9333
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}/api/config`
const HMAC_URL = `http://127.0.0.1:${HMAC_PORT}/api/config`
const GET_URL = `http://127.0.0.1:${BACKEND_PORT}/config.json`
const SAVE_A = path.join(os.tmpdir(), `ql-e2e-${BACKEND_PORT}.json`)
const SAVE_B = path.join(os.tmpdir(), `ql-e2e-${HMAC_PORT}.json`)
for (const p of [SAVE_A, SAVE_B]) { try { fs.rmSync(p, { force: true }) } catch (e) { /* 忽略 */ } }
const FRONT_URL = `http://127.0.0.1:${FRONT_PORT}/`
const distFile = path.join(root, 'dist', 'index.html')
if (!fs.existsSync(distFile)) { console.error('请先 npm run build'); process.exit(1) }

const browsers = [
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
]
const browser = browsers.find(p => fs.existsSync(p))
if (!browser) { console.log('本机没找到 Chrome / Edge，跳过端到端检查'); process.exit(0) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(fn, ms = 10000, label = '') {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return } catch (e) { /* 继续等 */ }
    await sleep(120)
  }
  throw new Error('等待超时：' + label)
}

/* ------------------------------------------------------------ 极简 CDP 客户端 */
async function connectCdp() {
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()
  const page = list.find(t => t.type === 'page' && t.url.startsWith(FRONT_URL))
  if (!page) throw new Error('没找到页面 target')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = () => reject(new Error('CDP WebSocket 连接失败'))
  })
  let seq = 0
  const pending = new Map()
  ws.onmessage = e => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  }
  return (method, params = {}) => new Promise(resolve => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

/* ------------------------------------------------------------ 测试表达式（在页面里跑） */
const expression = `(async () => {
  const R = [];
  const ok = (n, c, x) => R.push((c ? 'PASS' : 'FAIL') + ' | ' + n + (x ? ' | ' + x : ''));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const q = s => document.querySelector(s);
  const qa = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const body = () => document.body.innerText;
  try {
    const tab = qa('.output-panel .seg button').find(x => x.textContent.indexOf('提交到后端') >= 0);
    if (tab) tab.click();
    await wait(400);
    const input = q('.submit-pane .sp-url');
    if (input) {
      input.value = '${BACKEND_URL}';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await wait(350);
    const btn = q('.submit-pane .sp-row .btn.primary');
    if (btn) btn.click();
    await wait(1400);

    ok('页面通过 HTTP 服务部署', location.protocol === 'http:', location.protocol);
    ok('确实发出了跨域 POST', (window.__QL_CALLS || []).some(c => c.url.indexOf('${BACKEND_PORT}') >= 0));
    ok('提交状态显示成功', body().indexOf('提交成功') >= 0);
    ok('没有 file:// 拦截提示', body().indexOf('FILE_PROTOCOL') < 0);

    // 从浏览器跨源 GET 回读，等价于启动器「拉取在线配置」
    let pulled = '', status = 0;
    try { const res = await fetch('${GET_URL}'); status = res.status; pulled = await res.text(); }
    catch (e) { ok('跨源 GET 返回 200', false, e.message); }
    if (status) ok('跨源 GET 返回 200', status === 200, 'HTTP ' + status);
    ok('回读内容与生成的 config.json 一致', pulled.indexOf('"items"') >= 0 && pulled.indexOf('notepad') >= 0);
  } catch (e) {
    R.push('FAIL | 脚本异常 | ' + (e && e.message ? e.message : e));
  }
  return R;
})()`

/* ------------------------------------------------------------ 启动服务 */
const html = fs.readFileSync(distFile, 'utf-8')
const front = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' })
  res.end(html)
})

const backend = spawn(process.execPath, [path.join(root, 'scripts', 'mock-backend.mjs')], {
  env: { ...process.env, QL_MOCK_PORT: String(BACKEND_PORT), QL_MOCK_SAVE_PATH: SAVE_A },
  stdio: ['ignore', 'pipe', 'pipe']
})
let hmacLog = ''
const hmacBackend = spawn(process.execPath, [path.join(root, 'scripts', 'mock-backend.mjs')], {
  env: {
    ...process.env,
    QL_MOCK_PORT: String(HMAC_PORT),
    QL_MOCK_SAVE_PATH: SAVE_B,
    QL_MOCK_SECRET: 'ql-demo-secret',
    QL_MOCK_KEY_ID: 'demo-key'
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
hmacBackend.stdout.on('data', d => { hmacLog += d.toString() })
hmacBackend.stderr.on('data', d => { hmacLog += d.toString() })

let backendLog = ''
backend.stdout.on('data', d => { backendLog += d.toString() })
backend.stderr.on('data', d => { backendLog += d.toString() })

let chrome = null
let exitCode = 0
try {
  const alive = async url => [200, 404].includes((await fetch(url)).status)
  await waitFor(() => alive(`http://127.0.0.1:${BACKEND_PORT}/config.json`), 10000, '参考后端')
  await new Promise(resolve => front.listen(FRONT_PORT, '127.0.0.1', resolve))

  chrome = spawn(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + CDP_PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'ql-e2e-profile-' + Date.now()),
    FRONT_URL
  ], { stdio: ['ignore', 'ignore', 'ignore'] })

  await waitFor(async () => {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
    return r.ok
  }, 15000, 'Chrome CDP')

  const send = await connectCdp()
  await send('Page.enable')
  // 清掉上一轮残留，并在应用加载前挂上 fetch 记录器（不拦截，保留真实 CORS 行为）
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'try{localStorage.clear()}catch(e){};' +
      'window.__QL_CALLS=[];const __f=window.fetch.bind(window);' +
      'window.fetch=function(u,o){window.__QL_CALLS.push({url:String(u),opts:o});return __f(u,o)};'
  })
  await send('Page.reload', { ignoreCache: true })
  await waitFor(async () => {
    const r = await send('Runtime.evaluate', { expression: 'document.readyState === "complete" && !!document.querySelector(".topbar")', returnByValue: true })
    return r.result && r.result.result && r.result.result.value === true
  }, 15000, '页面渲染')

  const res = await Promise.race([
    send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
    sleep(30000).then(() => { throw new Error('页面内测试超时') })
  ])
  if (res.result && res.result.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails))
  const lines = (res.result && res.result.result && res.result.result.value) || []
  lines.forEach(l => console.log('  ' + l))
  const failed = lines.filter(l => l.startsWith('FAIL'))
  console.log(`\n真实跨域端到端：${lines.length - failed.length} 通过 / ${failed.length} 失败`)
  if (failed.length) exitCode = 1

  /* ---------------- 鉴权协议：客户端签名器 vs 后端校验器 ---------------- */
  console.log('\n鉴权协议联调（另一实例启用 QL-HMAC-SHA256-v1）：')
  const nOk = (n, c, x) => {
    console.log((c ? '  PASS | ' : '  FAIL | ') + n + (x ? ' | ' + x : ''))
    if (!c) exitCode = 1
  }
  await waitFor(() => alive(`http://127.0.0.1:${HMAC_PORT}/config.json`), 10000, 'HMAC 后端')
  const hmacBody = '{"items":[{"id":"hmac-demo","name":"签名联调","type":"app","target":"notepad.exe"}]}'
  const signed = await submitConfig({
    json: hmacBody, errors: 0, runtimeUrl: HMAC_URL,
    env: { pageProtocol: 'http:' },
    auth: { mode: 'hmac-sha256', keyId: 'demo-key', secret: 'ql-demo-secret' }
  })
  nOk('带签名的提交被后端受理', signed.ok, signed.code + ' / ' + signed.status)
  nOk('签名头已发出', !!signed.headers['X-QL-Signature'])

  const opt = await fetch(HMAC_URL, {
    method: 'OPTIONS',
    headers: {
      Origin: FRONT_URL,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,x-ql-client,x-ql-signature'
    }
  })
  nOk('OPTIONS 预检放行 X-QL-* 头', opt.status === 204 &&
    (opt.headers.get('access-control-allow-headers') || '').includes('X-QL-Signature'))

  const h = await buildHmacHeaders({ url: HMAC_URL, body: hmacBody, keyId: 'demo-key', secret: 'ql-demo-secret' })
  const base = { 'Content-Type': 'application/json;charset=utf-8', 'X-QL-Client': 'quicklaunch-config-builder/1.0' }
  const post = extra => fetch(HMAC_URL, { method: 'POST', headers: { ...base, ...extra }, body: hmacBody })
  nOk('同一签名首次通过', (await post(h)).status === 200)
  nOk('重放同一 nonce 被拒', (await post(h)).status === 401)
  const hBad = await buildHmacHeaders({
    url: HMAC_URL, body: hmacBody, keyId: 'demo-key', secret: 'ql-demo-secret',
    nonce: 'bad0000000000001'
  })
  nOk('错误签名被拒', (await post({ ...hBad, 'X-QL-Signature': 'v1=' + '0'.repeat(64) })).status === 401)
  nOk('缺少签名头被拒', (await post({})).status === 401)

  console.log('\n参考后端日志（无鉴权实例）：')
  console.log(backendLog.trim().split('\n').map(s => '  ' + s).join('\n'))
  console.log('参考后端日志（HMAC 实例，尾部）：')
  console.log(hmacLog.trim().split('\n').slice(-6).map(s => '  ' + s).join('\n'))
} catch (e) {
  console.error('端到端检查失败：' + e.message)
  console.error(backendLog)
  exitCode = 1
} finally {
  if (chrome) chrome.kill()
  backend.kill()
  hmacBackend.kill()
  front.close()
}
process.exit(exitCode)
