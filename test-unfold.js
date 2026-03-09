#!/usr/bin/env node
// Test: generic unfold executing Mode 4 blocks for ALL BSP modes.
// Each block is a pscale program. unfold() walks it step by step.
// Results compared against the 297-line hand-coded bsp.js.

import { nav, read, unfold, RT } from './core.js';
import { bsp } from './bsp.js';
import { readFileSync } from 'fs';

// ============ MODE 4 BLOCKS ============

// Shared: parse a semantic number into walk digits and whole (pscale anchor)
const BSP_PARSE = {
  _: 'Parse semantic number into walk digits and whole',
  1: { _: 'split $address .' },                        // ["0", "121"]
  2: { _: 'get #1 0' },                                // "0" (integer part)
  3: { _: 'get #1 1' },                                // "121" (fractional part)
  4: { _: 'eq #2 0' },                                 // delineation?
  5: { _: 'if #4', 1: 'chars #3', 2: 'chars #2' },    // walk digits
  6: { _: 'if #4', 1: 'int 0', 2: 'len #2' },         // whole (pscale anchor)
};

// Spindle: walk digits through tree, collect nodes with pscale
const BSP_SPINDLE = {
  _: 'Spindle — path chain, wide to specific',
  1: { _: 'let whole $whole' },                         // from parsed context
  2: { _: 'each $walkDigits',                           // walk digits, collect
    1: 'nav $node $item',                               //   advance into tree
    2: 'let node #1',                                   //   carry node forward
    3: 'read #1',                                       //   text at this depth
    4: 'sub $whole $i',                                 //   pscale = whole - i
    5: 'sub #4 1',                                      //   adjust for 1-indexed depth
    6: { _: 'if #3', 1: 'arr #5 #3', 2: 'arr' },       //   [pscale, text] or []
    7: 'return #6',                                     //   yield to collector
  },
};

// Ring: siblings at the terminal digit's parent
const BSP_RING = {
  _: 'Ring — siblings at terminal parent',
  1: { _: 'init $walkDigits' },                         // parent path digits
  2: { _: 'last $walkDigits' },                         // terminal digit
  3: { _: 'let terminal #2' },                          // store for loop
  4: { _: 'join #1 .' },                                // parent path ('' if root)
  5: { _: 'nav $tree #4' },                             // parent node
  6: { _: 'let parent #5' },                            // store for loop
  7: { _: 'range 10' },                                 // ['0','1',...,'9']
  8: { _: 'each #7',                                    // iterate digits
    1: 'eq $item $terminal',                             //   is terminal?
    2: 'nav $parent $item',                              //   child node
    3: 'exists #2',                                      //   child exists?
    4: 'not #1',                                         //   not terminal?
    5: 'and #3 #4',                                      //   exists AND not terminal
    6: 'read #2',                                        //   child text
    7: 'isobj #2',                                       //   is branch?
    8: { _: 'if #5', 1: 'arr $item #6 #7', 2: 'arr' },  //   [digit, text, branch] or []
    9: 'return #8',                                      //   yield
  },
};

// Dir: subtree at endpoint
const BSP_DIR = {
  _: 'Dir — subtree from endpoint',
  1: { _: 'join $walkDigits .' },                       // path ('' if empty)
  2: { _: 'nav $tree #1' },                             // subtree
};

// Point: single node at target pscale from spindle results
const BSP_POINT = {
  _: 'Point — single node at pscale',
  1: { _: 'each $walked',                               // search walked nodes
    1: 'get $item 0',                                   //   this node's pscale
    2: 'eq #1 $pscale',                                 //   match target?
    3: { _: 'if #2', 1: 'id $item' },                   //   yield match (else undefined → filtered)
    4: 'return #3',
  },
  2: { _: 'len #1' },                                   // matches found?
  3: { _: 'if #2', 1: 'get #1 0', 2: 'last $walked' }, // first match or last node
};

// ============ HELPERS ============

const shell = JSON.parse(readFileSync('shell.json', 'utf8'));
const tree = shell.tree;

function parse(addr) {
  const r = unfold(BSP_PARSE, { address: String(addr) });
  return { walkDigits: r['5'], whole: r['6'] };
}

let pass = 0, fail = 0;
function check(label, match) {
  if (match) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
}

// ============ TEST: SPINDLE ============

const testAddresses = [0.121, 0.21, 0.8, 0.12, 0.511];

console.log('=== SPINDLE ===');
for (const addr of testAddresses) {
  const ref = bsp(shell, addr);
  const refNodes = ref.nodes || [];

  const { walkDigits, whole } = parse(addr);
  const r = unfold(BSP_SPINDLE, { walkDigits, whole, tree, node: tree });
  const walked = r['2'];

  const testNodes = [];
  const rootText = read(tree);
  if (rootText) testNodes.push({ pscale: whole, text: rootText });
  for (const item of walked) {
    if (Array.isArray(item) && item.length === 2) {
      testNodes.push({ pscale: item[0], text: item[1] });
    }
  }

  const match = refNodes.length === testNodes.length &&
    refNodes.every((n, i) => n.pscale === testNodes[i].pscale && n.text === testNodes[i].text);
  check(`spindle(${addr}) — ${refNodes.length} nodes`, match);
}

// ============ TEST: RING ============

