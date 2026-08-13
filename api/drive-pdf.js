// api/drive-pdf.js
// Proxy لجلب ملف PDF من Google Drive من السيرفر (يتجاوز مشكلة CORS)
// استخدام: /api/drive-pdf?id=FILE_ID

export default async function handler(req, res) {
  const id = req.query.id;
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).json({ error: 'missing or invalid id' });
    return;
  }

  try {
    const base = `https://drive.google.com/uc?export=download&id=${id}`;
    let response = await fetch(base, { redirect: 'follow' });

    // لو الملف كبير، درايف بيرجّع صفحة تأكيد HTML فيها confirm token
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const tokenMatch = html.match(/confirm=([0-9A-Za-z_-]+)/) || html.match(/name="confirm"\s+value="([0-9A-Za-z_-]+)"/);
      const uuidMatch = html.match(/uuid=([0-9a-zA-Z_-]+)/);
      if (tokenMatch) {
        let confirmUrl = `https://drive.google.com/uc?export=download&confirm=${tokenMatch[1]}&id=${id}`;
        if (uuidMatch) confirmUrl += `&uuid=${uuidMatch[1]}`;
        response = await fetch(confirmUrl, { redirect: 'follow' });
      } else {
        res.status(502).json({ error: 'drive returned an unexpected page, check the file is shared as "Anyone with the link"' });
        return;
      }
    }

    if (!response.ok) {
      res.status(response.status).json({ error: 'failed to fetch file from drive' });
      return;
    }

    const buf = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message || 'proxy error' });
  }
}
