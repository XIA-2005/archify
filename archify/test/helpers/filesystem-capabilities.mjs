import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const fileSymlinkSkip = (() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-file-symlink-probe-'));
  try {
    const target = path.join(root, 'target');
    fs.writeFileSync(target, 'probe');
    fs.symlinkSync(target, path.join(root, 'alias'), 'file');
    return false;
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return 'file symlink creation is unavailable on this host';
    throw error;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();
