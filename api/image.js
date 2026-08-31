// Vercel Serverless Function - Hugging Face Image Proxy

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.HF_TOKEN;
  if (!apiKey) return res.status(500).json({ error: 'HF_TOKEN is missing. Add it in Vercel → Settings → Environment Variables.' });

  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Image prompt is required.' });

    const response = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ inputs: prompt })
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: text || 'Hugging Face image generation failed.' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return res.status(200).json({ data: [{ url: `data:image/png;base64,${buffer.toString('base64')}` }] });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Hugging Face image generation error' });
  }
}
