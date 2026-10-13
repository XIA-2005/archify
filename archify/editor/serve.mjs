#!/usr/bin/env node
// Optional, localhost-only visual editor for existing Archify architecture candidates.
// The canonical renderer, candidate and delivery evidence stay under Archify's control.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderArchifyRoutes } from './route-preview.mjs';
import { createRoutePreviewPipeline } from './route-preview-cache.mjs';

const root = fs.realpathSync.native(process.cwd());
const editorDir = path.dirname(fileURLToPath(import.meta.url));
const cli = process.env.ARCHIFY_CLI
  ? path.resolve(process.env.ARCHIFY_CLI)
  : path.resolve(editorDir, '../bin/archify.mjs');
if (!fs.existsSync(cli)) {
  console.error('Cannot locate Archify. Set ARCHIFY_CLI to the full path to Archify/bin/archify.mjs.');
  process.exit(1);
}
const requested = process.argv[2];
if (!requested || process.argv.includes('--help')) {
  console.log('用法: node <archify>/editor/serve.mjs <candidate.json>（在项目根目录使用 Bash 执行）');
  process.exit(requested ? 0 : 1);
}
const extra = process.argv.slice(3);
if (extra.length && (extra.length !== 2 || extra[0] !== '--repo-root')) {
  throw new Error('Only --repo-root <directory> is supported after the candidate path.');
}
const repoRoot = extra.length ? fs.realpathSync.native(path.resolve(extra[1])) : root;
const input = fs.realpathSync.native(path.resolve(root, requested));
const inside = (p) => p === root || p.startsWith(root + path.sep);
if (!inside(input) || !fs.statSync(input, { throwIfNoEntry: false })?.isFile()) {
  console.error('候选文件必须位于当前项目目录内，且已存在。');
  process.exit(1);
}
const canonical = JSON.parse(fs.readFileSync(input, 'utf8'));
if (canonical.diagram_type !== 'architecture' || canonical.schema_version !== 1) {
  console.error('可视化编辑器目前仅支持 architecture / schema_version 1。');
  process.exit(1);
}
const output = path.resolve(root, canonical.meta.output);
const outputParent = fs.realpathSync.native(path.dirname(output));
const existingOutput = fs.existsSync(output) ? fs.realpathSync.native(output) : output;
if (!inside(output) || !inside(outputParent) || !inside(existingOutput)
  || !output.toLowerCase().endsWith('.html')) {
  console.error('候选图的 meta.output 不在当前项目目录内。');
  process.exit(1);
}
const originalMeta = { output: canonical.meta.output, repository: canonical.meta.repository };
const routePipeline = createRoutePreviewPipeline((candidate, { signal }) =>
  renderArchifyRoutes({
    candidate, cli, cwd: root, repoRoot, repositoryBacked: Boolean(candidate.meta.repository), signal,
  }));
