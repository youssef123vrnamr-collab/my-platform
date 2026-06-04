/**
 * /api/imagine.js — Vercel Serverless Function
 * بيعمل redirect لـ Pollinations مباشرةً بدل proxy ثقيل
 * أسرع بكتير — بيخلص في أقل من ثانية
 */

export const config = {
  maxDuration: 10,
};

const MODELS = ["flux", "flux-realism", "turbo", "any-dark"];

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { prompt = "", seed, model } = req.query;

  if (!prompt.trim()) {
    return res.status(400).json({ error: "No prompt provided" });
  }

  const chosenModel =
    MODELS.includes(model) ? model : MODELS[Math.floor(Math.random() * MODELS.length)];
  const imgSeed = seed ? parseInt(seed) : Math.floor(Math.random() * 9999999);

  const polUrl =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.substring(0, 500))}` +
    `?width=512&height=512&nologo=true&enhance=true&model=${chosenModel}&seed=${imgSeed}`;

  // Redirect مباشر — الـ function بتخلص فوراً ومفيش timeout
  return res.redirect(302, polUrl);
}
