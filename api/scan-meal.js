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

// --- Cache produit OPTIONNEL (Upstash Redis / Vercel KV via REST). No-op si non configuré -> comportement identique. ---
async function kvCmd(cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return null;
  try {
    const r = await fetch(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.result;
  } catch (e) { return null; }
}
async function cacheGet(bc) {
  const v = await kvCmd(['GET', 'flint:prod:v2:' + bc]);
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}
async function cacheSet(bc, obj) {
  try { await kvCmd(['SET', 'flint:prod:v2:' + bc, JSON.stringify(obj), 'EX', 2592000]); } catch (e) {}
}
async function photoGet(bc) {
  const v = await kvCmd(['GET', 'flint:img:v1:' + bc]);
  return (typeof v === 'string' && v.indexOf('data:image') === 0) ? v : null;
}
async function photoSet(bc, durl) {
  try { await kvCmd(['SET', 'flint:img:v1:' + bc, durl]); await kvCmd(['DEL', 'flint:prod:v2:' + bc]); } catch (e) {}
}

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

// nom de l'unité d'une portion (ex: "1 biscuit (12.5 g)" -> "biscuit", "15 g" -> "portion")
function servingLabel(s) {
  if (!s) return 'portion';
  const stop = { g: 1, ml: 1, gr: 1, kg: 1, cl: 1, l: 1, kj: 1, kcal: 1, cal: 1 };
  const m = /[0-9.,]+\s*([a-zàâäçéèêëîïôöûùü]{2,})/i.exec(String(s));
  if (m && !stop[m[1].toLowerCase()]) return m[1].toLowerCase().replace(/s$/, '');
  const cleaned = String(s).replace(/[0-9.,]+\s*(g|ml|gr|kg|cl|l|kj|kcal|cal)\b/gi, ' ').replace(/[()]/g, ' ');
  const m2 = /([a-zàâäçéèêëîïôöûùü]{3,})/i.exec(cleaned);
  if (m2 && !stop[m2[1].toLowerCase()]) return m2[1].toLowerCase().replace(/s$/, '');
  return 'portion';
}

function num(x) { const v = Number(x); return isFinite(v) ? v : 0; }

function buildAnalysis(p, n, per100) {
  const nl = p.nutrient_levels || {};
  const sent = l => l === 'low' ? 'good' : (l === 'high' ? 'bad' : (l === 'moderate' ? 'warn' : 'neutral'));
  const QQ = { good: 'Faible quantité', warn: 'Quantité modérée', bad: 'Quantité élevée' };
  const rows = [];
  const kcal = per100.kcal;
  const es = kcal <= 150 ? 'good' : (kcal <= 350 ? 'warn' : 'bad');
  rows.push({ k: 'Calories', v: round(kcal) + ' kcal', s: es, q: es === 'good' ? 'Peu calorique' : (es === 'warn' ? 'Modérément calorique' : 'Calorique') });
  const sug = num(n.sugars_100g), ss = nl.sugars ? sent(nl.sugars) : (sug <= 5 ? 'good' : (sug <= 15 ? 'warn' : 'bad'));
  rows.push({ k: 'Sucres', v: round(sug) + ' g', s: ss, q: QQ[ss] });
  const sat = num(n['saturated-fat_100g']), fs = nl['saturated-fat'] ? sent(nl['saturated-fat']) : (sat <= 1.5 ? 'good' : (sat <= 5 ? 'warn' : 'bad'));
  rows.push({ k: 'Graisses saturées', v: round(sat) + ' g', s: fs, q: QQ[fs] });
  const salt = num(n.salt_100g), ls = nl.salt ? sent(nl.salt) : (salt <= 0.3 ? 'good' : (salt <= 1.5 ? 'warn' : 'bad'));
  rows.push({ k: 'Sel', v: (Math.round(salt * 10) / 10) + ' g', s: ls, q: QQ[ls] });
  const prot = num(n.proteins_100g);
  if (prot >= 8) rows.push({ k: 'Protéines', v: round(prot) + ' g', s: 'good', q: 'Bonne source' });
  const fib = num(n.fiber_100g);
  if (fib >= 3) rows.push({ k: 'Fibres', v: round(fib) + ' g', s: 'good', q: 'Source de fibres' });
  const add = p.additives_n != null ? num(p.additives_n) : ((p.additives_tags || []).length);
  rows.push({ k: 'Additifs', v: add === 0 ? '0' : String(add), s: add === 0 ? 'good' : (add <= 3 ? 'warn' : 'bad'), q: add === 0 ? 'Aucun additif' : (add <= 3 ? 'Quelques additifs' : 'Beaucoup d\'additifs') });
  const nova = num(p.nova_group);
  if (nova) rows.push({ k: 'Transformation', v: '', s: nova >= 4 ? 'bad' : (nova === 3 ? 'warn' : 'good'), q: nova >= 4 ? 'Ultra-transformé' : (nova === 3 ? 'Transformé' : 'Peu transformé') });
  return rows;
}

function healthScore(p, n, per100) {
  const gradeMap = { a: 90, b: 72, c: 52, d: 32, e: 14 };
  const grade = (p.nutriscore_grade || '').toLowerCase();
  let base;
  if (gradeMap[grade] != null) base = gradeMap[grade];
  else {
    const kcal = per100.kcal, sug = num(n.sugars_100g), sat = num(n['saturated-fat_100g']), salt = num(n.salt_100g), prot = num(n.proteins_100g), fib = num(n.fiber_100g);
    base = 72;
    base -= Math.min(28, sug * 0.7); base -= Math.min(22, sat * 1.6); base -= Math.min(16, salt * 9);
    base -= Math.min(14, Math.max(0, kcal - 200) * 0.03); base += Math.min(12, prot * 0.5); base += Math.min(10, fib * 1.5);
  }
  const nova = num(p.nova_group); if (nova === 4) base -= 12; else if (nova === 3) base -= 5;
  const add = p.additives_n != null ? num(p.additives_n) : ((p.additives_tags || []).length); base -= Math.min(25, add * 3);
  if (/organic/.test((p.labels_tags || []).join(','))) base += 5;
  return Math.max(0, Math.min(100, Math.round(base)));
}

function offBarcodePath(code) {
  var c = String(code).replace(/\D/g, '');
  if (c.length < 9) return c;
  return c.slice(0, 3) + '/' + c.slice(3, 6) + '/' + c.slice(6, 9) + '/' + c.slice(9);
}

// ProductImageResolver : meilleure image OpenFoodFacts (jamais d'IA). FR -> EN -> autre langue -> image_front_url -> image brute -> placeholder.
function resolveProductImage(p, code) {
  var out = { imageUrl: null, imageUrls: { thumb: null, medium: null, full: null }, imageSource: 'none', confidenceScore: 0, matchType: 'barcode-exact', status: 'placeholder', fallbackUsed: true };
  var sel = p.selected_images && p.selected_images.front;
  var imgs = p.images || {};
  if (sel && sel.display) {
    var order = ['fr', 'en'];
    for (var k in sel.display) { if (order.indexOf(k) === -1) order.push(k); }
    for (var i = 0; i < order.length; i++) {
      var lang = order[i];
      if (!sel.display[lang]) continue;
      out.imageUrl = sel.display[lang];
      out.imageUrls.medium = sel.display[lang];
      out.imageUrls.thumb = (sel.small && sel.small[lang]) || (sel.thumb && sel.thumb[lang]) || sel.display[lang];
      out.imageUrls.full = sel.display[lang];
      out.imageSource = lang === 'fr' ? 'off-selected-fr' : (lang === 'en' ? 'off-selected-en' : 'off-selected-other');
      out.confidenceScore = lang === 'fr' ? 1.0 : (lang === 'en' ? 0.92 : 0.85);
      out.status = 'resolved';
      out.fallbackUsed = (lang !== 'fr');
      return out;
    }
  }
  if (p.image_front_url || p.image_url) {
    var u = p.image_front_url || p.image_url;
    out.imageUrl = u; out.imageUrls.medium = u;
    out.imageUrls.thumb = p.image_front_small_url || u;
    out.imageUrls.full = u;
    out.imageSource = 'off-front-url'; out.confidenceScore = 0.80; out.status = 'resolved'; out.fallbackUsed = true;
    return out;
  }
  for (var key in imgs) {
    if (/^\d+$/.test(key)) {
      var base = 'https://images.openfoodfacts.org/images/products/' + offBarcodePath(code) + '/' + key;
      out.imageUrl = base + '.400.jpg';
      out.imageUrls = { thumb: base + '.100.jpg', medium: base + '.400.jpg', full: base + '.jpg' };
      out.imageSource = 'off-raw'; out.confidenceScore = 0.65; out.status = 'resolved'; out.fallbackUsed = true;
      return out;
    }
  }
  return out;
}

async function offLookup(code) {
  const c = String(code).replace(/\D/g, '');
  if (c.length < 6) return { error: 'Code-barres invalide' };
  const fields = 'product_name,product_name_fr,brands,nutriments,serving_size,quantity,image_front_url,image_url,image_front_small_url,images,selected_images,categories_tags,nutriscore_grade,nova_group,additives_tags,additives_n,nutrient_levels,labels_tags';
  const u = `https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=${fields}`;
  const r = await fetch(u, { headers: { 'User-Agent': 'FLINT/1.0 (nutrition app)' } });
  if (!r.ok) return { error: 'OpenFoodFacts ' + r.status };
  const j = await r.json();
  if (j.status !== 1 || !j.product) return { error: 'Produit introuvable' };
  const p = j.product, n = p.nutriments || {};
  let kcal100 = n['energy-kcal_100g'];
  if (kcal100 == null && n['energy_100g'] != null) kcal100 = Number(n['energy_100g']) / 4.184; // kJ -> kcal
  const per100 = { kcal: num(kcal100), prot: num(n.proteins_100g), carb: num(n.carbohydrates_100g), fat: num(n.fat_100g) };
  const serving = parseGrams(p.serving_size) || 30;
  const f = serving / 100;
  const name = p.product_name_fr || p.product_name || p.brands || 'Produit';
  const item = { name: String(name).slice(0, 60), grams: round(serving), kcal: round(per100.kcal * f), prot: round(per100.prot * f), carb: round(per100.carb * f), fat: round(per100.fat * f), confidence: 0.92, box: null, serving: round(serving), servingLabel: servingLabel(p.serving_size), barcode: c };
  if (!item.kcal && !item.prot && !item.carb && !item.fat) return { error: 'Pas d\'infos nutritionnelles pour ce produit' };
  const score = healthScore(p, n, per100);
  const label = score >= 75 ? 'Excellent' : (score >= 50 ? 'Bon' : (score >= 25 ? 'Médiocre' : 'Mauvais'));
  const img = resolveProductImage(p, c);
  if (img.status === 'placeholder') {
    const comm = await photoGet(c);
    if (comm) { img.imageUrl = comm; img.imageUrls = { thumb: comm, medium: comm, full: comm }; img.imageSource = 'user-community'; img.confidenceScore = 0.9; img.status = 'resolved'; img.fallbackUsed = true; }
  }
  const product = {
    name: String(name).slice(0, 80),
    brand: String(p.brands || '').split(',')[0].trim().slice(0, 40),
    image: img.imageUrl || p.image_front_url || p.image_url || null,
    imageResolved: img,
    score: score, label: label,
    nutriscore: (p.nutriscore_grade || '').toUpperCase() || null,
    nova: num(p.nova_group) || null,
    analysis: buildAnalysis(p, n, per100),
    per100: { kcal: round(per100.kcal), prot: round(per100.prot), carb: round(per100.carb), fat: round(per100.fat) }
  };
  return { mealName: item.name, items: [item], total: { kcal: item.kcal, prot: item.prot, carb: item.carb, fat: item.fat }, product: product };
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

    const mode = (body.photo && body.barcode) ? 'photo' : (body.barcode ? 'barcode' : (body.text ? 'text' : (body.image ? 'image' : null)));
    if (!mode) return res.status(400).json({ error: 'Fournis "image", "text", "barcode" ou "photo".' });

    // --- Upload d'une photo produit communautaire (stockée dans le cache partagé si configuré) ---
    if (mode === 'photo') {
      const pbc = String(body.barcode).replace(/\D/g, '');
      const durl = String(body.photo || '');
      if (pbc.length < 6 || durl.indexOf('data:image') !== 0 || durl.length > 700000) return res.status(400).json({ status: 'rejected' });
      if (!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)) return res.status(200).json({ status: 'unavailable' });
      await photoSet(pbc, durl);
      return res.status(200).json({ status: 'saved' });
    }

    // --- Mode code-barres : OpenFoodFacts (pas besoin de Gemini) ---
    if (mode === 'barcode') {
      const bc = String(body.barcode).replace(/\D/g, '');
      const hit = await cacheGet(bc);
      if (hit) return res.status(200).json(hit);
      const out = await offLookup(body.barcode);
      if (out.error) return res.status(404).json(out);
      cacheSet(bc, out).catch(() => {});
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
