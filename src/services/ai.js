const config = require('../config');
const { UserError } = require('./errors');

async function complete({ system, user, maxTokens = 3000 }) {
  const { provider } = config.ai;
  try {
    if (provider === 'openai') return await openai(system, user, maxTokens);
    return await anthropic(system, user, maxTokens);
  } catch (e) {
    if (e instanceof UserError) throw e;
    console.error('[ai] request failed:', e.message);
    throw new UserError('The AI service did not respond. Your credits were refunded. Try again in a minute.', 502);
  }
}

async function anthropic(system, user, maxTokens) {
  if (!config.ai.anthropicKey) throw new UserError('The AI service is not configured yet.', 503);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.ai.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.ai.anthropicModel, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function openai(system, user, maxTokens) {
  if (!config.ai.openaiKey) throw new UserError('The AI service is not configured yet.', 503);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ai.openaiKey}` },
    body: JSON.stringify({
      model: config.ai.openaiModel,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

function parseJSON(text) {
  const s = String(text).replace(/```json|```/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No JSON in model output');
  return JSON.parse(s.slice(a, b + 1));
}

module.exports = { complete, parseJSON };
