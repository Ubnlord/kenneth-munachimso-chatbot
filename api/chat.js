// Vercel Serverless Function - Hugging Face Inference Providers Chat Proxy

const PRIMARY_MODEL = 'openai/gpt-oss-120b:fastest';
const FALLBACK_MODEL = 'Qwen/Qwen3-8B:fastest';
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [800, 1800];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeModel(model) {
  if (!model || typeof model !== 'string') return PRIMARY_MODEL;
  const trimmed = model.trim();
  if (trimmed === 'openai/gpt-oss-120b') return PRIMARY_MODEL;
  if (trimmed === 'Qwen/Qwen3-8B') return FALLBACK_MODEL;
  return trimmed;
}

async function requestModel({ apiKey, model, messages, temperature, max_tokens }) {
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens,
      stream: false
    })
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: raw || `Hugging Face returned HTTP ${response.status}` };
  }

  return { response, data };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.HF_TOKEN;
  if (!apiKey) {
    return res.status(500).json({
      error: 'HF_TOKEN is missing. Add it in Vercel → Settings → Environment Variables, enable it for Production, then redeploy.'
    });
  }

  const body = req.body || {};
  const requestedModel = normalizeModel(body.model);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const temperature = body.temperature ?? 0.8;
  const max_tokens = body.max_tokens ?? 1024;

  // Try the requested model first. For temporary 429/5xx provider overloads,
  // retry briefly and then automatically fall back to Qwen3-8B.
  const modelsToTry = [requestedModel];
  if (requestedModel !== FALLBACK_MODEL) modelsToTry.push(FALLBACK_MODEL);

  let lastFailure = null;

  try {
    for (const model of modelsToTry) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const { response, data } = await requestModel({
          apiKey,
          model,
          messages,
          temperature,
          max_tokens
        });

        if (response.ok) {
          return res.status(200).json({
            ...data,
            _proxy: {
              provider: 'huggingface-inference-providers',
              model,
              fallbackUsed: model !== requestedModel
            }
          });
        }

        const providerMessage = data?.error?.message || data?.error || data?.message || `Hugging Face returned HTTP ${response.status}`;
        lastFailure = {
          error: String(providerMessage),
          model,
          provider: 'huggingface-inference-providers',
          status: response.status
        };

        // Retry only transient overload/server failures. Auth, bad-request,
        // missing-model and other permanent errors go straight to the fallback.
        const transient = response.status === 429 || response.status >= 500;
        if (!transient || attempt === MAX_RETRIES) break;

        await sleep(RETRY_DELAYS_MS[attempt] || 1800);
      }
    }

    return res.status(lastFailure?.status || 502).json({
      error: lastFailure?.error || 'All Hugging Face models/providers failed.',
      model: lastFailure?.model,
      provider: 'huggingface-inference-providers',
      status: lastFailure?.status,
      fallbackAttempted: modelsToTry.length > 1
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Hugging Face proxy error',
      provider: 'huggingface-inference-providers'
    });
  }
}
