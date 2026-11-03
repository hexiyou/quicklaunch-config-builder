/**
 * 编译期后端配置 —— 源码里唯一需要改后端地址的地方。
 *
 * vite.config.js 会在构建时 import 本文件，把整个对象用 define 以「字面量」
 * 注入 dist/index.html。也就是说默认 URL 是编译进产物的常量，运行时不会
 * 再去读任何配置文件、也不会发额外的探测请求。
 *
 * 改完请重新执行 npm run build。
 * 也可以不改源码，用环境变量临时覆盖默认值（CI / 多环境部署用）：
 *     QL_BACKEND_URL=https://cfg.example.com/api/config npm run build
 *
 * 页面上的「后端 API」输入框优先级高于这里的默认值，见 README「在线提交」。
 */
const fromEnv = (process.env.QL_BACKEND_URL || '').trim()

export default {
  // ① 默认后端提交 URL（编译期写进产物）
  defaultUrl: fromEnv || 'http://127.0.0.1:8787/api/config',

  // 请求超时（毫秒）。超时后主动 abort，不阻塞界面。
  timeoutMs: 10000,

  // ② 鉴权配置。首版无鉴权；协议与扩展点见 README「后端鉴权协议 QL-HMAC-SHA256-v1」。
  //    后续启用时改成 'hmac-sha256' 并填 keyId / secret，或注入自定义 provider。
  auth: {
    mode: 'none',   // 'none' | 'hmac-sha256'
    keyId: '',
    secret: ''      // 注意：静态前端里的密钥无法保密，务必读 README 的安全边界说明
  }
}
