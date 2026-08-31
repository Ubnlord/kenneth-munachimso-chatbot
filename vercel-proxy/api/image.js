// Vercel Serverless Function - Hugging Face Image Proxy
// Path: /api/image

import { InferenceClient } from '@huggingface/inference';

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
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Image prompt is required.' });

    const client = new InferenceClient(apiKey);
    const image = await client.textToImage({
      model: 'black-forest-labs/FLUX.1-schnell',
      inputs: prompt
    });

    const buffer = Buffer.from(await image.arrayBuffer());
    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

    return res.status(200).json({
      data: [{ url: dataUrl }]
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Hugging Face image generation error' });
  }
}
