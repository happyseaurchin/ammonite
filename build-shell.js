#!/usr/bin/env node
// Build a unified ammonite shell from hermitcrab blocks.
// Maps existing blocks to digit addresses and merges into one tree.

import { readFileSync, writeFileSync, readdirSync } from 'fs';

const BLOCKS_DIR = '../blocks';

// Address map: digit → block name
// This is the one place the mapping is defined. After this, it's just numbers.
const MAP = {
  1: 'wake',
  2: 'concerns',
  3: 'history',
  4: 'stash',
  5: 'purpose',
  6: 'relationships',
  7: 'cooking',
  8: 'touchstone',
  9: 'horizon',
};

// Secondary blocks that don't get a top-level digit
// They'll be nested or omitted for now.
const EXTRA = ['capabilities', 'institution', 'refs', 'vision'];

const shell = {
  tree: {
    _: 'Ammonite shell. One tree, many processors.',
  },
  skeleton: {},
};

// Load and merge each mapped block
for (const [digit, name] of Object.entries(MAP)) {
  try {
    const raw = readFileSync(`${BLOCKS_DIR}/${name}.json`, 'utf8');
    const block = JSON.parse(raw);
    shell.tree[digit] = block.tree;
    shell.skeleton[digit] = name;
    // Carry tuning if present
    if (block.tuning) {
      if (!shell.tree[digit] || typeof shell.tree[digit] === 'string') {
        shell.tree[digit] = { _: shell.tree[digit] || '' };
      }
      shell.tree[digit].tuning = block.tuning;
    }
    // Carry periods, tiers, dashboard if present (concerns block)
    for (const meta of ['periods', 'tiers', 'dashboard']) {
      if (block[meta]) {
        if (typeof shell.tree[digit] === 'string') shell.tree[digit] = { _: shell.tree[digit] };
        shell.tree[digit][meta] = block[meta];
      }
    }
    // Carry skeleton if present
    if (block.skeleton) {
      shell.skeleton[digit] = { _: name, skeleton: block.skeleton };
    }
    console.log(`  [${digit}] ${name} ✓`);
  } catch (e) {
    console.log(`  [${digit}] ${name} — skipped: ${e.message}`);
  }
}

// Write the unified shell
const outPath = './shell.json';
writeFileSync(outPath, JSON.stringify(shell, null, 2));
console.log(`\nShell written to ${outPath} (${(JSON.stringify(shell).length / 1024).toFixed(0)} KB)`);
