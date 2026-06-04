/**
 * /api/imagine.js — Vercel Serverless Function
 * بيستخدم Hugging Face لتوليد صور حقيقية بالـ AI
 * بيجيب الـ hf_token من Firestore
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const config = {
  maxDuration: 60,
};

// Initialize Firebase Admin
function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

// Hugging Face models — مرتبة من الأحسن للأبسط
const HF_MODELS = [
  "stabilityai/stable-diffusion-xl-base-1.0",
  "runwayml/stable-diffusion-v1-5",
  "CompVis/stable-diffusion-v1-4",
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { prompt = "", model } = req.query;
  if (!prompt.trim()) {
    return res.status(400).json({ error: "No prompt provided" });
  }

  // جيب الـ hf_token من Firestore
  let hfToken = "";
  try {
    const db = getDb();
    const doc = await db.collection("api_keys").doc("keys").get();
    if (doc.exists) {
      hfToken = doc.data()?.hf_token || "";
    }
    // لو مش لاقيه في keys، جرب أول document في الـ collection
    if (!hfToken) {
      const snap = await db.collection("api_keys").limit(1).get();
      if (!snap.empty) {
        hfToken = snap.docs[0].data()?.hf_token || "";
      }
    }
  } catch (e) {
    console.error("Firestore error:", e);
  }

  if (!hfToken) {
    return res.status(500).json({ error: "HF token not found in Firestore" });
  }

  // اختار الموديل
  const modelIndex = parseInt(model) || 0;
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
        options: {
          wait_for_model: true,
        },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      // لو الموديل محتاج وقت (503)، جرب الموديل التاني
      if (response.status === 503 && modelIndex < HF_MODELS.length - 1) {
        return res.redirect(302, `/api/imagine?prompt=${encodeURIComponent(prompt)}&model=${modelIndex + 1}`);
      }
      return res.status(502).json({ error: `HF error ${response.status}`, detail: errText.substring(0, 200) });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return res.status(502).json({ error: "HF did not return an image", ct: contentType });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Model-Used", chosenModel);
    return res.status(200).send(buffer);

  } catch (e) {
    clearTimeout(timeout);
    return res.status(504).json({
      error: e.name === "AbortError" ? "Timeout >55s" : e.message || "Unknown error",
    });
  }
}
