# AMMONITE KEY — Python
#
# The button:      nav + read (~10 lines)
# The screwdriver: RT primitives (~12 lines, language-specific)
# The unfold:      execute Mode 4 blocks (~25 lines)
#
# Same op names as the JavaScript key. Same Mode 4 blocks.
# Different kitchen.

import json, re

# ---- THE BUTTON ----
# Navigate a tree by path. Read the underscore. That's it.

def nav(tree, path=None):
    if path is None or path == '':
        return tree
    n = tree
    for d in str(path).split('.'):
        if not isinstance(n, dict):
            return None
        n = n.get(d)
    return n

def read(n):
    if n is None:
        return None
    if isinstance(n, str):
        return n
    if isinstance(n, dict):
        return n.get('_')
    return None

# ---- THE SCREWDRIVER ----
# What THIS language can do. The octopus gets different hands.

def _num(x):
    return int(x) if isinstance(x, (int, float)) else (int(x) if str(x).lstrip('-').isdigit() else float(x))

RT = {
    # string
    'split': lambda s, sep: str(s).split(sep),
    'chars': lambda s: list(str(s)),
    'join':  lambda a, sep: sep.join(str(x) for x in a),
    'cat':   lambda *p: ''.join(str(x) for x in p),
    # array / object
    'get':   lambda a, i: a[int(i)],
    'len':   lambda a: len(a),
    'arr':   lambda *x: list(x),
    'obj':   lambda *kv: {str(kv[i]): kv[i+1] for i in range(0, len(kv), 2)},
    'push':  lambda a, *x: a + list(x),
    'last':  lambda a: a[-1] if a else None,
    'init':  lambda a: a[:-1],
    'range': lambda n: [str(i) for i in range(int(n))],
    # number
    'int':   lambda s: int(s),
    'sub':   lambda a, b: _num(a) - _num(b),
    'add':   lambda a, b: _num(a) + _num(b),
    # logic
    'eq':    lambda a, b: a == b or (str(a) == str(b)),
    'neq':   lambda a, b: not (a == b or str(a) == str(b)),
    'not':   lambda a: not a,
    'and':   lambda a, b: bool(a and b),
    'or':    lambda a, b: bool(a or b),
    'exists': lambda a: a is not None,
    'isobj': lambda a: isinstance(a, dict),
    'leaf':  lambda a: not isinstance(a, dict),
    'id':    lambda x: x,
}

# ---- THE UNFOLD ----
# Walk a Mode 4 block: digits 1-9 are steps, _ is instruction.
# $name = context, #N = step N result, literals pass through.

def unfold(block, ctx):
    r = {}

    def val(t):
        if t in ('null', 'true', 'false'):
            return json.loads(t)
        if t[0] == '$':
            return ctx.get(t[1:])
        if t[0] == '#':
            p = t[1:].split('.')
            v = r.get(p[0])
            for part in p[1:]:
                if v is None:
                    break
                v = v[part] if isinstance(v, dict) else v[int(part)] if isinstance(v, list) else None
            return v
        try:
            return int(t) if t and '.' not in t and t.lstrip('-').isdigit() else float(t)
        except (ValueError, AttributeError):
            return t

    for s in range(1, 10):
        k = str(s)
        nd = block.get(k) if isinstance(block, dict) else None
        if nd is None:
            continue
        ins = nd if isinstance(nd, str) else (nd.get('_') if isinstance(nd, dict) else None)
        if not ins:
            continue
        parts = re.split(r'\s+', ins)
        op, raw = parts[0], parts[1:]
        a = [val(t) for t in raw]

        if op == 'return':
            return a[0] if a else None
        if op == 'let':
            ctx[str(a[0])] = a[1]
            r[k] = a[1]
            continue
        if op == 'guard':
            if a[0]:
                fn = RT.get(str(a[1])) or ctx.get(str(a[1]))
                return fn(*a[2:]) if fn else a[1]
            continue
        if op == 'call':
            blk = a[0]
            if isinstance(blk, dict):
                cc = {**ctx}
                for i in range(1, len(a), 2):
                    cc[str(a[i])] = a[i+1]
                r[k] = unfold(blk, cc)
            continue
        if op == 'if':
            br = nd.get('1' if a[0] else '2') if isinstance(nd, dict) else None
            if br is not None:
                bparts = re.split(r'\s+', br if isinstance(br, str) else br.get('_', ''))
                bop, ba = bparts[0], bparts[1:]
                fn = RT.get(bop) or ctx.get(bop)
                r[k] = fn(*[val(t) for t in ba]) if fn else val(ba[0]) if ba else None
            continue
        if op in ('each', 'concat'):
            if not isinstance(a[0], list):
                r[k] = []
                continue
            sub = {**ctx}
            out = []
            for i, item in enumerate(a[0]):
                sub['item'] = item
                sub['i'] = i
                v = unfold(nd, sub)
                if op == 'concat':
                    if isinstance(v, list):
                        out.extend(v)
                else:
                    if v is not None:
                        out.append(v)
            r[k] = out
            continue
        if op == 'nav':
            r[k] = nav(a[0], a[1] if len(a) > 1 else None)
            continue
        if op == 'read':
            r[k] = read(a[0] if a else None)
            continue
        fn = RT.get(op) or ctx.get(op)
        r[k] = fn(*a) if fn else ins

    return r
