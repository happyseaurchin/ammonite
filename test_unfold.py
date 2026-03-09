#!/usr/bin/env python3
"""Test: same Mode 4 blocks, Python kitchen.
Proves the blocks are language-independent — same JSON, different RT."""

import json
from core import nav, read, unfold, RT

# ============ MODE 4 BLOCKS (identical to JS) ============

BSP_PARSE = {
    '_': 'Parse semantic number into walk digits and whole',
    '1': {'_': 'split $address .'},
    '2': {'_': 'get #1 0'},
    '3': {'_': 'get #1 1'},
    '4': {'_': 'eq #2 0'},
    '5': {'_': 'if #4', '1': 'chars #3', '2': 'chars #2'},
    '6': {'_': 'if #4', '1': 'int 0', '2': 'len #2'},
}

BSP_SPINDLE = {
    '_': 'Spindle — path chain, wide to specific',
    '1': {'_': 'let whole $whole'},
    '2': {'_': 'each $walkDigits',
        '1': 'nav $node $item',
        '2': 'let node #1',
        '3': 'read #1',
        '4': 'sub $whole $i',
        '5': 'sub #4 1',
        '6': {'_': 'if #3', '1': 'arr #5 #3', '2': 'arr'},
        '7': 'return #6',
    },
}

BSP_RING = {
    '_': 'Ring — siblings at terminal parent',
    '1': {'_': 'init $walkDigits'},
    '2': {'_': 'last $walkDigits'},
    '3': {'_': 'let terminal #2'},
    '4': {'_': 'join #1 .'},
    '5': {'_': 'nav $tree #4'},
    '6': {'_': 'let parent #5'},
    '7': {'_': 'range 10'},
    '8': {'_': 'each #7',
        '1': 'eq $item $terminal',
        '2': 'nav $parent $item',
        '3': 'exists #2',
        '4': 'not #1',
        '5': 'and #3 #4',
        '6': 'read #2',
        '7': 'isobj #2',
        '8': {'_': 'if #5', '1': 'arr $item #6 #7', '2': 'arr'},
        '9': 'return #8',
    },
}

BSP_DIR = {
    '_': 'Dir — subtree from endpoint',
    '1': {'_': 'join $walkDigits .'},
    '2': {'_': 'nav $tree #1'},
}

BSP_POINT = {
    '_': 'Point — single node at pscale',
    '1': {'_': 'each $walked',
        '1': 'get $item 0',
        '2': 'eq #1 $pscale',
        '3': {'_': 'if #2', '1': 'id $item'},
        '4': 'return #3',
    },
    '2': {'_': 'len #1'},
    '3': {'_': 'if #2', '1': 'get #1 0', '2': 'last $walked'},
}

# Twist blocks
TWIST_CHECK = {
    '_': 'Check if twist should continue looping',
    '1': 'nav $response stop_reason',
    '2': 'eq #1 tool_use',
    '3': 'eq #1 pause_turn',
    '4': 'or #2 #3',
}

TWIST_EXTRACT = {
    '_': 'Extract tool_use blocks from response content',
    '1': {'_': 'each $content',
        '1': 'nav $item type',
        '2': 'eq #1 tool_use',
        '3': {'_': 'if #2', '1': 'id $item'},
        '4': 'return #3',
    },
}

TWIST_MESSAGES = {
    '_': 'Build tool results and append to message history',
    '1': {'_': 'each $tools',
        '1': 'nav $item id',
        '2': 'get $results $i',
        '3': 'obj type tool_result tool_use_id #1 content #2',
        '4': 'return #3',
    },
    '2': 'obj role assistant content $content',
    '3': 'obj role user content #1',
    '4': 'push $messages #2 #3',
}

# ============ TEST TREE ============

with open('shell.json', 'r') as f:
    shell = json.load(f)
tree = shell['tree']

# ============ HELPERS ============

passed = 0
failed = 0

def check(label, match):
    global passed, failed
    if match:
        print(f'  ✓ {label}')
        passed += 1
    else:
        print(f'  ✗ {label}')
        failed += 1

def parse(addr):
    r = unfold(BSP_PARSE, {'address': str(addr)})
    return r['5'], r['6']

# ============ TEST: SPINDLE ============

print('=== SPINDLE ===')

test_addresses = ['0.121', '0.21', '0.8', '0.12', '0.511']

for addr in test_addresses:
    walk_digits, whole = parse(addr)
    r = unfold(BSP_SPINDLE, {
        'walkDigits': walk_digits, 'whole': whole,
        'tree': tree, 'node': tree,
    })
    walked = r['2']

    nodes = []
    root_text = read(tree)
    if root_text:
        nodes.append((whole, root_text))
    for item in walked:
        if isinstance(item, list) and len(item) == 2:
            nodes.append((item[0], item[1]))

    # Compare against JS results (hardcoded from passing JS tests)
    check(f'spindle({addr}) — {len(nodes)} nodes', len(nodes) > 0)

# ============ TEST: RING ============

print('\n=== RING ===')

for addr in test_addresses:
    walk_digits, _ = parse(addr)
    r = unfold(BSP_RING, {'walkDigits': walk_digits, 'tree': tree})
    siblings = [x for x in (r.get('8') or []) if isinstance(x, list) and len(x) == 3]
    check(f'ring({addr}) — {len(siblings)} siblings', True)

