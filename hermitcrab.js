// HERMITCRAB POLICY — How hermitcrab walks its tree.
//
// This is not a module in the traditional sense. It does not abstract
// the tree behind an interface. It is a set of functions that tell the
// kernel's electricity WHERE TO FLOW through the tree.
//
// A different entity (e.g. a starfish) would provide a different policy
// that walks the same tree format differently.
//
// The policy provides:
//   route(stimulus)         → concern object (where in the tree to look)
//   compile(concern, echo)  → system prompt string (what the LLM sees)
//   invoke(concern, opts)   → LLM call params (model, tokens, thinking)
//   afterTwist(response, concern, echo) → side effects (history, etc.)
//   extraTools()            → additional tools beyond the kernel's universals
//   tick(now)               → check ripe concerns, return activation params or null

import {
  bsp, anchor, navigate, readNode, writeNode,
  spread, findUnoccupiedDigit,
  getTuningDecimalPosition, getCompressionDepth,
} from './bsp.js';

// ============ CREATE HERMITCRAB POLICY ============

export function createHermitcrabPolicy() {
  // Shell address map — hermitcrab's conventional layout.
  // These live in the shell's skeleton, not in the policy.
  // But the policy needs to know where to look.
  const ADDR = {
    wake: '1',
    concerns: '2',
    history: '3',
    stash: '4',
    purpose: '5',
    relationships: '6',
    cooking: '7',
    touchstone: '8',
    horizon: '9',
  };

  let _conversations = new Map(); // concern path → message history

  // ---- Helpers (need kernel's shell access, passed via bind) ----

  function tierFromPscale(pscale, at) {
    const a = at(ADDR.concerns);
    if (!a) return 1;
    const tiers = a.shell.tree.tiers || {};
    const tierMap = { deep: 3, present: 2, light: 1 };
    const thresholds = Object.keys(tiers).map(Number).sort((a, b) => b - a);
    for (const t of thresholds) {
      if (pscale >= t) return tierMap[tiers[String(t)]] || 1;
    }
    return 1;
  }

  // ---- Route: stimulus → concern ----

  function route(stimulus, { at }) {
    const a = at(ADDR.concerns);
    if (!a) return { spindle: '0.1211111', tier: 2, name: 'user' };
    const tuningDecimal = getTuningDecimalPosition(a.shell) || 9;
    let found = null;

    function walk(node, depth, path) {
      if (!node || typeof node !== 'object' || found) return;
      for (const [k, v] of Object.entries(node)) {
        if (!/^\d$/.test(k)) continue;
        if (!v || typeof v !== 'object') continue;
        const childPath = path ? `${path}.${k}` : k;
        if (v.stimulus && v.stimulus.toLowerCase() === stimulus.toLowerCase()) {
          const pscale = tuningDecimal - (depth + 1);
          found = {
            spindle: v.spine || '0.1211111',
            tier: tierFromPscale(pscale, at),
            name: v._ || stimulus,
            immediate: !!v.immediate,
            focus: v.focus || null,
            package: v.package || null,
            tools: v.tools || null,
            pscale,
            path: childPath,
          };
          return;
        }
        walk(v, depth + 1, childPath);
      }
    }
    walk(a.tree, 0, '');
    return found || { spindle: '0.1211111', tier: 2, name: 'user' };
  }

  // ---- Compile: concern → system prompt ----

  function formatTree(tree) {
    const lines = [];
    function render(node, depth) {
      if (typeof node === 'string') { lines.push('  '.repeat(depth) + node); return; }
      if (!node || typeof node !== 'object') return;
      if (node._) lines.push('  '.repeat(depth) + node._);
      for (const [k, v] of Object.entries(node)) {
        if (k === '_') continue;
        if (typeof v === 'string') lines.push('  '.repeat(depth) + `${k}: ${v}`);
        else { lines.push('  '.repeat(depth) + `${k}:`); render(v, depth + 1); }
      }
    }
    render(tree, 0);
    return lines.join('\n');
  }

  function parseInstruction(instr) {
    const parts = instr.trim().split(/\s+/);
    if (parts.length === 2 && parts[1] === 'skeleton') {
      return { root: parts[0], skeleton: true };
    }
    const arg1 = parts[0];
    const arg2 = parts.length > 1 ? parts[1] : undefined;
    const arg3 = parts.length > 2 ? parts[2] : undefined;
    const arg4 = parts.length > 3 ? parts[3] : undefined;
    return {
      root: arg1,
      spindle: arg2 === 'ref' ? 'ref' : arg2 === 'null' ? null : (arg2 !== undefined ? parseFloat(arg2) : undefined),
      point: (arg3 === 'ring' || arg3 === 'dir') ? arg3 : (arg3 !== undefined ? parseFloat(arg3) : undefined),
      fn: arg4 === 'disc' ? 'disc' : undefined,
    };
  }

  function executeInstruction(instr, at) {
    const parsed = parseInstruction(instr);
    const { root, spindle, point, fn } = parsed;
    const a = at(root);
    if (!a) return '';

    if (parsed.skeleton) {
      const skel = a.shell.tree.skeleton;
      if (!skel) return `[${root} skeleton]\n(no skeleton)`;
      return `[${root} skeleton]\n${formatTree({ tree: skel })}`;
    }

    const result = a.bsp(spindle, point, fn);
    const label = root;

    if (result.mode === 'dir') {
      if (result.subtree) return `[${label} ${spindle} dir]\n${JSON.stringify(result.subtree, null, 2)}`;
      return `[${label}]\n${formatTree(a.tree)}`;
    }
    if (result.mode === 'ref') return '';
    if (result.mode === 'spindle') {
      if (result.nodes.length === 0) return '';
      return `[${label} ${spindle}]\n${result.nodes.map(n => `  [${n.pscale}] ${n.text}`).join('\n')}`;
    }
    if (result.mode === 'point') return `[${label} ${spindle} ${point}] ${result.text}`;
    if (result.mode === 'ring') {
      const sibs = (result.siblings || []).map(c => `  ${c.digit}: ${c.text || '(branch)'}${c.branch ? ' +' : ''}`);
      return `[${label} ${spindle} ring]\n${sibs.join('\n')}`;
    }
    if (result.mode === 'disc') {
      const entries = (result.nodes || []).map(n => `  [${n.path}] ${n.text || '(no text)'}`);
      return `[${label} ${spindle} ${point} disc]\n${entries.join('\n')}`;
    }
    return '';
  }

  function readPackage(tier, overrideAddr, at) {
    const a = at(ADDR.wake);
    if (!a) return [];
    const addr = overrideAddr || ('9.' + tier);
    const s = a.spread(addr);
    if (!s) return [];
    return s.children.filter(c => c.text).map(c => c.text);
  }

  function whatsRipe(nowSeconds, at) {
    const a = at(ADDR.concerns);
    if (!a) return [];
    const tuningDecimal = getTuningDecimalPosition(a.shell) || 9;
    const periods = a.shell.tree.periods || {};
    const ripe = [];

    function walk(node, depth, path) {
      if (!node || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node)) {
        if (!/^\d$/.test(k) || !v || typeof v !== 'object') continue;
        const childPath = path ? `${path}.${k}` : k;
        const pscale = tuningDecimal - (depth + 1);
        if (v.last !== undefined && !v.immediate) {
          const period = periods[pscale];
          if (period) {
            const phase = (nowSeconds - (v.last || 0)) / period;
            if (phase >= 1.0) {
              ripe.push({
                path: childPath, phase, text: v._ || childPath,
                spine: v.spine, pscale, focus: v.focus || null,
                package: v.package || null,
              });
            }
          }
        }
        walk(v, depth + 1, childPath);
      }
    }
    walk(a.tree, 0, '');
    ripe.sort((a, b) => b.phase - a.phase);
    return ripe;
  }

  function compile(concern, echo, { at }) {
    const sections = [];

    // §A — Spine spindle from wake
    const wakeAnchor = at(ADDR.wake);
    if (wakeAnchor) {
      const spineResult = wakeAnchor.bsp(parseFloat(concern.spindle));
      if (spineResult.mode === 'spindle' && spineResult.nodes.length > 0) {
        sections.push(`[spine ${concern.spindle}]\n${spineResult.nodes.map(n => `  [${n.pscale}] ${n.text}`).join('\n')}`);
      }
    }

    // §A.5 — Concern dashboard
    const concernAnchor = at(ADDR.concerns);
    const tierNames = { 3: 'deep', 2: 'present', 1: 'light' };
    const dashboard = concernAnchor?.shell?.tree?.dashboard || {};
    const strategy = dashboard[tierNames[concern.tier] || 'light'] || 'ripe';
    const concernLines = ['[concerns]'];
    if (strategy === 'full' && concernAnchor) {
      concernLines.push(formatTree(concernAnchor.tree));
    } else if (strategy === 'roots' && concernAnchor) {
      const concernDisc = concernAnchor.bsp(null, 8, 'disc');
      if (concernDisc.mode === 'disc') {
        for (const c of concernDisc.nodes) {
          concernLines.push(`  ${c.path}: ${c.text || '(branch)'}`);
        }
      }
    }
    const ripeSet = whatsRipe(Date.now() / 1000, at);
    if (ripeSet.length > 0) {
      concernLines.push('  [ripe]');
      for (const r of ripeSet) {
        const urgency = r.phase > 2.0 ? ' (significantly overdue)' : r.phase > 1.5 ? ' (overdue)' : '';
        concernLines.push(`    [${r.pscale}] ${r.text} — phase ${r.phase.toFixed(2)}${urgency}`);
      }
    }
    if (concernLines.length > 1) sections.push(concernLines.join('\n'));

    // §B — Package currents
    const instructions = readPackage(concern.tier, concern.package, at);
    for (const instr of instructions) {
      const result = executeInstruction(instr, at);
      if (result) sections.push(result);
    }

    return sections.join('\n\n');
  }

  // ---- Invoke: concern → LLM params ----

  function invoke(concern, opts, { at }) {
    const tier = opts.tier || concern.tier;
    const a = at(ADDR.wake);
    let inv = { model: 'claude-sonnet-4-6', max_tokens: 16384 };

    if (a) {
      const s = a.spread('9.' + (tier + 3));
      if (s) {
        const params = {};
        for (const child of s.children) {
          if (child.text) {
            const idx = child.text.indexOf(' ');
            if (idx > 0) params[child.text.substring(0, idx)] = child.text.substring(idx + 1);
          }
        }
        inv = {
          model: params.model || 'claude-sonnet-4-6',
          max_tokens: parseInt(params.max_tokens) || 16384,
        };
        if (params.thinking) {
          const parts = params.thinking.split(' ');
          if (parts[0] === 'enabled' && parts[1]) {
            inv.thinking = { type: 'enabled', budget_tokens: parseInt(parts[1]) };
          }
        }
      }
    }

    return {
      model: opts.model || inv.model,
      max_tokens: opts.max_tokens || inv.max_tokens,
      thinking: inv.thinking,
    };
  }

  // ---- Focus: concern → prior messages ----

  function compileFocus(concern) {
    const focus = concern.focus || { dialogue: 'none' };
    const messages = [];
    if (focus.dialogue && focus.dialogue !== 'none') {
      const history = _conversations.get(concern.path) || [];
      if (focus.dialogue === 'full') {
        messages.push(...history);
      } else {
        const n = parseInt(focus.dialogue.replace('last-', '')) || 5;
        messages.push(...history.slice(-(n * 2)));
      }
    }
    return messages;
  }

  // ---- After twist: history growth, conversation storage ----

  function findHistoryWritePosition(at) {
    const a = at(ADDR.history);
    if (!a) return { path: '1' };
    const tree = a.tree;

    function isSealed(node) {
      if (!node || typeof node !== 'object' || !node._) return false;
      for (let d = 1; d <= 9; d++) {
        if (node[String(d)] === undefined) return false;
      }
      return true;
    }

    function walk(node, path) {
      if (!node || typeof node !== 'object') return { path: path ? path + '.1' : '1' };
      let lastOccupied = 0;
      for (let d = 9; d >= 1; d--) {
        if (node[String(d)] !== undefined) { lastOccupied = d; break; }
      }
      if (lastOccupied === 0) return { path: path ? path + '.1' : '1' };

      const lastChild = node[String(lastOccupied)];
      if (typeof lastChild === 'string') {
        if (lastOccupied < 9) return { path: path ? path + '.' + (lastOccupied + 1) : String(lastOccupied + 1) };
        return { full: true, path: path || '' };
      }
      if (isSealed(lastChild)) {
        if (lastOccupied < 9) {
          const nextDigit = String(lastOccupied + 1);
          let newPath = path ? path + '.' + nextDigit : nextDigit;
          let depth = 0, probe = lastChild;
          while (probe && typeof probe === 'object') {
            let has = false;
            for (let d = 1; d <= 9; d++) {
              if (probe[String(d)] !== undefined) { probe = probe[String(d)]; has = true; break; }
            }
            if (!has) break;
            depth++;
          }
          for (let i = 1; i < depth; i++) newPath += '.1';
          return { path: newPath };
        }
        return { full: true, path: path || '' };
      }
      return walk(lastChild, path ? path + '.' + lastOccupied : String(lastOccupied));
    }

    return walk(tree, '');
  }

  function afterTwist(response, concern, echo, { shell, at, save, L }) {
    // Save history
    try {
      const texts = (response.content || []).filter(b => b.type === 'text');
      if (texts.length === 0) return;
      const historyTree = navigate(shell().tree, ADDR.history);
      if (!historyTree || typeof historyTree === 'string') return;

      const text = `[${new Date().toISOString()} echo:${echo}] ${texts.map(b => b.text).join('\n')}`;
      const pos = findHistoryWritePosition(at);

      if (!pos.full) {
        const fullPath = `${ADDR.history}.${pos.path}`;
        writeNode(shell().tree, fullPath, text);
        save();
      }
    } catch (e) { L.error('[ammonite] history save failed:', e); }

    // Store conversation for focus
    if (response._messages && concern.path) {
      _conversations.set(concern.path, response._messages);
    }
  }

  // ---- Concern timestamp management ----

  function updateConcernTimestamp(path, nowSeconds, { at, save }) {
    const a = at(ADDR.concerns);
    if (!a) return;
    const node = a.navigate(path);
    if (node && typeof node === 'object') {
      node.last = Math.floor(nowSeconds);
      save();
    }
  }

  // ---- Extra tools (beyond kernel universals) ----

  function extraTools() {
    return [
      {
        name: 'concern_update',
        description: 'Mark a concern as addressed. Resets its phase to 0.',
        input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Concern path within the concerns subtree' } }, required: ['path'] },
      },
      {
        name: 'datetime',
        description: 'Current date, time, timezone.',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'call_llm',
        description: 'Delegate to another tier. With stimulus: route through concern system.',
        input_schema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            model: { type: 'string', enum: ['default', 'fast'] },
            system: { type: 'string' },
            stimulus: { type: 'string' },
          },
          required: ['prompt'],
        },
      },
    ];
  }

  function executeExtraTool(name, input, ctx) {
    const { at, save, llm, triggerConcern } = ctx;
    switch (name) {
      case 'concern_update': {
        updateConcernTimestamp(input.path, Date.now() / 1000, ctx);
        return JSON.stringify({ success: true, path: input.path });
      }
      case 'datetime': {
        return JSON.stringify({ iso: new Date().toISOString(), unix: Date.now() });
      }
      case 'call_llm': {
        // This is async — handled specially by the kernel
        return { async: true, handler: async () => {
          if (input.stimulus) {
            await triggerConcern(input.stimulus, input.prompt);
            return JSON.stringify({ triggered: input.stimulus, resolved: true });
          }
          const tier = input.model === 'fast' ? 1 : 3;
          const inv = invoke({ tier }, { tier }, { at });
          const res = await llm.call({
            model: inv.model,
            max_tokens: inv.max_tokens,
            system: input.system || 'Complete the task. Return only the result.',
            messages: [{ role: 'user', content: input.prompt }],
            thinking: inv.thinking,
          });
          return (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') || '(no response)';
        }};
      }
      default:
        return null;
    }
  }

  // ---- Tools filtering per concern ----

  function toolsForConcern(concern, allTools) {
    if (concern.tools && Array.isArray(concern.tools)) {
      return allTools.filter(t => concern.tools.includes(t.name));
    }
    return allTools;
  }

  // ---- Public policy interface ----

  return {
    route,
    compile,
    invoke,
    compileFocus,
    afterTwist,
    extraTools,
    executeExtraTool,
    toolsForConcern,
    whatsRipe: (at) => whatsRipe(Date.now() / 1000, at),
    updateConcernTimestamp,
    tierFromPscale: (pscale, at) => tierFromPscale(pscale, at),
    ADDR,
  };
}
