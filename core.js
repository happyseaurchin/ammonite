// AMMONITE CORE — The button.
//
// Stage 0: Navigate + Read. The irreducible kernel.
// Stage 1: Runtime primitives. The screwdriver — what THIS language can do.
// Stage 2: Unfold. Read a Mode 4 block, execute it step by step.
//
// Everything else — BSP, the twist, policies — unfolds from the touchstone.
// The touchstone carries Mode 4 blocks (programs as pscale trees).
// Depth is sequence. Siblings are branches. The kernel walks them.
//
// The octopus presses the same button but gets different tools:
// a Python kernel maps "split" to str.split(), a Rust kernel to .split().
// The Mode 4 blocks are the same. The runtime primitives are different.
// Same recipe, different kitchen.

// ============ STAGE 0: THE BUTTON ============
// Navigate a tree by path. Read the underscore. That's it.

export function nav(tree, path) {
  if (path === undefined || path === null) return tree;
  let node = tree;
  for (const d of String(path).split('.')) {
    if (!node || typeof node !== 'object') return null;
    node = node[d];
  }
  return node;
}

export function read(node) {
  if (node === null || node === undefined) return null;
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && node['_'] !== undefined) return node['_'];
  return null;
}

// ============ STAGE 1: THE SCREWDRIVER ============
// Runtime primitives. These are what the LANGUAGE can do natively.
// A Python core.py would map the same names to Python built-ins.
// The Mode 4 blocks don't change. Only this map does.

export const RT = {
  // String
  split:   (s, sep) => String(s).split(sep),
  join:    (arr, sep) => arr.join(sep),
  chars:   (s) => String(s).split(''),
  cat:     (...parts) => parts.join(''),
  trim:    (s) => String(s).replace(/0+$/, ''),

  // Array
  get:     (a, i) => a[parseInt(i, 10)],
  len:     (a) => a.length,
  push:    (a, v) => { const c = [...a]; c.push(v); return c; },
  slice:   (a, from, to) => a.slice(parseInt(from), to !== undefined ? parseInt(to) : undefined),
  arr:     (...items) => items,

  // Number
  int:     (s) => parseInt(s, 10),
  float:   (s) => parseFloat(s),
  add:     (a, b) => Number(a) + Number(b),
  sub:     (a, b) => Number(a) - Number(b),
  mul:     (a, b) => Number(a) * Number(b),

  // Logic
  eq:      (a, b) => a == b,
  gt:      (a, b) => Number(a) > Number(b),
  not:     (a) => !a,
  is:      (a, type) => typeof a === type,
  exists:  (a) => a !== null && a !== undefined,

  // Object
  keys:    (o) => Object.keys(o).filter(k => /^\d$/.test(k)).sort(),
  set:     (o, k, v) => { const c = { ...o }; c[k] = v; return c; },
};

// ============ STAGE 2: UNFOLD ============
// Read a Mode 4 block. Execute it step by step.
// Each digit is a step. The _ text is the instruction.
// Sub-digits are loop bodies or branches.
//
// Instruction format:  op arg1 arg2 ...
//   $name  → function parameter (from context)
//   #N     → result of step N
//   #N.key → property of step N's result
//   @path  → navigate the working tree
//   Other  → literal (number if numeric, else string)

export function unfold(program, context) {
  const results = {};

  function resolve(token) {
    if (token === 'null') return null;
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token.startsWith('$')) return context[token.slice(1)];
    if (token.startsWith('#')) {
      const parts = token.slice(1).split('.');
      let val = results[parts[0]];
      for (let i = 1; i < parts.length; i++) val = val?.[parts[i]];
      return val;
    }
    if (token.startsWith('@')) return nav(context._tree, token.slice(1));
    if (!isNaN(token) && token !== '') return Number(token);
    return token;
  }

  for (let step = 1; step <= 9; step++) {
    const s = String(step);
    const stepNode = program[s];
    if (stepNode === undefined) continue;

    const instr = typeof stepNode === 'string' ? stepNode : stepNode?.['_'];
    if (!instr) continue;

    const tokens = instr.split(/\s+/);
    const op = tokens[0];
    const args = tokens.slice(1).map(resolve);

    // Control flow
    if (op === 'return') {
      return args[0];
    }

    if (op === 'if') {
      // Condition in args[0]. Digit 1 = true branch, digit 2 = false branch.
      const branch = args[0] ? '1' : '2';
      const branchNode = stepNode[branch];
      if (branchNode) {
        const branchInstr = typeof branchNode === 'string' ? branchNode : branchNode?.['_'];
        if (branchInstr) {
          const bt = branchInstr.split(/\s+/);
          const bArgs = bt.slice(1).map(resolve);
          results[s] = (RT[bt[0]] || context[bt[0]])?.(... bArgs) ?? bArgs[0];
        }
      }
      continue;
    }

    if (op === 'each') {
      // Iterate over args[0]. Execute sub-block for each item.
      const items = args[0];
      if (!Array.isArray(items)) { results[s] = []; continue; }
      const collected = [];
      for (let i = 0; i < items.length; i++) {
        // Sub-context: $item, $i available
        const subCtx = { ...context, item: items[i], i: i };
        const subResult = unfold(stepNode, subCtx);
        if (subResult !== undefined) collected.push(subResult);
      }
      results[s] = collected;
      continue;
    }

    if (op === 'let') {
      // Store a value in context: let name value
      context[String(args[0])] = args[1];
      results[s] = args[1];
      continue;
    }

    // Nav and read (Stage 0)
    if (op === 'nav') { results[s] = nav(args[0], args[1]); continue; }
    if (op === 'read') { results[s] = read(args[0]); continue; }

    // Runtime primitives (Stage 1)
    const fn = RT[op] || context[op];
    if (fn) {
      results[s] = fn(...args);
      continue;
    }

    // Unknown op — store as literal
    results[s] = instr;
  }

  return context._result ?? results;
}

// ============ BOOTSTRAP ============
// Given a touchstone tree, unfold BSP from its Mode 4 blocks.
// This is how the box opens itself.

export function bootstrap(touchstone) {
  // The touchstone carries BSP as Mode 4 programs.
  // The kernel reads them and produces functions.
  // Each function is added to the context for subsequent unfolding.

  const ctx = { _tree: touchstone };

  return {
    nav,
    read,
    unfold: (programPath, args) => {
      const program = nav(touchstone, programPath);
      if (!program) return null;
      return unfold(program, { ...ctx, ...args });
    },
    RT,
  };
}
