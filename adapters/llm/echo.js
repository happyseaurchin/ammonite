// Echo LLM adapter — returns the input as output. For testing.
// No API calls. The ammonite talks to itself.

export function createEchoLLM() {
  return {
    async call(params) {
      const lastMsg = params.messages[params.messages.length - 1];
      const text = typeof lastMsg.content === 'string'
        ? lastMsg.content
        : JSON.stringify(lastMsg.content);
      return {
        id: 'echo-' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: `[echo] ${text}` }],
        stop_reason: 'end_turn',
        model: 'echo',
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  };
}
