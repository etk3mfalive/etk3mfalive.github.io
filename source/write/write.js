/* ============================================================================
 * SelfWeb 写作控制台
 * ----------------------------------------------------------------------------
 * 移植自旧站（SvelteKit 版）的写入链路，改成不依赖构建工具的原生 JS，
 * 并且把内容格式从「config.json + index.md」改成 Hexo 的「单文件 + frontmatter」。
 *
 * 安全模型（与旧站一致）：
 *   - GitHub App 私钥只存在于浏览器内存（可选：口令加密后存 sessionStorage）
 *   - 私钥仅用于在本地签一个 RS256 JWT，签名结果发给 GitHub 换 installation token
 *   - 私钥本身永远不会被发送到任何服务器
 * ========================================================================== */

'use strict';

/* ---------------------------------------------------------------- 配置 */

const CFG = {
  owner: 'etk3mfalive',
  repo: 'soq-blog',
  branch: 'main',
  appId: '3171094',
  postsDir: 'source/_posts',
  uploadDir: 'source/images/uploads',
  uploadPublicBase: '/images/uploads'
};

const GH_API = 'https://api.github.com';
const COMMON_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28'
};

/* ------------------------------------------------------- 编码 / PEM 解析 */

function b64urlFromBytes(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlFromString(s) {
  return b64urlFromBytes(new TextEncoder().encode(s));
}
function pemToBytes(pem) {
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function derLength(len) {
  if (len < 0x80) return [len];
  const bytes = [];
  let v = len;
  while (v > 0) { bytes.unshift(v & 0xff); v >>= 8; }
  return [0x80 | bytes.length, ...bytes];
}
function concatBytes(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
/** GitHub App 下载的私钥通常是 PKCS#1，而 WebCrypto 只吃 PKCS#8，这里内存里包一层 */
function pkcs1ToPkcs8(pkcs1) {
  const algId = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const octet = concatBytes(new Uint8Array([0x04, ...derLength(pkcs1.length)]), pkcs1);
  const seq = concatBytes(version, algId, octet);
  return concatBytes(new Uint8Array([0x30, ...derLength(seq.length)]), seq);
}
async function importPrivateKey(pem) {
  const isPkcs1 = /BEGIN RSA PRIVATE KEY/.test(pem);
  const bytes = pemToBytes(pem);
  const der = isPkcs1 ? pkcs1ToPkcs8(bytes) : bytes;
  return crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
}
/** 生成 GitHub App 用的 RS256 JWT（iat = now-60s，exp = now+8min） */
async function signAppJwt(appId, pem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - 60, exp: now + 8 * 60, iss: appId };
  const key = await importPrivateKey(pem);
  const input = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return `${input}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

/* ------------------------------------------------------------- base64 工具 */

function toBase64Utf8(input) {
  const bytes = new TextEncoder().encode(input);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function fromBase64Utf8(input) {
  const bin = atob(input.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function readFileAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = rej;
    r.readAsText(file);
  });
}
function fileToBase64NoPrefix(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || '').replace(/^data:[^;]+;base64,/, ''));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
async function hashFileSHA256(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex.slice(0, 16);
}
function getFileExt(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i);
}

/* ------------------------------------------- 私钥的口令加密缓存（可选） */

const CACHE_KEY = 'selfweb.write.key.v1';

async function deriveAesKey(passphrase, salt) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function cacheEncryptedKey(pem, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(pem));
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({
    salt: toBase64Utf8(String.fromCharCode(...salt)),
    iv: toBase64Utf8(String.fromCharCode(...iv)),
    ct: toBase64Utf8(String.fromCharCode(...new Uint8Array(ct)))
  }));
}
function bytesFromB64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function readCachedKey(passphrase) {
  const raw = sessionStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const { salt, iv, ct } = JSON.parse(raw);
    const key = await deriveAesKey(passphrase, bytesFromB64(salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytesFromB64(iv) }, key, bytesFromB64(ct));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ GitHub API */

let token = null;
let authExpiredHandler = null;

async function gh(path, init = {}, opts = {}) {
  const headers = { ...COMMON_HEADERS, ...(init.headers || {}) };
  if (opts.auth) headers.Authorization = `Bearer ${opts.auth}`;
  if (init.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(GH_API + path, { ...init, headers });
  if (opts.allow404 && res.status === 404) return null;
  if (!res.ok) {
    if (res.status === 401 && authExpiredHandler) authExpiredHandler();
    let body = null;
    try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
    const detail = body && typeof body === 'object' && 'message' in body ? body.message : res.statusText;
    throw new Error(`GitHub API ${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined;
  return res.json();
}

async function getInstallationId(jwt) {
  const d = await gh(`/repos/${CFG.owner}/${CFG.repo}/installation`, {}, { auth: jwt });
  return d.id;
}
async function createInstallationToken(jwt, id) {
  const d = await gh(`/app/installations/${id}/access_tokens`, { method: 'POST' }, { auth: jwt });
  return d.token;
}
async function getRef() {
  const d = await gh(`/repos/${CFG.owner}/${CFG.repo}/git/ref/${encodeURIComponent('heads/' + CFG.branch)}`, {}, { auth: token });
  return d.object.sha;
}
async function createBlob(base64) {
  const d = await gh(`/repos/${CFG.owner}/${CFG.repo}/git/blobs`, {
    method: 'POST', body: JSON.stringify({ content: base64, encoding: 'base64' })
  }, { auth: token });
  return d.sha;
}
async function createTree(items, baseTree) {
  const d = await gh(`/repos/${CFG.owner}/${CFG.repo}/git/trees`, {
    method: 'POST', body: JSON.stringify({ tree: items, base_tree: baseTree })
  }, { auth: token });
  return d.sha;
}
async function createCommit(message, tree, parents) {
  const d = await gh(`/repos/${CFG.owner}/${CFG.repo}/git/commits`, {
    method: 'POST', body: JSON.stringify({ message, tree, parents })
  }, { auth: token });
  return d.sha;
}
async function updateRef(sha) {
  await gh(`/repos/${CFG.owner}/${CFG.repo}/git/refs/${encodeURIComponent('heads/' + CFG.branch)}`, {
    method: 'PATCH', body: JSON.stringify({ sha, force: false })
  }, { auth: token });
}
async function readTextFile(path) {
  const d = await gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(CFG.branch)}`, {}, { auth: token, allow404: true });
  if (!d || Array.isArray(d) || !d.content) return null;
  return fromBase64Utf8(d.content);
}
async function listDir(path) {
  const d = await gh(`/repos/${CFG.owner}/${CFG.repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(CFG.branch)}`, {}, { auth: token, allow404: true });
  if (!Array.isArray(d)) return [];
  return d.map(x => ({ name: x.name, path: x.path, type: x.type }));
}

/** 一次提交写入多个文件（sha: null 表示删除） */
async function commitFiles(items, message, log) {
  log('获取分支信息…');
  const base = await getRef();
  log('创建文件树…');
  const tree = await createTree(items, base);
  log('创建提交…');
  const commit = await createCommit(message, tree, [base]);
  log('更新分支…');
  await updateRef(commit);
  return commit;
}

/* -------------------------------------------------- frontmatter 读写 */

function yamlStr(v) {
  const s = String(v == null ? '' : v);
  if (s === '') return '""';
  if (/[:#\[\]{}&*!|>'"%@`,\n]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}
function unquote(s) {
  const t = String(s).trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return t;
}

/** 组装 Hexo 文章的完整文本 */
function buildPost(f) {
  const lines = ['---', `title: ${yamlStr(f.title)}`];
  const d = f.date || '';
  if (d) { lines.push(`date: ${d}`); lines.push(`updated: ${d}`); }
  const cats = (f.category || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
  if (cats.length) { lines.push('categories:'); cats.forEach(c => lines.push(`  - ${yamlStr(c)}`)); }
  if (f.tags.length) { lines.push('tags:'); f.tags.forEach(t => lines.push(`  - ${yamlStr(t)}`)); }
  if (f.summary) lines.push(`description: ${yamlStr(f.summary)}`);
  if (f.cover) lines.push(`cover: ${f.cover}`);
  // 正文里有公式才打开数学渲染。
  // 注意 NexT 的判定键名固定是 `mathjax`（即使渲染器用 KaTeX），写 katex 不生效。
  if (/\$[^$\n]+\$|\$\$[\s\S]+?\$\$/.test(f.body || '')) lines.push('mathjax: true');
  lines.push('comments: true');
  lines.push('---', '');
  return lines.join('\n') + (f.body || '') + '\n';
}

/** 解析已有文档的 frontmatter（只认我们自己生成的这套格式） */
function parsePost(text) {
  const out = { title: '', date: '', category: '', tags: [], summary: '', cover: '', body: text };
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return out;
  out.body = text.slice(m[0].length);
  let listKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const listItem = raw.match(/^\s+-\s+(.*)$/);
    if (listItem && listKey) {
      out[listKey].push(unquote(listItem[1]));
      continue;
    }
    const kv = raw.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2];
    if (key === 'title') { out.title = unquote(val); listKey = null; }
    else if (key === 'date') { out.date = unquote(val).replace(' ', 'T').slice(0, 16); listKey = null; }
    else if (key === 'description') { out.summary = unquote(val); listKey = null; }
    else if (key === 'cover') { out.cover = unquote(val); listKey = null; }
    else if (key === 'categories') { listKey = '_cats'; out._cats = out._cats || []; }
    else if (key === 'tags') { listKey = 'tags'; }
    else listKey = null;
    if (listKey === '_cats' && val) { out._cats.push(unquote(val)); listKey = null; }
  }
  out.category = (out._cats || []).join(', ');
  return out;
}

