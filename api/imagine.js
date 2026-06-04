/**
 * /api/imagine.js — Vercel Serverless Function
 * بيستخدم Hugging Face - fast models
 */

export const config = {
  maxDuration: 60,
};

// موديلات مرتبة من الأسرع للأبطأ
const HF_MODELS = [
  "black-forest-labs/FLUX.1-schnell",     // الأسرع - 4 steps بس
  "stabilityai/sdxl-turbo",               // سريع جداً
  "runwayml/stable-diffusion-v1-5",       // backup
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let prompt = "", hfToken = "", modelIndex = 0;
  if (req.method === "POST") {
    const body = req.body || {};
    prompt     = body.prompt    || "";
    hfToken    = body.hf_token  || "";
    modelIndex = parseInt(body.model) || 0;
  } else {
    prompt     = req.query.prompt   || "";
    hfToken    = req.query.hf_token || "";
    modelIndex = parseInt(req.query.model) || 0;
  }

  if (!prompt.trim())  return res.status(400).json({ error: "No prompt" });
  if (!hfToken.trim()) return res.status(400).json({ error: "No hf_token" });

  const chosenModel = HF_MODELS[modelIndex] || HF_MODELS[0];
  const hfUrl = `https://api-inference.huggingface.co/models/${chosenModel}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  // parameters حسب الموديل
  const parameters = modelIndex === 0
    ? { num_inference_steps: 4,  guidance_scale: 0,   width: 512, height: 512 }  // FLUX schnell
    : modelIndex === 1
    ? { num_inference_steps: 1,  guidance_scale: 0,   width: 512, height: 512 }  // SDXL turbo
    : { num_inference_steps: 20, guidance_scale: 7.5, width: 512, height: 512 }; // SD v1.5

  try {
    const response = await fetch(hfUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${hfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt.substring(0, 500),
        parameters,
        options: { wait_for_model: true },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`HF error ${response.status}:`, errText.substring(0, 200));
      return res.status(502).json({
        error: `HF ${response.status}`,
        detail: errText.substring(0, 200),
        tryNext: modelIndex < HF_MODELS.length - 1,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      const body = await response.text();
      console.error("Not image:", contentType, body.substring(0, 200));
      return res.status(502).json({
        error: "Not an image",
        ct: contentType,
        tryNext: modelIndex < HF_MODELS.length - 1,
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Model-Used", chosenModel);
    return res.status(200).send(buffer);

  } catch (e) {
    clearTimeout(timeout);
    console.error("imagine error:", e.message);
    return res.status(504).json({
      error: e.name === "AbortError" ? "Timeout" : (e.message || "Unknown"),
      tryNext: modelIndex < HF_MODELS.length - 1,
    });
  }
}
