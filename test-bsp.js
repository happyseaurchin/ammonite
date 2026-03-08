#!/usr/bin/env node
// Quick BSP test against the real shell.
import { bsp, anchor, navigate, spread } from './bsp.js';
import { readFileSync } from 'fs';

const shell = JSON.parse(readFileSync('./shell.json', 'utf8'));

// Test 1: dir of whole shell
const dir = bsp(shell);
console.log('=== dir: mode =', dir.mode, '===');

// Test 2: anchor at wake (digit 1), spindle 0.1
const wake = anchor(shell, '1');
console.log('\n=== anchor(1) wake ===');
console.log('root:', wake.tree._ ? wake.tree._.slice(0, 80) : '(no root)');
const spine = wake.bsp(0.1);
console.log('spindle 0.1:', spine.mode, spine.nodes?.length, 'nodes');
if (spine.nodes) spine.nodes.forEach(n => console.log(`  [${n.pscale}] ${n.text?.slice(0, 80)}`));

// Test 3: anchor at concerns (digit 2), disc at pscale 8
const concerns = anchor(shell, '2');
console.log('\n=== anchor(2) concerns disc pscale 8 ===');
const disc = concerns.bsp(null, 8, 'disc');
console.log('disc mode:', disc.mode, disc.nodes?.length, 'nodes');
if (disc.nodes) disc.nodes.forEach(n => console.log(`  [${n.path}] ${n.text?.slice(0, 80)}`));

// Test 4: anchor at cooking (digit 7), spindle for a recipe
const cooking = anchor(shell, '7');
console.log('\n=== anchor(7) cooking ===');
console.log('root:', cooking.tree._?.slice(0, 80));

// Test 5: navigate raw address without anchor
console.log('\n=== navigate(shell.tree, "1.1") — wake spine directly ===');
const wakeSpine = navigate(shell.tree, '1.1');
console.log(typeof wakeSpine === 'string' ? wakeSpine.slice(0, 80) : wakeSpine?._?.slice(0, 80));

// Test 6: spread at wake.9 (packages)
console.log('\n=== spread wake.9 (packages/invocation) ===');
const pkgSpread = wake.spread('9');
if (pkgSpread) {
  console.log('text:', pkgSpread.text?.slice(0, 80));
  pkgSpread.children.forEach(c => console.log(`  ${c.digit}: ${c.text?.slice(0, 60) || '(branch)'}${c.branch ? ' +' : ''}`));
}