/* ------------------------------------------------------------------ UI */

const $ = id => document.getElementById(id);
const state = { mode: 'create', originalSlug: null, posts: [], tags: [], open: null };

function showStatus(el, kind, msg) {
  const node = $(el);
  node.className = `status show ${kind}`;
  node.textContent = msg;
}
function hideStatus(el) { $(el).className = 'status'; }
function makeLogger(elId) {
  const node = $(elId);
  node.textContent = '';
  return msg => {
    const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    node.textContent += `[${t}] ${msg}\n`;
    node.scrollTop = node.scrollHeight;
  };
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ---------- 主题切换 ---------- */
const savedTheme = localStorage.getItem('write-theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$('theme-toggle').onclick = () => {
  const next = document.documentElement.dataset.theme === 'dark' ? '' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('write-theme', next);
};

/* ---------- 初始化表单默认值 ---------- */
$('owner').value = CFG.owner;
$('repo').value = CFG.repo;
$('branch').value = CFG.branch;
$('appid').value = CFG.appId;

/* ---------- 连接 ---------- */
$('pem-file').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  $('pem').value = await readFileAsText(file);
};

async function connect() {
  const log = makeLogger('auth-log');
  const btn = $('btn-connect');
  hideStatus('auth-status');
  btn.disabled = true;
  try {
    CFG.owner = $('owner').value.trim() || CFG.owner;
    CFG.repo = $('repo').value.trim() || CFG.repo;
    CFG.branch = $('branch').value.trim() || CFG.branch;
    CFG.appId = $('appid').value.trim() || CFG.appId;

    const passphrase = $('passphrase').value;
    let pem = $('pem').value.trim();

    if (!pem && passphrase) {
      log('尝试用口令解密已保存的私钥…');
      pem = (await readCachedKey(passphrase)) || '';
      if (pem) { $('pem').value = pem; log('私钥已从会话缓存中解密。'); }
      else log('会话中没有可解密的私钥，或口令不正确。');
    }
    if (!pem) throw new Error('请先选择 .pem 文件，或粘贴私钥内容');

    log('本地签名 RS256 JWT…');
    const jwt = await signAppJwt(CFG.appId, pem);

    log('查询 App 安装信息…');
    const installId = await getInstallationId(jwt);

    log('换取 installation token…');
    token = await createInstallationToken(jwt, installId);

    if (passphrase) {
      log('用口令加密私钥并存入本次会话…');
      try { await cacheEncryptedKey(pem, passphrase); log('已缓存。'); }
      catch (e) { log('缓存失败（不影响使用）：' + e.message); }
    }

    $('auth-state').textContent = '已连接 ✓';
    showStatus('auth-status', 'ok', `连接成功：${CFG.owner}/${CFG.repo} @ ${CFG.branch}`);
    $('list-panel').style.display = '';
    await loadPosts();
  } catch (err) {
    showStatus('auth-status', 'err', '连接失败：' + err.message);
    log('错误：' + err.message);
  } finally {
    btn.disabled = false;
  }
}
$('btn-connect').onclick = connect;
$('btn-forget').onclick = () => {
  sessionStorage.removeItem(CACHE_KEY);
  showStatus('auth-status', 'warn', '已清除本会话保存的私钥。');
};

