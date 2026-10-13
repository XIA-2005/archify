// Lightweight viewport/search/minimap helpers. No SVG path synthesis: edge
// geometry always comes from the official Archify renderer.
export const LARGE_GRAPH_THRESHOLD = 100;

export function nodeBox(node) {
  return {x:node.pos?.[0] ?? 0,y:node.pos?.[1] ?? 0,
    w:node.size?.[0] ?? 120,h:node.size?.[1] ?? 60};
}

export function sceneBounds(nodes) {
  if (!nodes?.length) return {x:0,y:0,w:1200,h:700};
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const node of nodes) {
    const box=nodeBox(node);
    left=Math.min(left,box.x);top=Math.min(top,box.y);
    right=Math.max(right,box.x+box.w);bottom=Math.max(bottom,box.y+box.h);
  }
  return {x:left,y:top,w:Math.max(1,right-left),h:Math.max(1,bottom-top)};
}

export function intersectsViewport(box,camera,padding=0) {
  if (!camera) return true;
  return box.x+box.w >= camera.x-padding && box.x <= camera.x+camera.w+padding
    && box.y+box.h >= camera.y-padding && box.y <= camera.y+camera.h+padding;
}

export function routeBox(route) {
  if (!route) return null;
  const points=route.points || [];
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const p of points) {
    left=Math.min(left,p[0]);top=Math.min(top,p[1]);
    right=Math.max(right,p[0]);bottom=Math.max(bottom,p[1]);
  }
  const label=route.labelBox;
  if (label) {
    left=Math.min(left,label.x);top=Math.min(top,label.y);
    right=Math.max(right,label.x+label.width);
    bottom=Math.max(bottom,label.y+label.height);
  }
  return Number.isFinite(left)?{x:left,y:top,w:right-left,h:bottom-top}:null;
}

export function levelOfDetail(camera,stageWidth) {
  if (!camera || !stageWidth) return 'detail';
  const unitsPerPixel=camera.w/stageWidth;
  return unitsPerPixel>=9?'overview':unitsPerPixel>=3?'compact':'detail';
}

export function searchNodes(nodes,query) {
  const term=String(query||'').trim().toLocaleLowerCase();
  if (!term) return [];
  const results=[];
  for (const node of nodes) {
    const id=String(node.id||'').toLocaleLowerCase();
    const label=String(node.label||'').toLocaleLowerCase();
    const sub=String(node.sublabel||'').toLocaleLowerCase();
    if (id.includes(term)||label.includes(term)||sub.includes(term)) {
      const rank=id===term?0:label===term?1:id.startsWith(term)?2:label.startsWith(term)?3:4;
      results.push({node,rank});
    }
  }
  return results.sort((a,b)=>a.rank-b.rank).map(x=>x.node);
}

export function minimapProjection(nodes,width=210,height=140,padding=10) {
  if (!(width>2*padding && height>2*padding)) throw new Error('小地图尺寸无效');
  const world=sceneBounds(nodes);
  const scale=Math.min((width-2*padding)/world.w,(height-2*padding)/world.h);
  const left=(width-world.w*scale)/2,top=(height-world.h*scale)/2;
  const toMap=(x,y)=>[left+(x-world.x)*scale,top+(y-world.y)*scale];
  const toWorld=(x,y)=>[world.x+(x-left)/scale,world.y+(y-top)/scale];
  const rect=box=>{const [x,y]=toMap(box.x,box.y);return {x,y,w:box.w*scale,h:box.h*scale};};
  return {world,scale,toMap,toWorld,rect,width,height};
}
