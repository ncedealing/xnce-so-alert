#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIN_NODE_MAJOR = 20;

function run(label, command, args) {
  console.log(`\n[${label}] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function nodeMajor() {
  const match = /^v?(\d+)/.exec(process.version);
  return match ? Number(match[1]) : 0;
}

function main() {
  if (nodeMajor() < MIN_NODE_MAJOR) {
    console.error(`Node.js 版本过低: ${process.version}，需要 Node.js ${MIN_NODE_MAJOR}+。`);
    process.exit(2);
  }
  console.log(`Node: ${process.execPath} (${process.version})`);

  const skipTests = process.argv.includes('--skip-tests');
  if (skipTests) {
    console.log('\n环境依赖检查完成。');
    return;
  }

  run('Node syntax', process.execPath, ['--check', path.join(ROOT, 'src', 'web.js')]);
  run('App syntax', process.execPath, ['--check', path.join(ROOT, 'src', 'app.js')]);
  run('UI build', 'npm', ['run', 'ui:build']);
  run('Test suite', 'npm', ['test']);
  console.log('\n部署前检查通过。');
  console.log('启动命令: npm run web');
}

main();
