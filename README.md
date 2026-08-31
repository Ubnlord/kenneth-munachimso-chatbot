# Kenneth Munachimso Chatbot

A lightweight personal AI chatbot using open-source models through Hugging Face Inference Providers.

## AI backend

- Chat: `openai/gpt-oss-120b:fastest`
- Images: `black-forest-labs/FLUX.1-schnell`
- Provider: Hugging Face Inference Providers
- Secret: `HF_TOKEN` (keep this server-side; never put it in `index.html`)

## Vercel setup

1. Open the `vercel-proxy` folder as the Vercel project/root directory.
2. In Vercel Project Settings → Environment Variables, add `HF_TOKEN`.
3. Use a Hugging Face token with **Make calls to Inference Providers** permission.
4. Redeploy the project.
5. In the chatbot Settings, keep using the deployed proxy URL.

The frontend can continue sending its existing OpenAI-compatible request format; the server proxy now routes chat and image requests through Hugging Face instead of xAI.

Hugging Face provides a free tier for Inference Providers, subject to the account's available credits and provider/model availability.
