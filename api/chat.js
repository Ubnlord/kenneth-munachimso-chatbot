// Vercel Serverless Function - Hugging Face Inference Providers Chat Proxy

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

  try {
    const body = req.body || {};
    let model = typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : 'openai/gpt-oss-120b:fastest';

    // Hugging Face supports automatic provider selection with :fastest.
    // If the UI supplies the bare model ID, normalize it to the documented policy.
    if (model === 'openai/gpt-oss-120b') model = 'openai/gpt-oss-120b:fastest';

    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: Array.isArray(body.messages) ? body.messages : [],
        temperature: body.temperature ?? 0.8,
        max_tokens: body.max_tokens ?? 1024,
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

    if (!response.ok) {
      const providerMessage = data?.error?.message || data?.error || data?.message || `Hugging Face returned HTTP ${response.status}`;
      return res.status(response.status).json({
        error: String(providerMessage),
        model,
        provider: 'huggingface-inference-providers',
        status: response.status
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Hugging Face proxy error',
      provider: 'huggingface-inference-providers'
    });
  }
}
