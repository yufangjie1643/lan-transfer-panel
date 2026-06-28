import { spawn } from 'node:child_process';

const children = [
  spawnChild('node scripts/dev-server.js'),
  spawnChild('npm --prefix desktop run dev'),
];

let exiting = false;

function stopAll(signal = 'SIGTERM') {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (!child.killed && child.exitCode === null) child.kill(signal);
  }
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (exiting) return;
    if (code && code !== 0) {
      stopAll();
      process.exitCode = code;
      return;
    }
    if (signal) {
      stopAll(signal);
    }
  });
}

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));

function spawnChild(command) {
  const child = spawn(command, {
    cwd: process.cwd(),
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  return child;
}