console.log('\n=== RING ===');
for (const addr of testAddresses) {
  const ref = bsp(shell, addr, 'ring');
  const refSiblings = ref.siblings || [];

  const { walkDigits } = parse(addr);
  const r = unfold(BSP_RING, { walkDigits, tree });
  const siblings = (r['8'] || []).filter(x => Array.isArray(x) && x.length === 3);

  const match = refSiblings.length === siblings.length &&
    refSiblings.every((s, i) => s.digit === siblings[i][0] && s.text === siblings[i][1]
      && s.branch === siblings[i][2]);
  check(`ring(${addr}) — ${refSiblings.length} siblings`, match);
  if (!match && refSiblings.length > 0) {
    console.log(`    ref:  ${refSiblings.map(s => s.digit).join(',')}`);
    console.log(`    test: ${siblings.map(s => s[0]).join(',')}`);
  }
}

// ============ TEST: DIR ============

console.log('\n=== DIR ===');
for (const addr of testAddresses) {
  const ref = bsp(shell, addr, 'dir');

  const { walkDigits } = parse(addr);
  const r = unfold(BSP_DIR, { walkDigits, tree });
  const subtree = r['2'];

  const match = JSON.stringify(ref.subtree) === JSON.stringify(subtree);
  check(`dir(${addr})`, match);
}

// ============ TEST: POINT ============

console.log('\n=== POINT ===');
for (const addr of testAddresses) {
  const { walkDigits, whole } = parse(addr);

  // Build spindle first (point searches all nodes: root + walked)
  const sr = unfold(BSP_SPINDLE, { walkDigits, whole, tree, node: tree });
  const allNodes = [];
  const rt = read(tree);
  if (rt) allNodes.push([whole, rt]);
  for (const item of (sr['2'] || [])) {
    if (Array.isArray(item) && item.length === 2) allNodes.push(item);
  }

  // Test a few pscale values
  for (const ps of [-1, -2, 0]) {
    const ref = bsp(shell, addr, ps);
    if (ref.mode !== 'point') continue;

    const r = unfold(BSP_POINT, { walked: allNodes, pscale: ps });
    const result = r['3'];

    const match = Array.isArray(result) && result.length === 2
      && result[0] === ref.pscale && result[1] === ref.text;
    check(`point(${addr}, ${ps}) → pscale ${ref.pscale}`, match);
    if (!match) {
      console.log(`    ref:  [${ref.pscale}] ${ref.text?.slice(0, 40)}`);
      console.log(`    test: ${result}`);
    }
  }
}

// ============ TEST: DISC ============

// Disc uses recursion (call + concat + guard in unfold).
// Test with a small controlled tree first, then against the live shell.

const BSP_DISC_WALK = {
  _: 'Recursive disc walk — collect all nodes at target depth',
  1: 'eq $depth $target',
  2: 'read $node',
  3: 'arr $path #2',
  4: { _: 'guard #1 arr #3' },                          // at target: return [[path, text]]
  5: 'leaf $node',
  6: { _: 'guard #5 arr' },                             // leaf: return []
  7: 'range 10',
  8: { _: 'concat #7',                                  // iterate children, concatenate results
    1: 'nav $node $item',                                //   child node
    2: 'exists #1',
    3: 'not #2',
    4: { _: 'guard #3 arr' },                            //   no child: return []
    5: 'len $path',                                      //   path empty?
    6: { _: 'if #5', 1: 'cat $path . $item', 2: 'id $item' },  // child path
    7: 'add $depth 1',
    8: 'call $discWalk node #1 depth #7 path #6',        //   recurse
    9: 'return #8',
  },
  9: { _: 'return #8' },                                 // return concatenated results
};

console.log('\n=== DISC ===');

// Small controlled tree
const discTree = {
  _: 'root',
  1: { _: 'one', 1: { _: 'one-one' }, 2: { _: 'one-two' } },
  2: { _: 'two', 1: { _: 'two-one' } },
  3: 'three',
};
const discShell = { tree: discTree };

for (const pscale of [-1, -2]) {
  const ref = bsp(discShell, null, pscale, 'disc');
  const refNodes = ref.nodes || [];

  const targetDepth = 0 - pscale; // refDecimal=0 (no tuning)
  const result = unfold(BSP_DISC_WALK, {
    node: discTree, depth: 0, target: targetDepth, path: '', discWalk: BSP_DISC_WALK,
  });
  const testNodes = (result || []).filter(x => Array.isArray(x) && x.length === 2);

  const match = refNodes.length === testNodes.length &&
    refNodes.every((n, i) => n.path === testNodes[i][0] && n.text === testNodes[i][1]);
  check(`disc(small, pscale=${pscale}) — ${refNodes.length} nodes`, match);
  if (!match) {
    console.log(`    ref:  ${refNodes.map(n => n.path).join(', ')}`);
    console.log(`    test: ${testNodes.map(n => n[0]).join(', ')}`);
  }
}

// Live shell disc test (depth 1 = all direct children of root)
{
  const ref = bsp(shell, null, -1, 'disc');
  const refNodes = ref.nodes || [];

  const result = unfold(BSP_DISC_WALK, {
    node: tree, depth: 0, target: 1, path: '', discWalk: BSP_DISC_WALK,
  });
  const testNodes = (result || []).filter(x => Array.isArray(x) && x.length === 2);

  const match = refNodes.length === testNodes.length &&
    refNodes.every((n, i) => n.path === testNodes[i][0] && n.text === testNodes[i][1]);
  check(`disc(shell, pscale=-1) — ${refNodes.length} nodes`, match);
  if (!match) {
    console.log(`    ref:  ${refNodes.map(n => n.path).join(', ')}`);
    console.log(`    test: ${testNodes.map(n => n[0]).join(', ')}`);
  }
}

// ============ SUMMARY ============

console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
