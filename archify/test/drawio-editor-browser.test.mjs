import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ChromeVisualBrowser,findChrome} from '../bin/visual-check.mjs';

test('draw.io native handles preserve edits, history, endpoints and frame geometry', {timeout:180000}, async t=>{
  const chrome=findChrome();if(!chrome){t.skip('Chrome required');return;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-drawio-browser-'));
  const candidate={schema_version:1,diagram_type:'architecture',meta:{title:'Native editing',output:'diagram.html',quality_profile:'standard'},
    components:[{id:'a',type:'backend',label:'Source',sublabel:'Preserved detail',pos:[200,200],size:[180,80]},
      {id:'b',type:'backend',label:'Target',pos:[600,200],size:[180,80]},
      {id:'c',type:'backend',label:'Other',pos:[600,400],size:[180,80]}],
    boundaries:[{kind:'region',label:'Local process',wraps:['a','b'],pad:80}],
    connections:[{id:'ab',from:'a',to:'b',label:'request',fromSide:'right',toSide:'left'}]};
  fs.writeFileSync(path.join(dir,'candidate.json'),JSON.stringify(candidate));
  const editorRoot=process.env.ARCHIFY_EDITOR_ROOT || fileURLToPath(new URL('../editor/',import.meta.url));
  const server=spawn(process.execPath,[path.join(editorRoot,'serve.mjs'),'candidate.json'],{
    cwd:dir,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stdout='',stderr='';server.stdout.on('data',d=>stdout+=d);server.stderr.on('data',d=>stderr+=d);
  const browser=new ChromeVisualBrowser(chrome);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function until(fn,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await sleep(100);}throw Error('Timeout: '+stderr);}
  let sid;
  const call=(method,params={})=>browser.cdp.send(method,params,sid);
  async function evalJS(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
  async function snapshot(){return JSON.parse(await evalJS(`(async()=>{let blob;const old=URL.createObjectURL;URL.createObjectURL=b=>{blob=b;return old(b)};try{document.getElementById('export').click()}finally{URL.createObjectURL=old}return blob.text()})()`));}
  async function position(expr){return evalJS(`(()=>{const f=document.getElementById('drawio-canvas'),w=f.contentWindow,g=w.archifyDrawio.graph;const el=${expr};const r=el.getBoundingClientRect(),fr=f.getBoundingClientRect();return [r.x+r.width/2+fr.x,r.y+r.height/2+fr.y]})()`);}
  async function drag(at,dx=0,dy=0){await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:at[0],y:at[1]});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x:at[0],y:at[1],button:'left',clickCount:1});
    for(let i=1;i<=5;i++)await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:at[0]+dx*i/5,y:at[1]+dy*i/5,button:'left',buttons:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:at[0]+dx,y:at[1]+dy,button:'left',clickCount:1});await sleep(150);}
  try{
    await until(()=>/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{40}\//.test(stdout));
    const base=stdout.match(/http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{40}\//)[0];
    sid=await browser.sessionPromise;
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:base});
    await until(()=>evalJS(`!!document.getElementById('drawio-canvas')?.contentWindow?.archifyDrawio?.graph.model.getCell('edge-ab')`));
    await until(()=>evalJS(`document.getElementById('message').textContent.includes('正式路由已同步')`));
    assert.deepEqual(await snapshot(),candidate,'Opening must not mutate the candidate');
    t.diagnostic('Loaded native draw.io and unchanged JSON');
    assert.equal(await evalJS(`document.getElementById('drawio-canvas').contentWindow.mxClient.VERSION`),'29.7.9');
    assert.equal(await evalJS(`getComputedStyle(document.getElementById('drawio-canvas').contentWindow.archifyDrawio.graph.view.getState(document.getElementById('drawio-canvas').contentWindow.archifyDrawio.graph.model.getCell('node-a')).text.node).visibility`),'visible');
    const before=await snapshot();
    await drag(await position(`g.view.getState(g.model.getCell('node-a')).shape.node`),0,35);
    const moved=await snapshot();assert.notDeepEqual(moved.components[0].pos,before.components[0].pos);
    assert.equal(moved.components[0].sublabel,before.components[0].sublabel);
    assert.equal(await evalJS(`document.getElementById('drawio-canvas').contentWindow.archifyDrawio.graph.getSelectionCell().archifyId`),'a');
    await call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});
    await sleep(200);assert.deepEqual(await snapshot(),before,'Native Ctrl+Z must use Archify history');
    await evalJS(`document.getElementById('redo').click()`);assert.deepEqual(await snapshot(),moved);
    t.diagnostic('Native mouse movement, Ctrl+Z and redo passed');
    await evalJS(`document.getElementById('drawio-canvas').contentWindow.archifyDrawio.ui.actions.get('duplicate').funct()`);
    const duplicated=await snapshot();assert.equal(duplicated.components.length,4);
    assert.equal(duplicated.components.at(-1).sublabel,'Preserved detail');
    assert.notEqual(duplicated.components.at(-1).id,'a');
    await evalJS(`document.getElementById('undo').click()`);assert.deepEqual(await snapshot(),moved);
    t.diagnostic('Native duplication preserves metadata and unique identity');
    await evalJS(`(()=>{const g=document.getElementById('drawio-canvas').contentWindow.archifyDrawio.graph;g.setSelectionCell(g.model.getCell('edge-ab'));})()`);
    const middle=`g.selectionCellsHandler.getHandler(g.model.getCell('edge-ab')).bends[2].node`;
    await drag(await position(middle),35,0);
    const segmented=await snapshot();assert.notDeepEqual(segmented.connections[0].via,moved.connections[0].via);
    assert.equal(segmented.connections[0].from,'a');assert.equal(segmented.connections[0].to,'b');
    await evalJS(`document.getElementById('undo').click()`);assert.deepEqual(await snapshot(),moved);
    t.diagnostic('Native orthogonal segment drag passed');
    // Select the real draw.io frame and drag its native bottom-right sizer.
    await evalJS(`(()=>{const g=document.getElementById('drawio-canvas').contentWindow.archifyDrawio.graph;g.setSelectionCell(g.model.getCell('boundary-0'));})()`);
    const sizer=`g.selectionCellsHandler.getHandler(g.model.getCell('boundary-0')).sizers[7].node`;
    await drag(await position(sizer),45,40);
    const resized=await snapshot();assert.ok(resized.boundaries[0].bounds?.length===4);
    t.diagnostic('Native frame resize passed');
    const frameAt=await evalJS(`(()=>{const f=document.getElementById('drawio-canvas'),g=f.contentWindow.archifyDrawio.graph,r=g.view.getState(g.model.getCell('boundary-0')).shape.node.getBoundingClientRect(),fr=f.getBoundingClientRect();return [fr.x+r.x+r.width/4,fr.y+r.y+2]})()`);
    await drag(frameAt,30,0);const frameMoved=await snapshot();
    assert.ok(frameMoved.boundaries[0].bounds[0]>resized.boundaries[0].bounds[0]);
    assert.equal(frameMoved.components[0].pos[0]-resized.components[0].pos[0],frameMoved.boundaries[0].bounds[0]-resized.boundaries[0].bounds[0]);
    await evalJS(`document.getElementById('undo').click()`);assert.deepEqual(await snapshot(),resized);
    t.diagnostic('Native frame movement carries its members');
    assert.ok(resized.boundaries[0].bounds[2]>before.components[1].pos[0]+before.components[1].size[0]-120);
    // Native endpoint reconnect uses the same edge handler as desktop draw.io.
    await evalJS(`(()=>{const g=document.getElementById('drawio-canvas').contentWindow.archifyDrawio.graph;g.setSelectionCell(g.model.getCell('edge-ab'));})()`);
    assert.equal(await evalJS(`document.getElementById('drawio-canvas').contentWindow.archifyDrawio.graph.selectionCellsHandler.getHandler(document.getElementById('drawio-canvas').contentWindow.archifyDrawio.graph.model.getCell('edge-ab')).constructor.name`),'mxEdgeSegmentHandler');
    const end=await position(`g.selectionCellsHandler.getHandler(g.model.getCell('edge-ab')).bends.at(-1).node`);
    const dest=await position(`g.view.getState(g.model.getCell('node-c')).shape.node`);
    await drag(end,dest[0]-end[0],dest[1]-end[1]);
    const reconnected=await snapshot();assert.equal(reconnected.connections[0].to,'c');
    t.diagnostic('Native endpoint reconnect passed');
    assert.ok(reconnected.connections[0].toPort);assert.ok(reconnected.connections[0].via);
    const evidence=process.env.ARCHIFY_DRAWIO_EVIDENCE;
    if(evidence){fs.mkdirSync(evidence,{recursive:true});const shot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(evidence,'native-handles.png'),Buffer.from(shot.data,'base64'));}
    await evalJS(`document.getElementById('undo').click()`);assert.deepEqual(await snapshot(),resized);
    fs.writeFileSync(path.join(dir,'edited-draft.json'),JSON.stringify(resized,null,2));
    // Formal save still executes the canonical validation/finalize pipeline.
    await evalJS(`document.getElementById('save').click()`);
    t.diagnostic('Save started');
    await until(()=>evalJS(`!document.getElementById('save').disabled`),90000);
    t.diagnostic('Save returned');
    assert.equal(await evalJS(`document.getElementById('message').classList.contains('error')`),false,
      await evalJS(`document.getElementById('message').textContent`));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'candidate.json'),'utf8')),resized);
    assert.ok(fs.readFileSync(path.join(dir,'diagram.html'),'utf8').includes('Preserved detail'));
    t.diagnostic('JSON and formal HTML verified; reloading');
    const loaded=browser.cdp.waitFor('Page.loadEventFired',sid);loaded.catch(()=>{});
    await call('Page.reload');await loaded;
    await until(()=>evalJS(`!!document.getElementById('drawio-canvas')?.contentWindow?.archifyDrawio?.graph.model.getCell('node-a') && !document.getElementById('export').disabled`));
    assert.deepEqual(await snapshot(),resized,'Saved geometry survives a fresh editor load');
    const savedBytes=fs.readFileSync(path.join(dir,'candidate.json'));
    await evalJS(`(()=>{const g=document.getElementById('drawio-canvas').contentWindow.archifyDrawio.graph;g.setCellStyles('curved','1',[g.model.getCell('edge-ab')]);document.getElementById('save').click();})()`);
    assert.ok(await evalJS(`document.getElementById('message').textContent.includes('曲线')`));
    assert.deepEqual(fs.readFileSync(path.join(dir,'candidate.json')),savedBytes,'Unsupported curves must not overwrite the canonical JSON');
    t.diagnostic('Unsupported native curves are explicitly blocked from lossy JSON saving');
  }finally{await browser.close();server.kill();}
});
