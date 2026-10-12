#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractArchifyRoutes } from './route-preview.mjs';

const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error('用法: node test-editor.mjs <存在的 architecture candidate.json>');
  process.exit(1);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-editor-e2e-'));
const candidatePath = path.join(dir, 'candidate.json');
const candidate = JSON.parse(fs.readFileSync(source,'utf8'));
candidate.meta.output = 'diagram.html';
fs.writeFileSync(candidatePath, JSON.stringify(candidate,null,2)+'\n');
const child = spawn(process.execPath,[fileURLToPath(new URL('./serve.mjs',import.meta.url)),'candidate.json'],{
  cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe'],
});
let fullOutput = '', errorOutput = '';
child.stdout.on('data',d=>fullOutput+=d.toString());
child.stderr.on('data',d=>errorOutput+=d.toString());
async function waitUrl() {
  const deadline = Date.now()+18000;
  while(Date.now()<deadline){
    const url=fullOutput.match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{40}\//)?.[0];
    if(url)return url;
    if(child.exitCode!==null)throw new Error('Server exited: '+errorOutput);
    await new Promise(r=>setTimeout(r,90));
  }
  throw new Error('Server did not start: '+fullOutput+' '+errorOutput);
}
let count=0;
try {
  const base=await waitUrl();
  const main=await fetch(base);assert.equal(main.status,200);
  const mainHtml=await main.text();
  assert.ok(mainHtml.includes('Archify · 可视化编辑器'));
  assert.ok(mainHtml.includes('连接节点'));
  assert.ok(mainHtml.includes('node-search') && mainHtml.includes('minimap-canvas'));
  assert.ok(!mainHtml.includes('id="font-scale"') && mainHtml.includes('id="line-scale"')
    && mainHtml.includes('fontProperty'), 'Missing independent font controls');
  const largeGraphModule=await fetch(base+'large-graph.mjs');
  assert.equal(largeGraphModule.status,200);
  assert.ok((await largeGraphModule.text()).includes('minimapProjection'));
  count++;console.log('PASS: 本机编辑界面与控件');
  const initialBytes=fs.readFileSync(candidatePath);
  const original=await (await fetch(base+'api/spec')).json();
  const draft=structuredClone(original.candidate);
  draft.meta.title='草稿导出 · 中文🙂';
  const imageResponse=await fetch(base+'api/image-preview',{method:'POST',
    headers:{'content-type':'application/json','x-archify-editor':'1',origin:new URL(base).origin},
    body:JSON.stringify(draft)});
  const image=await imageResponse.json();
  assert.equal(imageResponse.status,200,JSON.stringify(image));
  assert.equal(image.status,'draft-render');
  assert.ok(image.html.includes('草稿导出 · 中文🙂') && image.html.includes('exportMenu'));
  assert.deepEqual(fs.readFileSync(candidatePath),initialBytes,'Draft export must not save candidate');
  assert.ok(!fs.readdirSync(dir).some(name=>/candidate\.image-|image-preview-/.test(name)));
  assert.equal((await fetch(base+'api/image-preview',{method:'POST',body:JSON.stringify(draft)})).status,403);
  count++;console.log('PASS: 未保存中文草稿直接图像导出、权限与临时文件清理');
  assert.ok(original.candidate.components.length>0);
  assert.ok(original.candidate.connections.length>0);
  const requestRoutes = async (spec, headers = {}) => {
    const response=await fetch(base+'api/routes',{method:'POST',
      headers:{'content-type':'application/json','x-archify-editor':'1',
        origin:new URL(base).origin,...headers},body:JSON.stringify(spec)});
    return {status:response.status,body:await response.json()};
  };
  const preview=await requestRoutes(original.candidate);
  assert.equal(preview.status,200,JSON.stringify(preview.body));
  assert.equal(preview.body.source,'archify-render');
  assert.equal(preview.body.edges.length,original.candidate.connections.length);
  const referenceHtml=path.join(dir,'reference.html');
  const official=spawnSync(process.execPath,[process.env.ARCHIFY_CLI || fileURLToPath(new URL('../bin/archify.mjs',import.meta.url)),'render','architecture',
    candidatePath,referenceHtml,'--quality',candidate.meta.quality_profile||'showcase'],{
    cwd:dir,encoding:'utf8',timeout:20000,maxBuffer:2_000_000,windowsHide:true,
  });
  assert.equal(official.status,0,'Official reference render failed: '+official.stderr);
  const expected=extractArchifyRoutes(fs.readFileSync(referenceHtml,'utf8'),
    original.candidate.connections.length);
  assert.deepEqual(preview.body.edges,expected);
  const packEdge=preview.body.edges.find(e=>e.id==='c_start_pack');
  if (packEdge) assert.ok(packEdge.d.includes(' Q '),'Expected official rounded orthogonal route');
  else assert.ok(preview.body.edges.every(e=>e.d.startsWith('M ')),'Missing canonical routes');
  count++;console.log('PASS: 所有连线路径及标签与正式 Archify HTML 完全一致');
  const cached=await requestRoutes(original.candidate);
  assert.equal(cached.status,200);
  assert.equal(cached.body.cache,'hit');
  assert.deepEqual(cached.body.edges,preview.body.edges);
  count++;console.log('PASS: 官方路由缓存命中且几何完全一致');
  const moved=structuredClone(original.candidate);
  moved.components[0].pos[0]+=15;
  const movedPreview=await requestRoutes(moved);
  assert.equal(movedPreview.status,200,JSON.stringify(movedPreview.body));
  assert.notEqual(movedPreview.body.edges[0].d,preview.body.edges[0].d);
  assert.deepEqual(fs.readFileSync(candidatePath),initialBytes);
  count++;console.log('PASS: 移动节点后重新执行正式路由且不写入原项目');
  const concurrentCandidate=structuredClone(original.candidate);
  concurrentCandidate.meta.title+=' · 同时请求';
  const concurrent=await Promise.all(Array.from({length:4},()=>requestRoutes(concurrentCandidate)));
  assert.ok(concurrent.every(r=>r.status===200));
  assert.deepEqual(concurrent.map(r=>r.body.cache).sort(),['miss','shared','shared','shared']);
  assert.ok(concurrent.every(r=>JSON.stringify(r.body.edges)===JSON.stringify(concurrent[0].body.edges)));
  count++;console.log('PASS: 四个并发相同候选请求只执行一次正式路由');
  const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
  if(chrome){
    const browser=spawnSync(chrome,['--headless=new','--disable-gpu','--no-first-run',
      '--no-default-browser-check','--disable-extensions',
      '--user-data-dir='+path.join(dir,'browser-profile'),
      '--virtual-time-budget=4000','--dump-dom',base],{
      encoding:'utf8',timeout:30000,maxBuffer:3_000_000,windowsHide:true});
    assert.equal(browser.status,0,'browser check failed: '+browser.stderr?.slice(-500));
    assert.ok(browser.stdout.includes('data-node-id="'+original.candidate.components[0].id+'"'),
      'browser did not render the architecture nodes');
    assert.ok(browser.stdout.includes('属性检查器'));
    const referenceEdge=packEdge||preview.body.edges[0];
    assert.ok(browser.stdout.includes('data-rendered-route="'+(referenceEdge.id||'edge-0')+'"'),
      'The browser did not render the canonical connection');
    assert.ok(browser.stdout.includes('d="'+referenceEdge.d+'"'),
      'The browser line geometry diverged from Archify final output');
    count++;console.log('PASS: Chrome/Edge 实际页面加载与 SVG 节点渲染');
  } else {console.log('SKIP: 未找到 Chrome/Edge 浏览器');}
  const send=async (body,headers={})=>{
    const response=await fetch(base+'api/save',{method:'POST',
      headers:{'content-type':'application/json','x-archify-editor':'1',
        'origin':new URL(base).origin,...headers},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
  const csrf=await send({expectedHash:original.expectedHash,candidate:original.candidate},{origin:'http://evil.invalid'});
  assert.equal(csrf.status,403);
  assert.deepEqual(fs.readFileSync(candidatePath),initialBytes);
  count++;console.log('PASS: 跨源保存拒绝');
  const stale=await send({expectedHash:'wrong',candidate:original.candidate});
  assert.equal(stale.status,409);
  count++;console.log('PASS: 过期版本保护');
  const malformed=structuredClone(original.candidate);
  malformed.components[1].id=malformed.components[0].id;
  const reject=await send({expectedHash:original.expectedHash,candidate:malformed});
  assert.equal(reject.status,422);
  assert.deepEqual(fs.readFileSync(candidatePath),initialBytes);
  count++;console.log('PASS: 非法 JSON 不覆盖原文件');
  const outOfRange=structuredClone(original.candidate);
  outOfRange.meta.font_scale=4;
  const styleRejected=await send({expectedHash:original.expectedHash,candidate:outOfRange});
  assert.equal(styleRejected.status,422);
  assert.deepEqual(fs.readFileSync(candidatePath),initialBytes);
  const unknown=structuredClone(original.candidate);
  unknown.meta.random_style_field=1;
  assert.equal((await send({expectedHash:original.expectedHash,candidate:unknown})).status,422);
  count++;console.log('PASS: 样式数值严格校验，未知元数据仍被拒绝');
  const updated=structuredClone(original.candidate);
  updated.meta.title+=' · 编辑器集成测试';
  updated.components[0].font_sizes={label:10,sublabel:9};
  updated.meta.line_scale=1.3;
  const saved=await send({expectedHash:original.expectedHash,candidate:updated});
  assert.equal(saved.status,200,'save failed: '+JSON.stringify(saved));
  assert.equal(saved.body.ok,true);
  assert.equal(JSON.parse(fs.readFileSync(candidatePath,'utf8')).meta.title,updated.meta.title);
  assert.equal(JSON.parse(fs.readFileSync(candidatePath,'utf8')).components[0].font_sizes.label,10);
  assert.equal(JSON.parse(fs.readFileSync(candidatePath,'utf8')).meta.line_scale,1.3);
  assert.ok(fs.readFileSync(path.join(dir,'diagram.html'),'utf8').includes(updated.meta.title));
  assert.ok(fs.existsSync(saved.body.backup));
  count++;console.log('PASS: 自动备份、Archify 校验/生成、保存正式 HTML');
  console.log('ALL_TESTS_PASS: '+count);
} finally {
  child.kill();
  if (child.exitCode === null) {
    await Promise.race([
      new Promise(resolve => child.once('exit',resolve)),
      new Promise(resolve => setTimeout(resolve,2000)),
    ]);
  }
  try {
    fs.rmSync(dir,{recursive:true,force:true,maxRetries:12,retryDelay:250});
  } catch (error) {
    // Windows Chrome process handles may outlive Archify's successful browser gate.
    console.warn('WARN: 测试临时目录清理被系统锁定：'+dir+' ('+error.code+')');
  }
}