/* ---------- 文章列表 ---------- */
async function loadPosts() {
  const log = makeLogger('save-log');
  const listHint = $('list-hint');
  listHint.textContent = '正在读取仓库中的文章列表…';
  hideStatus('save-status');
  try {
    const entries = await listDir(CFG.postsDir);
    const files = entries.filter(e => e.type === 'file' && /\.md$/i.test(e.name));
    state.posts = files.map(f => ({ slug: f.name.replace(/\.md$/i, ''), name: f.name, title: '', date: '' }));
    renderPosts();
    listHint.textContent = `共 ${state.posts.length} 篇。正在读取标题…`;

    // 并发拉取标题（限制 6 并发，避免打爆 API）
    let idx = 0;
    const workers = Array.from({ length: Math.min(6, state.posts.length) }, async () => {
      while (idx < state.posts.length) {
        const me = state.posts[idx++];
        try {
          const text = await readTextFile(`${CFG.postsDir}/${me.name}`);
          if (text) {
            const p = parsePost(text);
            me.title = p.title;
            me.date = p.date;
          }
        } catch { /* 单篇失败不影响其它 */ }
        renderPosts();
      }
    });
    await Promise.all(workers);
    listHint.textContent = `共 ${state.posts.length} 篇。`;
  } catch (err) {
    listHint.textContent = '';
    showStatus('save-status', 'err', '读取文章列表失败：' + err.message);
    log('错误：' + err.message);
  }
}

