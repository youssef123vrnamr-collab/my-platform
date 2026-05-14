export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, name, expiration } = req.body;

    const IMGBB_KEY = process.env.IMGBB_API_KEY;
    if (!IMGBB_KEY) {
      return res.status(500).json({ error: 'IMGBB_API_KEY not configured' });
    }

    const params = new URLSearchParams();
    params.append('key', IMGBB_KEY);
    params.append('image', image);
    if (name) params.append('name', name);
    if (expiration) params.append('expiration', expiration);

    const imgbbResp = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const result = await imgbbResp.json();
    return res.status(imgbbResp.status).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
