#!/usr/bin/env node
// Test: the twist as Mode 4 blocks.
// The twist is the kernel's core loop: LLM → tools → echo → recompile → repeat.
// Data algorithm is Mode 4. Async orchestration is minimal JS electricity.

import { nav, read, unfold, RT } from './core.js';

// ============ MODE 4 BLOCKS ============

// Check if twist loop should continue
const TWIST_CHECK = {
  _: 'Check if twist should continue looping',
  1: 'nav $response stop_reason',
  2: 'eq #1 tool_use',
  3: 'eq #1 pause_turn',
  4: 'or #2 #3',                                  // should continue?
};

// Extract tool_use blocks from response content
const TWIST_EXTRACT = {
  _: 'Extract tool_use blocks from response content',
  1: { _: 'each $content',
    1: 'nav $item type',                           //   block type
    2: 'eq #1 tool_use',                           //   is tool_use?
    3: { _: 'if #2', 1: 'id $item' },             //   keep if yes
    4: 'return #3',                                //   yield (undefined filtered)
  },
};

// Build updated messages for next echo
const TWIST_MESSAGES = {
  _: 'Build tool results and append to message history',
  1: { _: 'each $tools',                          // build tool_result objects
    1: 'nav $item id',                             //   tool_use_id
    2: 'get $results $i',                          //   result at same index
    3: 'obj type tool_result tool_use_id #1 content #2',
    4: 'return #3',
  },
  2: 'obj role assistant content $content',        // assistant message
  3: 'obj role user content #1',                   // user message (tool results)
  4: 'push $messages #2 #3',                       // append both
};

// ============ ASYNC TWIST RUNNER ============
// Minimal electricity for async orchestration.
// The blocks handle data; the runner handles time.

async function twistRun(blocks, ctx) {
  let response = await ctx.llm(ctx.params);
  let messages = [...ctx.params.messages];
  let echo = 0;

  while (true) {
    const content = response.content || [];
    const { '4': shouldContinue, '3': isPause } = unfold(blocks.check, { response });
    if (!shouldContinue) break;

    const { '1': tools } = unfold(blocks.extract, { content });

    // Pause with no tools → re-call
    if (isPause && tools.length === 0) {
      messages = [...messages, { role: 'assistant', content }];
      response = await ctx.llm({ ...ctx.params, messages });
      continue;
    }
    if (tools.length === 0) break;

    // Async: execute tools (the only part that needs JS runtime)
    const results = [];
    for (const tb of tools) {
      const r = await ctx.executeTool(tb.name, tb.input);
      results.push(typeof r === 'string' ? r : JSON.stringify(r));
    }

    // Mode 4: build messages
    const built = unfold(blocks.messages, { tools, results, content, messages });
    messages = built['4'];

    // Echo + recompile
    echo++;
    if (ctx.compile) ctx.params = { ...ctx.params, system: ctx.compile(echo) };

    response = await ctx.llm({ ...ctx.params, messages });
  }

  response._messages = messages;
  response._echo = echo;
  return response;
}

// ============ HELPERS ============

let pass = 0, fail = 0;
function check(label, match) {
  if (match) { console.log(`  ✓ ${label}`); pass++; }
  else { console.log(`  ✗ ${label}`); fail++; }
}

const BLOCKS = { check: TWIST_CHECK, extract: TWIST_EXTRACT, messages: TWIST_MESSAGES };

// ============ TEST: TWIST_CHECK ============

console.log('=== TWIST_CHECK ===');

check('tool_use → continue',
  unfold(TWIST_CHECK, { response: { stop_reason: 'tool_use' } })['4'] === true);

check('pause_turn → continue',
  unfold(TWIST_CHECK, { response: { stop_reason: 'pause_turn' } })['4'] === true);

check('end_turn → stop',
  unfold(TWIST_CHECK, { response: { stop_reason: 'end_turn' } })['4'] === false);

check('isPause true for pause_turn',
  unfold(TWIST_CHECK, { response: { stop_reason: 'pause_turn' } })['3'] === true);

check('isPause false for tool_use',
  unfold(TWIST_CHECK, { response: { stop_reason: 'tool_use' } })['3'] === false);

// ============ TEST: TWIST_EXTRACT ============

console.log('\n=== TWIST_EXTRACT ===');

const mockContent = [
  { type: 'text', text: 'Let me help.' },
  { type: 'tool_use', id: 'tu_1', name: 'read', input: { address: '1' } },
  { type: 'tool_use', id: 'tu_2', name: 'write', input: { address: '2', content: 'hi' } },
];

const extracted = unfold(TWIST_EXTRACT, { content: mockContent })['1'];
check('extracts 2 tool_use blocks', extracted.length === 2);
check('first tool id', extracted[0].id === 'tu_1');
check('second tool id', extracted[1].id === 'tu_2');
check('preserves name', extracted[0].name === 'read');
check('preserves input', extracted[1].input.address === '2');

const emptyExtracted = unfold(TWIST_EXTRACT, {
  content: [{ type: 'text', text: 'hi' }],
})['1'];
check('empty when no tools', emptyExtracted.length === 0);

// ============ TEST: TWIST_MESSAGES ============

console.log('\n=== TWIST_MESSAGES ===');

