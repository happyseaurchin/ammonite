#!/usr/bin/env node
// Test: Can the GENERIC unfold execute a Mode 4 block
// and produce the same BSP spindle output as the 297-line bsp.js?
//
// Previous proof used a hand-written unfoldSpindle function.
// THIS proof uses unfold() directly. The Mode 4 block IS the code.

import { nav, read, unfold, RT } from './core.js';
import { bsp } from './bsp.js';
import { readFileSync } from 'fs';

// ============ THE MODE 4 BLOCK ============
// BSP spindle as a pscale program. No JavaScript function needed.
// The generic unfold walks this block step by step.

const BSP_SPINDLE = {
  _: 'BSP spindle — parse address, walk tree, collect nodes with pscale',
  1: { _: 'split $address .' },                        // parse semantic number
  2: { _: 'get #1 0' },                                // integer part
  3: { _: 'get #1 1' },                                // fractional part
  4: { _: 'eq #2 0' },                                 // delineation?
  5: { _: 'if #4', 1: 'chars #3', 2: 'chars #2' },    // walk digits
  6: { _: 'if #4', 1: 'int 0', 2: 'len #2' },         // decimal position
  7: { _: 'let decimal #6' },                          // store for loop access
  8: { _: 'each #5',                                   // walk digits, collect
    1: 'nav $node $item',                               //   advance into tree
    2: 'let node #1',                                   //   carry node forward
    3: 'read #1',                                       //   text at this depth
    4: 'sub $decimal $i',                               //   pscale = decimal - i
    5: 'sub #4 1',                                      //   adjust for 1-indexed depth
    6: { _: 'if #3', 1: 'arr #5 #3', 2: 'arr' },       //   [pscale, text] or []
    7: 'return #6',                                     //   yield to collector
  },
};

// ============ TEST ============

const shell = JSON.parse(readFileSync('shell.json', 'utf8'));
const tree = shell.tree;

const testAddresses = [
  0.121,    // Delineation: walk 1→2→1
  0.21,     // Delineation: walk 2→1
  0.8,      // Delineation: walk 8 (touchstone)
  0.12,     // Delineation: walk 1→2
  0.511,    // Delineation: walk 5→1→1
];

console.log('=== GENERIC UNFOLD: Mode 4 block vs bsp.js ===\n');

let pass = 0, fail = 0;

for (const addr of testAddresses) {
  // Reference: bsp.js (297 lines of hand-coded JS)
  const ref = bsp(shell, addr);
  const refNodes = ref.nodes || [];

  // Test: generic unfold executing the Mode 4 block
  const r = unfold(BSP_SPINDLE, { address: String(addr), tree, node: tree });
  const decimalPosition = r['6'];
  const walked = r['8'];

  // Build nodes: root + walked (matching bsp.js output format)
  const testNodes = [];
  const rootText = read(tree);
  if (rootText) testNodes.push({ pscale: decimalPosition, text: rootText });
  for (const item of walked) {
    if (Array.isArray(item) && item.length === 2) {
      testNodes.push({ pscale: item[0], text: item[1] });
    }
  }

  // Compare pscale and text for each node
  const match = refNodes.length === testNodes.length &&
    refNodes.every((n, i) => n.pscale === testNodes[i].pscale && n.text === testNodes[i].text);

  if (match) {
    console.log(`  ✓ bsp(${addr}) — ${refNodes.length} nodes match`);
    pass++;
  } else {
    console.log(`  ✗ bsp(${addr}) — MISMATCH`);
    console.log(`    ref:  ${refNodes.map(n => `[${n.pscale}] ${n.text?.slice(0, 40)}`).join(' | ')}`);
    console.log(`    test: ${testNodes.map(n => `[${n.pscale}] ${n.text?.slice(0, 40)}`).join(' | ')}`);
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed out of ${testAddresses.length} tests`);

// ============ THE POINT ============

console.log('\n=== THE POINT ===');
console.log('bsp.js:         297 lines of hand-coded JavaScript');
console.log('core.js:        ~50 lines (nav + read + RT + unfold)');
console.log('BSP_SPINDLE:    ~20 lines of JSON (the Mode 4 block)');
console.log('Test caller:    ~10 lines (unfold + format results)');
console.log('');
console.log('No unfoldSpindle function. No hand-written walker.');
console.log('The generic unfold() executes the Mode 4 block directly.');
console.log('Same block + Python key = same BSP in Python.');
