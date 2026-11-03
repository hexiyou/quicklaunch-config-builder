<script setup>
import { ref, computed, watch } from 'vue'
import { jsonText, errorCount, warnCount, notify } from '../store.js'
import { COMPILED, loadRuntimeUrl, saveRuntimeUrl, currentEnv } from '../backend/config.js'
import { submitConfig, BASE_HEADERS } from '../backend/submit.js'
import { AUTH_SCHEME } from '../backend/auth.js'

const runtimeUrl = ref(loadRuntimeUrl())
const busy = ref(false)
const status = ref(null)
const showAdvanced = ref(false)
const showRequest = ref(false)

// 高级设置只存在内存里，不写入 localStorage（密钥不落盘）
const authMode = ref(COMPILED.auth.mode || 'none')
const keyId = ref(COMPILED.auth.keyId || '')
const secret = ref(COMPILED.auth.secret || '')

watch(runtimeUrl, v => saveRuntimeUrl(v))

const compiledDefault = COMPILED.defaultUrl
const effective = computed(() => String(runtimeUrl.value || '').trim() || compiledDefault)
const isOverride = computed(() => !!String(runtimeUrl.value || '').trim())
const env = currentEnv()
const isFilePage = computed(() => env.pageProtocol === 'file:')

const headersPreview = computed(() => ({
  ...BASE_HEADERS,
  ...(authMode.value === 'hmac-sha256'
    ? {
        'X-QL-Auth-Mode': 'hmac-sha256',
        'X-QL-Key-Id': keyId.value || '<keyId>',
        'X-QL-Timestamp': '<unix 秒>',
        'X-QL-Nonce': '<随机>',
        'X-QL-Body-Sha256': '<请求体 SHA-256>',
        'X-QL-Signature': 'v1=<HMAC-SHA256 hex>'
      }
    : {})
}))

function restoreDefault() {
  runtimeUrl.value = ''
  notify('已恢复编译期默认后端地址')
}

async function doSubmit(force = false) {
  if (busy.value) return
  busy.value = true
  status.value = { pending: true, ok: false, code: 'PENDING', message: '正在提交…', requested: false }
  try {
    const r = await submitConfig({
      json: jsonText.value,
      runtimeUrl: runtimeUrl.value,
      errors: errorCount.value,
      auth: { mode: authMode.value, keyId: keyId.value, secret: secret.value },
      allowFile: !!force
    })
    status.value = { ...r, pending: false }
    notify(r.ok ? '已提交到后端' : '提交未成功，见下方状态', r.ok ? 'ok' : 'bad')
  } catch (e) {
    status.value = {
      pending: false, ok: false, code: 'UNEXPECTED', requested: false,
      message: '提交过程出现异常：' + (e && e.message ? e.message : e) + '。本地生成功能不受影响。'
    }
  } finally {
    busy.value = false
  }
}

const statusClass = computed(() => {
  const s = status.value
  if (!s) return ''
  if (s.pending) return 'pending'
  return s.ok ? 'ok' : 'bad'
})
</script>

