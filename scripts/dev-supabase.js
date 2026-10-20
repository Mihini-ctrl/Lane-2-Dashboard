'use strict';

const { spawn } = require('node:child_process');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'backend:dev'], { stdio: 'inherit' }),
  spawn(npm, ['start'], { stdio: 'inherit' })
];
let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  });
}

children.forEach((child) => {
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop('SIGTERM');
  });
  child.on('exit', (code, signal) => {
    if (stopping) return;
    process.exitCode = code || (signal ? 1 : 0);
    stop('SIGTERM');
  });
});

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
