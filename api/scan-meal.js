// FLINT — proxy d'analyse de repas. La clé API vit UNIQUEMENT ici (env GEMINI_API_KEY).
// 3 modes :
//   { image: "<dataURL|base64>", mime? }  -> Gemini Vision (+ bounding box par aliment)
//   { text: "2 œufs, pain, avocat" }      -> Gemini texte (estimation depuis une description)
//   { barcode: "3017620422003" }          -> OpenFoodFacts (lookup produit, sans clé)
// Retour: { mealName, items:[{name,grams,kcal,prot,carb,fat,confidence,box}], total:{kcal,prot,carb,fat} }

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
          confidence: { type: 'number' },
          box: { type: 'array', items: { type: 'number' } }
        },
        required: ['name', 'grams', 'kcal', 'prot', 'carb', 'fat', 'confidence']
      }
    }
  },
  required: ['mealName', 'items']
};

const PROMPT_IMG = `Tu es un expert en nutrition. Analyse la photo de ce repas.
Identifie CHAQUE aliment visible séparément (ne regroupe pas tout en un seul item).
Pour chaque aliment, estime de façon réaliste :
- name : nom court en français
- grams : portion en grammes
- kcal, prot (protéines g), carb (glucides g), fat (lipides g)
- confidence : 0 à 1 (ta certitude)
- box : boîte englobante [ymin, xmin, ymax, xmax] en entiers normalisés 0-1000 (où se trouve l'aliment dans l'image)
Tiens compte des matières grasses de cuisson et sauces PROBABLES même si peu visibles (huile, beurre, vinaigrette) — ajoute-les comme items distincts si pertinent.
Donne un mealName court résumant le plat. Réponds UNIQUEMENT en JSON conforme au schéma.`;

function promptText(t) {
  return `Tu es un expert en nutrition. L'utilisateur décrit son repas en français : "${String(t).slice(0, 400)}".
Identifie CHAQUE aliment mentionné séparément. Pour chaque aliment, estime de façon réaliste :
- name : nom court en français
- grams : portion en grammes (déduis des quantités mentionnées, ex "2 œufs" ≈ 100g ; sinon portion standard réaliste)
- kcal, prot (protéines g), carb (glucides g), fat (lipides g)
- confidence : 0 à 1
N'invente AUCUN aliment non mentionné. Ne renvoie PAS de box. Donne un mealName court résumant le repas. Réponds UNIQUEMENT en JSON conforme au schéma.`;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-flint-key');
}

// Rate-limit best-effort en mémoire (par IP). Pour du costaud : Vercel KV / Upstash.
const RL = new Map();
const RL_WINDOW = 60000, RL_MAX = 20;
function rateLimited(ip) {
  const now = Date.now();
  const arr = (RL.get(ip) || []).filter(t => now - t < RL_WINDOW);
  arr.push(now);
  RL.set(ip, arr);
  if (RL.size > 5000) { for (const k of RL.keys()) { if (!(RL.get(k) || []).some(t => now - t < RL_WINDOW)) RL.delete(k); } }
  return arr.length > RL_MAX;
}

function round(n) { return Math.max(0, Math.round(Number(n) || 0)); }

function mapItems(data) {
  const items = (data.items || []).map(it => ({
    name: String(it.name || 'Aliment'),
    grams: round(it.grams),
    kcal: round(it.kcal),
    prot: round(it.prot),
    carb: round(it.carb),
    fat: round(it.fat),
    confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0.5)),
    box: (Array.isArray(it.box) && it.box.length === 4) ? it.box.map(Number) : null
  }));
  const total = items.reduce((a, it) => ({ kcal: a.kcal + it.kcal, prot: a.prot + it.prot, carb: a.carb + it.carb, fat: a.fat + it.fat }), { kcal: 0, prot: 0, carb: 0, fat: 0 });
  return { mealName: String(data.mealName || 'Mon repas'), items, total };
}

async function callGemini(key, parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const gReq = { contents: [{ parts: parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 } };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gReq) });
  if (!r.ok) { const t = await r.text(); throw new Error('Gemini ' + r.status + ' ' + t.slice(0, 200)); }
  const j = await r.json();
  const txt = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
  if (!txt) throw new Error('réponse Gemini vide');
  return JSON.parse(txt);
}

function parseGrams(s) {
  if (!s) return 0;
  const m = /([\d.,]+)\s*(g|ml)\b/i.exec(String(s));
  return m ? Math.round(parseFloat(m[1].replace(',', '.'))) : 0;
}

async function offLookup(code) {
  const c = String(code).replace(/\D/g, '');
  if (c.length < 6) return { error: 'Code-barres invalide' };
  const u = `https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=product_name,product_name_fr,brands,nutriments,serving_size,quantity`;
  const r = await fetch(u, { headers: { 'User-Agent': 'FLINT/1.0 (nutrition app)' } });
  if (!r.ok) return { error: 'OpenFoodFacts ' + r.status };
  const j = await r.json();
  if (j.status !== 1 || !j.product) return { error: 'Produit introuvable' };
  const p = j.product, n = p.nutriments || {};
  let kcal100 = n['energy-kcal_100g'];
  if (kcal100 == null && n['energy_100g'] != null) kcal100 = Number(n['energy_100g']) / 4.184; // kJ -> kcal
  const per = { kcal: Number(kcal100) || 0, prot: Number(n.proteins_100g) || 0, carb: Number(n.carbohydrates_100g) || 0, fat: Number(n.fat_100g) || 0 };
  const grams = parseGrams(p.serving_size) || 100;
  const f = grams / 100;
  let name = p.product_name_fr || p.product_name || p.brands || 'Produit';
  const item = { name: String(name).slice(0, 60), grams: round(grams), kcal: round(per.kcal * f), prot: round(per.prot * f), carb: round(per.carb * f), fat: round(per.fat * f), confidence: 0.92, box: null };
  if (!item.kcal && !item.prot && !item.carb && !item.fat) return { error: 'Pas d\'infos nutritionnelles pour ce produit' };
  return { mealName: item.name, items: [item], total: { kcal: item.kcal, prot: item.prot, carb: item.carb, fat: item.fat } };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Trop de requêtes, réessaie dans une minute.' });

  const secret = process.env.FLINT_APP_SECRET;
  if (secret && req.headers['x-flint-key'] !== secret) return res.status(401).json({ error: 'unauthorized' });

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const mode = body.barcode ? 'barcode' : (body.text ? 'text' : (body.image ? 'image' : null));
    if (!mode) return res.status(400).json({ error: 'Fournis "image", "text" ou "barcode".' });

    // --- Mode code-barres : OpenFoodFacts (pas besoin de Gemini) ---
    if (mode === 'barcode') {
      const out = await offLookup(body.barcode);
      if (out.error) return res.status(404).json(out);
      return res.status(200).json(out);
    }

    // --- Modes IA (photo / texte) : nécessitent la clé Gemini ---
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY manquante (variable d\'env Vercel)' });

    let parts;
    if (mode === 'image') {
      let image = body.image;
      let mime = body.mime || 'image/jpeg';
      const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
      if (m) { mime = m[1]; image = m[2]; }
      parts = [{ text: PROMPT_IMG }, { inline_data: { mime_type: mime, data: image } }];
    } else {
      parts = [{ text: promptText(body.text) }];
    }

    let data;
    try { data = await callGemini(key, parts); }
    catch (e) { return res.status(502).json({ error: String((e && e.message) || e).slice(0, 220) }); }

    return res.status(200).json(mapItems(data));
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
