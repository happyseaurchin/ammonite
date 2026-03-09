// AMMONITE KERNEL — The electricity.
//
// Takes a shell (one JSON tree), a storage adapter, an LLM adapter,
// and a policy (how this entity walks its tree).
// Returns a running ammonite.
//
// The kernel does three things:
//   1. Navigate the shell (BSP)
//   2. Execute tools (read, write, bsp, append — universal tree operations)
//   3. Twist (call LLM → handle tools → recompile → repeat)
//
// Everything else — how to route stimuli, how to compile context,
// what model to use, how to grow history — is policy.
// The kernel is the electricity. The policy is the wiring diagram.
//
// It does NOT: touch DOM, localStorage, filesystems, or network.
// Those are adapter responsibilities, injected at boot.

import {
  bsp, anchor, navigate, readNode, writeNode,
  findUnoccupiedDigit,
} from './bsp.js';

// ============ CREATE KERNEL ============

export function createKernel({ storage, llm, policy, log }) {
  const L = log || { info: console.log, error: console.error };

  let _shell = null;   // The live shell in memory
  let _ctx = null;      // { echo, changed, concern } during a twist
  let _lock = false;    // Activation lock — one twist at a time

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

  function at(digit) {
    if (!_shell) load();
    return anchor(_shell, digit);
  }

  // The context object passed to policy functions.
  // This is how the policy accesses the kernel's state
  // without the kernel knowing what the policy does with it.
  function kernelCtx() {
    return { shell, at, save, llm, L, triggerConcern };
  }

  // ---- Universal tools (tree operations) ----

  const CORE_TOOLS = [
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
  ];

  function executeCoreTools(name, input) {
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
      default:
        return null; // Not a core tool
    }
  }

  // ---- Tool dispatch (core + policy) ----

  async function executeTool(name, input) {
    // Try core tools first
    const coreResult = executeCoreTools(name, input);
    if (coreResult !== null) return coreResult;

    // Delegate to policy for extra tools
    if (policy && policy.executeExtraTool) {
      const ctx = kernelCtx();
      const result = policy.executeExtraTool(name, input, ctx);
      if (result !== null) {
        // Policy tools can be async
        if (result && result.async && result.handler) {
          const savedCtx = _ctx;
          try {
            return await result.handler();
          } catch (e) {
            return JSON.stringify({ error: e.message });
          } finally {
            _ctx = savedCtx;
          }
        }
        return typeof result === 'string' ? result : JSON.stringify(result);
      }
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  // ---- The Twist ----
  //
  // The heart of the kernel. After each tool call:
  //   1. Echo increments
  //   2. Policy recompiles currents from the (possibly changed) tree
  //   3. The LLM sees fresh context
  //
  // This is how tool calls become self-correcting.

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

        // THE TWIST: echo increments, policy recompiles, context shifts
        _ctx.echo++;
        if (policy && policy.compile) {
          const freshSystem = policy.compile(concern, _ctx.echo, kernelCtx());
          params = { ...params, system: freshSystem };
        }
        _ctx.changed.clear();

        L.info(`[ammonite] twist: echo ${_ctx.echo}`);
        response = await llm.call({ ...params, messages: allMessages });
      }

      // Let policy handle post-twist effects (history, conversation storage, etc.)
      if (policy && policy.afterTwist) {
        policy.afterTwist(response, concern, _ctx.echo, kernelCtx());
      }

      response._messages = allMessages;
      response._echo = _ctx.echo;
      return response;

    } finally {
      _ctx = null;
    }
  }

  // ---- Activate & trigger ----

  function allTools() {
    const extras = (policy && policy.extraTools) ? policy.extraTools() : [];
    return [...CORE_TOOLS, ...extras];
  }

  function selectTools(concern) {
    const all = allTools();
    if (policy && policy.toolsForConcern) {
      return policy.toolsForConcern(concern, all);
    }
    return all;
  }

  function ensureThinkingBudget(params) {
    if (params.thinking && params.max_tokens <= (params.thinking.budget_tokens || 0)) {
      params.max_tokens = (params.thinking.budget_tokens || 0) + 1024;
    }
    return params;
  }

  async function triggerConcern(stimulus, message) {
    const ctx = kernelCtx();
    const concern = policy.route(stimulus, ctx);
    const inv = policy.invoke(concern, {}, ctx);
    const system = policy.compile(concern, 0, ctx);
    const params = ensureThinkingBudget({
      model: inv.model, max_tokens: inv.max_tokens, system,
      messages: [{ role: 'user', content: message }],
      tools: selectTools(concern), thinking: inv.thinking,
    });
    return twist(params, concern);
  }

  async function activate(stimulus, message, opts = {}) {
    if (_lock) return { error: 'activation in progress' };
    _lock = true;
    try {
      if (!_shell) load();
      const ctx = kernelCtx();
      const concern = policy.route(stimulus, ctx);

      // Let policy handle pre-activation (e.g. timestamp updates)
      if (concern.path && policy.updateConcernTimestamp) {
        policy.updateConcernTimestamp(concern.path, Date.now() / 1000, ctx);
      }

      const inv = policy.invoke(concern, opts, ctx);
      const system = opts.system || policy.compile(concern, 0, ctx);
      const focusMessages = policy.compileFocus ? policy.compileFocus(concern) : [];
      const allInput = [...focusMessages, ...(message ? [{ role: 'user', content: message }] : [])];

      const params = ensureThinkingBudget({
        model: opts.model || inv.model,
        max_tokens: opts.max_tokens || inv.max_tokens,
        system,
        messages: allInput,
        tools: selectTools(concern),
        thinking: inv.thinking,
      });

      const response = await twist(params, concern);
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
    const ctx = kernelCtx();

    // Ask policy what's ripe
    const ripe = policy.whatsRipe ? policy.whatsRipe(at) : [];
    if (ripe.length === 0) return;
    const top = ripe[0];

    // Mechanical heartbeat for low-pscale concerns
    if (top.pscale <= 4) {
      if (policy.updateConcernTimestamp) {
        policy.updateConcernTimestamp(top.path, Date.now() / 1000, ctx);
      }
      L.info('[ammonite] heartbeat: mechanical OK');
      return;
    }

    const tier = policy.tierFromPscale ? policy.tierFromPscale(top.pscale, at) : 1;
    const concern = {
      spindle: top.spine || '0.1111111', tier, name: top.text,
      path: top.path, focus: top.focus, package: top.package || null, tools: null,
    };
    L.info(`[ammonite] concern: ${top.text} phase=${top.phase.toFixed(2)} → tier ${tier}`);

    _lock = true;
    try {
      const inv = policy.invoke(concern, { tier }, ctx);
      const system = policy.compile(concern, 0, ctx);
      const focusMessages = policy.compileFocus ? policy.compileFocus(concern) : [];
      const msg = { role: 'user', content: `CONCERN ACTIVATION — ${top.text} (phase ${top.phase.toFixed(2)}). Address this concern, then use concern_update to mark it handled.` };
      const params = ensureThinkingBudget({
        model: inv.model, max_tokens: inv.max_tokens, system,
        messages: [...focusMessages, msg],
        tools: selectTools(concern), thinking: inv.thinking,
      });
      await twist(params, concern);
    } catch (e) {
      L.error('[ammonite] concern activation failed:', e);
    } finally {
      if (policy.updateConcernTimestamp) {
        policy.updateConcernTimestamp(top.path, Date.now() / 1000, ctx);
      }
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
    bsp: (address, point, fn) => {
      if (!_shell) load();
      return bsp(_shell, address, point, fn);
    },

    // Actions
    activate,    // stimulus + message → response (the main entry point)
    tick,        // check ripe concerns, fire most urgent
    triggerConcern,

    // Direct access (for adapters and debugging)
    tools: allTools,
  };
}
