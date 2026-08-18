// Cloudflare Worker – Kenneth Munachimso AI Proxy
// 
// SETUP:
// 1. Create a new Worker on dash.cloudflare.com
// 2. Paste this entire file
// 3. Go to Settings → Variables → Add Secret
//    Name:  XAI_API_KEY
//    Value: your xAI API key (starts with xai-...)
// 4. Deploy
// 5. Copy the Worker URL and paste it into the chatbot Settings

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    const url = new URL(request.url);
    let targetUrl = null;

    if (url.pathname === '/chat') {
      targetUrl = 'https://api.x.ai/v1/chat/completions';
    } else if (url.pathname === '/image') {
      targetUrl = 'https://api.x.ai/v1/images/generations';
    } else {
      return new Response(JSON.stringify({ error: 'Unknown endpoint. Use /chat or /image' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Make sure the secret exists
    if (!env.XAI_API_KEY) {
      return new Response(JSON.stringify({ 
        error: 'XAI_API_KEY secret is missing. Add it in Worker Settings → Variables.' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    try {
      const body = await request.text();

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.XAI_API_KEY}`
        },
        body
      });

      const data = await response.text();

      return new Response(data, {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Proxy error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
