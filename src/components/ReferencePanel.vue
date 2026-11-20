<script setup>
import {
  ITEM_FIELDS, PARAM_FIELDS, GROUP_FIELDS, SCHEDULE_FIELDS, TOP_FIELDS,
  CALLBACK_FIELDS, CALLBACK_RULES,
  ITEM_TYPES, TARGET_RULES, TEMPLATE_RULES, TEMPLATE_FIELDS,
  DYNAMIC_VALUES, DYNAMIC_RULES, BUILTIN_VALUES, BUILTIN_RULES, README_NOTES
} from '../schema.js'

const appliesText = f => f.applies ? f.applies.join(' · ') : '全部类型'
const reqText = f => f.required ? '必填' : '可选'
// 含花括号的文案必须走 JS 常量，Vue 模板会把字面 {{…}} 当插值解析
const MACHINE_TPL = '{{#machine}}'
const MACHINE_SHORT_TPL = '{{#machine:short}}'
</script>

<template>
  <div class="editor-scroll">
    <div class="editor-title-row">
      <div>
        <div class="editor-title">字段速查 · 配置说明</div>
        <div class="editor-subtitle">内容逐条对应 wv2-launcher/README.md「四、配置说明」与「七、定时调度」</div>
      </div>
    </div>

    <!-- 条目字段 -->
    <div class="ref-block">
      <h3 class="ref-title">items[] 条目字段（{{ ITEM_FIELDS.length }} 项）</h3>
      <p class="ref-sub">左侧勾选框控制「可选字段」是否写进 JSON。必填字段始终写入。适用类型一列说明字段只对哪些 type 有意义。</p>
      <table class="ref-table">
        <thead><tr><th>字段</th><th>意义</th><th>必填</th><th>格式 / 校验口径</th><th>适用类型</th></tr></thead>
        <tbody>
          <tr v-for="f in ITEM_FIELDS" :key="f.key">
            <td>{{ f.key }}</td>
            <td>{{ f.desc }}<div class="muted fs11 mt6">README：{{ f.doc }}</div></td>
            <td><span class="tag" :class="f.required ? 'req' : 'opt'">{{ reqText(f) }}</span></td>
            <td>{{ f.format }}</td>
            <td class="muted">{{ appliesText(f) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- params -->
    <div class="ref-block">
      <h3 class="ref-title">params[] 参数声明字段</h3>
      <p class="ref-sub">声明了 params，target 等字段里的模板变量才会被替换；变量按声明顺序位置填，也可以用「名称=值」命名填。</p>
      <table class="ref-table">
        <thead><tr><th>字段</th><th>意义</th><th>必填</th><th>格式</th></tr></thead>
        <tbody>
          <tr v-for="f in PARAM_FIELDS" :key="f.key">
            <td>{{ f.key }}</td><td>{{ f.desc }}</td>
            <td><span class="tag" :class="f.required ? 'req' : 'opt'">{{ reqText(f) }}</span></td>
            <td>{{ f.format }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- groups -->
    <div class="ref-block">
      <h3 class="ref-title">groups[] 分组字段</h3>
      <table class="ref-table">
        <thead><tr><th>字段</th><th>意义</th><th>必填</th><th>格式</th></tr></thead>
        <tbody>
          <tr v-for="f in GROUP_FIELDS" :key="f.key">
            <td>{{ f.key }}</td><td>{{ f.desc }}</td>
            <td><span class="tag" :class="f.required ? 'req' : 'opt'">{{ reqText(f) }}</span></td>
            <td>{{ f.format }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- schedules -->
    <div class="ref-block">
      <h3 class="ref-title">schedules[] 定时任务字段</h3>
      <p class="ref-sub">at 与 every 必须二选一，days 只跟 at 搭。写错的那一条只跳过自己，原因写进 sched.log，不影响别的任务。</p>
      <table class="ref-table">
        <thead><tr><th>字段</th><th>意义</th><th>必填</th><th>格式</th></tr></thead>
        <tbody>
          <tr v-for="f in SCHEDULE_FIELDS" :key="f.key">
            <td>{{ f.key }}</td><td>{{ f.desc }}</td>
            <td><span class="tag" :class="f.required ? 'req' : 'opt'">{{ reqText(f) }}</span></td>
            <td>{{ f.format }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 顶层 -->
    <div class="ref-block">
      <h3 class="ref-title">顶层字段</h3>
      <table class="ref-table">
        <thead><tr><th>字段</th><th>意义</th><th>必填</th><th>格式</th></tr></thead>
        <tbody>
          <tr v-for="f in TOP_FIELDS" :key="f.key">
            <td>{{ f.key }}</td><td>{{ f.desc }}<div class="muted fs11 mt6">{{ f.doc }}</div></td>
            <td><span class="tag" :class="f.required ? 'req' : 'opt'">{{ reqText(f) }}</span></td>
            <td>{{ f.format }}</td>
          </tr>
          <tr><td>items</td><td>条目数组，配置的数据主体。老版本也支持顶层直接写数组。</td><td><span class="tag req">必填</span></td><td>对象数组</td></tr>
          <tr><td>groups</td><td>分组定义，只影响过滤（@分组、胶囊），不影响启动。不写也能跑。</td><td><span class="tag opt">可选</span></td><td>对象数组</td></tr>
          <tr><td>schedules</td><td>后台定时任务，效果等同 ql run，不写就一条任务都没有。</td><td><span class="tag opt">可选</span></td><td>对象数组</td></tr>
          <tr><td>callback</td><td>顶层可选回调块：响应根对象带 _ql_callback 时按 actions 执行本地动作。不写就是全默认值，老配置不用改。</td><td><span class="tag opt">可选</span></td><td>对象（5 个可选子字段，见下表）</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 顶层 callback -->
    <div class="ref-block">
      <h3 class="ref-title">顶层 callback 回调块（{{ CALLBACK_FIELDS.length }} 个字段）</h3>
      <p class="ref-sub">
        上游 d48be68 新增、03086ae 补了 <span class="mono">popup</span>。整个块可选，不写就是默认值
        <span class="mono">enabled=true · max=5 · maxDepth=5 · allow=[] · onQuiet=notify · popup=native</span>；
        左侧「回调 callback」页可开关并逐字段编辑，生成器把它排在导出 JSON 的末尾。
      </p>
      <table class="ref-table">
        <thead><tr><th>字段</th><th>意义</th><th>必填</th><th>格式 / 校验口径</th></tr></thead>
        <tbody>
          <tr v-for="f in CALLBACK_FIELDS" :key="f.key">
            <td>{{ f.key }}</td>
            <td>{{ f.desc }}<div class="muted fs11 mt6">README：{{ f.doc }}</div></td>
            <td><span class="tag" :class="f.required ? 'req' : 'opt'">{{ reqText(f) }}</span></td>
            <td>{{ f.format }}</td>
          </tr>
        </tbody>
      </table>
      <ul class="ref-list mt10"><li v-for="(r, i) in CALLBACK_RULES" :key="i">{{ r }}</li></ul>
    </div>

    <!-- 类型 -->
    <div class="ref-block">
      <h3 class="ref-title">8 种 type 的语义</h3>
      <div v-for="t in ITEM_TYPES" :key="t.value" class="ref-card">
        <h4>{{ t.label }}</h4>
        <p>{{ t.desc }}</p>
        <p class="mt6 mono fs11 muted">target 示例：{{ t.targetHint }}</p>
      </div>
    </div>

    <!-- target 解析 -->
    <div class="ref-block">
      <h3 class="ref-title">target 的解析规则（按 type 区分）</h3>
      <p class="ref-sub">UNC 路径（两个反斜杠开头的服务器共享）在所有 type 下都算绝对路径，不会被拼上脚本目录；workdir / icon 也一样。</p>
      <table class="ref-table">
        <thead><tr><th>type</th><th>怎么处理</th><th>例子</th></tr></thead>
        <tbody>
          <tr v-for="r in TARGET_RULES" :key="r.type"><td>{{ r.type }}</td><td>{{ r.rule }}</td><td class="mono">{{ r.example }}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 模板 -->
    <div class="ref-block">
      <h3 class="ref-title">模板变量：四条边界与生效字段</h3>
      <ul class="ref-list"><li v-for="(r, i) in TEMPLATE_RULES" :key="i">{{ r }}</li></ul>
      <p class="ref-sub mt6">生效字段：<span class="mono">{{ TEMPLATE_FIELDS.join(' / ') }}</span></p>
    </div>

    <!-- 动态值 -->
    <div class="ref-block">
      <h3 class="ref-title">发送前展开的动态值（headers 与 body 都会展开）</h3>
      <table class="ref-table">
        <thead><tr><th>写法</th><th>结果</th></tr></thead>
        <tbody>
          <tr v-for="d in DYNAMIC_VALUES" :key="d.tpl"><td class="mono">{{ d.tpl }}</td><td>{{ d.desc }}</td></tr>
        </tbody>
      </table>
      <ul class="ref-list mt10"><li v-for="(r, i) in DYNAMIC_RULES" :key="i">{{ r }}</li></ul>
    </div>

    <!-- 内置变量 -->
    <div class="ref-block">
      <h3 class="ref-title">内置变量 @ 一族（{{ BUILTIN_VALUES.length }} 种，不需要声明 params）</h3>
      <p class="ref-sub">
        上游 713398e / d76e27b 新增。<span class="mono">@</span> 开头的是「环境」不是「参数」：
        不进 params 变量集合，也不参与「被模板消耗的参数不再追加」。在编辑区任意生效字段的「插入」下拉里都能选。
        另有 AHK 侧的 <span class="mono">{{ MACHINE_TPL }}</span> / <span class="mono">{{ MACHINE_SHORT_TPL }}</span>，见上表。
      </p>
      <table class="ref-table">
        <thead><tr><th>写法</th><th>结果 / 用途</th></tr></thead>
        <tbody>
          <tr v-for="b in BUILTIN_VALUES" :key="b.tpl"><td class="mono">{{ b.tpl }}</td><td>{{ b.desc }}</td></tr>
        </tbody>
      </table>
      <ul class="ref-list mt10"><li v-for="(r, i) in BUILTIN_RULES" :key="i">{{ r }}</li></ul>
    </div>

    <!-- 约定 -->
    <div class="ref-block">
      <h3 class="ref-title">容易踩的约定</h3>
      <div v-for="n in README_NOTES" :key="n.title" class="ref-card"><h4>{{ n.title }}</h4><p>{{ n.text }}</p></div>
    </div>
  </div>
</template>
