// Vercel Serverless Function - Hugging Face Chat Proxy
// Path: /api/chat

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.HF_TOKEN;
  if (!apiKey) {
    return res.status(500).json({
      error: 'HF_TOKEN is missing. Add a Hugging Face token with Inference Providers permission in Vercel Environment Variables.'
    });
  }

  try {
    const body = req.body || {};
    const model = body.model || 'openai/gpt-oss-120b:fastest';

    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: body.messages || [],
        temperature: body.temperature ?? 0.8,
        max_tokens: body.max_tokens ?? 1024,
        stream: false
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Hugging Face proxy error' });
  }
}
