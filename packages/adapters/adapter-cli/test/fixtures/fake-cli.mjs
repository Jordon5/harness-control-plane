#!/usr/bin/env node
// 假 CLI：供 adapter-cli 契约测试驱动。模式由第一个参数决定。
const mode = process.argv[2] ?? 'ok';

if (mode === 'fail') {
  process.stderr.write('boom\n');
  process.exit(2);
}

if (mode === 'hang') {
  setInterval(() => {}, 1000);
} else {
  process.stdout.write(JSON.stringify({ type: 'line', text: 'one' }) + '\n');
  process.stdout.write('plain-not-json\n');
  process.stderr.write('warn-line\n');
  setTimeout(() => process.exit(0), 10);
}