const token = randomBytes(20).toString('hex');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (res, code, body) => respond(res, code, JSON.stringify(body), 'application/json; charset=utf-8');
function respond(res, code, body, mime) {
  res.writeHead(code, {
    'Content-Type': mime,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.end(body);
}
const stamp = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + randomBytes(3).toString('hex');
function runCli(args) {
  if (canonical.meta.repository && !args.includes('--repo-root')) args.push('--repo-root', repoRoot);
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 5_000_000,
    windowsHide: true,
  });
  let parsed;
  try { parsed = JSON.parse(result.stdout?.trim() || '{}'); } catch { parsed = {}; }
  return {
    renderOk: result.status === 0,
    // 'validate' emits {ok:true} without 'status'; 'finalize' emits both.
    ok: result.status === 0 && parsed.ok === true && (!parsed.status || parsed.status === 'pass'),
    receipt: parsed,
    message: (parsed.diagnostics || []).map((v) => v.message).slice(0, 6).join('；')
      || result.error?.message || result.stderr?.slice(-700) || '校验未通过',
  };
}
async function onImagePreview(req, res) {
  let temporary, preview;
  try {
    const candidate = await readJSON(req);
    if (!validCandidateMetadata(candidate)) return json(res, 400, {ok:false,message:'预览元数据不合法'});
    temporary = path.join(path.dirname(input), `candidate.image-${stamp()}.json`);
    preview = path.join(path.dirname(input), `image-preview-${stamp()}.html`);
    fs.writeFileSync(temporary, JSON.stringify(candidate), {flag:'wx'});
    const rendered = runCli(['render','architecture',temporary,preview,'--quality',
      candidate.meta?.quality_profile === 'standard' ? 'standard' : 'showcase']);
    // render emits text, rather than a JSON receipt; its exit code is authoritative.
    if (!rendered.renderOk) return json(res, 422, {ok:false,message:rendered.message});
    const html = fs.readFileSync(preview,'utf8');
    return json(res,200,{ok:true,html,status:'draft-render',message:'正式渲染器生成的草稿，尚未完成 finalize 和视觉验收'});
  } catch(error) { return json(res,422,{ok:false,message:error.message}); }
  finally {
    for (const file of [temporary,preview]) if(file) try { fs.unlinkSync(file); } catch {}
  }
}
async function readJSON(req) {
  const chunks=[];let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>2_000_000)throw Error('JSON 超出 2 MB 限制');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function validCandidateMetadata(next) {
  return next && Array.isArray(next.components) && (next.connections===undefined||Array.isArray(next.connections))
    && next.diagram_type === 'architecture' && next.schema_version === 1
    && next.meta?.output === originalMeta.output
    && JSON.stringify(next.meta?.repository) === JSON.stringify(originalMeta.repository);
}
async function onRoutePreview(req, res) {
  const controller = new AbortController();
  res.once('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const candidate = await readJSON(req);
    if (!validCandidateMetadata(candidate)) {
      return json(res, 400, {ok:false,message:'预览输入格式或元数据不合法'});
    }
    const result = await routePipeline.get(candidate, { signal: controller.signal });
    if (!res.destroyed) json(res, 200, {ok:true,source:'archify-render',...result});
  } catch (error) {
    if (!res.destroyed) json(res, error.code === 'PREVIEW_BUSY' ? 429 : 422,
      {ok:false,message:error.message});
  }
}
let busy = false;
async function onSave(req, res) {
  if (busy) return json(res, 423, { ok: false, message: '正在生成中，请勿重复保存。' });
  busy = true;
  let temporary;
  try {
    const request = await readJSON(req);
    const currentBytes = fs.readFileSync(input);
    if (hash(currentBytes) !== request.expectedHash) {
      return json(res, 409, { ok: false, message: 'candidate.json 已被其他程序更改，请刷新编辑器后重试，或先导出当前修改。' });
    }
    const next = request.candidate;
    if (!validCandidateMetadata(next)) {
      return json(res, 400, { ok: false, message: '架构类型、输出路径或仓库标识不允许变更。' });
    }
    if (JSON.stringify(next).length > 1_000_000) {
      return json(res, 413, { ok: false, message: '图内容超出 1 MB 限制。' });
    }
    temporary = path.join(path.dirname(input), `candidate.editor-${stamp()}.json`);
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' });
    // Gate content and composition BEFORE changing the user's canonical file.
    const quality = next.meta?.quality_profile === 'standard' ? 'standard' : 'showcase';
    const validation = runCli(['validate', 'architecture', temporary, '--quality', quality, '--json']);
    if (!validation.ok) {
      return json(res, 422, { ok: false, stage: 'validate', message: validation.message,
        note: '原始文件未更改。可调整布局；大型自由排布画布可在右侧把质量档位切为 standard 再保存。' });
    }
    if (hash(fs.readFileSync(input)) !== request.expectedHash) {
      return json(res, 409, { ok: false, message: '在校验期间文件已变化，请先刷新或导出草稿。' });
    }
    const backup = path.join(path.dirname(input), `candidate.backup-${stamp()}.json`);
    fs.copyFileSync(input, backup, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temporary, input);
    temporary = undefined;
    const latestHash = hash(fs.readFileSync(input));
    const receiptFolder = path.join(path.dirname(input), `editor-review-${stamp()}`);
    const finalization = runCli(['finalize', 'architecture', input, output,
      '--quality', quality, '--out-dir', receiptFolder, '--json']);
    if (!finalization.ok) {
      return json(res, 500, { ok: false, stage: 'finalize', saved: true, expectedHash: latestHash,
        message: 'JSON 已保存，但 HTML 完整交付检查未通过：' + finalization.message,
        backup, note: '已保留保存前的 JSON 备份。请根据检查报告修复，勿将旧 HTML 当作通过验证的新版本。' });
    }
    json(res, 200, { ok: true, expectedHash: latestHash, backup,
      message: 'JSON 已保存；Archify 的 validate、deliver、check、browser-check 全部通过。' });
  } catch (error) {
    json(res, 500, { ok: false, message: error.message });
  } finally {
    if (temporary) try { fs.unlinkSync(temporary); } catch {}
    busy = false;
  }
}
const html = fs.readFileSync(path.join(editorDir, 'editor.html'), 'utf8');
const server = http.createServer((req, res) => {
  const base = `/${token}`;
  const route = req.url?.split('?')[0];
  const host = `127.0.0.1:${server.address().port}`;
  if (req.headers.host !== host || !route?.startsWith(base)) {
    return json(res, 404, { ok: false, message: 'Not found' });
  }
  if (req.method === 'GET' && (route === base || route === base + '/')) {
    return respond(res, 200, html, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && (route === base + '/drawio-frame.html'
      || route === base + '/drawio-adapter.mjs' || route.startsWith(base + '/vendor/drawio/'))) {
    const relative = route.slice(base.length + 1);
    const file = path.resolve(editorDir, relative);
    const vendorRoot = path.join(editorDir, 'vendor', 'drawio');
    const permitted = relative === 'drawio-frame.html' || relative === 'drawio-adapter.mjs'
      || (file.startsWith(vendorRoot + path.sep) && fs.existsSync(file)
        && fs.realpathSync.native(file).startsWith(vendorRoot + path.sep));
    if (!permitted || !fs.statSync(file, {throwIfNoEntry:false})?.isFile())
      return json(res,404,{ok:false,message:'Not found'});
    const mime = {'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript',
      '.css':'text/css','.xml':'application/xml','.txt':'text/plain','.png':'image/png',
      '.woff2':'font/woff2'}[path.extname(file)] || 'application/octet-stream';
    return respond(res,200,fs.readFileSync(file),mime);
  }
  if (req.method === 'GET' && route === base + '/orthogonal-tools.mjs') {
    return respond(res, 200, fs.readFileSync(path.join(editorDir, 'orthogonal-tools.mjs')),
      'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && route === base + '/scene-normalize.mjs') {
    return respond(res,200,fs.readFileSync(path.join(editorDir,'scene-normalize.mjs')),'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && route === base + '/batch-fonts.mjs') {
    return respond(res,200,fs.readFileSync(path.join(editorDir,'batch-fonts.mjs')),'text/javascript; charset=utf-8');
  }
  const sharedModule=route?.slice((base+'/shared/').length);
  if(req.method==='GET'&&route?.startsWith(base+'/shared/')&&['text-style.mjs','text-fit.mjs','utils.mjs','i18n.mjs','architecture-position.mjs'].includes(sharedModule)) {
    return respond(res,200,fs.readFileSync(path.join(editorDir,'../renderers/shared',sharedModule)),'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && route === base + '/auto-layout.mjs') {
    return respond(res, 200, fs.readFileSync(path.join(editorDir, 'auto-layout.mjs')),
      'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && route === base + '/large-graph.mjs') {
    return respond(res, 200, fs.readFileSync(path.join(editorDir, 'large-graph.mjs')),
      'text/javascript; charset=utf-8');
  }
  if (req.method === 'GET' && route === base + '/api/spec') {
    try {
      const raw = fs.readFileSync(input);
      const candidate=JSON.parse(raw);
      if(!validCandidateMetadata(candidate))return json(res,422,{ok:false,message:'候选文件结构或受保护元数据不合法'});
      return json(res, 200, { candidate, expectedHash: hash(raw), target: output, input });
    } catch(error) {
      return json(res, error.code==='ENOENT'?404:error instanceof SyntaxError?422:500,
        {ok:false,message:error.message});
    }
  }
  if (req.method === 'GET' && route === base + '/original') {
    if (!fs.existsSync(output)) return respond(res, 404, 'Original HTML not found', 'text/plain');
    return respond(res, 200, fs.readFileSync(output), 'text/html; charset=utf-8');
  }
  if (req.method === 'POST' && route === base + '/api/save') {
    if (req.headers.origin !== `http://${host}` || req.headers['x-archify-editor'] !== '1'
      || !req.headers['content-type']?.startsWith('application/json')) {
      return json(res, 403, { ok: false, message: 'Unauthorized origin' });
    }
    return void onSave(req, res);
  }
  if (req.method === 'POST' && (route === base + '/api/routes' || route === base + '/api/image-preview')) {
    if (req.headers.origin !== 'http://' + host || req.headers['x-archify-editor'] !== '1'
      || !req.headers['content-type']?.startsWith('application/json')) {
      return json(res, 403, { ok: false, message: 'Unauthorized origin' });
    }
    return route === base + '/api/routes' ? void onRoutePreview(req, res) : void onImagePreview(req, res);
  }
  json(res, 404, { ok: false, message: 'Not found' });
});
server.listen(0, '127.0.0.1', () => {
  console.log('\nArchify 可视化编辑器已启动（仅本机访问）：');
  console.log(`http://127.0.0.1:${server.address().port}/${token}/`);
  console.log('项目：' + input);
  console.log('在浏览器打开上面的地址。Ctrl+C 结束编辑器。');
});
