import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function gitTool(name) {
  if (process.platform !== 'win32') return name;
  const git = spawnSync('where.exe',['git'],{encoding:'utf8'});
  for (const executable of (git.stdout || '').trim().split(/\r?\n/)) {
    const root = path.resolve(path.dirname(executable),'..');
    for (const directory of ['bin','usr/bin']) {
      const candidate=path.join(root,directory,`${name}.exe`);
      if(fs.existsSync(candidate))return candidate;
    }
  }
  return name;
}
