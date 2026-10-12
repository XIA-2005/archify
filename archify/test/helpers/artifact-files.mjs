import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// A source ZIP has no Git index. Still inspect its maintained artifact roots;
// never follow links or include scratch directories outside those roots.
export function htmlArtifacts(root, roots) {
  const tracked = spawnSync('git', ['ls-files', '-z', '--', ...roots], { cwd: root, encoding: 'utf8' });
  if (tracked.status === 0) return tracked.stdout.split('\0').filter(name => name.endsWith('.html')).sort();
  if (!tracked.error && !/not a git repository/i.test(tracked.stderr || '')) throw new Error(tracked.stderr);
  if (tracked.error && tracked.error.code !== 'ENOENT') throw tracked.error;
  const files = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute) || fs.lstatSync(absolute).isSymbolicLink()) return;
    if (fs.statSync(absolute).isDirectory()) {
      for (const entry of fs.readdirSync(absolute)) visit(path.join(relative, entry));
    } else if (relative.endsWith('.html')) files.push(relative.split(path.sep).join('/'));
  }
  roots.forEach(visit);
  return files.sort();
}
