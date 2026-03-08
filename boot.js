#!/usr/bin/env node
// Ammonite boot — headless.
// Assembles: shell (from file or memory) + storage adapter + LLM adapter → kernel.
// Usage:
//   node ammonite/boot.js                        # echo LLM, memory storage
//   node ammonite/boot.js --shell path/to/shell.json   # load from file
//   node ammonite/boot.js --live                  # Anthropic API (needs ANTHROPIC_API_KEY)
//   node ammonite/boot.js --tick                  # run one concern tick
//   node ammonite/boot.js --message "Hello"       # send a message

import { createKernel } from './kernel.js';
import { createMemoryStorage } from './adapters/storage/memory.js';
import { createFilesystemStorage } from './adapters/storage/filesystem.js';
import { createEchoLLM } from './adapters/llm/echo.js';
import { createAnthropicLLM } from './adapters/llm/anthropic.js';
import { readFileSync } from 'fs';

// ---- Parse args ----
const args = process.argv.slice(2);
function flag(name) { return args.includes('--' + name); }
function arg(name) {
  const i = args.indexOf('--' + name);
  return (i >= 0 && i + 1 < args.length) ? args[i + 1] : null;
}

// ---- Assemble ----

// Shell
let initialShell = null;
const shellPath = arg('shell');
if (shellPath) {
  const raw = readFileSync(shellPath, 'utf8');
  initialShell = JSON.parse(raw);
}

// Storage
const storage = shellPath
  ? createFilesystemStorage(shellPath)
  : createMemoryStorage(initialShell);

// LLM
const llm = flag('live')
  ? createAnthropicLLM(process.env.ANTHROPIC_API_KEY)
  : createEchoLLM();

// Kernel
const kernel = createKernel({ storage, llm });
kernel.load();

// ---- Act ----

const message = arg('message');

if (flag('tick')) {
  console.log('[boot] Running concern tick...');
  kernel.tick().then(() => {
    console.log('[boot] Tick complete.');
    kernel.save();
  });
} else if (message) {
  console.log(`[boot] Activating with: "${message}"`);
  kernel.activate('user', message).then(result => {
    console.log('[boot] Response:', result.text || result.error);
    console.log('[boot] Echoes:', result.echo);
    kernel.save();
  });
} else {
  // Default: print shell summary
  const shell = kernel.shell();
  const tree = shell.tree || {};
  console.log('[boot] Ammonite loaded.');
  console.log('[boot] Shell root:', tree._ || '(empty)');
  const digits = Object.keys(tree).filter(k => /^\d$/.test(k));
  for (const d of digits.sort()) {
    const node = tree[d];
    const text = typeof node === 'string' ? node : (node && node._) ? node._ : '(branch)';
    console.log(`  [${d}] ${text.slice(0, 100)}`);
  }
  console.log(`[boot] ${digits.length} subtrees. Storage: ${shellPath ? 'filesystem' : 'memory'}. LLM: ${flag('live') ? 'anthropic' : 'echo'}.`);
}
