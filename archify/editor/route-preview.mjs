// Use the ACTUAL Archify renderer to obtain editor geometry.
// Never duplicate its orthogonal route solver in the browser.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function attributes(fragment) {
  const fields = {};
  for (const [, key, value] of fragment.matchAll(/([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g)) {
    fields[key] = value;
  }
  return fields;
}

export function extractArchifyRoutes(html, expectedCount) {
  const marker = html.indexOf('<!-- Main Diagram -->');
  const start = html.indexOf('<svg ', marker >= 0 ? marker : 0);
  const end = html.indexOf('</svg>', start);
  if (start < 0 || end < 0) throw new Error('Archify 未生成 SVG 主图');
  const svg = html.slice(start, end);
  const routes = new Map();
  for (const [tag] of svg.matchAll(/<path\b[^>]*\/>/g)) {
    if (!tag.includes('data-edge-key=')) continue;
    const attr = attributes(tag);
    if (attr['data-edge-key'] === undefined || !attr.d) continue;
    const key = Number(attr['data-edge-key']);
    if (!Number.isSafeInteger(key) || routes.has(key)) throw new Error('Archify 连线索引重复或非法');
    routes.set(key, {
      key, id: attr['data-edge-id'] || null, from: attr['data-edge-from'], to: attr['data-edge-to'],
      d: attr.d, strokeWidth: Number(attr['stroke-width'] || 1.5),
      points: (attr['data-composition-points'] || '').split(';').filter(Boolean).map(pair => pair.split(',').map(Number)),
      halo: attr['data-composition-crossover'] === 'halo',
    });
  }
  // The renderer emits labels separately from paths, but shares the same data-edge-key.
  for (const [, header, contents] of svg.matchAll(/<g\s+([^>]*data-detail="context"[^>]*)>([\s\S]*?)<\/g>/g)) {
    const attr = attributes(header);
    if (attr['data-edge-key'] === undefined) continue;
    const route = routes.get(Number(attr['data-edge-key']));
    if (!route) continue;
    const rectMatch = contents.match(/<rect\b([^>]*)\/>/);
    const textMatch = contents.match(/<text\b([^>]*)>/);
    if (!rectMatch || !textMatch) throw new Error('Archify 连线标签结构不完整');
    const rect = attributes(rectMatch[1]), label = attributes(textMatch[1]);
    route.labelBox = {
      x: Number(rect.x), y: Number(rect.y), width: Number(rect.width),
      height: Number(rect.height), rx: Number(rect.rx || 3),
      textX: Number(label.x), textY: Number(label.y),
      fontSize: Number(label['font-size'] || 8),
    };
  }
  if (routes.size !== expectedCount) {
    throw new Error('Archify 连线数与候选 JSON 不匹配（预期 ' + expectedCount
      + '，获得 ' + routes.size + '）；拒绝显示不准确的预览');
  }
  for (const route of routes.values()) {
    if (!route.points?.length || route.points.some(p => p.length !== 2 || p.some(n => !Number.isFinite(n)))
      || typeof route.d !== 'string' || !/^M[\s\d.-]/.test(route.d)
      || !Number.isFinite(route.strokeWidth)
      || (route.labelBox && Object.values(route.labelBox).some(v => !Number.isFinite(v)))) {
      throw new Error('Archify 返回了不可用的连线路径或标签');
    }
  }
  return [...routes.values()].sort((a,b) => a.key - b.key);
}

export async function renderArchifyRoutes({ candidate, cli, cwd, repoRoot = cwd, repositoryBacked = false, signal }) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'archify-route-preview-'));
  const input = path.join(directory, 'candidate.json');
  const output = path.join(directory, 'preview.html');
  try {
    await fs.promises.writeFile(input, JSON.stringify(candidate), { flag: 'wx' });
    const argv = [cli, 'render', 'architecture', input, output, '--quality',
      candidate.meta.quality_profile || 'showcase',
      ...(repositoryBacked ? ['--repo-root', repoRoot] : [])];
    try {
      await execFileAsync(process.execPath, argv, {
        cwd, encoding: 'utf8', timeout: 20000, maxBuffer: 2_000_000,
        windowsHide: true, signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('Archify 正式渲染失败：'
        + (error.stderr?.trim() || error.message).slice(0, 700));
    }
    if (signal?.aborted) {
      const error = new Error('预览已取消');
      error.name = 'AbortError';
      throw error;
    }
    const html = await fs.promises.readFile(output, 'utf8');
    const start = html.indexOf('<svg ', html.indexOf('<!-- Main Diagram -->'));
    const end = html.indexOf('</svg>', start) + 6;
    return { edges: extractArchifyRoutes(html, (candidate.connections||[]).length), sceneSvg: html.slice(start, end) };
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
