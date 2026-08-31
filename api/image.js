// Vercel Serverless Function - Hugging Face Image Proxy

const DEFAULT_MODEL = 'black-forest-labs/FLUX.1-dev';
const FALLBACK_MODEL = 'Qwen/Qwen-Image';
const RETRY_DELAYS_MS = [900, 1800];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeModel(model) {
  if (!model || typeof model !== 'string') return DEFAULT_MODEL;
  const value = model.trim();
  if (value === 'black-forest-labs/FLUX.1-schnell') return DEFAULT_MODEL;
  return value;
}

async function generateImage({ apiKey, model, prompt }) {
  // Use the Hugging Face Inference Providers text-to-image endpoint.
  // :fastest lets the router select an available provider instead of
  // forcing the deprecated hf-inference serverless route.
  const endpoint = `https://router.huggingface.co/hf-inference/models/${encodeURIComponent(model)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ inputs: prompt })
  });

  return response;
}

async function parseError(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || parsed?.error || parsed?.message || text;
  } catch {
    return text || `Hugging Face returned HTTP ${response.status}`;
  }
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
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return res.status(400).json({ error: 'Image prompt is required.' });

  const requestedModel = normalizeModel(body.model);
  const modelsToTry = [requestedModel];
  if (requestedModel !== FALLBACK_MODEL) modelsToTry.push(FALLBACK_MODEL);

  let lastError = null;

  try {
    for (const model of modelsToTry) {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        const response = await generateImage({ apiKey, model, prompt });

        if (response.ok) {
          const contentType = response.headers.get('content-type') || 'image/png';
          const buffer = Buffer.from(await response.arrayBuffer());
          return res.status(200).json({
            data: [{ url: `data:${contentType};base64,${buffer.toString('base64')}` }],
            _proxy: {
              provider: 'huggingface-inference-providers',
              model,
              fallbackUsed: model !== requestedModel
            }
          });
        }

        lastError = {
          error: String(await parseError(response)),
          model,
          status: response.status
        };

        // Retry temporary provider overloads. A deprecated/unsupported model
        // (410), auth error (401/403), or bad request moves directly to fallback.
        const transient = response.status === 429 || response.status >= 500;
        if (!transient || attempt === RETRY_DELAYS_MS.length) break;
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }

    return res.status(lastError?.status || 502).json({
      error: lastError?.error || 'All Hugging Face image models/providers failed.',
      model: lastError?.model,
      provider: 'huggingface-inference-providers',
      status: lastError?.status,
      fallbackAttempted: modelsToTry.length > 1
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Hugging Face image generation error',
      provider: 'huggingface-inference-providers'
    });
  }
}