<template>
  <div class="submit-pane">
    <div class="sp-head">
      <div>
        <div class="sp-title">↑ 提交到后端 <span class="tag gray">附加功能</span></div>
        <div class="sp-sub">把右侧生成的完整 JSON 文本 POST 给后端，供启动器「拉取在线配置」使用。失败不影响本地生成 / 复制 / 下载。</div>
      </div>
      <span class="tag" :class="errorCount ? 'red' : 'green'">{{ errorCount ? errorCount + ' 处错误' : '校验通过' }}</span>
    </div>

    <div class="sp-body">
      <div class="hint-box sp-hint">
        仅当<b>校验 0 错误</b>才会发起请求；请求体就是 <span class="mono">config.json</span> 全文（<span class="mono">Content-Type: application/json</span>）。
        默认地址写在源码 <span class="mono">backend.config.js</span>，编译时固化进产物；下面填了值就覆盖它。
        后端必须正确响应 <span class="mono">OPTIONS</span> 预检并放行 CORS，详见 README。
      </div>

      <div class="sp-label">
        <span>后端 API URL</span>
        <span class="muted fs11">留空 = 使用编译期默认值</span>
      </div>
      <div class="row sp-row">
        <input
          v-model="runtimeUrl" class="input mono sp-url grow"
          :placeholder="compiledDefault"
          spellcheck="false" autocomplete="off"
        />
        <button class="btn sm" :disabled="!isOverride" @click="restoreDefault">恢复默认</button>
        <button class="btn primary sm nowrap" :disabled="busy" @click="doSubmit(false)">
          {{ busy ? '提交中…' : '↑ 提交到后端' }}
        </button>
      </div>

      <div class="sp-meta">
        <span class="tag" :class="isOverride ? 'blue' : 'gray'">{{ isOverride ? '页面输入（优先）' : '编译期默认值' }}</span>
        <span class="mono sp-effective">{{ effective }}</span>
      </div>

      <div v-if="errorCount" class="sp-inline-warn">
        ✕ 当前有 {{ errorCount }} 处校验错误，点提交也<b>不会发出请求</b>；请先看「校验」页。
        <span v-if="warnCount" class="muted">（另有 {{ warnCount }} 条提醒，不阻止提交）</span>
      </div>

      <div v-if="isFilePage" class="status-box warn sp-env">
        当前页面是 <span class="mono">file://</span> 本地打开的 HTML，浏览器大概率拦截跨域提交。
        建议用 <span class="mono">npm run preview</span> 通过 HTTP 打开本工具；本地生成功能完全不受影响。
      </div>

      <div v-if="status" class="status-box" :class="statusClass">
        <div class="sb-head">
          <b>{{ status.pending ? '提交中' : status.ok ? '提交成功' : '提交失败' }}</b>
          <span class="mono fs11">{{ status.code }}</span>
          <span v-if="status.status" class="mono fs11">HTTP {{ status.status }}</span>
          <span v-if="status.ms" class="mono fs11">{{ status.ms }} ms</span>
          <span v-if="!status.requested && !status.pending" class="tag gray">未发起请求</span>
        </div>
        <div class="sb-msg">{{ status.message }}</div>
        <div v-if="status.code === 'FILE_PROTOCOL'" class="mt6">
          <button class="btn sm" :disabled="busy" @click="doSubmit(true)">仍然尝试（Origin: null）</button>
        </div>
        <pre v-if="status.responseText" class="sb-resp mono">{{ status.responseText }}</pre>
      </div>

      <details class="sp-details" :open="showRequest" @toggle="showRequest = $event.target.open">
        <summary>请求预览 · 方法与请求头</summary>
        <div class="sp-detail-body">
          <div class="mono fs11">POST {{ effective }}</div>
          <pre class="sb-resp mono">{{ JSON.stringify(headersPreview, null, 2) }}</pre>
          <div class="muted fs11">请求体 = 右侧「生成的 JSON」全文（{{ jsonText.length }} 字符），不做任何包装。</div>
        </div>
      </details>

      <details class="sp-details" :open="showAdvanced" @toggle="showAdvanced = $event.target.open">
        <summary>高级 · 鉴权预留（首版默认无鉴权）</summary>
        <div class="sp-detail-body">
          <div class="row wrap mb8">
            <span class="sp-label-inline">鉴权模式</span>
            <select v-model="authMode" class="select mini-select">
              <option value="none">none · 无鉴权（首版）</option>
              <option value="hmac-sha256">hmac-sha256 · {{ AUTH_SCHEME }}</option>
            </select>
          </div>
          <template v-if="authMode === 'hmac-sha256'">
            <div class="row wrap mb8">
              <input v-model="keyId" class="input mono grow" placeholder="Key Id（后端据此查密钥）" />
              <input v-model="secret" type="password" class="input mono grow" placeholder="Secret（仅本次会话内存）" />
            </div>
            <div class="hint-box">
              启用后会附加 <span class="mono">X-QL-*</span> 六个签名头；后端按 README 的 QL-HMAC-SHA256-v1 协议校验。
              静态前端无法真正保密 secret，生产环境建议改为「运行时注入短期令牌」的自定义 provider。
              密钥只保存在内存，不写 localStorage、不随配置导出。
            </div>
          </template>
          <div v-else class="muted fs11">不附加任何鉴权头。后端接口按无鉴权实现即可，未来启用鉴权无需改动提交逻辑。</div>
        </div>
      </details>

      <details class="sp-details">
        <summary>提交不通时，按这个顺序排查</summary>
        <div class="sp-detail-body muted fs11">
          1. 后端是否已启动、URL 是否写对；<br />
          2. 后端是否处理 <span class="mono">OPTIONS</span> 预检，并返回 <span class="mono">Access-Control-Allow-Origin</span> /
          <span class="mono">Allow-Methods: POST, OPTIONS</span> /
          <span class="mono">Allow-Headers: Content-Type, X-QL-Client, X-QL-*</span>；<br />
          3. 本工具是否通过 HTTP(S) 服务部署（<span class="mono">file://</span> 打开会被拦）；<br />
          4. HTTPS 页面不能请求 HTTP 后端；<br />
          5. 用 <span class="mono">node scripts/mock-backend.mjs</span> 起一个已配好 CORS 的参考后端做对照。
        </div>
      </details>
    </div>
  </div>
</template>
