// Vercel Serverless Function - Hugging Face Inference Providers Image Proxy
// Uses explicit provider routes instead of the deprecated hf-inference route.

const PRIMARY = {
  name: 'fal-ai/FLUX.1-schnell',
  endpoint: 'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell'
};

const FALLBACK = {
  name: 'fal-ai/FLUX.1-dev',
  endpoint: 'https://router.huggingface.co/fal-ai/fal-ai/flux/dev'
};

const RETRY_DELAYS_MS = [900, 1800];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateImage({ apiKey, provider, prompt }) {
  return fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      prompt,
      image_size: 'square_hd',
      num_inference_steps: provider === PRIMARY ? 4 : 28,
      output_format: 'png'
    })
  });
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

async function responseToImage(response) {
  const contentType = response.headers.get('content-type') || '';

  // Some providers return the image bytes directly.
  if (contentType.startsWith('image/')) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  // Other providers return JSON containing an image URL.
  const data = await response.json();
  const url = data?.images?.[0]?.url || data?.image?.url || data?.url || data?.data?.[0]?.url;
  if (url) return url;

  // Also support a base64 image returned by a provider.
  const b64 = data?.images?.[0]?.b64_json || data?.b64_json || data?.data?.[0]?.b64_json;
  if (b64) return `data:image/png;base64,${b64}`;

  throw new Error('Image provider returned a successful response without an image.');
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

  const providers = [PRIMARY, FALLBACK];
  let lastError = null;

  try {
    for (const provider of providers) {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        const response = await generateImage({ apiKey, provider, prompt });

        if (response.ok) {
          const imageUrl = await responseToImage(response);
          return res.status(200).json({
            data: [{ url: imageUrl }],
            _proxy: {
              provider: provider.name,
              fallbackUsed: provider !== PRIMARY
            }
          });
        }

        lastError = {
          error: String(await parseError(response)),
          provider: provider.name,
          status: response.status
        };

        const transient = response.status === 429 || response.status >= 500;
        if (!transient || attempt === RETRY_DELAYS_MS.length) break;
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }

    return res.status(lastError?.status || 502).json({
      error: lastError?.error || 'All Hugging Face image providers failed.',
      provider: lastError?.provider,
      status: lastError?.status,
      fallbackAttempted: true
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Hugging Face image generation error',
      provider: 'huggingface-inference-providers'
    });
  }
}
