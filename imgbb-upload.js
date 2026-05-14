export const config = { runtime: 'edge' };

export default async function handler(req) {
  // السماح بـ CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { image, name, expiration } = body;

    // المفتاح محفوظ في Vercel Environment Variables
    const IMGBB_KEY = process.env.IMGBB_API_KEY;
    if (!IMGBB_KEY) {
      return new Response(JSON.stringify({ error: 'IMGBB_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // إرسال لـ imgbb
    const formData = new FormData();
    formData.append('key', IMGBB_KEY);
    formData.append('image', image);
    if (name) formData.append('name', name);
    if (expiration) formData.append('expiration', expiration);

    const imgbbResp = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData,
    });

    const result = await imgbbResp.json();

    return new Response(JSON.stringify(result), {
      status: imgbbResp.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