const tools = [
  { type: 'tool_use', id: 'tu_1', name: 'read', input: {} },
  { type: 'tool_use', id: 'tu_2', name: 'write', input: {} },
];
const results = ['{"content":"hello"}', '{"success":true}'];
const messages = [{ role: 'user', content: 'Do something' }];

const built = unfold(TWIST_MESSAGES, {
  tools, results, content: mockContent, messages,
});

const toolResults = built['1'];
check('builds 2 tool_results', toolResults.length === 2);
check('tool_result type', toolResults[0].type === 'tool_result');
check('tool_use_id preserved', toolResults[0].tool_use_id === 'tu_1');
check('content preserved', toolResults[0].content === '{"content":"hello"}');
check('second result', toolResults[1].tool_use_id === 'tu_2');

const updatedMessages = built['4'];
check('3 messages total', updatedMessages.length === 3);
check('original preserved', updatedMessages[0].role === 'user');
check('assistant appended', updatedMessages[1].role === 'assistant');
check('user tool results appended', updatedMessages[2].role === 'user');
check('tool results in user msg', updatedMessages[2].content.length === 2);

// ============ TEST: FULL TWIST (single echo) ============

console.log('\n=== FULL TWIST ===');

{
  let callCount = 0;
  const mockLlm = async (params) => {
    callCount++;
    if (callCount === 1) {
      return {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Reading data.' },
          { type: 'tool_use', id: 'tu_a', name: 'read', input: { address: '1.2' } },
        ],
      };
    }
    return {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done.' }],
    };
  };

  const mockExecute = async (name, input) => {
    return JSON.stringify({ result: `${name} executed` });
  };

  const result = await twistRun(BLOCKS, {
    llm: mockLlm,
    executeTool: mockExecute,
    params: {
      model: 'test',
      messages: [{ role: 'user', content: 'Hello' }],
      system: 'You are helpful.',
    },
  });

  check('LLM called twice', callCount === 2);
  check('echo count is 1', result._echo === 1);
  check('final stop is end_turn', result.stop_reason === 'end_turn');
  check('messages has 3 entries', result._messages.length === 3);
  check('first msg is user', result._messages[0].role === 'user');
  check('second msg is assistant', result._messages[1].role === 'assistant');
  check('third msg is user (results)', result._messages[2].role === 'user');
  check('tool_result in msg', result._messages[2].content[0].type === 'tool_result');
  check('tool_use_id in result', result._messages[2].content[0].tool_use_id === 'tu_a');
}

// ============ TEST: MULTI-ECHO TWIST ============

console.log('\n=== MULTI-ECHO TWIST ===');

{
  let callCount = 0;
  const mockLlm = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'read', input: { address: '1' } },
        ],
      };
    }
    if (callCount === 2) {
      return {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu_2', name: 'write', input: { address: '2', content: 'x' } },
          { type: 'tool_use', id: 'tu_3', name: 'read', input: { address: '3' } },
        ],
      };
    }
    return {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'All done.' }],
    };
  };

  const execLog = [];
  const mockExecute = async (name) => {
    execLog.push(name);
    return `result_${name}`;
  };

  let recompileCount = 0;
  const result = await twistRun(BLOCKS, {
    llm: mockLlm,
    executeTool: mockExecute,
    params: {
      model: 'test',
      messages: [{ role: 'user', content: 'Go' }],
      system: 'sys',
    },
    compile: (echo) => { recompileCount++; return `sys_echo${echo}`; },
  });

  check('LLM called 3 times', callCount === 3);
  check('echo count is 2', result._echo === 2);
  check('3 tools executed', execLog.length === 3);
  check('tools in order', execLog.join(',') === 'read,write,read');
  check('recompiled twice', recompileCount === 2);
  check('messages has 5 entries', result._messages.length === 5);
  // user(1), assistant+results(2,3), assistant+results(4,5)
}

// ============ TEST: PAUSE_TURN ============

console.log('\n=== PAUSE_TURN ===');

{
  let callCount = 0;
  const mockLlm = async () => {
    callCount++;
    if (callCount === 1) {
      return {
        stop_reason: 'pause_turn',
        content: [{ type: 'text', text: 'Thinking...' }],
      };
    }
    return {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Done thinking.' }],
    };
  };

  const result = await twistRun(BLOCKS, {
    llm: mockLlm,
    executeTool: async () => 'x',
    params: {
      model: 'test',
      messages: [{ role: 'user', content: 'Think' }],
      system: '',
    },
  });

  check('handles pause_turn', result.stop_reason === 'end_turn');
  check('LLM called twice', callCount === 2);
  check('no echo increment', result._echo === 0);
  check('pause msg appended', result._messages.length === 2);
  check('assistant preserved', result._messages[1].role === 'assistant');
}

// ============ TEST: NO TOOLS (immediate end) ============

console.log('\n=== IMMEDIATE END ===');

{
  let callCount = 0;
  const mockLlm = async () => {
    callCount++;
    return {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Nothing to do.' }],
    };
  };

  const result = await twistRun(BLOCKS, {
    llm: mockLlm,
    executeTool: async () => 'x',
    params: {
      model: 'test',
      messages: [{ role: 'user', content: 'Hi' }],
      system: '',
    },
  });

  check('LLM called once', callCount === 1);
  check('echo is 0', result._echo === 0);
  check('messages unchanged', result._messages.length === 1);
}

// ============ SUMMARY ============

console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
