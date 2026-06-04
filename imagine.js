/**
 * /api/imagine.js — Vercel Serverless Function
 * بيستقبل hf_token من الـ frontend ويولد صورة بـ Hugging Face
 */

export const config = {
  maxDuration: 60,
};

const HF_MODELS = [
  "stabilityai/stable-diffusion-xl-base-1.0",
  "runwayml/stable-diffusion-v1-5",
  "CompVis/stable-diffusion-v1-4",
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // اقبل البيانات من POST body أو GET query
  let prompt = "", hfToken = "", modelIndex = 0;
  if (req.method === "POST") {
    const body = req.body || {};
    prompt     = body.prompt     || "";
    hfToken    = body.hf_token   || "";
    modelIndex = parseInt(body.model) || 0;
  } else {
    prompt     = req.query.prompt    || "";
    hfToken    = req.query.hf_token  || "";
    modelIndex = parseInt(req.query.model) || 0;
  }

  if (!prompt.trim())   return res.status(400).json({ error: "No prompt" });
  if (!hfToken.trim())  return res.status(400).json({ error: "No hf_token" });

  const chosenModel = HF_MODELS[modelIndex] || HF_MODELS[0];
  const hfUrl = `https://api-inference.huggingface.co/models/${chosenModel}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

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
        parameters: {
          num_inference_steps: 25,
          guidance_scale: 7.5,
          width: 512,
          height: 512,
        },
        options: { wait_for_model: true },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({
        error: `HF error ${response.status}`,
        detail: errText.substring(0, 300),
        tryNext: modelIndex < HF_MODELS.length - 1,
      });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return res.status(502).json({ error: "Not an image", ct: contentType });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Model-Used", chosenModel);
    return res.status(200).send(buffer);

  } catch (e) {
    clearTimeout(timeout);
    return res.status(504).json({
      error: e.name === "AbortError" ? "Timeout >55s" : (e.message || "Unknown error"),
      tryNext: modelIndex < HF_MODELS.length - 1,
    });
  }
}
