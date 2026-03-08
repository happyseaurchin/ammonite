// bsp.js — Block · Spindle · Point (Ammonite)
// Semantic address resolver for a unified pscale shell.
// No block names. The shell is one tree. Addresses are pure numbers.
//
// Key difference from hermitcrab BSP: the `anchor` parameter.
// anchor(shell, '6') returns a sub-BSP scoped to digit 6.
// Within that scope, addresses are relative — the leading '6.' is jettisoned.
// This is how discrete blocks worked implicitly (each file was its own tree).
// Now it's explicit: anchor at a digit, work relative to it.
//
// Modes:
//   bsp(shell, address)                → spindle: path chain wide→specific
//   bsp(shell)                         → dir: full tree
//   bsp(shell, address, 'ring')        → ring: siblings at terminal
//   bsp(shell, address, 'dir')         → dir: subtree from endpoint
//   bsp(shell, address, point)         → point: single node at pscale
//   bsp(shell, null, pscale, 'disc')   → disc: all nodes at pscale level
//
// anchor(shell, digit) → { bsp, navigate, read, write, spread, tree }
//   Returns an interface scoped to a subtree. All addresses relative.

// ============ TREE NAVIGATION ============

function navigate(tree, path) {
  if (!path) return tree;
  const keys = String(path).split('.');
  let node = tree;
  for (const k of keys) {
    if (node === null || node === undefined || typeof node === 'string') return null;
    node = node[k];
  }
  return node;
}

function spread(tree, path) {
  const node = path ? navigate(tree, path) : tree;
  if (node === null || node === undefined) return null;
  if (typeof node === 'string') return { text: node, children: [] };
  const text = node._ || null;
  const children = [];
  for (const [k, v] of Object.entries(node)) {
    if (k === '_') continue;
    const childText = typeof v === 'string' ? v : (v && typeof v === 'object' && v._) ? v._ : null;
    children.push({ digit: k, text: childText, branch: typeof v === 'object' && v !== null });
  }
  return { text, children };
}

// ============ TUNING FORK ============

function getTuningDecimalPosition(shell) {
  if (!shell || !shell.tuning) return null;
  const parts = String(shell.tuning).split('.');
  const intStr = parts[0] || '0';
  return intStr === '0' ? 0 : intStr.length;
}

function getCompressionDepth(tree) {
  let depth = 0;
  let node = tree;
  while (node && typeof node === 'object' && node['0'] !== undefined) {
    depth++;
    node = node['0'];
  }
  return depth;
}

// ============ BSP ============

function bsp(shell, address, point, fn) {
  // shell can be { tree, tuning?, ... } or a raw tree object.
  // Normalize: if shell has no .tree, treat shell itself as tree.
  const tree = shell && shell.tree !== undefined ? shell.tree : shell;
  const tuning = shell && shell.tuning !== undefined ? shell.tuning : null;
  const shellObj = { tree, tuning };

  if (!tree) return { mode: 'dir', tree: {} };

  // Mode: dir (full) — bsp(shell) with no other args
  if (address == null && point == null && fn == null) {
    return { mode: 'dir', tree };
  }

  // ---- Parse the semantic number ----
  let walkDigits, hasPscale, digitsBefore;
  if (address == null) {
    walkDigits = [];
    hasPscale = true;
    const tuningDecimal = getTuningDecimalPosition(shellObj);
    digitsBefore = tuningDecimal !== null ? tuningDecimal : 0;
  } else {
    const str = typeof address === 'number' ? address.toFixed(10) : String(address);
    const parts = str.split('.');
    const intStr = parts[0] || '0';
    const fracStr = (parts[1] || '').replace(/0+$/, '');
    const isDelineation = intStr === '0';
    walkDigits = isDelineation
      ? fracStr.split('').filter(c => c.length > 0)
      : (intStr + fracStr).split('');
    hasPscale = isDelineation || fracStr.length > 0;
    const spindleTreeDepth = isDelineation ? 0 : intStr.length;
    const tuningDecimal = getTuningDecimalPosition(shellObj);
    digitsBefore = tuningDecimal !== null ? tuningDecimal : (isDelineation ? 0 : (hasPscale ? intStr.length : -1));
    if (tuningDecimal !== null) hasPscale = true;

    // Tuning fork compensation
    if (tuningDecimal !== null) {
      const needed = Math.max(0, tuningDecimal - spindleTreeDepth);
      if (needed > 0) {
        const maxComp = getCompressionDepth(tree);
        const zeros = Math.min(needed, maxComp);
        if (zeros > 0) walkDigits = Array(zeros).fill('0').concat(walkDigits);
      }
    }
  }

  // ---- Build spindle nodes ----
  const nodes = [];
  let node = tree;

  const rootText = (typeof node === 'object' && node !== null && typeof node['_'] === 'string')
    ? node['_'] : null;
  if (rootText !== null) {
    nodes.push({ pscale: hasPscale ? digitsBefore : null, text: rootText });
  }

  for (let i = 0; i < walkDigits.length; i++) {
    const d = walkDigits[i];
    if (!node || typeof node !== 'object' || node[d] === undefined) break;
    node = node[d];
    const text = typeof node === 'string'
      ? node
      : (typeof node === 'object' && node !== null && typeof node['_'] === 'string')
        ? node['_']
        : JSON.stringify(node);
    nodes.push({
      pscale: hasPscale ? (digitsBefore - 1) - i : null,
      digit: d,
      text
    });
  }

  // ---- Mode: ring ----
  if (point === 'ring') {
    if (walkDigits.length === 0) return { mode: 'ring', siblings: [] };
    const parentPath = walkDigits.length > 1 ? walkDigits.slice(0, -1).join('.') : null;
    const terminalDigit = walkDigits[walkDigits.length - 1];
    const parentNode = parentPath ? navigate(tree, parentPath) : tree;
    if (!parentNode || typeof parentNode !== 'object') return { mode: 'ring', siblings: [] };
    const siblings = [];
    for (let d = 0; d <= 9; d++) {
      const k = String(d);
      if (k === terminalDigit || parentNode[k] === undefined) continue;
      const v = parentNode[k];
      const childText = typeof v === 'string' ? v : (v && typeof v === 'object' && v._) ? v._ : null;
      siblings.push({ digit: k, text: childText, branch: typeof v === 'object' && v !== null });
    }
    return { mode: 'ring', siblings };
  }

  // ---- Mode: dir (subtree) ----
  if (point === 'dir') {
    const endPath = walkDigits.length > 0 ? walkDigits.join('.') : null;
    const endNode = endPath ? navigate(tree, endPath) : tree;
    return { mode: 'dir', path: endPath, subtree: endNode || null };
  }

  // ---- Mode: disc ----
  if (fn === 'disc' && point != null) {
    const pscale = typeof point === 'string' ? Number(point) : point;
    const tuningDecimal = getTuningDecimalPosition(shellObj);
    const refDecimal = tuningDecimal !== null ? tuningDecimal : digitsBefore;
    const targetDepth = refDecimal - pscale;
    if (targetDepth < 0) return { mode: 'disc', pscale, nodes: [] };

    const discNodes = [];
    function walkDisc(n, depth, path) {
      if (depth === targetDepth) {
        const text = typeof n === 'string' ? n
          : (n && typeof n === 'object' && typeof n._ === 'string') ? n._
          : null;
        discNodes.push({ path, text });
        return;
      }
      if (!n || typeof n !== 'object') return;
      for (let d = 0; d <= 9; d++) {
        const k = String(d);
        if (n[k] !== undefined) {
          walkDisc(n[k], depth + 1, path ? `${path}.${k}` : k);
        }
      }
    }
    walkDisc(tree, 0, '');
    return { mode: 'disc', pscale, nodes: discNodes };
  }

  if (nodes.length === 0) return { mode: 'spindle', nodes: [] };

  // ---- Mode: point ----
  if (point != null && fn == null) {
    const p = typeof point === 'string' ? Number(point) : point;
    if (isNaN(p)) return { mode: 'error', error: `Unknown mode: ${point}` };
    const target = nodes.find(n => n.pscale === p);
    if (target) return { mode: 'point', text: target.text, pscale: target.pscale };
    const last = nodes[nodes.length - 1];
    return { mode: 'point', text: last.text, pscale: last.pscale };
  }

  // ---- Mode: spindle (default) ----
  return { mode: 'spindle', nodes };
}