function renderPosts() {
  const kw = $('filter').value.trim().toLowerCase();
  const ul = $('posts');
  ul.innerHTML = '';
  const shown = state.posts.filter(p =>
    !kw || (p.title || '').toLowerCase().includes(kw) || p.slug.toLowerCase().includes(kw)
  );
  for (const p of shown) {
    const li = document.createElement('li');
    if (state.originalSlug === p.slug) li.className = 'active';
    li.innerHTML = `${esc(p.title || p.slug)}<span class="meta">${esc(p.slug)}${p.date ? ' · ' + esc(p.date.slice(0, 10)) : ''}</span>`;
    li.onclick = () => openPost(p.slug);
    ul.appendChild(li);
  }
  if (!shown.length) {
    ul.innerHTML = '<li style="cursor:default;color:var(--muted)">没有匹配的文章</li>';
  }
}
$('filter').oninput = renderPosts;
$('btn-refresh').onclick = () => { state.posts = []; loadPosts(); };
$('btn-new').onclick = () => newPost();

/* ---------- 打开 / 新建 ---------- */
function setTags(tags) {
  state.tags = [...new Set(tags.filter(Boolean))];
  const box = $('tag-chips');
  box.innerHTML = '';
  state.tags.forEach((t, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = t + ' ×';
    chip.title = '点击删除';
    chip.onclick = () => { state.tags.splice(i, 1); setTags(state.tags); };
    box.appendChild(chip);
  });
}
$('f-tag-input').onkeydown = e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const v = e.target.value.trim().replace(/,$/, '');
    if (v) { setTags([...state.tags, v]); e.target.value = ''; }
  }
};

