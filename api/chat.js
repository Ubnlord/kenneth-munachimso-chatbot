// Vercel Serverless Function - Multi-provider chat proxy
// Primary: Hugging Face Inference Providers
// Free fallback: Groq API (requires GROQ_API_KEY in Vercel)

const HF_PRIMARY_MODEL = 'openai/gpt-oss-120b:fastest';
const HF_FALLBACK_MODEL = 'Qwen/Qwen3-8B:fastest';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const MAX_HF_RETRIES = 2;
const RETRY_DELAYS_MS = [800, 1800];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeModel(model) {
  if (!model || typeof model !== 'string') return HF_PRIMARY_MODEL;
  const value = model.trim();
  if (value === 'openai/gpt-oss-120b') return HF_PRIMARY_MODEL;
  if (value === 'Qwen/Qwen3-8B') return HF_FALLBACK_MODEL;
  return value;
}

async function requestHuggingFace({ apiKey, model, messages, temperature, max_tokens }) {
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens, stream: false })
  });

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { error: raw }; }
  return { response, data };
}

async function requestGroq({ apiKey, messages, temperature, max_tokens }) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      max_tokens,
      stream: false
    })
  });

  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { error: raw }; }
  return { response, data };
}

function providerError(data, status) {
  return String(
    data?.error?.message ||
    data?.error ||
    data?.message ||
    `Provider returned HTTP ${status}`
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!messages.length) return res.status(400).json({ error: 'messages is required.' });

  const temperature = body.temperature ?? 0.8;
  const max_tokens = body.max_tokens ?? 1024;
  const requestedModel = normalizeModel(body.model);

  // 1) Try Hugging Face if a token exists. A 402 (credits exhausted) is treated
  // as a hard provider failure and immediately moves to the free Groq fallback.
  const hfToken = process.env.HF_TOKEN;
  let lastFailure = null;

  if (hfToken) {
    const hfModels = [requestedModel];
    if (requestedModel !== HF_FALLBACK_MODEL) hfModels.push(HF_FALLBACK_MODEL);

    for (const model of hfModels) {
      for (let attempt = 0; attempt <= MAX_HF_RETRIES; attempt++) {
        try {
          const { response, data } = await requestHuggingFace({
            apiKey: hfToken,
            model,
            messages,
            temperature,
            max_tokens
          });

          if (response.ok) {
            return res.status(200).json({
              ...data,
              _proxy: { provider: 'huggingface-inference-providers', model, fallbackUsed: model !== requestedModel }
            });
          }

          lastFailure = { provider: 'huggingface', status: response.status, error: providerError(data, response.status), model };

          // 402 = exhausted HF credits: don't waste time retrying.
          // 401/403/404/410 = permanent provider/model issue: move on.
          const transient = response.status === 429 || response.status >= 500;
          if (!transient || attempt === MAX_HF_RETRIES) break;
          await sleep(RETRY_DELAYS_MS[attempt] || 1800);
        } catch (err) {
          lastFailure = { provider: 'huggingface', status: 502, error: err?.message || 'Hugging Face request failed', model };
          break;
        }
      }
    }
  }

  // 2) Free-provider fallback: Groq. This is independent of HF credits.
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const { response, data } = await requestGroq({
        apiKey: groqKey,
        messages,
        temperature,
        max_tokens
      });

      if (response.ok) {
        return res.status(200).json({
          ...data,
          _proxy: { provider: 'groq', model: GROQ_MODEL, fallbackUsed: true }
        });
      }

      lastFailure = { provider: 'groq', status: response.status, error: providerError(data, response.status), model: GROQ_MODEL };
    } catch (err) {
      lastFailure = { provider: 'groq', status: 502, error: err?.message || 'Groq request failed', model: GROQ_MODEL };
    }
  } else {
    return res.status(503).json({
      error: 'Free fallback is not configured. Add GROQ_API_KEY in Vercel → Settings → Environment Variables, enable Production, then redeploy.',
      provider: lastFailure?.provider || 'none',
      previousError: lastFailure?.error || null,
      setup: 'GROQ_API_KEY'
    });
  }

  return res.status(lastFailure?.status || 502).json({
    error: lastFailure?.error || 'All configured AI providers failed.',
    provider: lastFailure?.provider,
    model: lastFailure?.model,
    fallbackAttempted: Boolean(groqKey),
    huggingFaceCreditsMayBeExhausted: lastFailure?.provider === 'huggingface' && lastFailure?.status === 402
  });
}
