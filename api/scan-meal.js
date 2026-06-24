// FLINT — proxy d'analyse de repas par photo (Gemini Flash, vision).
// Déployé sur Vercel. La clé API vit UNIQUEMENT ici (variable d'env GEMINI_API_KEY),
// jamais dans le front public.
//
// Front : POST { image: "<dataURL ou base64>", mime?: "image/jpeg" }
// Retour: { mealName, items:[{name,grams,kcal,prot,carb,fat,confidence}], total:{kcal,prot,carb,fat} }

const MODEL = 'gemini-2.5-flash';

const SCHEMA = {
  type: 'object',
  properties: {
    mealName: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
          prot: { type: 'number' },
          carb: { type: 'number' },
          fat: { type: 'number' },
          confidence: { type: 'number' }
        },
        required: ['name', 'grams', 'kcal', 'prot', 'carb', 'fat', 'confidence']
      }
    }
  },
  required: ['mealName', 'items']
};

const PROMPT = `Tu es un expert en nutrition. Analyse la photo de ce repas.
Identifie CHAQUE aliment visible séparément (ne regroupe pas tout en un seul item).
Pour chaque aliment, estime de façon réaliste :
- name : nom court en français
- grams : portion en grammes
- kcal, prot (protéines g), carb (glucides g), fat (lipides g)
- confidence : 0 à 1 (ta certitude)
Tiens compte des matières grasses de cuisson et sauces PROBABLES même si peu visibles (huile, beurre, vinaigrette) — ajoute-les comme items distincts si pertinent.
Donne un mealName court résumant le plat. Réponds UNIQUEMENT en JSON conforme au schéma.`;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function round(n) { return Math.max(0, Math.round(Number(n) || 0)); }

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY manquante (variable d\'env Vercel)' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    let image = body && body.image;
    if (!image) return res.status(400).json({ error: 'champ "image" manquant' });

    // accepte une data URL (data:image/jpeg;base64,xxxx) ou du base64 brut
    let mime = (body && body.mime) || 'image/jpeg';
    const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
    if (m) { mime = m[1]; image = m[2]; }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
    const gReq = {
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: image } }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 }
    };

    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq) });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: 'Gemini ' + r.status, detail: t.slice(0, 400) });
    }
    const j = await r.json();
    const txt = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
    if (!txt) return res.status(502).json({ error: 'réponse Gemini vide' });

    let data;
    try { data = JSON.parse(txt); } catch (e) { return res.status(502).json({ error: 'JSON Gemini invalide' }); }

    const items = (data.items || []).map(it => ({
      name: String(it.name || 'Aliment'),
      grams: round(it.grams),
      kcal: round(it.kcal),
      prot: round(it.prot),
      carb: round(it.carb),
      fat: round(it.fat),
      confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0.5))
    }));
    const total = items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, prot: a.prot + it.prot, carb: a.carb + it.carb, fat: a.fat + it.fat }), { kcal: 0, prot: 0, carb: 0, fat: 0 });

    return res.status(200).json({ mealName: String(data.mealName || 'Mon repas'), items, total });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