function updateSlugPreview() {
  const slug = $('f-slug').value.trim();
  const d = $('f-date').value;
  if (!slug || !d) { $('slug-preview').textContent = ''; return; }
  const [y, m, day] = d.slice(0, 10).split('-');
  $('slug-preview').textContent = `网址将是： /${y}/${m}/${day}/${encodeURIComponent(slug)}/`;
}

function fillForm(p) {
  $('f-title').value = p.title || '';
  $('f-slug').value = p.slug || '';
  $('f-date').value = p.date || '';
  $('f-category').value = p.category || '';
  $('f-summary').value = p.summary || '';
  $('f-cover').value = p.cover || '';
  $('body').value = p.body || '';
  setTags(p.tags || []);
  updateSlugPreview();
  renderPreview();
}

async function openPost(slug) {
  const log = makeLogger('save-log');
  hideStatus('save-status');
  $('edit-panel').style.display = '';
  $('edit-title-label').textContent = '第三步 · 编辑';
  $('mode-badge').textContent = '编辑中：' + slug;
  showStatus('save-status', 'warn', '正在从仓库读取最新内容…');
  try {
    const text = await readTextFile(`${CFG.postsDir}/${slug}.md`);
    if (text == null) throw new Error('文件不存在');
    const p = parsePost(text);
    p.slug = slug;
    state.mode = 'edit';
    state.originalSlug = slug;
    fillForm(p);
    hideStatus('save-status');
    renderPosts();
    $('edit-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showStatus('save-status', 'err', '读取失败：' + err.message);
    log('错误：' + err.message);
  }
}

function newPost() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  state.mode = 'create';
  state.originalSlug = null;
  fillForm({ title: '', slug: '', date, category: '', tags: [], summary: '', cover: '', body: '' });
  $('edit-panel').style.display = '';
  $('edit-title-label').textContent = '第三步 · 新建';
  $('mode-badge').textContent = '新建文章';
  hideStatus('save-status');
  renderPosts();
  $('edit-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('btn-cancel').onclick = () => {
  $('edit-panel').style.display = 'none';
  state.mode = 'create';
  state.originalSlug = null;
  renderPosts();
};

/* ---------- 预览 ---------- */
function renderPreview() {
  const md = $('body').value;
  try {
    $('preview').innerHTML = window.marked ? window.marked.parse(md) : esc(md);
  } catch (e) {
    $('preview').textContent = '预览失败：' + e.message;
  }
}
$('body').oninput = renderPreview;
$('f-date').oninput = updateSlugPreview;
$('f-slug').oninput = updateSlugPreview;

/* ---------- 图片上传 ---------- */
async function uploadImages(files) {
  if (!token) { showStatus('save-status', 'err', '请先连接'); return; }
  const log = makeLogger('save-log');
  const list = [...files].filter(f => f.type.startsWith('image/'));
  if (!list.length) return;
  showStatus('save-status', 'warn', `正在上传 ${list.length} 张图片…`);
  try {
    const items = [];
    const inserted = [];
    for (const file of list) {
      const hash = await hashFileSHA256(file);
      const name = `${hash}${getFileExt(file.name).toLowerCase()}`;
      const repoPath = `${CFG.uploadDir}/${name}`;
      const b64 = await fileToBase64NoPrefix(file);
      const sha = await createBlob(b64);
      items.push({ path: repoPath, mode: '100644', type: 'blob', sha });
      inserted.push(`![${file.name}](${CFG.uploadPublicBase}/${name})`);
      log(`已准备图片 ${name}`);
    }
    await commitFiles(items, `上传图片: ${inserted.length} 张`, log);
    $('body').value += (($('body').value.endsWith('\n') || !$('body').value) ? '' : '\n') + inserted.join('\n') + '\n';
    renderPreview();
    showStatus('save-status', 'ok', `已上传 ${inserted.length} 张图片并插入正文（提交后约 1~2 分钟生效）`);
  } catch (err) {
    showStatus('save-status', 'err', '图片上传失败：' + err.message);
    log('错误：' + err.message);
  }
}
$('drop-zone').onclick = () => $('img-file').click();
$('img-file').onchange = e => { uploadImages(e.target.files); e.target.value = ''; };
const dz = $('drop-zone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('over');
  uploadImages(e.dataTransfer.files);
});

