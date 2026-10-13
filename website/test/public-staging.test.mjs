import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { stagePublic } from '../scripts/stage-public.mjs';

test('public staging excludes untracked files and rejects external symlinks and URL collisions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-public-'));
  const output = path.join(root, 'output');
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  const write = (file, text) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); };
  try {
    git('init', '-q');
    write('docs/index.html', 'legacy page');
    write('docs/cases/demo.html', 'interactive artifact');
    write('website/public/new.svg', '<svg/>');
    git('add', '.');
    write('docs/private-note.txt', 'not for publication');
    stagePublic(root, output);
    assert.equal(fs.readFileSync(path.join(output, 'cases/demo.html'), 'utf8'), 'interactive artifact');
    assert.equal(fs.existsSync(path.join(output, 'new.svg')), true);
    assert.equal(fs.existsSync(path.join(output, 'index.html')), false);
    assert.equal(fs.existsSync(path.join(output, 'private-note.txt')), false);
    // Windows directory junctions need no symlink privilege and exercise the
    // same ancestor-link rejection in production staging.
    const link = process.platform === 'win32' ? 'docs/link' : 'docs/link.txt';
    if(process.platform === 'win32') {
      write('outside/private-note.txt', 'external content');
      fs.symlinkSync(path.join(root,'outside'),path.join(root,link),'junction');
    } else fs.symlinkSync(path.join(root,'docs/private-note.txt'),path.join(root,link));
    git('add', link);
    assert.throws(() => stagePublic(root, output), /symlink/);
    git('rm', '-r', '--cached', link);
    write('website/public/cases/demo.html', 'collision');
    git('add', 'website/public/cases/demo.html');
    assert.throws(() => stagePublic(root, output), /Duplicate public URL/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
