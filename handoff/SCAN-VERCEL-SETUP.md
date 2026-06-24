# Passation — Scan repas (façon Cal AI) + déploiement du proxy sur Vercel

> Doc pour reprendre le travail sur la feature **« prends ton plat en photo → calories/macros »** de FLINT.
> Tout le code est **déjà sur `main`** (repo `chaborz-saas/flint`). Il reste **une seule chose** : déployer le mini-backend sur Vercel et brancher son URL. ~10 min.

---

## 1. Objectif

L'app FLINT a une page **Nutrition** qui prend le plat en photo et renvoie calories + macros, aliment par aliment (éditable). L'analyse est faite par **Gemini 2.5 Flash** (vision).

⚠️ La clé Gemini **ne peut pas vivre dans l'app** (front public + APK = tout le monde pourrait l'extraire et faire exploser la facture). Donc l'app appelle un **petit proxy serverless** qui détient la clé côté serveur. Ce proxy = `api/scan-meal.js`, à déployer sur **Vercel**.

```
App FLINT (PWA + APK)  →  proxy Vercel (garde la clé Gemini)  →  Gemini  →  calories/macros
```

**Tant que le proxy n'est pas déployé/branché, l'app marche mais retombe sur un repas générique (~600 kcal).** C'est le fallback.

---

## 2. Ce qui est déjà fait (sur `main`, en ligne en `flint-v245`)

- **`api/scan-meal.js`** — le proxy (Vercel serverless, CommonJS). Appelle Gemini, renvoie `{mealName, items:[{name,grams,kcal,prot,carb,fat,confidence}], total}`. Contient déjà : CORS, **rate-limit par IP** (20 req/min), **secret d'app** (header `x-flint-key`).
- **Front Nutrition** (`index.html`) refait façon Cal AI : page de capture (hero caméra + modes) + carte résultat (photo + pastilles, Calories, 3 macros, score santé, liste aliments éditable, badges).
- **Balance** = tracking pur (le bouton photo a été déplacé vers Nutrition).
- Le « cerveau » scan (override de `window.analyzeMealPhoto` + liste éditable + recalcul live) est dans le `<script>` isolé en bas de `index.html`.

Rien à recoder. Juste à déployer + brancher.

---

## 3. Récupérer le code (pull)

```bash
cd <ton clone de chaborz-saas/flint>
git checkout main
git pull origin main
```

Vérifie que ces fichiers existent :
- `api/scan-meal.js`
- `handoff/SCAN-VERCEL-SETUP.md` (ce doc)

---

## 4. Déployer le proxy sur Vercel

> Un repo GitHub peut alimenter **plusieurs projets Vercel** sans conflit. Idéalement, crée le projet sous le compte Vercel de **Félix** (`chaborz-saas`) pour que **la clé Gemini et la facture API restent chez lui** (c'est son produit).

1. [vercel.com](https://vercel.com) → connexion avec le GitHub `chaborz-saas`.
2. **Add New… → Project** → importe le repo **`chaborz-saas/flint`** (⚠️ ce repo précis — pas le fork de Dino, qui n'a peut-être pas le dossier `api/`).
3. **Framework Preset : Other**. Aucune build command, aucun output dir. Vercel détecte tout seul `api/scan-meal.js` comme fonction serverless.
4. **Deploy**. Tu obtiens une URL type `https://flint-xxxx.vercel.app`.
   → L'endpoint sera `https://flint-xxxx.vercel.app/api/scan-meal`.

---

## 5. Variables d'environnement (Vercel)

Project → **Settings → Environment Variables** → ajoute :

| Name               | Value                          | Note |
|--------------------|--------------------------------|------|
| `GEMINI_API_KEY`   | *(la clé Gemini de Félix)*     | se crée sur aistudio.google.com → Get API key. **Ne JAMAIS la committer.** |
| `FLINT_APP_SECRET` | `fl1nt-scan-9x4q2`             | doit matcher `window.FLINT_APP_KEY` du front (soft-secret anti-abus). |

Puis **Deployments → … → Redeploy** (sinon les variables ne sont pas prises en compte).

---

## 6. Brancher l'URL dans le front + push

Dans `index.html`, ligne ~6206, remplacer l'URL placeholder par l'URL Vercel réelle :

```js
// AVANT
window.FLINT_SCAN_API = window.FLINT_SCAN_API || 'https://flint-proxy.vercel.app/api/scan-meal';
// APRÈS (exemple)
window.FLINT_SCAN_API = window.FLINT_SCAN_API || 'https://flint-xxxx.vercel.app/api/scan-meal';
```

Puis bump de version (cache) + push :
- `index.html` : `const APP_VERSION='flint-v245';` → `flint-v246`
- `sw.js` : `const CACHE = 'flint-v245';` → `flint-v246`

```bash
git add index.html sw.js
git commit -m "Branche le proxy Gemini de prod (FLINT_SCAN_API) — v246"
git push origin main
```

GitHub Pages se met à jour en ~1 min, l'APK se met à jour tout seul (server.url).

---

## 7. Tester

**Smoke test du proxy** (sans image → doit répondre proprement, prouve que la fonction + le secret tournent) :

```bash
# avec le bon secret → 400 "champ image manquant" (= proxy OK, clé présente)
curl -s -X POST https://flint-xxxx.vercel.app/api/scan-meal \
  -H "Content-Type: application/json" -H "x-flint-key: fl1nt-scan-9x4q2" -d '{}'

# sans le secret → 401 unauthorized (= protection active)
curl -s -X POST https://flint-xxxx.vercel.app/api/scan-meal \
  -H "Content-Type: application/json" -d '{}'
```

- `{"error":"GEMINI_API_KEY manquante..."}` → la variable d'env n'est pas posée / pas redéployé.
- `{"error":"champ \"image\" manquant"}` → 👍 tout est bon, prêt pour une vraie photo.

**Test réel** : ouvrir l'app → onglet **Nutrition** → **Scanner mon repas** → prendre une photo de plat → la carte résultat doit afficher de vraies valeurs détectées (et non le repas générique 600 kcal).

---

## 8. Sécurité (important)

- ❌ Ne **jamais** mettre `GEMINI_API_KEY` dans le code / un fichier committé (repo public → scrapé en minutes, Google révoque). Elle vit **uniquement** dans les env vars Vercel.
- `FLINT_APP_SECRET` / `window.FLINT_APP_KEY` = soft-secret (déjà visible dans le front public). Il décourage l'abus passant + couplé au rate-limit. Pour du costaud plus tard : passer le rate-limit sur Vercel KV / Upstash et envisager une vraie auth (comptes).

---

## 9. Note branches (éviter le conflit récurrent)

`main` (`chaborz-saas/flint`) contient le `api/` + le Bluetooth + la feature scan. Dino bosse sur sa branche fork `feat/flint-frontend`.
👉 Idéalement, **baser la branche front de Dino sur `main`** pour qu'elle hérite de `api/` et du BLE, au lieu de re-merger à chaque fois. Sinon, à chaque pull du front de Dino : merge `--theirs` sur `index.html`/`sw.js` puis ré-appliquer le bloc Bluetooth + le script scan.

---

*Questions ? Tout le détail technique est dans `api/scan-meal.js` (commenté) et dans le `<script>` scan en bas de `index.html`.*
