/**
 * 浏览器端交互冒烟（node scripts/ui-check.mjs）
 * 需要本机有 Chrome / Edge，且先执行过 npm run build。
 * 做法：把 dist/index.html 复制一份，注入一段测试脚本，用无头浏览器跑完
 * 再把 <pre id="TEST_RESULT"> 里的结果读回来。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const distFile = path.join(root, 'dist', 'index.html')
if (!fs.existsSync(distFile)) {
  console.error('找不到 dist/index.html，请先执行 npm run build')
  process.exit(1)
}

const browsers = [
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
]
const browser = browsers.find(p => fs.existsSync(p))
if (!browser) { console.error('本机没找到 Chrome / Edge，跳过浏览器检查'); process.exit(0) }

const inject = `
<pre id="TEST_RESULT" style="display:none"></pre>
<script>
(function () {
  const R = [];
  const ok = (name, cond, extra) => R.push((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const qa = s => Array.prototype.slice.call(document.querySelectorAll(s));
  const q = s => document.querySelector(s);
  const body = () => document.body.innerText;
  const code = () => (q('.code-area') ? q('.code-area').innerText : '');
  const tab = word => { const b = qa('.nav-tab').find(x => x.textContent.indexOf(word) >= 0); if (b) b.click(); };
  const outTab = word => { const b = qa('.output-panel .seg button').find(x => x.textContent.indexOf(word) >= 0); if (b) b.click(); };
  const topBtn = word => { const b = qa('.topbar-actions button, .topbar-right button').find(x => x.textContent.indexOf(word) >= 0); if (b) b.click(); };
  const submitBtn = () => q('.submit-pane .sp-row .btn.primary');
  const byTypeLabel = label => qa('.type-rail .type-tab').find(x => (x.querySelector('.tr-label')?.textContent || '').trim() === label);
  const itemRows = () => qa('.items-scroll .list-item');
  const itemCount = () => Number((qa('.nav-tab').find(x => x.textContent.indexOf('条目 items') >= 0)?.querySelector('.count')?.textContent || '0').trim());

  // 拦截 fetch：既能统计「是否发过请求」，又能在 file:// 下模拟成功 / CORS 失败
  window.__QL_FETCH_CALLS = [];
  window.__QL_FETCH_MODE = 'fail';
  window.fetch = function (url, opts) {
    window.__QL_FETCH_CALLS.push({ url: url, opts: opts });
    if (window.__QL_FETCH_MODE === 'ok') {
      return Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve('{"ok":true,"saved":true}')
      });
    }
    return Promise.reject(new TypeError('Failed to fetch'));
  };

  window.addEventListener('load', async function () {
    try {
      await wait(700);
      ok('初始渲染标题', body().indexOf('QuickLaunch 配置生成器') >= 0);
      ok('示例条目已载入', body().indexOf('记事本') >= 0);
      ok('JSON 预览含 items', code().indexOf('"items"') >= 0);
      ok('JSON 预览含 groups', code().indexOf('"groups"') >= 0);
      ok('JSON 预览含 schedules', code().indexOf('"schedules"') >= 0);
      ok('JSON 预览含 notepad', code().indexOf('notepad') >= 0);
      ok('JSON 里没有 undefined', code().indexOf('undefined') < 0);
      ok('初始校验通过', body().indexOf('校验通过') >= 0);

      /* ---------------- 条目类型纵向 TAB ---------------- */
      const railTabs = qa('.type-rail .type-tab');
      ok('条目页出现纵向类型 TAB 栏', railTabs.length === 9, railTabs.length + ' 个');
      ok('第一个 TAB 是「全部」且默认选中',
        !!railTabs[0] && railTabs[0].textContent.indexOf('全部') >= 0 && railTabs[0].classList.contains('active'));
      const totalItems = Number((qa('.nav-tab').find(x => x.textContent.indexOf('条目 items') >= 0)?.querySelector('.count')?.textContent || '0').trim());
      ok('「全部」保留全部条目（与原来一致）', itemRows().length === totalItems,
        itemRows().length + '/' + totalItems);
      const jsonLen0 = code().length;

      const appTab = byTypeLabel('app'); if (appTab) appTab.click();
      await wait(350);
      const appRows = itemRows();
      ok('app TAB 只显示 app 类型', appRows.length > 0 && appRows.length < totalItems &&
        appRows.every(r => (r.querySelector('.li-badge')?.textContent || '').trim() === 'app'),
        appRows.length + ' 条');
      ok('筛选后自动选中该类型第一条', !!q('.items-scroll .list-item.active'));
      ok('列表标题显示筛选类型', body().indexOf('条目列表 · app') >= 0);
      ok('筛选不改变生成的 JSON', code().length === jsonLen0, jsonLen0 + ' -> ' + code().length);

      tab('分组'); await wait(300);
      ok('分组页不显示类型 TAB', !q('.type-rail'));
      tab('条目'); await wait(300);
      ok('切回条目页保留筛选状态', !!byTypeLabel('app') && byTypeLabel('app').classList.contains('active'));

      const ahkTab = byTypeLabel('ahk'); if (ahkTab) ahkTab.click();
      await wait(350);
      ok('0 条的类型显示空状态与新增入口', body().indexOf('当前没有') >= 0 && !!q('.items-scroll .empty button'));

      const allTab = byTypeLabel('全部'); if (allTab) allTab.click();
      await wait(350);
      ok('切回「全部」恢复全部条目', itemRows().length === totalItems);

      tab('分组'); await wait(350);
      ok('分组页有 ID 字段', body().indexOf('分组 ID') >= 0);
      ok('分组页有输入框', qa('.editor-panel input').length > 0);

      tab('定时任务'); await wait(350);
      ok('定时页不显示类型 TAB', !q('.type-rail'));
      ok('定时页有 run 输入', !!q('.editor-panel input[list="dl-run"]'));
      ok('定时页有 at 字段', body().indexOf('固定时刻 at') >= 0);
      ok('定时页有 every 字段', body().indexOf('固定间隔 every') >= 0);
      ok('定时页有 days 字段', body().indexOf('星期 days') >= 0);

      tab('条目'); await wait(350);
      const first = qa('.list-item')[0]; if (first) first.click();
      await wait(300);
      ok('条目页有 target 输入', !!q('.editor-panel textarea.mono'));
      const before = code().length;
      const toggles = qa('.editor-panel .include-toggle:not(.locked):not(.on)');
      if (toggles.length) toggles[0].click();
      await wait(350);
      ok('打开可选字段后 JSON 变化', code().length !== before, before + ' -> ' + code().length);

      const wh = qa('.type-card').find(x => x.textContent.indexOf('webhook') >= 0);
      if (wh) wh.click();
      await wait(400);
      ok('切到 webhook 出现 method', body().indexOf('请求方法 method') >= 0);
      ok('切到 webhook 出现 body', body().indexOf('请求体 body') >= 0);
      ok('非 http 的 target 触发错误提示', body().indexOf('处错误') >= 0);

      tab('字段速查'); await wait(400);
      ok('字段速查表格齐全', qa('.ref-table').length >= 5, qa('.ref-table').length + ' 张表');
      ok('字段速查含 target 规则', body().indexOf('target 的解析规则') >= 0);
      ok('字段速查含动态值', body().indexOf('发送前展开的动态值') >= 0);
      ok('字段速查含 8 种 type', body().indexOf('8 种 type') >= 0);

      /* ---------------- 云端提交（附加功能） ---------------- */
      outTab('提交到后端'); await wait(400);
      ok('提交页有后端 API 输入框', !!q('.submit-pane .sp-url'));
      ok('输入框占位符是编译期默认 URL',
        (q('.submit-pane .sp-url')?.placeholder || '').indexOf('127.0.0.1:8787/api/config') >= 0);
      ok('展示编译期默认值来源', body().indexOf('编译期默认值') >= 0);
      ok('file:// 本地打开有环境提示', body().indexOf('file://') >= 0);

      // 上面把条目切成 webhook 且 target 不是 http，此时校验有错误
      const n0 = window.__QL_FETCH_CALLS.length;
      if (submitBtn()) submitBtn().click();
      await wait(450);
      ok('校验不通过时完全不发请求', window.__QL_FETCH_CALLS.length === n0,
        window.__QL_FETCH_CALLS.length + ' 次');
      ok('校验不通过时有明确提示', body().indexOf('未发起请求') >= 0);

      // 载入示例配置让校验通过，再验证 file:// 拦截与强制尝试
      topBtn('载入示例配置'); await wait(450);
      outTab('提交到后端'); await wait(300);
      if (submitBtn()) submitBtn().click();
      await wait(450);
      ok('file:// 下提交被拦截且给出错误', body().indexOf('FILE_PROTOCOL') >= 0);
      ok('file:// 拦截时未发请求', window.__QL_FETCH_CALLS.length === n0);
      ok('提供「仍然尝试」入口', !!q('.submit-pane .status-box .btn'));

      window.__QL_FETCH_MODE = 'ok';
      const force = q('.submit-pane .status-box .btn'); if (force) force.click();
      await wait(500);
      ok('强制尝试后发起一次请求', window.__QL_FETCH_CALLS.length === n0 + 1,
        window.__QL_FETCH_CALLS.length + ' 次');
      const last = window.__QL_FETCH_CALLS[window.__QL_FETCH_CALLS.length - 1];
      ok('请求方法是 POST', !!last && last.opts.method === 'POST');
      ok('请求体就是完整生成的 JSON', !!last && last.opts.body.indexOf('"items"') >= 0);
      ok('请求头 Content-Type 为 application/json',
        !!last && last.opts.headers['Content-Type'] === 'application/json;charset=utf-8');
      ok('显式跨域且不带凭据', !!last && last.opts.mode === 'cors' && last.opts.credentials === 'omit');
      ok('提交成功有状态提示', body().indexOf('提交成功') >= 0);

      // 页面输入覆盖编译期默认值
      const urlInput = q('.submit-pane .sp-url');
      if (urlInput) {
        urlInput.value = 'https://cfg.example.com/api/config';
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await wait(350);
      ok('自定义 URL 生效', body().indexOf('https://cfg.example.com/api/config') >= 0);
      ok('显示页面输入优先标记', body().indexOf('页面输入（优先）') >= 0);

      outTab('生成的 JSON'); await wait(350);
      ok('提交失败/成功后本地 JSON 生成仍正常', code().indexOf('"items"') >= 0);

      // 筛选态下把条目的 type 改掉，筛选应跟着走，不让条目凭空消失
      tab('条目'); await wait(300);
      const ap2 = byTypeLabel('app'); if (ap2) ap2.click(); await wait(300);
      const row2 = q('.items-scroll .list-item'); if (row2) row2.click(); await wait(250);
      const wh2 = qa('.type-card').find(x => x.textContent.indexOf('webhook') >= 0);
      if (wh2) wh2.click();
      await wait(450);
      ok('改 type 后筛选自动跟随到新类型',
        !!byTypeLabel('webhook') && byTypeLabel('webhook').classList.contains('active'));
      ok('改 type 后条目仍在可见列表里', !!q('.items-scroll .list-item.active'));

      /* ---------------- 导入：全量覆盖 / 合并模式 / 撤销 ---------------- */
      topBtn('载入示例配置'); await wait(450);
      const total0 = itemCount();
      ok('合并测试前重置为示例配置', total0 === 23, String(total0));

      const mergeText = JSON.stringify({
        name: 'SHOULD-NOT-APPEAR', version: 99,
        items: [
          { id: 'notepad', name: '冲突条目-新', type: 'cmd', target: 'ipconfig /all' },
          { id: 'ql-merge-new-1', name: '新条目一', type: 'app', target: 'a.exe' },
          { id: 'ql-merge-new-2', name: '新条目二', type: 'folder', target: '.' }
        ],
        groups: [{ id: 'ql-merge-group', name: '新分组' }],
        schedules: [{ run: 'notepad', every: '1h' }]
      });
      const paste = txt => {
        const ta = q('.import-modal textarea');
        if (ta) { ta.value = txt; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      };

      topBtn('导入 config.json'); await wait(320);
      ok('导入弹窗已打开', !!q('.import-modal'));
      ok('默认选中「清空原有，全量覆盖」', q('#import-mode-replace')?.checked === true);
      ok('默认不显示合并冲突策略', !q('.merge-policy'));

      q('#import-mode-merge').click(); await wait(320);
      ok('切到合并模式后出现两种冲突策略', !!q('#merge-policy-keep') && !!q('#merge-policy-replace'));
      ok('冲突策略默认「保留原有」', q('#merge-policy-keep')?.checked === true);
      ok('按钮文案变成「执行合并」', (q('#do-import-btn')?.textContent || '').indexOf('执行合并') >= 0);

      paste(mergeText); await wait(420);
      ok('合并预览出现', !!q('.merge-preview'));
      ok('预览显示新增 4 项', (q('.merge-preview')?.innerText || '').indexOf('新增 4') >= 0,
        (q('.merge-preview')?.innerText || '').slice(0, 90));
      ok('预览列出冲突 ID', !!q('.mp-chip') && (q('.mp-chip')?.innerText || '').indexOf('notepad') >= 0);
      ok('预览只读，编辑区未被改动', itemCount() === total0, itemCount() + '/' + total0);

      q('#do-import-btn').click(); await wait(520);
      ok('合并后弹窗关闭', !q('.import-modal'));
      ok('合并后条目数 = 原数 + 2', itemCount() === total0 + 2, itemCount() + '/' + total0);
      ok('合并后 JSON 含新条目', code().indexOf('ql-merge-new-1') >= 0 && code().indexOf('ql-merge-new-2') >= 0);
      ok('keep 策略保留原有冲突条目', code().indexOf('冲突条目-新') < 0);
      ok('合并后顶层 name 不被改写', code().indexOf('SHOULD-NOT-APPEAR') < 0);
      ok('合并后无 ID 的定时任务被追加', code().indexOf('"every": "1h"') >= 0);
      ok('合并后出现撤销按钮', !!q('#undo-merge-btn'));
      ok('合并后类型筛选重置为「全部」', !!byTypeLabel('全部') && byTypeLabel('全部').classList.contains('active'));

      q('#undo-merge-btn').click(); await wait(520);
      ok('撤销后条目数恢复', itemCount() === total0, itemCount() + '/' + total0);
      ok('撤销后新条目消失', code().indexOf('ql-merge-new-1') < 0);
      ok('撤销后撤销按钮消失', !q('#undo-merge-btn'));

      // 另一种冲突策略
      topBtn('导入 config.json'); await wait(320);
      q('#import-mode-merge').click(); await wait(320);
      q('#merge-policy-replace').click(); await wait(250);
      paste(mergeText); await wait(420);
      ok('预览随策略切换提示整条覆盖', (q('.merge-preview')?.innerText || '').indexOf('整条覆盖') >= 0);
      q('#do-import-btn').click(); await wait(520);
      ok('replace 策略用新配置覆盖冲突条目', code().indexOf('冲突条目-新') >= 0);
      ok('replace 策略仍保留顶层字段', code().indexOf('SHOULD-NOT-APPEAR') < 0);
      q('#undo-merge-btn').click(); await wait(520);
      ok('replace 合并也可撤销', itemCount() === total0);

      // 合并后又编辑过 → 撤销必须先确认，避免静默吞掉新工作
      topBtn('导入 config.json'); await wait(320);
      q('#import-mode-merge').click(); await wait(320);
      paste(mergeText); await wait(350);
      q('#do-import-btn').click(); await wait(500);
      const afterMerge3 = itemCount();
      const addBtn = qa('.sidebar .panel-foot button').find(b => b.textContent.indexOf('新增条目') >= 0);
      if (addBtn) addBtn.click();
      await wait(380);
      let confirmText = '';
      const origConfirm = window.confirm;
      window.confirm = msg => { confirmText = String(msg); return false; };
      q('#undo-merge-btn').click(); await wait(380);
      ok('合并后又编辑时撤销会先弹确认', confirmText.indexOf('一并回退') >= 0, confirmText.slice(0, 60));
      ok('取消确认后不撤销', itemCount() === afterMerge3 + 1, itemCount() + '/' + afterMerge3);
      window.confirm = () => true;
      q('#undo-merge-btn').click(); await wait(450);
      ok('确认后完成撤销', itemCount() === total0, itemCount() + '/' + total0);
      window.confirm = origConfirm;

      // 原来的全量覆盖行为必须原样保留
      topBtn('导入 config.json'); await wait(320);
      ok('重开弹窗仍默认全量覆盖', q('#import-mode-replace')?.checked === true);
      paste(JSON.stringify({ name: 'FULL', version: 7, items: [{ id: 'only-one', name: '唯一条目', type: 'app', target: 'x.exe' }] }));
      await wait(350);
      ok('全量覆盖模式不显示合并预览', !q('.merge-preview'));
      q('#do-import-btn').click(); await wait(520);
      ok('全量覆盖后条目数等于导入文件', itemCount() === 1, String(itemCount()));
      ok('全量覆盖会采用导入文件的顶层字段', code().indexOf('"FULL"') >= 0);
      ok('全量覆盖会清掉旧撤销点', !q('#undo-merge-btn'));

      // 解析失败不能改动编辑区
      topBtn('导入 config.json'); await wait(320);
      paste('{ broken json'); await wait(300);
      q('#do-import-btn').click(); await wait(380);
      ok('JSON 解析失败给出提示', body().indexOf('JSON 解析失败') >= 0);
      ok('解析失败不改动编辑区', itemCount() === 1);
      const cancel = qa('.import-modal .modal-foot .btn').find(b => b.textContent.indexOf('取消') >= 0);
      if (cancel) cancel.click();
      await wait(300);
      topBtn('载入示例配置'); await wait(400);

      /* ---------------- multipart 编辑器 / 动态值口径 ---------------- */
      outTab('生成的 JSON'); await wait(320);
      const mpImport = {
        name: 'MPTEST', version: 1,
        items: [{ id: 'up', name: '上传测试', type: 'webhook', target: 'https://api.example.com/upload', method: 'POST' }]
      };
      topBtn('导入 config.json'); await wait(320);
      paste(JSON.stringify(mpImport)); await wait(300);
      q('#do-import-btn').click(); await wait(520);
      ok('导入单条 webhook 用于 multipart 测试', itemCount() === 1 && code().indexOf('MPTEST') >= 0);

      const mpRow = () => qa('.editor-panel .field-row').find(r => (r.querySelector('.field-key')?.textContent || '').trim() === 'multipart');
      const mpTabs = () => qa('.mpart-editor .seg button');
      const cfg = () => { try { return JSON.parse(code()) } catch (e) { return null } };
      ok('webhook 编辑区含 multipart 字段', !!mpRow());
      ok('multipart 默认不写入', mpRow()?.classList.contains('is-off') === true);
      mpRow().querySelector('.include-toggle').click(); await wait(420);
      ok('打开开关后出现 multipart 编辑器', !!q('.mpart-editor'));
      ok('三种写法按钮齐全', mpTabs().length === 3, mpTabs().length + ' 个');
      ok('默认选中「完整式」', mpTabs()[0]?.classList.contains('active') === true);
      ok('JSON 预览可解析', !!cfg());
      const mp0 = cfg()?.items?.[0]?.multipart;
      ok('完整式输出 fields + files', !!mp0 && Array.isArray(mp0.files) && ('fields' in mp0), JSON.stringify(mp0));

      mpTabs()[1].click(); await wait(380);
      ok('切到「单文件」写法', mpTabs()[1].classList.contains('active'));
      const mp1 = cfg()?.items?.[0]?.multipart;
      ok('单文件写法输出扁平对象（无 fields / files）',
        !!mp1 && !Array.isArray(mp1) && !('files' in mp1) && !('fields' in mp1), JSON.stringify(mp1));

      mpTabs()[2].click(); await wait(380);
      ok('切到「文件数组」写法', mpTabs()[2].classList.contains('active'));
      ok('数组写法输出数组', Array.isArray(cfg()?.items?.[0]?.multipart), JSON.stringify(cfg()?.items?.[0]?.multipart));

      mpTabs()[0].click(); await wait(380);
      ok('切回「完整式」恢复 fields / files', Array.isArray(cfg()?.items?.[0]?.multipart?.files));
      ok('文件子表含 4 个输入', qa('.mpart-editor .mpart-file-grid .mpart-cell input').length === 4);
      const pathInput = qa('.mpart-editor .mpart-file-grid .mpart-cell input')[1];
      pathInput.value = 'D:/pic.png';
      pathInput.dispatchEvent(new Event('input', { bubbles: true }));
      await wait(420);
      ok('填 path 后 JSON 实时更新', code().indexOf('pic.png') >= 0);

      const addFileBtn = qa('.mpart-editor .mpart-sub button').find(b => b.textContent.indexOf('添加文件') >= 0);
      addFileBtn.click(); await wait(380);
      ok('添加文件后出现 2 张文件卡片', qa('.mpart-editor .sub-card').length === 2, qa('.mpart-editor .sub-card').length + ' 张');
      outTab('校验'); await wait(380);
      ok('新文件缺 path 触发校验提示', body().indexOf('缺 path') >= 0);
      outTab('生成的 JSON'); await wait(350);

      // 导入一份「单文件简写」配置，验证编辑器能自动识别已有写法、不擅自改写
      const singleImport = { name: 'MPSINGLE', items: [{ id: 'up2', name: '上传2', type: 'webhook', target: 'https://x', multipart: { field: 'f', file: 'a.png' } }] };
      topBtn('导入 config.json'); await wait(320);
      paste(JSON.stringify(singleImport)); await wait(300);
      q('#do-import-btn').click(); await wait(520);
      ok('导入单文件简写后自动识别写法', mpTabs()[1]?.classList.contains('active') === true,
        'active=' + mpTabs().findIndex(b => b.classList.contains('active')));
      const mp2 = cfg()?.items?.[0]?.multipart;
      ok('导入的 file 别名原样保留', !!mp2 && !Array.isArray(mp2) && mp2.file === 'a.png', JSON.stringify(mp2));

      tab('字段速查'); await wait(400);
      ok('速查含 file 系列动态值', body().indexOf('{{#filebase64:路径}}') >= 0);
      ok('速查口径为 headers 与 body 都展开', body().indexOf('headers 与 body 都展开') >= 0);
      ok('速查不再出现「只展开请求头」', body().indexOf('只展开请求头') < 0);
      ok('速查生效字段列了 multipart', body().indexOf('multipart') >= 0);
    } catch (e) {
      R.push('FAIL | 脚本异常 | ' + (e && e.message ? e.message : e));
    }
    const pre = document.getElementById('TEST_RESULT');
    pre.textContent = R.join('\\n');
    pre.setAttribute('data-done', '1');
  });
})();
</script>
`

const html = fs.readFileSync(distFile, 'utf-8')
const tmp = path.join(os.tmpdir(), 'ql-ui-check.html')
// 每次都从干净状态开始：清掉 localStorage，否则上一轮交互留下的改动会污染下一轮
const clean = html.replace('<head>', '<head><script>try{localStorage.clear()}catch(e){}</script>')
fs.writeFileSync(tmp, clean.replace('</body>', inject + '</body>'), 'utf-8')

let dom = ''
try {
  dom = execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + path.join(os.tmpdir(), 'ql-ui-check-profile-' + Date.now()),
    '--virtual-time-budget=45000', '--dump-dom',
    'file:///' + tmp.replace(/\\/g, '/')
  ], { encoding: 'utf-8', maxBuffer: 30 * 1024 * 1024, timeout: 90000, stdio: ['ignore', 'pipe', 'ignore'] })
} catch (e) {
  console.error('浏览器执行失败：' + e.message)
  process.exit(1)
}

const m = dom.match(/<pre id="TEST_RESULT"[^>]*>([\s\S]*?)<\/pre>/)
if (!m) { console.error('没有拿到测试结果（页面可能没渲染）'); process.exit(1) }
const lines = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').split('\n').filter(Boolean)
lines.forEach(l => console.log('  ' + l))
const failed = lines.filter(l => l.startsWith('FAIL'))
console.log(`\n浏览器交互检查：${lines.length - failed.length} 通过 / ${failed.length} 失败`)
if (failed.length) process.exitCode = 1
