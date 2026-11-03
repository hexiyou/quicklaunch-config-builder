import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'
import backendConfig from './backend.config.js'

/**
 * 把构建产物里的 JS / CSS 全部内联进 index.html。
 * 这样 dist/index.html 是一个可以「双击直接打开」的离线单文件，
 * 不需要起服务器，也不依赖 node_modules —— 方便直接复制到别的机器使用。
 */
function singleFileHtml() {
  return {
    name: 'ql-single-file-html',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist')
      const htmlPath = path.join(outDir, 'index.html')
      if (!fs.existsSync(htmlPath)) return

      let html = fs.readFileSync(htmlPath, 'utf-8')

      // <link rel="stylesheet" href="./assets/xxx.css"> -> <style>...</style>
      html = html.replace(
        /<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi,
        (tag, href) => {
          const file = path.join(outDir, href.replace(/^\.?\//, ''))
          if (!fs.existsSync(file)) return tag
          const css = fs.readFileSync(file, 'utf-8')
          return `<style>\n${css}\n</style>`
        }
      )

      // <script type="module" src="./assets/xxx.js"></script> -> <script type="module">...</script>
      html = html.replace(
        /<script([^>]*)src="([^"]+)"([^>]*)><\/script>/gi,
        (tag, before, src, after) => {
          const file = path.join(outDir, src.replace(/^\.?\//, ''))
          if (!fs.existsSync(file)) return tag
          const js = fs.readFileSync(file, 'utf-8')
          const attrs = (before + after).replace(/crossorigin(?:="[^"]*")?/gi, '')
          return `<script${attrs}>\n${js}\n</script>`
        }
      )

      fs.writeFileSync(htmlPath, html, 'utf-8')
      const assetsDir = path.join(outDir, 'assets')
      if (fs.existsSync(assetsDir)) fs.rmSync(assetsDir, { recursive: true, force: true })
      console.log('[single-file] dist/index.html 已内联为可离线打开的单文件')
    }
  }
}

export default defineConfig({
  base: './',
  // 把 backend.config.js 的内容以字面量编译进产物。
  // src/backend/config.js 读取 __QL_BACKEND_CONFIG__，构建后这个标识符不再存在，
  // 产物里只留下默认 URL 字符串本身。
  define: {
    __QL_BACKEND_CONFIG__: JSON.stringify(backendConfig)
  },
  plugins: [vue(), singleFileHtml()],
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 2000
  }
})
