// AMMONITE KERNEL — Pure logic, zero substrate assumptions.
// Takes a shell (one JSON tree), a storage adapter, and an LLM adapter.
// Returns a running ammonite.
//
// The kernel does five things:
//   1. Navigate the shell (BSP)
//   2. Match stimuli to concerns (walk the concern subtree)
//   3. Compile currents (BSP instructions → system prompt)
//   4. Twist (call LLM → handle tools → recompile → repeat)
//   5. Tick (check which concerns are ripe, fire them)
//
// It does NOT: touch DOM, localStorage, filesystems, or network.
// Those are adapter responsibilities, injected at boot.
//
// Shell layout (digits are conventional, not hardcoded in kernel):
//   The kernel reads the shell's skeleton to discover which digit
//   serves which role. But for the initial build, the convention is:
//     1 = wake (spine, packages, invocation)
//     2 = concerns (stimulus routing, temporal state)
//     3 = history (growth tree, append-only)
//     4 = stash (working memory)
//     5 = purpose
//     6 = relationships
//     7 = cooking (recipes)
//     8 = touchstone (format spec)
//     9 = horizon (roadmap)
//   These numbers live in the shell's skeleton, not in the kernel.

import {
  bsp, anchor, navigate, readNode, writeNode,
  spread, findUnoccupiedDigit,
  getTuningDecimalPosition, getCompressionDepth,
} from './bsp.js';

// ============ CREATE KERNEL ============

