import { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stageCleanSkill } from '../../../scripts/stage-clean-skill.mjs';

const fixtures = new Map();
const directories = new Set();
after(() => {
  for (const directory of directories) fs.rmSync(directory,{recursive:true,force:true});
});
export function sourceGitEnvironment(root) {
  if (fixtures.has(root)) return fixtures.get(root);
  const probe = spawnSync('git',['rev-parse','--show-toplevel'],{cwd:root,encoding:'utf8'});
  if (probe.status === 0) return {};
  assert.match(probe.stderr || '',/not a git repository/i);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(),'archify-exported-source-index-'));
  directories.add(fixture);
  const emptyConfig = path.join(fixture,'empty.gitconfig');
  fs.writeFileSync(emptyConfig,'');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env,{GIT_CONFIG_GLOBAL:emptyConfig,GIT_CONFIG_NOSYSTEM:'1'});
  const git = args => {
    const result=spawnSync('git',args,{cwd:root,env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
  };
  git(['init','--bare','--template=',path.join(fixture,'git')]);
  Object.assign(env,{GIT_DIR:path.join(fixture,'git'),GIT_WORK_TREE:root,GIT_INDEX_FILE:path.join(fixture,'index')});
  git(['add','--','archify','LICENSE','THIRD_PARTY_NOTICES.md','.gitattributes']);
  git(['-c','user.name=Archify Test','-c','user.email=archify-test@example.invalid','commit','-m','Exported source test fixture']);
  const overrides=Object.fromEntries(Object.entries(env).filter(([key])=>key.startsWith('GIT_')));
  fixtures.set(root,overrides);
  return overrides;
}

// Only the isolated test call sees this index. Production staging is unchanged.
export function stageSourceSkill(options) {
  const env=sourceGitEnvironment(options.repoRoot);
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  Object.assign(process.env,env);
  if(previous.GIT_INDEX_FILE)process.env.GIT_INDEX_FILE=previous.GIT_INDEX_FILE;
  try{return stageCleanSkill(options);}
  finally {
    for(const [key,value] of Object.entries(previous)) {
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
}
