/**
 * /api/imagine.js — Vercel Serverless Function
 * بيستقبل prompt ويجيب صورة من Pollinations من السيرفر
 * بدل ما المتصفح يطلب مباشرة (بيتجنب CORS ومشاكل الشبكة)
 */

export const config = {
  maxDuration: 60, // 60 ثانية — أقصى مسموح على Hobby plan
};

const MODELS = ["flux", "flux-realism", "turbo", "any-dark"];

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { prompt = "", seed, model } = req.query;

  if (!prompt.trim()) {
    return res.status(400).json({ error: "No prompt provided" });
  }

  // اختار موديل عشوائي أو اللي بعته المتصفح
  const chosenModel =
    MODELS.includes(model) ? model : MODELS[Math.floor(Math.random() * MODELS.length)];
  const imgSeed = seed ? parseInt(seed) : Math.floor(Math.random() * 9999999);

  const polUrl =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.substring(0, 500))}` +
    `?width=512&height=512&nologo=true&enhance=true&model=${chosenModel}&seed=${imgSeed}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000); // 55s safety margin

  try {
    const upstream = await fetch(polUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SpaceApp/1.0)",
        Accept: "image/*,*/*",
      },
    });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(502).json({
        error: `Pollinations returned ${upstream.status}`,
        model: chosenModel,
      });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return res.status(502).json({ error: "Upstream did not return an image" });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store, no-cache");
    res.setHeader("X-Model-Used", chosenModel);
    res.setHeader("X-Seed-Used", String(imgSeed));

    return res.status(200).send(buffer);

  } catch (e) {
    clearTimeout(timeout);
    const isTimeout = e.name === "AbortError";
    return res.status(504).json({
      error: isTimeout ? "Generation timed out (>55s)" : e.message || "Unknown error",
      model: chosenModel,
    });
  }
}
