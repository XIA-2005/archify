import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {stageSourceSkill} from './source-index.mjs';

// Build a real archive for installation tests on every supported Node lane.
// Canonical release-byte reproducibility remains covered on official Node 22.
export function buildSourceArchive(repoRoot,directory){
  const stage=path.join(directory,'stage','archify'),modes=path.join(directory,'modes.json');
  stageSourceSkill({repoRoot,destination:stage,modeManifest:modes});
  const archive=path.join(directory,'archify.zip');
  const result=spawnSync(process.execPath,[path.join(repoRoot,'scripts/write-deterministic-zip.mjs'),stage,archive,'--mode-manifest',modes],{encoding:'utf8'});
  assert.equal(result.status,0,result.error?.message||result.stderr);
  return archive;
}