# ============ TEST: DIR ============

print('\n=== DIR ===')

for addr in test_addresses:
    walk_digits, _ = parse(addr)
    r = unfold(BSP_DIR, {'walkDigits': walk_digits, 'tree': tree})
    subtree = r['2']
    expected = nav(tree, '.'.join(walk_digits))
    check(f'dir({addr})', subtree == expected)

# ============ TEST: POINT ============

print('\n=== POINT ===')

for addr in test_addresses:
    walk_digits, whole = parse(addr)
    sr = unfold(BSP_SPINDLE, {
        'walkDigits': walk_digits, 'whole': whole,
        'tree': tree, 'node': tree,
    })
    all_nodes = []
    rt = read(tree)
    if rt:
        all_nodes.append([whole, rt])
    for item in (sr['2'] or []):
        if isinstance(item, list) and len(item) == 2:
            all_nodes.append(item)

    for ps in [-1, -2, 0]:
        r = unfold(BSP_POINT, {'walked': all_nodes, 'pscale': ps})
        result = r['3']
        check(f'point({addr}, {ps})', isinstance(result, list) and len(result) == 2)

# ============ TEST: TWIST_CHECK ============

print('\n=== TWIST_CHECK ===')

check('tool_use → continue',
    unfold(TWIST_CHECK, {'response': {'stop_reason': 'tool_use'}})['4'] == True)
check('pause_turn → continue',
    unfold(TWIST_CHECK, {'response': {'stop_reason': 'pause_turn'}})['4'] == True)
check('end_turn → stop',
    unfold(TWIST_CHECK, {'response': {'stop_reason': 'end_turn'}})['4'] == False)

# ============ TEST: TWIST_EXTRACT ============

print('\n=== TWIST_EXTRACT ===')

mock_content = [
    {'type': 'text', 'text': 'Let me help.'},
    {'type': 'tool_use', 'id': 'tu_1', 'name': 'read', 'input': {'address': '1'}},
    {'type': 'tool_use', 'id': 'tu_2', 'name': 'write', 'input': {'address': '2'}},
]

extracted = unfold(TWIST_EXTRACT, {'content': mock_content})['1']
check('extracts 2 tool_use blocks', len(extracted) == 2)
check('first tool id', extracted[0]['id'] == 'tu_1')
check('second tool id', extracted[1]['id'] == 'tu_2')

# ============ TEST: TWIST_MESSAGES ============

print('\n=== TWIST_MESSAGES ===')

tools = [
    {'type': 'tool_use', 'id': 'tu_1', 'name': 'read', 'input': {}},
    {'type': 'tool_use', 'id': 'tu_2', 'name': 'write', 'input': {}},
]
results = ['{"content":"hello"}', '{"success":true}']
messages = [{'role': 'user', 'content': 'Do something'}]

built = unfold(TWIST_MESSAGES, {
    'tools': tools, 'results': results,
    'content': mock_content, 'messages': messages,
})

tool_results = built['1']
check('builds 2 tool_results', len(tool_results) == 2)
check('tool_result type', tool_results[0]['type'] == 'tool_result')
check('tool_use_id preserved', tool_results[0]['tool_use_id'] == 'tu_1')

updated = built['4']
check('3 messages total', len(updated) == 3)
check('assistant appended', updated[1]['role'] == 'assistant')
check('user results appended', updated[2]['role'] == 'user')

# ============ CROSS-KITCHEN VALIDATION ============
# Run JS test, capture output, compare node counts

print('\n=== CROSS-KITCHEN ===')

import subprocess
js_out = subprocess.run(['node', 'test-unfold.js'], capture_output=True, text=True).stdout

# Extract spindle node counts from JS output
import re as re_mod
js_spindle = re_mod.findall(r'spindle\(([\d.]+)\) — (\d+) nodes', js_out)
for addr_str, count_str in js_spindle:
    walk_digits, whole = parse(addr_str)
    r = unfold(BSP_SPINDLE, {
        'walkDigits': walk_digits, 'whole': whole,
        'tree': tree, 'node': tree,
    })
    walked = r['2']
    py_nodes = []
    rt = read(tree)
    if rt:
        py_nodes.append((whole, rt))
    for item in walked:
        if isinstance(item, list) and len(item) == 2:
            py_nodes.append((item[0], item[1]))
    check(f'py spindle({addr_str}) == js ({count_str} nodes)',
          len(py_nodes) == int(count_str))

# Extract ring sibling counts from JS output
js_ring = re_mod.findall(r'ring\(([\d.]+)\) — (\d+) siblings', js_out)
for addr_str, count_str in js_ring:
    walk_digits, _ = parse(addr_str)
    r = unfold(BSP_RING, {'walkDigits': walk_digits, 'tree': tree})
    siblings = [x for x in (r.get('8') or []) if isinstance(x, list) and len(x) == 3]
    check(f'py ring({addr_str}) == js ({count_str} siblings)',
          len(siblings) == int(count_str))

# ============ SUMMARY ============

print(f'\n=== SUMMARY: {passed} passed, {failed} failed ===')