/* ---------- 保存 ---------- */
$('btn-save').onclick = async () => {
  const log = makeLogger('save-log');
  hideStatus('save-status');
  if (!token) { showStatus('save-status', 'err', '请先连接（第一步）'); return; }
  const btn = $('btn-save');
  btn.disabled = true;
  try {
    const title = $('f-title').value.trim();
    const slug = $('f-slug').value.trim();
    const body = $('body').value;
    if (!title) throw new Error('标题不能为空');
    if (!slug) throw new Error('文件名不能为空');
    if (!/^[A-Za-z0-9_\u4e00-\u9fa5-]+$/.test(slug)) throw new Error('文件名只能包含字母、数字、下划线、连字符和中文');
    if (!body.trim()) throw new Error('正文不能为空');

    const dateRaw = $('f-date').value;
    const date = dateRaw ? dateRaw.replace('T', ' ') + ':00' : '';

    const text = buildPost({
      title, date, body,
      category: $('f-category').value,
      tags: state.tags,
      summary: $('f-summary').value.trim(),
      cover: $('f-cover').value.trim()
    });

    showStatus('save-status', 'warn', '正在提交…');
    log('写入文件…');
    const blobSha = await createBlob(toBase64Utf8(text));
    const items = [{ path: `${CFG.postsDir}/${slug}.md`, mode: '100644', type: 'blob', sha: blobSha }];

    // 改名：把旧文件标记为删除
    if (state.mode === 'edit' && state.originalSlug && state.originalSlug !== slug) {
      items.push({ path: `${CFG.postsDir}/${state.originalSlug}.md`, mode: '100644', type: 'blob', sha: null });
      log(`将同时删除旧文件 ${state.originalSlug}.md`);
    }

    const message = state.mode === 'edit' ? `更新文章: ${slug}` : `新增文章: ${slug}`;
    const commit = await commitFiles(items, message, log);
    showStatus('save-status', 'ok', `提交成功 ✓ ${commit.slice(0, 7)}　Cloudflare Pages 正在重新构建，约 1~2 分钟后网站上就能看到。`);
    state.mode = 'edit';
    state.originalSlug = slug;
    $('mode-badge').textContent = '编辑中：' + slug;
    await loadPosts();
  } catch (err) {
    showStatus('save-status', 'err', '保存失败：' + err.message);
    log('错误：' + err.message);
  } finally {
    btn.disabled = false;
  }
};

/* ---------- 删除 ---------- */
$('btn-delete').onclick = async () => {
  const log = makeLogger('save-log');
  hideStatus('save-status');
  if (!token) { showStatus('save-status', 'err', '请先连接'); return; }
  const slug = state.originalSlug;
  if (!slug) { showStatus('save-status', 'warn', '这是新建中的文章，还没有提交过，无需删除。'); return; }
  if (!confirm(`确定删除「${slug}」吗？\n\n这会从仓库里删掉 ${CFG.postsDir}/${slug}.md，可以在 GitHub 上回滚。`)) return;
  try {
    showStatus('save-status', 'warn', '正在删除…');
    const commit = await commitFiles(
      [{ path: `${CFG.postsDir}/${slug}.md`, mode: '100644', type: 'blob', sha: null }],
      `删除文章: ${slug}`, log
    );
    showStatus('save-status', 'ok', `已删除 ✓ ${commit.slice(0, 7)}`);
    $('edit-panel').style.display = 'none';
    state.mode = 'create';
    state.originalSlug = null;
    await loadPosts();
  } catch (err) {
    showStatus('save-status', 'err', '删除失败：' + err.message);
    log('错误：' + err.message);
  }
};

/* ---------- 自动解锁（会话里已缓存私钥时） ---------- */
(async function boot() {
  if (sessionStorage.getItem(CACHE_KEY)) {
    showStatus('auth-status', 'warn', '检测到本次会话已保存私钥。输入口令后点「连接」即可解锁。');
  }
})();
