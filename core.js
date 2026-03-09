// AMMONITE KEY — JavaScript
//
// The button:      nav + read (~10 lines)
// The screwdriver: RT primitives (~12 lines, language-specific)
// The unfold:      execute Mode 4 blocks (~25 lines)
//
// A Python key maps the same op names to Python built-ins.
// A Rust key maps them to Rust. The Mode 4 blocks don't change.
// Same recipe, different kitchen.

// ---- THE BUTTON ----
// Navigate a tree by path. Read the underscore. That's it.

export function nav(tree, path) {
  if (path == null || path === '') return tree;
  let n = tree;
  for (const d of String(path).split('.')) {
    if (!n || typeof n !== 'object') return null;
    n = n[d];
  }
  return n;
}

export function read(n) {
  return n == null ? null : typeof n === 'string' ? n : n?._ ?? null;
}

// ---- THE SCREWDRIVER ----
// What THIS language can do. The octopus gets different hands.

export const RT = {
  // string
  split: (s, sep) => String(s).split(sep),
  chars: s => String(s).split(''),
  join:  (a, sep) => a.join(sep),
  cat:   (...p) => p.join(''),
  // array / object
  get:   (a, i) => a[+i],
  len:   a => a.length,
  arr:   (...x) => x,
  obj:   (...kv) => { const o = {}; for (let i = 0; i < kv.length; i += 2) o[String(kv[i])] = kv[i+1]; return o; },
  push:  (a, ...x) => [...a, ...x],
  last:  a => a[a.length - 1],
  init:  a => a.slice(0, -1),
  range: n => Array.from({length: +n}, (_, i) => String(i)),
  // number
  int:   s => parseInt(s),
  sub:   (a, b) => +a - +b,
  add:   (a, b) => +a + +b,
  // logic
  eq:    (a, b) => a == b,
  neq:   (a, b) => a != b,
  not:   a => !a,
  and:   (a, b) => !!(a && b),
  or:    (a, b) => !!(a || b),
  exists: a => a != null,
  isobj: a => typeof a === 'object' && a !== null,
  leaf:  a => typeof a !== 'object' || a === null,
  id:    x => x,
};

// ---- THE UNFOLD ----
// Walk a Mode 4 block: digits 1-9 are steps, _ is instruction.
// $name = context, #N = step N result, literals pass through.

export function unfold(block, ctx) {
  const r = {};

  function val(t) {
    if (t === 'null' || t === 'true' || t === 'false') return JSON.parse(t);
    if (t[0] === '$') return ctx[t.slice(1)];
    if (t[0] === '#') {
      const p = t.slice(1).split('.');
      let v = r[p[0]];
      for (let i = 1; i < p.length; i++) v = v?.[p[i]];
      return v;
    }
    return isNaN(t) || t === '' ? t : Number(t);
  }

  for (let s = 1; s <= 9; s++) {
    const k = String(s), nd = block[k];
    if (nd === undefined) continue;
    const ins = typeof nd === 'string' ? nd : nd?._;
    if (!ins) continue;
    const [op, ...raw] = ins.split(/\s+/);
    const a = raw.map(val);

    if (op === 'return') return a[0];
    if (op === 'let') { ctx[String(a[0])] = a[1]; r[k] = a[1]; continue; }
    if (op === 'guard') {
      if (a[0]) { const fn = RT[String(a[1])] || ctx[String(a[1])]; return fn ? fn(...a.slice(2)) : a[1]; }
      continue;
    }
    if (op === 'call') {
      const blk = a[0];
      if (blk && typeof blk === 'object') {
        const cc = { ...ctx };
        for (let i = 1; i < a.length; i += 2) cc[String(a[i])] = a[i + 1];
        r[k] = unfold(blk, cc);
      }
      continue;
    }
    if (op === 'if') {
      const br = nd[a[0] ? '1' : '2'];
      if (br) {
        const [bop, ...ba] = (typeof br === 'string' ? br : br._).split(/\s+/);
        r[k] = (RT[bop] || ctx[bop])?.(...ba.map(val)) ?? val(ba[0]);
      }
      continue;
    }
    if (op === 'each' || op === 'concat') {
      if (!Array.isArray(a[0])) { r[k] = []; continue; }
      const sub = { ...ctx }, out = [];
      for (let i = 0; i < a[0].length; i++) {
        sub.item = a[0][i]; sub.i = i;
        const v = unfold(nd, sub);
        if (op === 'concat') { if (Array.isArray(v)) out.push(...v); }
        else { if (v !== undefined) out.push(v); }
      }
      r[k] = out; continue;
    }
    if (op === 'nav')  { r[k] = nav(a[0], a[1]); continue; }
    if (op === 'read') { r[k] = read(a[0]); continue; }
    const fn = RT[op] || ctx[op];
    r[k] = fn ? fn(...a) : ins;
  }
  return r;
}