// ============ TRUNCATION / ANCHOR ============
// anchor(shell, '6') → returns a scoped interface where '6' is the root.
// All BSP operations within the anchor are relative to that subtree.
// The subtree inherits tuning from the shell unless it has its own.

function anchor(shell, digit) {
  const tree = shell && shell.tree !== undefined ? shell.tree : shell;
  const subtree = navigate(tree, String(digit));
  if (!subtree || typeof subtree === 'string') {
    return null; // Can't anchor on a leaf or missing node
  }
  // Build a sub-shell: the subtree becomes .tree, inherit tuning if subtree has none
  const subShell = {
    tree: subtree,
    tuning: subtree.tuning !== undefined ? subtree.tuning : (shell && shell.tuning) || null
  };

  return {
    shell: subShell,
    tree: subtree,
    bsp: (address, point, fn) => bsp(subShell, address, point, fn),
    navigate: (path) => navigate(subtree, path),
    read: (path) => readNode(subtree, path),
    write: (path, content) => writeNode(subtree, path, content),
    spread: (path) => spread(subtree, path),
    findFree: (path) => findUnoccupiedDigit(subtree, path),
  };
}

// ============ NODE OPERATIONS ============

function readNode(tree, path) {
  const node = path ? navigate(tree, path) : tree;
  if (node === null || node === undefined) return { error: `Path ${path} not found` };
  if (typeof node === 'string') return { content: node };
  const result = { content: node._ || null, children: {} };
  for (const [k, v] of Object.entries(node)) {
    if (k === '_') continue;
    if (typeof v === 'string') result.children[k] = v;
    else if (v && typeof v === 'object') result.children[k] = v._ || '(branch)';
  }
  return result;
}

function writeNode(tree, path, content) {
  const keys = String(path).split('.');
  const last = keys.pop();
  let node = tree;
  for (const k of keys) {
    if (typeof node[k] === 'string') node[k] = { _: node[k] };
    if (!node[k]) node[k] = {};
    node = node[k];
  }
  if (content === null || content === undefined) {
    delete node[last];
  } else if (node[last] && typeof node[last] === 'object') {
    node[last]._ = content;
  } else {
    node[last] = content;
  }
  return { success: true };
}

function findUnoccupiedDigit(tree, path) {
  const node = path ? navigate(tree, path) : tree;
  if (!node || typeof node === 'string') return { digit: '1', note: 'Node is leaf — will become branch' };
  for (let d = 1; d <= 9; d++) {
    if (!node[String(d)]) return { digit: String(d) };
  }
  return { full: true, note: 'Digits 1-9 all occupied — compression needed' };
}

// ============ EXPORTS ============

export {
  bsp,
  anchor,
  navigate,
  readNode,
  writeNode,
  spread,
  findUnoccupiedDigit,
  getTuningDecimalPosition,
  getCompressionDepth,
};
