// Anthropic LLM adapter — calls Claude API directly.
// Single method: call(params) → response.
// params: { model, max_tokens, system, messages, tools?, thinking? }

export function createAnthropicLLM(apiKey, options = {}) {
  const baseUrl = options.baseUrl || 'https://api.anthropic.com';
  const version = options.version || '2023-06-01';

  return {
    async call(params) {
      const body = {};
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) body[k] = v;
      }
      // Extended thinking requires temperature=1 or unset
      if (body.thinking && body.temperature !== undefined && body.temperature !== 1) {
        delete body.temperature;
      }

      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': version,
      };
      // Server-side tools need beta header
      if (body.tools && body.tools.some(t => t.type && t.type.includes('web'))) {
        headers['anthropic-beta'] = 'interleaved-thinking-2025-05-14';
      }

      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic ${res.status}: ${err}`);
      }

      const data = await res.json();
      if (data.type === 'error') {
        throw new Error(`Claude: ${data.error?.message || JSON.stringify(data.error)}`);
      }
      return data;
    },
  };
}
