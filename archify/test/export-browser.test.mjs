import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChromeVisualBrowser, findChrome } from '../bin/visual-check.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.ARCHIFY_CHROME ? findChrome() : null;

test('Export preserves menu, clipboard, semantic cards and recording lifecycles', {
  skip: chrome ? false : 'Set ARCHIFY_CHROME to run real-browser Export checks.',
}, async (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-export-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const evidence = process.env.ARCHIFY_EXPORT_RUNTIME_EVIDENCE;
  const records = [];
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  t.after(() => { if (evidence) fs.writeFileSync(path.join(evidence, 'observations.json'), JSON.stringify(records, null, 2) + '\n'); });
  const input = path.join(scratch, 'motion.json');
  const file = path.join(scratch, 'motion.html');
  const source = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples/web-app.architecture.json'), 'utf8'));
  source.meta.animation = 'trace';
  source.meta.visual_preset = 'signal-flow';
  fs.writeFileSync(input, JSON.stringify(source));
  execFileSync(process.execPath, [path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), input, file]);
  const browser = new ChromeVisualBrowser(chrome);
  t.after(() => browser.close());
  const session = await browser.sessionPromise;
  const send = (method, params = {}) => browser.cdp.send(method, params, session);
  await browser.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  async function run(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, result.exceptionDetails?.exception?.description);
    return result.result?.value;
  }
  // Instrument browser boundaries only: all serialization, drawing and encoding
  // remain production code. Each navigation restores the original environment.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.exportErrors=[];window.exportAlerts=[];window.exportConsole=[];
    addEventListener('error',e=>exportErrors.push(e.message));
    addEventListener('unhandledrejection',e=>exportErrors.push(String(e.reason)));
    window.alert=message=>exportAlerts.push(message);
    console.error=(...args)=>exportConsole.push(args.map(String).join(' '));
    window.exportUrls=new Map();window.exportDownloads=[];window.exportTracks=[];window.exportCancelled=[];
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);exportUrls.set(url,{blob,revoked:false});return url;};
    URL.revokeObjectURL=url=>{const item=exportUrls.get(url);if(item)item.revoked=true;revoke(url);};
    const click=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){if(this.download){exportDownloads.push({name:this.download,blob:exportUrls.get(this.href).blob,attached:this.isConnected});return;}return click.call(this);};
    const capture=HTMLCanvasElement.prototype.captureStream;
    if(capture)HTMLCanvasElement.prototype.captureStream=function(...args){const stream=capture.apply(this,args);exportTracks.push(...stream.getTracks());return stream;};
    const cancel=window.cancelAnimationFrame;
    window.cancelAnimationFrame=id=>{exportCancelled.push(id);return cancel(id);};
    // Activation can survive asynchronous work. Observe the actual handler
    // stack so even a microtask cannot masquerade as synchronous construction.
    window.copyInClickHandler=false;
    const listen=EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener=function(type,listener,options){
      if(this.id==='export-menu'&&type==='click'&&typeof listener==='function'){
        const handler=listener;
        listener=function(event){
          copyInClickHandler=true;
          try{return handler.call(this,event);}finally{copyInClickHandler=false;}
        };
      }
      return listen.call(this,type,listener,options);
    };
    window.exportWait=predicate=>new Promise((resolve,reject)=>{const start=performance.now();function poll(){if(predicate())return resolve();if(performance.now()-start>12000)return reject(new Error('Export observation timed out'));setTimeout(poll,20);}poll();});
    const fault=new URL(location.href).searchParams.get('fault');
    if(fault==='unsupported'){window.MediaRecorder=undefined;window.ClipboardItem=undefined;HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,';}
  ` });
  async function load({ width = 1440, theme = 'dark', extra = '' } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
    await send('Page.navigate', { url: pathToFileURL(file).href + '?theme=' + theme + extra });
    await loaded;
    await run('document.fonts.ready');
    await run('Archify.readerLayout.whenStable()');
    await run('Archify.viewerChromeLayout.whenStable()');
  }
  async function key(key, code, windowsVirtualKeyCode) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
  }
  async function click(selector) {
    const point = await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
  async function record(label) {
    const value = await run(`({open:Archify.exportMenu.isOpen(),expanded:document.getElementById('btn-export').getAttribute('aria-expanded'),
      active:document.activeElement.id||document.activeElement.dataset.action||document.activeElement.dataset.format,
      downloads:exportDownloads.map(d=>({name:d.name,type:d.blob.type,attached:d.attached})),
      urls:[...exportUrls.values()].map(u=>({type:u.blob.type,revoked:u.revoked})),tracks:exportTracks.map(t=>t.readyState),
      receipt:Object.fromEntries([...document.documentElement.attributes].filter(a=>a.name.startsWith('data-last-export-')&&!a.name.endsWith('-bytes')).map(a=>[a.name,a.value])),
      errors:exportErrors,alerts:exportAlerts,console:exportConsole,
      external:performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/^https?:/.test(n))})`);
    assert.deepEqual(value.errors, [], label);
    assert.deepEqual(value.external, [], label);
    records.push({ label, ...value });
    return value;
  }
  const route = `Archify.routeProbe.begin({source:'users',focusNode:false});if(!Archify.routeProbe.choose('db',{updateUrl:false}))throw new Error('route fixture failed');`;
  const reach = `Archify.focus.set('api',{toggle:false,updateUrl:false});if(!Archify.focus.reach('downstream',{toggle:false,updateUrl:false,reveal:false}))throw new Error('reach fixture failed');`;

  await t.test('removed share actions cannot be invoked through the menu or old API', async () => {
    await load();
    assert.equal(await run(`document.querySelector('[data-format="share-card"], [data-action="copy-share-card"]') === null`), true);
    assert.equal(await run(`typeof Archify.exportMenu.copyShareCard`), 'undefined');
    assert.equal(await run(`Archify.exportMenu.shareCard().then(()=>false,()=>true)`), true);
    assert.equal(await run(`Archify.exportMenu.run('share-card').then(()=>false,()=>true)`), true);
    const state = await record('removed-share-actions');
    assert.deepEqual(state.downloads, []);
    assert.deepEqual(state.urls, []);
    assert.deepEqual(state.receipt, {});
    assert.deepEqual(state.console, []);
  });

  await t.test('native menu input skips unavailable entries and preserves focus and mutual exclusion', async () => {
    for (const width of [390, 720, 1440]) {
      await load({ width, extra: '&fault=unsupported' });
      assert.deepEqual(await run('Object.keys(Archify.exportMenu).sort()'), ['close','downloadReachShareCard','downloadRouteShareCard','isOpen','open','run','shareCard','syncReachShare','syncRouteShare'].sort());
      assert.deepEqual(await run('Object.keys(Archify.motion).sort()'), ['canEncodeGif','canRecord','recordGif','recordWebm']);
      assert.deepEqual(await run(`[...document.querySelectorAll('#export-menu [data-format="jpeg"],#export-menu [data-format="webp"],#export-menu [data-format="webm"],#export-menu [data-action="copy"]')].map(e=>e.disabled)`), [true,true,true,true]);
      await run(`document.getElementById('btn-export').focus()`);
      await key('ArrowUp', 'ArrowUp', 38);
      const last = await run(`document.activeElement.dataset.format||document.activeElement.dataset.action`);
      await key('Home', 'Home', 36);
      const first = await run(`document.activeElement.dataset.format||document.activeElement.dataset.action`);
      assert.notEqual(first, last);
      await key('ArrowUp', 'ArrowUp', 38);
      assert.equal(await run(`document.activeElement.dataset.format||document.activeElement.dataset.action`), last);
      await key('ArrowDown', 'ArrowDown', 40);
      assert.equal(await run(`document.activeElement.dataset.format||document.activeElement.dataset.action`), first);
      await key('End', 'End', 35);
      assert.equal(await run(`document.activeElement.dataset.format||document.activeElement.dataset.action`), last);
      await key('Escape', 'Escape', 27);
      assert.equal((await record('escape-' + width)).active, 'btn-export');
      assert.equal(await run('Archify.exportMenu.isOpen()'), false);
      await click('#btn-export');
      await key('Tab', 'Tab', 9);
      assert.equal(await run('Archify.exportMenu.isOpen()'), false);
      await click('#btn-export');
      assert.equal(await run(`document.getElementById('export-menu').contains(document.elementFromPoint(5,5))`), false);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
      assert.equal(await run('Archify.exportMenu.isOpen()'), false);
      await run('Archify.preset.open();Archify.exportMenu.open()');
      assert.equal(await run('Archify.preset.isOpen()'), false);
      await run('Archify.semanticLens.open();Archify.exportMenu.open()');
      assert.equal(await run('Archify.semanticLens.isOpen()'), false);
      const state = await record('menu-' + width);
      assert.equal(state.open, true);assert.equal(state.expanded, 'true');assert.deepEqual(state.console, []);
    }
  });

  await t.test('auto-open and themed menu rendering keep stable layout', async () => {
    for (const theme of ['dark', 'light']) {
      await load({ theme, extra: '&openExport=1' });
      await run('exportWait(()=>Archify.exportMenu.isOpen())');
      const state = await record('auto-' + theme);
      assert.equal(state.expanded, 'true');assert.deepEqual(state.console, []);
      if (evidence) {
        await run(`Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))`);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(evidence, theme + '-menu.png'), Buffer.from(shot.data, 'base64'));
      }
    }
  });

  await t.test('semantic card downloads retain snapshots, receipts and URL lifetime', async () => {
    for (const variant of ['route', 'reach']) {
      await load();await run(variant === 'route' ? route : reach);
      await run(`Archify.exportMenu.open();document.querySelector('[data-action="${variant}-share-card"]').focus()`);
      const result = await run(`(async()=>{let triggerFocus=0;const trigger=document.getElementById('btn-export');const onFocus=()=>triggerFocus++;trigger.addEventListener('focus',onFocus);const blob=await Archify.exportMenu.${variant === 'route' ? 'downloadRouteShareCard' : 'downloadReachShareCard'}();const image=await createImageBitmap(blob);const dimensions=[image.width,image.height];image.close();trigger.removeEventListener('focus',onFocus);return {dimensions,triggerFocus,type:blob.type};})()`);
      assert.deepEqual(result, { dimensions: [1200,630], triggerFocus: 0, type: 'image/png' });
      const live = await record(variant + '-download');
      assert.equal(live.receipt['data-last-export-variant'], variant);
      assert.equal(live.receipt['data-last-export-canonical'], 'false');
      assert.equal(live.receipt['data-last-export-' + variant + '-state-clean'], 'true');
      assert.ok(live.downloads[0].name.endsWith(variant === 'route' ? '-route-share-card.png' : '-downstream-reach-share-card.png'));
      assert.deepEqual(live.urls.map(u=>u.revoked), [true,false]);
      assert.equal(await run(`document.querySelectorAll('a[download]').length`), 0);
      await run('exportWait(()=>[...exportUrls.values()].every(u=>u.revoked))');
      assert.deepEqual((await record(variant + '-released')).urls.map(u=>u.revoked), [true,true]);
      await run(`Archify.exportMenu.open();${variant === 'route' ? 'Archify.routeProbe.clear()' : 'Archify.focus.clearReach()'};`);
      assert.equal(await run(`document.querySelector('[data-action="${variant}-share-card"]').hidden`), true);
      await run(`Archify.exportMenu.${variant === 'route' ? 'downloadRouteShareCard' : 'downloadReachShareCard'}()`);
      const missing = await record(variant + '-invalidated');
      assert.equal(missing.receipt['data-last-export-error-format'], 'share-card');
      assert.equal(missing.receipt['data-last-export-variant'], undefined);assert.equal(missing.alerts.length, 1);
      // An invalid provider snapshot must not be sanitized into a different route.
      await run(variant === 'route' ? route : reach);
      await run(`(()=>{const provider=${variant === 'route' ? 'Archify.routeProbe' : 'Archify.focus'};const method=${JSON.stringify(variant === 'route' ? 'exportSnapshot' : 'reachabilitySnapshot')};const snapshot=provider[method]();snapshot.nodeIds=['missing'];provider[method]=()=>snapshot;})()`);
      assert.equal(await run(`Archify.exportMenu.shareCard({variant:${JSON.stringify(variant)}}).then(()=>false,()=>true)`), true);
      assert.equal((await record(variant + '-malformed')).downloads.length, 1);
    }
  });

  await t.test('clipboard keeps promise construction in the click and distinct fallback/error receipts', async () => {
    for (const mode of ['promise','fallback','reject']) {
      const action = 'copy';
      await load();
      await run(`window.copyCalls=[];window.copyDone=false;window.copyBlob=null;
        window.ClipboardItem=class {constructor(data){const value=data['image/png'];copyCalls.push({promise:value instanceof Promise,gesture:navigator.userActivation.isActive,inClickHandler:copyInClickHandler});if(${JSON.stringify(mode)}==='fallback'&&value instanceof Promise)throw new Error('promise unsupported');this.value=value;}};
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write(items){copyCalls.push({write:true});if(${JSON.stringify(mode)}==='reject'){copyDone=true;return Promise.reject(new Error('clipboard denied'));}return Promise.resolve(items[0].value).then(blob=>{copyBlob=blob;copyDone=true;});}}});
        document.querySelector('[data-action="${action}"]').disabled=false;Archify.exportMenu.open();`);
      await click(`[data-action="${action}"]`);
      await run(`exportWait(()=>copyDone&&(${JSON.stringify(mode)}==='reject'?exportAlerts.length>0:document.querySelector('.archify-toast').textContent.length>0))`);
      const calls = await run('copyCalls');
      assert.deepEqual(calls[0], { promise: true, gesture: true, inClickHandler: true });
      if (mode === 'fallback') assert.equal(calls[1].inClickHandler, false, 'Blob fallback remains asynchronous');
      assert.deepEqual(calls.map(c=>c.write?'write':c.promise?'promise':'blob'), mode === 'fallback' ? ['promise','blob','write'] : ['promise','write']);
      const state = await record(action + '-' + mode);
      assert.equal(state.active, 'btn-export');
      if (mode !== 'reject') {
        assert.equal(await run('copyBlob.type'), 'image/png');
        const dims = await run('(async()=>{const b=await createImageBitmap(copyBlob);const size=[b.width,b.height];b.close();return size;})()');
        assert.ok(dims[0] > 1200);
        assert.equal(state.receipt['data-last-export-format'], undefined);
      } else {
        assert.equal(state.alerts.length,1);
        assert.equal(state.receipt['data-last-export-error-format'], undefined);
      }
      await run('exportWait(()=>[...exportUrls.values()].every(u=>u.revoked))');
    }
    await load({extra:'&fault=unsupported'});
    assert.equal(await run(`document.querySelector('[data-action="copy"]').disabled`), true);
    assert.equal((await record('clipboard-unavailable')).alerts.length, 0);
  });

  await t.test('raster failures release sources and retain retry and synchronous SVG behavior', async () => {
    for (const fault of ['image','context','null-blob']) {
      await load();
      await run(`window.savedImage=Image;window.savedContext=HTMLCanvasElement.prototype.getContext;window.savedToBlob=HTMLCanvasElement.prototype.toBlob;`);
      if (fault === 'image') await run(`window.Image=class {set src(value){queueMicrotask(()=>this.onerror(new Error('image failed')));}}`);
      if (fault === 'context') await run('HTMLCanvasElement.prototype.getContext=()=>null');
      if (fault === 'null-blob') await run('HTMLCanvasElement.prototype.toBlob=function(callback){callback(null)}');
      await run(`Archify.exportMenu.run('png')`);
      const state = await record('raster-' + fault);
      assert.equal(state.receipt['data-last-export-error-format'],'png');assert.equal(state.alerts.length,1);
      assert.equal(state.urls.length,1);assert.equal(state.urls[0].revoked,true);assert.deepEqual(state.downloads,[]);
      await run(`window.Image=savedImage;HTMLCanvasElement.prototype.getContext=savedContext;HTMLCanvasElement.prototype.toBlob=savedToBlob;Archify.exportMenu.run('png')`);
      await run('exportWait(()=>exportDownloads.length===1)');
      assert.equal((await record('retry-' + fault)).receipt['data-last-export-error-format'],undefined);
    }
    await load();
    const sync = await run(`(()=>{const svg=document.querySelector('.diagram-container > svg'),clone=svg.cloneNode;svg.cloneNode=()=>{throw new Error('sync serialization')};try{Archify.exportMenu.run('svg');return false;}catch(e){return e.message==='sync serialization';}finally{svg.cloneNode=clone;}})()`);
    assert.equal(sync,true);assert.deepEqual((await record('svg-sync-throw')).receipt,{});
  });

  await t.test('standalone SVG keeps intrinsic dimensions without changing Viewer or raster sizing', async () => {
    const fixtures = [
      ['architecture', 'web-app.architecture.json'],
      ['workflow', 'agent-tool-call.workflow.json'],
      ['sequence', 'cache-miss-request.sequence.json'],
      ['dataflow', 'product-analytics.dataflow.json'],
      ['lifecycle', 'agent-run.lifecycle.json'],
    ];
    try {
      for (const [mode, fixture] of fixtures) {
        execFileSync(process.execPath, [path.join(skillRoot, `renderers/${mode}/render-${mode}.mjs`), path.join(skillRoot, 'examples', fixture), file]);
        for (const theme of ['dark', 'light']) {
          await load({ theme });
          const dimensions = await run(`(()=>{const v=document.querySelector('.diagram-container svg').viewBox.baseVal;return [v.width,v.height];})()`);
          const viewerWidths = [];
          for (const width of [640, 1440]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
            await run('Archify.readerLayout.whenStable()');
            await run('Archify.viewerChromeLayout.whenStable()');
            viewerWidths.push(await run(`document.querySelector('.diagram-container svg').getBoundingClientRect().width`));
          }
          assert.notEqual(viewerWidths[0], viewerWidths[1], `${mode}: Viewer remains responsive`);
          const original = await run(`document.querySelector('.diagram-container svg').outerHTML`);
          await run(`Archify.exportMenu.run('svg')`);
          await run('exportWait(()=>exportDownloads.length===1)');
          const svgText = await run('exportDownloads[0].blob.text()');
          const svgFile = path.join(evidence || scratch, `${mode}-${theme}.svg`);
          fs.writeFileSync(svgFile, svgText);
          const figure = await run(`(()=>{const v=document.querySelector('.diagram-container svg').viewBox.baseVal;const sub=(document.querySelector('.header .subtitle')||{}).textContent;const header=document.querySelector('.header h1')?32+(sub&&sub.trim()?24:0)+18:0;return [(v.width+104)*4,(v.height+104+header)*4];})()`);
          const rasterSizes = [];
          for (const format of ['png', 'jpeg', 'webp']) {
            await run(`Archify.exportMenu.run('${format}')`);
            const result = await run(`(async()=>{const blob=exportDownloads.at(-1).blob;const image=await createImageBitmap(blob);const dimensions=[image.width,image.height];image.close();return {dimensions,type:blob.type};})()`);
            assert.deepEqual(result.dimensions, figure, `${mode} ${theme} ${format}: native 4x framed raster`);
            assert.equal(result.type, 'image/' + format);
            rasterSizes.push({ format, ...result });
            if (evidence) {
              const bytes = await run('(async()=>Array.from(new Uint8Array(await exportDownloads.at(-1).blob.arrayBuffer())))()');
              fs.writeFileSync(path.join(evidence, `${mode}-${theme}.${format}`), Buffer.from(bytes));
            }
          }
          assert.equal(await run(`document.querySelector('.diagram-container svg').outerHTML`), original, 'exports leave the live SVG unchanged');
          await record(`${mode}-${theme}-sizing`);
          for (const width of [640, 1440]) {
            await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
            await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
            const loaded = browser.cdp.waitFor('Page.loadEventFired', session);
            await send('Page.navigate', { url: pathToFileURL(svgFile).href });
            await loaded;
            await run('document.fonts.ready');
            const actual = await run(`(()=>{const s=document.documentElement,r=s.getBoundingClientRect(),v=s.viewBox.baseVal;return {rendered:[r.width,r.height],attributes:[Number(s.getAttribute('width')),Number(s.getAttribute('height'))],viewBox:[v.width,v.height]};})()`);
            records.push({ label: `${mode}-${theme}-direct-${width}`, ...actual, viewerWidths, rasterSizes });
            if (evidence && mode === 'architecture') {
              const shot = await send('Page.captureScreenshot', { format: 'png' });
              fs.writeFileSync(path.join(evidence, `${mode}-${theme}-direct-${width}.png`), Buffer.from(shot.data, 'base64'));
            }
            assert.deepEqual(actual.attributes, dimensions);
            assert.deepEqual(actual.viewBox, dimensions);
            assert.deepEqual(actual.rendered, dimensions, `${mode} ${theme}: intrinsic size at ${width}px viewport`);
          }
        }
      }
    } finally {
      execFileSync(process.execPath, [path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), input, file]);
    }
  });

  await t.test('SVG Auto/Light/Dark background toggle decodes transparent pixels in both color schemes', async () => {
    for(const theme of ['dark','light']){
      await load({theme});
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
      const live=await run(`document.querySelector('.diagram-container svg').outerHTML`);
      await run('Archify.exportMenu.open()');await click('[data-action="transparent-background"]');
      for(const format of ['svg','svg-light','svg-dark']){
        await run(`Archify.exportMenu.run(${JSON.stringify(format)})`);
        const result=await run(`(async()=>{
          const blob=exportDownloads.at(-1).blob,text=await blob.text(),svg=new DOMParser().parseFromString(text,'image/svg+xml').documentElement;
          const url=URL.createObjectURL(blob),image=new Image();image.src=url;
          try{
            await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject});
            const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
            const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let transparent=0,painted=0;
            for(let i=3;i<pixels.length;i+=4){if(pixels[i]===0)transparent++;if(pixels[i]===255)painted++;}
            return {alpha:pixels[3],transparent,painted,grid:svg.querySelectorAll('rect[fill="url(#grid)"]').length,background:svg.querySelectorAll('.c-bg-rect').length,theme:svg.getAttribute('data-theme')};
          }finally{URL.revokeObjectURL(url);}
        })()`);
        assert.equal(result.alpha,0);assert.ok(result.transparent>100);assert.ok(result.painted>100);
        assert.equal(result.grid,0);assert.equal(result.background,0);
        assert.equal(result.theme,format==='svg'?null:format.slice(4));
        if(evidence){const bytes=await run(`exportDownloads.at(-1).blob.arrayBuffer().then(b=>Array.from(new Uint8Array(b)))`);fs.writeFileSync(path.join(evidence,`${theme}-${format}-transparent.svg`),Buffer.from(bytes));}
      }
      await run('Archify.exportMenu.open()');await click('[data-action="transparent-background"]');await run(`Archify.exportMenu.run('svg')`);
      assert.equal(await run(`(async()=>{const blob=exportDownloads.at(-1).blob,url=URL.createObjectURL(blob),image=new Image();image.src=url;try{await new Promise((r,j)=>{image.onload=r;image.onerror=j});const c=document.createElement('canvas');c.width=c.height=2;const x=c.getContext('2d');x.drawImage(image,0,0);return x.getImageData(0,0,1,1).data[3];}finally{URL.revokeObjectURL(url)}})()`),255);
      assert.equal(await run(`document.querySelector('.diagram-container svg').outerHTML`),live);
    }
    await send('Emulation.setEmulatedMedia',{features:[]});
  });

  await t.test('SVG download declares UTF-8 and preserves CJK text', async () => {
    const originalInput = fs.readFileSync(input, 'utf8');
    try {
      const cjkSource = JSON.parse(originalInput);
      cjkSource.components[0].label = '用户入口';
      fs.writeFileSync(input, JSON.stringify(cjkSource));
      execFileSync(process.execPath, [path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), input, file]);
      await load();
      await run(`Archify.exportMenu.run('svg')`);
      await run('exportWait(()=>exportDownloads.length===1)');
      const download = await run(`exportDownloads[0].blob.text().then(text=>({name:exportDownloads[0].name,type:exportDownloads[0].blob.type,text}))`);
      assert.ok(download.name.endsWith('.svg'));
      assert.equal(download.type, 'image/svg+xml;charset=utf-8');
      assert.ok(download.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'standalone SVG must declare its UTF-8 encoding');
      assert.ok(download.text.includes('用户入口'), 'CJK label must survive serialization');
      await record('svg-utf8');
    } finally {
      fs.writeFileSync(input, originalInput);
      execFileSync(process.execPath, [path.join(skillRoot, 'renderers/architecture/render-architecture.mjs'), input, file]);
    }
  });

  await t.test('background toggle preserves real raster alpha, JPEG fallback and keyboard state', async () => {
    for (const theme of ['dark', 'light']) {
      await load({ theme });
      await run('Archify.exportMenu.open()');
      await click('[data-action="transparent-background"]');
      assert.equal(await run('Archify.exportMenu.isOpen()'), true);
      assert.equal(await run(`document.activeElement.getAttribute('role')`), 'menuitemcheckbox');
      assert.equal(await run(`document.activeElement.getAttribute('aria-checked')`), 'true');
      await key('ArrowDown', 'ArrowDown', 40);
      assert.equal(await run('document.activeElement.id'), 'export-scale');
      for (const format of ['png', 'webp', 'jpeg']) {
        const result = await run(`(async()=>{
          await Archify.exportMenu.run(${JSON.stringify(format)});
          const blob=exportDownloads.at(-1).blob,bitmap=await createImageBitmap(blob);
          const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
          const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]===255)opaque++;
          return {alpha:pixels[3],opaque,type:blob.type};
        })()`);
        assert.equal(result.alpha, format === 'jpeg' ? 255 : 0, `${theme} ${format}`);
        assert.ok(result.opaque > 100, 'diagram content remains painted');
      }
      await run('Archify.exportMenu.open()');
      await click('[data-action="transparent-background"]');
      await run(`Archify.exportMenu.run('png')`);
      assert.equal(await run(`createImageBitmap(exportDownloads.at(-1).blob).then(b=>{const c=document.createElement('canvas');c.width=c.height=2;const x=c.getContext('2d');x.drawImage(b,0,0);b.close();return x.getImageData(0,0,1,1).data[3];})`), 255);
    }
  });

  await t.test('native scale selection renders larger raster and GIF frames and preserves vector/size errors', async () => {
    await load();await run('Archify.exportMenu.open();document.getElementById("export-scale").focus()');
    assert.deepEqual(await run('[...document.getElementById("export-scale").options].map(o=>o.value)'), ['auto','1','3','5','7','10']);
    await key('Home','Home',36);await key('ArrowDown','ArrowDown',40);await key('ArrowDown','ArrowDown',40);
    assert.equal(await run('document.getElementById("export-scale").value'),'3');
    assert.equal(await run('Archify.exportMenu.isOpen()'),true);
    const vb=await run(`(()=>{const v=document.querySelector('.diagram-container svg').viewBox.baseVal;return {width:v.width,height:v.height};})()`);
    const dimensions={};
    for(const format of ['png','jpeg','webp']){
      dimensions[format]=[];
      for(const scale of [1,3]){
        await run(`Archify.exportMenu.run(${JSON.stringify(format)},{scale:${scale}})`);
        const size=await run(`createImageBitmap(exportDownloads.at(-1).blob).then(b=>{const r=[b.width,b.height];b.close();return r;})`);
        dimensions[format].push(size);
      }
      assert.equal(dimensions[format][1][0],dimensions[format][0][0]*3);
      assert.equal(dimensions[format][1][1],dimensions[format][0][1]*3);
    }
    await run(`Archify.exportMenu.run('gif',{duration:250,fps:8,transparentBackground:true})`);
    const gif=await run(`(async()=>{const blob=exportDownloads.at(-1).blob;window.scaledGif=blob;const decoder=new ImageDecoder({data:await blob.arrayBuffer(),type:'image/gif'});await decoder.tracks.ready;const {image}=await decoder.decode({frameIndex:0});const c=document.createElement('canvas');c.width=image.displayWidth;c.height=image.displayHeight;const x=c.getContext('2d');x.drawImage(image,0,0);const r={width:image.displayWidth,height:image.displayHeight,alpha:x.getImageData(10,10,1,1).data[3],frames:decoder.tracks.selectedTrack.frameCount};image.close();decoder.close();return r;})()`);
    assert.equal(gif.width,Math.round(vb.width*3));assert.equal(gif.height,Math.round(vb.height*3));assert.equal(gif.alpha,0);assert.equal(gif.frames,2);
    const nativeSvg=await run(`(async()=>{const sources=[...exportUrls.values()].filter(u=>u.blob.type.startsWith('image/svg+xml'));const d=new DOMParser().parseFromString(await sources.at(-1).blob.text(),'image/svg+xml').documentElement;return {width:Number(d.getAttribute('width')),height:Number(d.getAttribute('height'))};})()`);
    assert.equal(nativeSvg.width,vb.width*3);assert.equal(nativeSvg.height,vb.height*3);
    await run(`Archify.exportMenu.run('svg')`);
    assert.equal(await run(`exportDownloads.at(-1).blob.text().then(t=>Number(new DOMParser().parseFromString(t,'image/svg+xml').documentElement.getAttribute('width')))`),vb.width);
    await run(`document.querySelector('.diagram-container svg').setAttribute('viewBox','0 0 100 60')`);
    let unitSize;
    for (const scale of [1,3,5,7,10]) {
      await run(`Archify.exportMenu.run('png',{scale:${scale}})`);
      const size=await run(`createImageBitmap(exportDownloads.at(-1).blob).then(b=>{const r=[b.width,b.height];b.close();return r;})`);
      if(scale===1)unitSize=size;
      assert.deepEqual(size,unitSize.map(n=>n*scale), `${scale}× PNG renders at native resolution`);
    }
    for (const scale of [0,2,4,11]) {
      const count=await run('exportDownloads.length');
      await run(`Archify.exportMenu.run('png',{scale:${scale}})`);
      assert.equal(await run('exportDownloads.length'),count);
      assert.match(await run('exportAlerts.at(-1)'),/1×, 3×, 5×, 7× or 10×/);
    }
    for (const format of ['gif','webm']) {
      await run(`Archify.exportMenu.run('${format}',{scale:10,duration:250,fps:8})`);
      assert.equal(await run("document.documentElement.getAttribute('data-last-export-format')"),format);
      const size=await run(`(async()=>{
        const blob=exportDownloads.at(-1).blob;
        if('${format}'==='gif') {
          const decoder=new ImageDecoder({data:await blob.arrayBuffer(),type:'image/gif'});
          const {image}=await decoder.decode({frameIndex:0});
          const size=[image.displayWidth,image.displayHeight];image.close();decoder.close();return size;
        }
        const url=URL.createObjectURL(blob),video=document.createElement('video');video.src=url;
        await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});
        const size=[video.videoWidth,video.videoHeight];video.removeAttribute('src');video.load();URL.revokeObjectURL(url);return size;
      })()`);
      assert.deepEqual(size,[1000,600], `${format} decodes at 10× resolution`);
    }
    const oversized=await run(`(()=>{const v=document.querySelector('.diagram-container svg');v.setAttribute('viewBox','0 0 10000 10000');return Archify.exportMenu.run('gif',{scale:10}).then(()=>({error:document.documentElement.getAttribute('data-last-export-error-format'),message:exportAlerts.at(-1)}));})()`);
    assert.equal(oversized.error,'gif');assert.match(oversized.message,/lower scale/);
    if(evidence){const bytes=await run(`scaledGif.arrayBuffer().then(b=>Array.from(new Uint8Array(b)))`);fs.writeFileSync(path.join(evidence,'scaled-3x.gif'),Buffer.from(bytes));}
  });

  await t.test('10x still images exceed the legacy pixel and side caps at native resolution', async () => {
    await load();
    const unit = await run(`(()=>{const v=document.querySelector('.diagram-container svg').viewBox.baseVal;const sub=(document.querySelector('.header .subtitle')||{}).textContent;return [v.width+104,v.height+104+(document.querySelector('.header h1')?32+(sub&&sub.trim()?24:0)+18:0)];})()`);
    assert.ok(unit[0]*10 > 8192 || unit[1]*10 > 8192);
    assert.ok(unit[0]*unit[1]*100 > 16*1024*1024);
    for (const format of ['png','jpeg','webp']) {
      const before = await run('exportDownloads.length');
      await run(`Archify.exportMenu.run('${format}',{scale:10,transparentBackground:true})`);
      assert.equal(await run('exportDownloads.length'),before+1, `${format}: ${await run('exportAlerts.at(-1)')}`);
      const result = await run(`(async()=>{const blob=exportDownloads.at(-1).blob;const image=await createImageBitmap(blob);const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=Math.round(image.height*1200/image.width);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let painted=0,transparent=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i])painted++;else transparent++;}const result={width:image.width,height:image.height,type:blob.type,painted,transparent,preview:canvas.toDataURL('image/png')};image.close();exportDownloads.length=0;exportUrls.clear();return result;})()`);
      assert.deepEqual([result.width,result.height],unit.map(n=>n*10));
      assert.equal(result.type, `image/${format}`);
      assert.ok(result.painted > 100);
      if(format==='jpeg') assert.equal(result.transparent,0);
      else assert.ok(result.transparent > 100);
      if(evidence) fs.writeFileSync(path.join(evidence,`native-10x-${format}.png`),Buffer.from(result.preview.split(',')[1],'base64'));
    }
    for (const bounds of ['0 0 3300 100','0 0 1700 1700']) {
      await run(`document.querySelector('.diagram-container svg').setAttribute('viewBox','${bounds}')`);
      for (const format of ['png','jpeg','webp']) {
        await run(`Archify.exportMenu.run('${format}',{scale:10})`);
        assert.equal(await run("document.documentElement.getAttribute('data-last-export-error-format')"),format);
        assert.match(await run('exportAlerts.at(-1)'),/lower scale/);
      }
    }
    // Motion retains its smaller per-frame budget.
    await run(`document.querySelector('.diagram-container svg').setAttribute('viewBox','0 0 900 300');Archify.exportMenu.run('gif',{scale:10})`);
    assert.equal(await run("document.documentElement.getAttribute('data-last-export-error-format')"),'gif');
  });

  await t.test('transparent WebM decodes actual alpha and motion with bounded encoder cleanup', async () => {
    await load();
    const result = await run(`(async()=>{
      const blob=await Archify.motion.recordWebm({transparentBackground:true,duration:500,fps:10});
      window.alphaBlob=blob;
      const url=URL.createObjectURL(blob),video=document.createElement('video');video.muted=true;video.src=url;
      await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('Alpha WebM decode failed'));});
      const painted=new Promise(resolve=>video.requestVideoFrameCallback(resolve));await video.play();await painted;video.pause();
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0);
      const first=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=0.3;});
      ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(video,0,0);
      const second=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let transparent=0,opaque=0,changed=0;for(let i=3;i<first.length;i+=4){if(first[i]===0)transparent++;if(first[i]===255)opaque++;if(first[i-1]!==second[i-1]||first[i]!==second[i])changed++;}
      const duration=video.duration;
      video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
      return {transparent,opaque,changed,duration,size:blob.size};
    })()`);
    assert.ok(result.transparent > 100, JSON.stringify(result));
    assert.ok(result.opaque > 100, JSON.stringify(result));
    assert.ok(result.changed > 10, JSON.stringify(result));
    assert.equal(result.duration, 0.5);
    assert.ok(result.size > 0);
    assert.ok((await record('webm-alpha')).urls.every(u=>u.revoked));
    if(evidence){const bytes=await run(`alphaBlob.arrayBuffer().then(b=>Array.from(new Uint8Array(b)))`);fs.writeFileSync(path.join(evidence,'transparent.webm'),Buffer.from(bytes));}
    await load({ theme: 'light' });
    await run('Archify.exportMenu.open()');
    await click('[data-action="transparent-background"]');
    await click('[data-format="webm"]');
    await run('exportWait(()=>exportDownloads.length===1)');
    assert.equal(await run(`document.documentElement.getAttribute('data-last-export-format')`), 'webm');
    assert.equal(await run(`(async()=>{const url=URL.createObjectURL(exportDownloads[0].blob),v=document.createElement('video');v.src=url;await new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=reject;});const duration=v.duration;v.removeAttribute('src');v.load();URL.revokeObjectURL(url);return duration;})()`), 6);
    await run('Archify.exportMenu.open()');
    await click('[data-action="transparent-background"]');
    await run('window.VideoEncoder=undefined');
    await run('Archify.exportMenu.open()');
    await click('[data-action="transparent-background"]');
    assert.equal(await run(`document.querySelector('[data-format="webm"]').disabled`), true);
    await click('[data-action="transparent-background"]');
    assert.equal(await run(`document.querySelector('[data-format="webm"]').disabled`), false);
    await load();
    const cleanup = await run(`(async()=>{
      const Native=VideoEncoder;let configured=0,closed=0;
      window.VideoEncoder=class extends Native {
        configure(config){if(++configured===2)throw new Error('alpha configure fault');super.configure(config);}
        close(){closed++;super.close();}
      };
      let message='';try{await Archify.motion.recordWebm({transparentBackground:true,duration:250,fps:10});}catch(e){message=e.message;}
      await new Promise(resolve=>setTimeout(resolve,0));
      return {message,closed,revoked:[...exportUrls.values()].every(u=>u.revoked),errors:exportErrors};
    })()`);
    assert.deepEqual(cleanup, { message: 'alpha configure fault', closed: 2, revoked: true, errors: [] });
  });

  await t.test('GIF menu frame rate changes decoded frames and preserves duration, transparency and keyboard selection', async () => {
    await load({theme:'light'});
    await run('Archify.exportMenu.open()');
    await click('[data-action="transparent-background"]');
    assert.equal(await run('document.getElementById("export-gif-fps").value'), '12');
    for (const [index, fps] of [12,24,30,50].entries()) {
      await run('Archify.exportMenu.open();document.getElementById("export-gif-fps").focus()');
      await key('Home', 'Home', 36);
      for(let step=0;step<index;step++)await key('ArrowDown', 'ArrowDown', 40);
      assert.equal(await run('document.activeElement.id'), 'export-gif-fps');
      assert.equal(await run('document.getElementById("export-gif-fps").value'), String(fps));
      await run(`Archify.exportMenu.run('gif',{duration:1000,scale:1})`);
      const result=await run(`(async()=>{
        const decoder=new ImageDecoder({data:await exportDownloads.at(-1).blob.arrayBuffer(),type:'image/gif'});
        await decoder.tracks.ready;const count=decoder.tracks.selectedTrack.frameCount;
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');let duration=0,blankPainted=0;
        for(let i=0;i<count;i++){
          const {image}=await decoder.decode({frameIndex:i});duration+=image.duration;
          canvas.width=image.displayWidth;canvas.height=image.displayHeight;ctx.drawImage(image,0,0);image.close();
          const blank=ctx.getImageData(0,0,100,30).data;for(let p=3;p<blank.length;p+=4)if(blank[p])blankPainted++;
        }
        decoder.close();return {count,duration,blankPainted};
      })()`);
      assert.equal(result.count,fps);assert.equal(result.duration,1000000);assert.equal(result.blankPainted,0);
    }
    await run(`Archify.exportMenu.run('gif',{duration:1000,fps:8,scale:1})`);
    assert.equal(await run(`(async()=>{const d=new ImageDecoder({data:await exportDownloads.at(-1).blob.arrayBuffer(),type:'image/gif'});await d.tracks.ready;const n=d.tracks.selectedTrack.frameCount;d.close();return n;})()`),8,'explicit API fps overrides menu selection');
    await record('gif-frame-rates');
  });

  await t.test('GIF decodes looping motion and binary transparency without MediaRecorder or trace mode', async () => {
    for (const [transparent,theme] of [[false,'dark'],[false,'light'],[true,'dark'],[true,'light']]) {
      await load({theme});
      const result=await run(`(async()=>{
        window.MediaRecorder=undefined;
        const svg=document.querySelector('.diagram-container svg');svg.removeAttribute('data-animation');
        svg.querySelectorAll('[data-animate]').forEach(e=>e.removeAttribute('data-animate'));
        const blob=await Archify.motion.recordGif({duration:500,fps:12,transparentBackground:${transparent}});
        window.gifBlob=blob;
        const decoder=new ImageDecoder({data:await blob.arrayBuffer(),type:'image/gif'});
        await decoder.tracks.ready;
        const count=decoder.tracks.selectedTrack.frameCount,loop=decoder.tracks.selectedTrack.repetitionCount;
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
        let first,changed=0,transparent=0,opaque=0,duration=0,blankPainted=0;
        for(let i=0;i<count;i++){
          const {image}=await decoder.decode({frameIndex:i});duration+=image.duration;
          canvas.width=image.displayWidth;canvas.height=image.displayHeight;ctx.drawImage(image,0,0);image.close();
          const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
          // A transparent corner alone misses a grid baked into the canvas.
          // This empty strip crosses grid lines; check it in every decoded frame.
          const blank=ctx.getImageData(0,0,100,30).data;
          for(let p=3;p<blank.length;p+=4)if(blank[p])blankPainted++;
          if(!first){first=pixels;for(let p=3;p<pixels.length;p+=4){if(pixels[p]===0)transparent++;if(pixels[p]===255)opaque++;}}
          else if(i===count-1)for(let p=0;p<pixels.length;p++)if(pixels[p]!==first[p])changed++;
        }
        decoder.close();return {count,loop:loop===Infinity?'infinite':loop,duration,changed,transparent,opaque,blankPainted,size:blob.size,type:blob.type};
      })()`);
      assert.equal(result.count,6);assert.equal(result.loop,'infinite');
      assert.equal(result.duration,500000);assert.ok(result.changed>10,JSON.stringify(result));
      assert.ok(result.opaque>100);assert.equal(result.type,'image/gif');
      assert.ok(transparent?result.transparent>100:result.transparent===0,JSON.stringify(result));
      if(transparent)assert.equal(result.blankPainted,0,'transparent GIF paints its empty canvas');
      assert.ok((await record('gif-'+transparent+'-'+theme)).urls.every(u=>u.revoked));
      if(evidence){const bytes=await run(`gifBlob.arrayBuffer().then(b=>Array.from(new Uint8Array(b)))`);fs.writeFileSync(path.join(evidence,(transparent?'transparent':'opaque')+'-'+theme+'.gif'),Buffer.from(bytes));}
    }
    await load();await run('Archify.exportMenu.open()');await click('[data-format="gif"]');
    await run('exportWait(()=>exportDownloads.length===1)');
    const state=await record('gif-menu');
    assert.equal(state.receipt['data-last-export-format'],'gif');assert.ok(state.downloads[0].name.endsWith('.gif'));
    assert.equal(await run(`(async()=>{const decoder=new ImageDecoder({data:await exportDownloads[0].blob.arrayBuffer(),type:'image/gif'});await decoder.tracks.ready;const count=decoder.tracks.selectedTrack.frameCount;decoder.close();return count;})()`),72);
    await load();
    const failed=await run(`(async()=>{const native=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=()=>{throw Error('gif pixels unavailable');};let message='';try{await Archify.motion.recordGif({duration:250});}catch(e){message=e.message;}finally{CanvasRenderingContext2D.prototype.getImageData=native;}await new Promise(r=>setTimeout(r,0));return {message,revoked:[...exportUrls.values()].every(u=>u.revoked)};})()`);
    assert.deepEqual(failed,{message:'gif pixels unavailable',revoked:true});
  });

  await t.test('recording succeeds with real encoding and releases tracks and the background URL', async () => {
    await load();assert.equal(await run('Archify.motion.canRecord()'),true);
    const result = await run(`(async()=>{const blob=await Archify.motion.recordWebm({duration:500,fps:10});window.recordedBlob=blob;const url=URL.createObjectURL(blob),video=document.createElement('video');video.muted=true;video.src=url;await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(new Error('WebM decode failed'));});const dimensions=[video.videoWidth,video.videoHeight];const painted=new Promise(resolve=>video.requestVideoFrameCallback(resolve));await video.play();await painted;video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);return {type:blob.type,nonempty:blob.size>0,dimensions,cancelled:exportCancelled.length>0};})()`);
    assert.match(result.type,/^video\/webm/);assert.equal(result.nonempty,true);assert.equal(result.cancelled,true);assert.ok(result.dimensions.every(n=>n>0&&n%2===0));
    const state = await record('webm-real');assert.ok(state.tracks.length>0);assert.ok(state.tracks.every(s=>s==='ended'));assert.ok(state.urls.every(u=>u.revoked));assert.deepEqual(state.console,[]);
    if(evidence){const bytes=await run(`(async()=>Array.from(new Uint8Array(await recordedBlob.arrayBuffer())))()`);fs.writeFileSync(path.join(evidence,'recording.webm'),Buffer.from(bytes));}
  });

  await t.test('all five renderer families animate anonymous geometry without trace or node pulses', async () => {
    const original=fs.readFileSync(file);
    try {for(const [mode,fixture]of [['architecture','web-app.architecture.json'],['workflow','agent-tool-call.workflow.json'],['sequence','cache-miss-request.sequence.json'],['dataflow','product-analytics.dataflow.json'],['lifecycle','agent-run.lifecycle.json']]){
      execFileSync(process.execPath,[path.join(skillRoot,`renderers/${mode}/render-${mode}.mjs`),path.join(skillRoot,'examples',fixture),file]);
      await load();
    const result=await run(`(async()=>{
      document.querySelectorAll('[data-edge-id]').forEach(el=>el.removeAttribute('data-edge-id'));
      document.querySelectorAll('[data-node-id]').forEach(el=>el.removeAttribute('data-node-id'));
      document.querySelectorAll('[data-animate]').forEach(el=>el.removeAttribute('data-animate'));
      const blob=await Archify.motion.recordGif({duration:1000,fps:12,scale:1});window.anonymousGif=blob;
      const decoder=new ImageDecoder({data:await blob.arrayBuffer(),type:'image/gif'});await decoder.tracks.ready;
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');let first,changed=0;
      for(let i=0;i<decoder.tracks.selectedTrack.frameCount;i++){
        const {image}=await decoder.decode({frameIndex:i});canvas.width=image.displayWidth;canvas.height=image.displayHeight;ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        if(!first)first=new Uint8ClampedArray(pixels);else for(let j=0;j<pixels.length;j+=4)if(pixels[j]!==first[j]||pixels[j+1]!==first[j+1]||pixels[j+2]!==first[j+2])changed++;
        image.close();
      }
      const count=decoder.tracks.selectedTrack.frameCount;decoder.close();return {changed,count,width:canvas.width,height:canvas.height};
    })()`);
    assert.equal(result.count,12);assert.ok(result.changed>10,JSON.stringify(result));
    records.push({name:mode+'-anonymous-edge-gif',...result});
    if(evidence){const bytes=await run(`(async()=>Array.from(new Uint8Array(await anonymousGif.arrayBuffer())))()`);fs.writeFileSync(path.join(evidence,mode+'-anonymous-edges.gif'),Buffer.from(bytes));}
    }}finally{fs.writeFileSync(file,original);}
  });

  await t.test('anonymous edges animate in decoded GIF frames without node pulses', async () => {
    await load();
    const result=await run(`(async()=>{
      document.querySelectorAll('[data-edge-id]').forEach(el=>el.removeAttribute('data-edge-id'));
      document.querySelectorAll('[data-node-id]').forEach(el=>el.removeAttribute('data-node-id'));
      const blob=await Archify.motion.recordGif({duration:1000,fps:12,scale:1});window.anonymousGif=blob;
      const decoder=new ImageDecoder({data:await blob.arrayBuffer(),type:'image/gif'});await decoder.tracks.ready;
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');let first,changed=0;
      for(let i=0;i<decoder.tracks.selectedTrack.frameCount;i++){
        const {image}=await decoder.decode({frameIndex:i});canvas.width=image.displayWidth;canvas.height=image.displayHeight;ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        if(!first)first=new Uint8ClampedArray(pixels);else for(let j=0;j<pixels.length;j+=4)if(pixels[j]!==first[j]||pixels[j+1]!==first[j+1]||pixels[j+2]!==first[j+2])changed++;
        image.close();
      }
      const count=decoder.tracks.selectedTrack.frameCount;decoder.close();return {changed,count,width:canvas.width,height:canvas.height};
    })()`);
    assert.equal(result.count,12);assert.ok(result.changed>10,JSON.stringify(result));
    records.push({name:'anonymous-edge-gif',...result});
    if(evidence){const bytes=await run(`(async()=>Array.from(new Uint8Array(await anonymousGif.arrayBuffer())))()`);fs.writeFileSync(path.join(evidence,'anonymous-edges.gif'),Buffer.from(bytes));}
  });

  await t.test('menu recording writes its receipt and downloads the real default-duration WebM', async () => {
    await load();await run('Archify.exportMenu.open()');
    await click('[data-format="webm"]');
    await run('exportWait(()=>exportDownloads.length===1)');
    const state=await record('webm-download');
    assert.equal(state.active,'btn-export');assert.equal(state.receipt['data-last-export-format'],'webm');
    assert.equal(state.receipt['data-last-export-canonical'],'true');assert.deepEqual(state.console,[]);
    assert.ok(state.downloads[0].name.endsWith('.webm'));assert.match(state.downloads[0].type,/^video\/webm/);
    assert.equal(await run('Number(document.documentElement.dataset.lastMotionBytes)===exportDownloads[0].blob.size&&exportDownloads[0].blob.size>0'),true);
    assert.ok(state.tracks.length>0);assert.ok(state.tracks.every(s=>s==='ended'));
    assert.deepEqual(state.urls.map(u=>u.revoked),[true,false]);
    await run('exportWait(()=>[...exportUrls.values()].every(u=>u.revoked))');
  });

  await t.test('recording constructor/error/empty failures clean up and public run disables WebM', async () => {
    for (const fault of ['constructor','error','empty','start','requestData','stop','silent-stop','draw','later-draw','capture']) {
      await load();
      await run(`window.MediaRecorder=class {
        static isTypeSupported(){return true;}
        constructor(){if(${JSON.stringify(fault)}==='constructor')throw new Error('recorder constructor');this.state='inactive';this.mimeType='video/webm';}
        start(){if(${JSON.stringify(fault)}==='start')throw Error('recorder start');this.state='recording';if(${JSON.stringify(fault)}==='error')setTimeout(()=>{this.state='inactive';this.onerror({error:new Error('recorder error')});},20);}
        requestData(){if(${JSON.stringify(fault)}==='requestData')throw Error('recorder requestData');} stop(){if(${JSON.stringify(fault)}==='stop')throw Error('recorder stop');this.state='inactive';if(${JSON.stringify(fault)}!=='silent-stop'&&this.onstop)this.onstop();}
      };`);
      await run(`(()=>{const fault=${JSON.stringify(fault)};
        if(fault==='capture')HTMLCanvasElement.prototype.captureStream=()=>{throw Error('capture failure')};
        if(fault==='draw'||fault==='later-draw'){const native=CanvasRenderingContext2D.prototype.drawImage;let count=0;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(++count>(fault==='draw'?0:1))throw Error('drawing failure');return native.apply(this,args)}}
      })()`);
      assert.equal(await run('Archify.motion.recordWebm({duration:250,fps:10}).then(()=>false,()=>true)'),true);
      const state=await record('webm-'+fault);assert.ok(state.urls.every(u=>u.revoked));if(fault!=='capture')assert.ok(state.tracks.length>0);assert.ok(state.tracks.every(s=>s==='ended'));
      const later=await record('webm-'+fault+'-settled');assert.deepEqual(later.errors,[]);
    }
    await load({extra:'&fault=unsupported'});
    await run(`Archify.exportMenu.run('webm')`);
    const state=await record('webm-unavailable');assert.equal(state.receipt['data-last-export-error-format'],'webm');assert.deepEqual(state.alerts,[]);
    assert.deepEqual(await run(`(()=>{const b=document.querySelector('[data-format="webm"]');return {disabled:b.disabled,opacity:b.style.opacity};})()`),{disabled:true,opacity:'0.5'});
  });
});