export function createKernel({ storage, llm, log }) {
  // log is optional: { info, error } — defaults to console
  const L = log || { info: console.log, error: console.error };

  // Shell address map — discovered from skeleton, with defaults.
  // The kernel asks the shell where things are, not the other way around.
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

  let _shell = null;   // The live shell in memory
  let _ctx = null;      // { echo, changed, concern } during a twist
  let _lock = false;    // Activation lock — one twist at a time
  let _conversations = new Map(); // concern path → message history

  // ---- Shell access ----

  function load() {
    _shell = storage.load();
    if (!_shell) _shell = { tree: { _: 'Empty shell.' } };
    return _shell;
  }

  function save() {
    storage.save(_shell);
  }

  function shell() { return _shell; }

  // ---- Anchored access (the replacement for blockLoad) ----

  function at(digit) {
    if (!_shell) load();
    return anchor(_shell, digit);
  }

  // ---- Concern system ----

  function tierFromPscale(pscale) {
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

  function findConcern(stimulus) {
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
            tier: tierFromPscale(pscale),
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

  function whatsRipe(nowSeconds) {
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

  function updateConcernTimestamp(path, nowSeconds) {
    const a = at(ADDR.concerns);
    if (!a) return;
    const node = a.navigate(path);
    if (node && typeof node === 'object') {
      node.last = Math.floor(nowSeconds);
      save();
    }
  }

  // ---- Package & invocation (read from wake subtree) ----

  function readPackage(tier, overrideAddr) {
    const a = at(ADDR.wake);
    if (!a) return [];
    const addr = overrideAddr || ('9.' + tier);
    const s = a.spread(addr);
    if (!s) return [];
    return s.children.filter(c => c.text).map(c => c.text);
  }

  function readInvocation(tier) {
    const a = at(ADDR.wake);
    if (!a) return { model: 'claude-sonnet-4-6', max_tokens: 16384 };
    const s = a.spread('9.' + (tier + 3));
    if (!s) return { model: 'claude-sonnet-4-6', max_tokens: 16384 };
    const params = {};
    for (const child of s.children) {
      if (child.text) {
        const idx = child.text.indexOf(' ');
        if (idx > 0) params[child.text.substring(0, idx)] = child.text.substring(idx + 1);
      }
    }
    const result = {
      model: params.model || 'claude-sonnet-4-6',
      max_tokens: parseInt(params.max_tokens) || 16384,
    };
    if (params.thinking) {
      const parts = params.thinking.split(' ');
      if (parts[0] === 'enabled' && parts[1]) {
        result.thinking = { type: 'enabled', budget_tokens: parseInt(parts[1]) };
      }
    }
    return result;
  }

  // ---- Currents compiler ----

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
    // In ammonite, instructions use addresses, not block names.
    // "1 0.21" → bsp(shell, anchor at 1, address 0.21)
    // But they can also be full-shell addresses: "0.121" → bsp on whole shell.
    // Convention: first token is a digit (subtree) or a semantic number (whole shell).
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

  function executeInstruction(instr) {
    const parsed = parseInstruction(instr);
    const { root, spindle, point, fn } = parsed;

    // Anchor at the root digit
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

  function compileCurrents(concern, echo) {
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
    const ripeSet = whatsRipe(Date.now() / 1000);
    if (ripeSet.length > 0) {
      concernLines.push('  [ripe]');
      for (const r of ripeSet) {
        const urgency = r.phase > 2.0 ? ' (significantly overdue)' : r.phase > 1.5 ? ' (overdue)' : '';
        concernLines.push(`    [${r.pscale}] ${r.text} — phase ${r.phase.toFixed(2)}${urgency}`);
      }
    }
    if (concernLines.length > 1) sections.push(concernLines.join('\n'));

    // §B — Package currents
    const instructions = readPackage(concern.tier, concern.package);
    for (const instr of instructions) {
      const result = executeInstruction(instr);
      if (result) sections.push(result);
    }

    return sections.join('\n\n');
  }

  // ---- Focus (conversation history) ----

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

  // ---- Tools ----

  const TOOLS = [
    {
      name: 'read',
      description: 'Read a node in the shell at an address. Returns content + immediate children.',
      input_schema: { type: 'object', properties: { address: { type: 'string', description: 'Dot-separated address, e.g. "1.2.3" or "4"' } }, required: ['address'] },
    },
    {
      name: 'write',
      description: 'Write content to an address in the shell.',
      input_schema: { type: 'object', properties: { address: { type: 'string' }, content: { type: 'string' } }, required: ['address', 'content'] },
    },
    {
      name: 'bsp',
      description: 'Semantic address resolution on a subtree.\nbsp(root) → dir\nbsp(root, address) → spindle\nbsp(root, address, "ring") → siblings\nbsp(root, address, "dir") → subtree\nbsp(root, address, point) → single node at pscale\nbsp(root, null, pscale, "disc") → all nodes at pscale',
      input_schema: {
        type: 'object',
        properties: {
          root: { type: 'string', description: 'Digit to anchor on (e.g. "1" for wake subtree)' },
          spindle: { oneOf: [{ type: 'number' }, { type: 'string', enum: ['ref'] }] },
          point: { oneOf: [{ type: 'number' }, { type: 'string', enum: ['ring', 'dir'] }] },
          fn: { type: 'string', enum: ['disc'] },
        },
        required: ['root'],
      },
    },
    {
      name: 'append',
      description: 'Add entry at next free digit (1-9) under an address.',
      input_schema: { type: 'object', properties: { address: { type: 'string' }, content: { type: 'string' } }, required: ['address', 'content'] },
    },
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

  function toolsForConcern(concern) {
    if (concern.tools && Array.isArray(concern.tools)) {
      return TOOLS.filter(t => concern.tools.includes(t.name));
    }
    return TOOLS;
  }

  async function executeTool(name, input) {
    switch (name) {
      case 'read': {
        const node = navigate(_shell.tree, input.address);
        if (node === null || node === undefined) return JSON.stringify({ error: `Address "${input.address}" not found` });
        return JSON.stringify(readNode(_shell.tree, input.address));
      }
      case 'write': {
        writeNode(_shell.tree, input.address, input.content);
        if (_ctx) _ctx.changed.add(input.address.split('.')[0]);
        save();
        return JSON.stringify({ success: true });
      }
      case 'bsp': {
        const a = at(input.root);
        if (!a) return JSON.stringify({ error: `Subtree "${input.root}" not found` });
        const result = a.bsp(input.spindle, input.point, input.fn);
        return JSON.stringify(result);
      }
      case 'append': {
        const slot = findUnoccupiedDigit(_shell.tree, input.address);
        if (slot.full) return JSON.stringify({ error: 'All digits 1-9 occupied', address: input.address });
        const writePath = input.address ? `${input.address}.${slot.digit}` : slot.digit;
        writeNode(_shell.tree, writePath, input.content);
        if (_ctx) _ctx.changed.add(input.address.split('.')[0]);
        save();
        return JSON.stringify({ success: true, address: writePath, digit: slot.digit });
      }
      case 'concern_update': {
        updateConcernTimestamp(input.path, Date.now() / 1000);
        return JSON.stringify({ success: true, path: input.path });
      }
      case 'datetime': {
        return JSON.stringify({ iso: new Date().toISOString(), unix: Date.now() });
      }
      case 'call_llm': {
        if (input.stimulus) {
          const savedCtx = _ctx;
          try {
            await triggerConcern(input.stimulus, input.prompt);
          } catch (e) {
            return JSON.stringify({ error: e.message });
          } finally {
            _ctx = savedCtx;
          }
          return JSON.stringify({ triggered: input.stimulus, resolved: true });
        }
        const tier = input.model === 'fast' ? 1 : 3;
        const inv = readInvocation(tier);
        const res = await llm.call({
          model: inv.model,
          max_tokens: inv.max_tokens,
          system: input.system || 'Complete the task. Return only the result.',
          messages: [{ role: 'user', content: input.prompt }],
          thinking: inv.thinking,
        });
        return (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') || '(no response)';
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }

  // ---- The Twist ----

  async function twist(params, concern) {
    _ctx = { echo: 0, changed: new Set(), concern };

    try {
      let response = await llm.call(params);
      let allMessages = [...params.messages];

      while (response.stop_reason === 'tool_use' || response.stop_reason === 'pause_turn') {
        const toolBlocks = (response.content || []).filter(b => b.type === 'tool_use');
        const serverBlocks = (response.content || []).filter(b => b.type === 'server_tool_use');
        for (const b of serverBlocks) L.info(`[ammonite] server: ${b.name}`);

        if (response.stop_reason === 'pause_turn' && toolBlocks.length === 0) {
          allMessages = [...allMessages, { role: 'assistant', content: response.content }];
          response = await llm.call({ ...params, messages: allMessages });
          continue;
        }

        if (toolBlocks.length === 0) break;

        const results = [];
        for (const tb of toolBlocks) {
          L.info(`[ammonite] tool: ${tb.name}`, tb.input);
          const result = await executeTool(tb.name, tb.input);
          results.push({ type: 'tool_result', tool_use_id: tb.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
        }

        allMessages = [...allMessages, { role: 'assistant', content: response.content }, { role: 'user', content: results }];

        // THE TWIST: echo increments, currents recompile, context shifts
        _ctx.echo++;
        const freshSystem = compileCurrents(concern, _ctx.echo);
        params = { ...params, system: freshSystem };
        _ctx.changed.clear();

        L.info(`[ammonite] twist: echo ${_ctx.echo}`);
        response = await llm.call({ ...params, messages: allMessages });
      }

      // Persist history
      autoSaveHistory(response, _ctx.echo);
      response._messages = allMessages;
      response._echo = _ctx.echo;
      return response;

    } finally {
      _ctx = null;
    }
  }

  // ---- History growth ----

  function findHistoryWritePosition() {
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

  function autoSaveHistory(response, echo) {
    try {
      const texts = (response.content || []).filter(b => b.type === 'text');
      if (texts.length === 0) return;
      const historyTree = navigate(_shell.tree, ADDR.history);
      if (!historyTree || typeof historyTree === 'string') return;

      const text = `[${new Date().toISOString()} echo:${echo}] ${texts.map(b => b.text).join('\n')}`;
      const pos = findHistoryWritePosition();

      if (!pos.full) {
        // Write into the history subtree (address relative to history root)
        const fullPath = `${ADDR.history}.${pos.path}`;
        writeNode(_shell.tree, fullPath, text);
        save();
      }
    } catch (e) { L.error('[ammonite] history save failed:', e); }
  }

  // ---- Trigger & tick ----

  async function triggerConcern(stimulus, message) {
    const concern = findConcern(stimulus);
    const inv = readInvocation(concern.tier);
    const system = compileCurrents(concern, 0);
    const params = {
      model: inv.model, max_tokens: inv.max_tokens, system,
      messages: [{ role: 'user', content: message }],
      tools: toolsForConcern(concern), thinking: inv.thinking,
    };
    if (inv.thinking && params.max_tokens <= (inv.thinking.budget_tokens || 0)) {
      params.max_tokens = (inv.thinking.budget_tokens || 0) + 1024;
    }
    return twist(params, concern);
  }

  async function activate(stimulus, message, opts = {}) {
    if (_lock) return { error: 'activation in progress' };
    _lock = true;
    try {
      if (!_shell) load();
      const concern = findConcern(stimulus);
      if (concern.path) updateConcernTimestamp(concern.path, Date.now() / 1000);
      const inv = readInvocation(opts.tier || concern.tier);
      const system = opts.system || compileCurrents(concern, 0);
      const focusMessages = compileFocus(concern);
      const allInput = [...focusMessages, ...(message ? [{ role: 'user', content: message }] : [])];
      const params = {
        model: opts.model || inv.model,
        max_tokens: opts.max_tokens || inv.max_tokens,
        system,
        messages: allInput,
        tools: toolsForConcern(concern),
        thinking: inv.thinking,
      };
      if (inv.thinking && params.max_tokens <= (inv.thinking.budget_tokens || 0)) {
        params.max_tokens = (inv.thinking.budget_tokens || 0) + 1024;
      }
      const response = await twist(params, concern);
      if (response._messages) _conversations.set(concern.path, response._messages);
      const text = (response.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      return { text, echo: response._echo, model: response.model };
    } catch (e) {
      L.error('[ammonite] activation failed:', e);
      return { error: e.message };
    } finally {
      _lock = false;
    }
  }

  async function tick() {
    if (_lock) return;
    if (!_shell) load();
    const ripe = whatsRipe(Date.now() / 1000);
    if (ripe.length === 0) return;
    const top = ripe[0];

    // Mechanical heartbeat for low-pscale concerns
    if (top.pscale <= 4) {
      const a = at(ADDR.concerns);
      if (a) {
        updateConcernTimestamp(top.path, Date.now() / 1000);
        L.info('[ammonite] heartbeat: mechanical OK');
        return;
      }
    }

    const tier = tierFromPscale(top.pscale);
    const concern = {
      spindle: top.spine || '0.1111111', tier, name: top.text,
      path: top.path, focus: top.focus, package: top.package || null, tools: null,
    };
    L.info(`[ammonite] concern: ${top.text} phase=${top.phase.toFixed(2)} → tier ${tier}`);

    _lock = true;
    try {
      const inv = readInvocation(tier);
      const system = compileCurrents(concern, 0);
      const focusMessages = compileFocus(concern);
      const msg = { role: 'user', content: `CONCERN ACTIVATION — ${top.text} (phase ${top.phase.toFixed(2)}). Address this concern, then use concern_update to mark it handled.` };
      const params = {
        model: inv.model, max_tokens: inv.max_tokens, system,
        messages: [...focusMessages, msg],
        tools: toolsForConcern(concern), thinking: inv.thinking,
      };
      if (inv.thinking && params.max_tokens <= (inv.thinking.budget_tokens || 0)) {
        params.max_tokens = (inv.thinking.budget_tokens || 0) + 1024;
      }
      const response = await twist(params, concern);
      if (response._messages) _conversations.set(concern.path, response._messages);
    } catch (e) {
      L.error('[ammonite] concern activation failed:', e);
    } finally {
      updateConcernTimestamp(top.path, Date.now() / 1000);
      _lock = false;
    }
  }

  // ---- Public interface ----

  return {
    // Shell access
    load,
    save,
    shell: () => _shell,
    at,
    bsp: (address, point, fn) => bsp(_shell, address, point, fn),

    // Concern system
    findConcern,
    whatsRipe: () => whatsRipe(Date.now() / 1000),

    // Actions
    activate,    // stimulus + message → response (the main entry point)
    tick,        // check ripe concerns, fire most urgent
    triggerConcern,

    // Direct access (for adapters)
    compileCurrents,
    tools: TOOLS,
  };
}
