# FLINT

App de santé / récupération façon **Whoop**, à partir d'une **Polar Loop** (via Health Connect sur Android). Récupération (HRV), sommeil, charge/effort, coach sommeil, nutrition — le tout calculé sur ta propre baseline.

🔗 **En ligne** : https://chaborz-saas.github.io/flint/
📱 **APK Android** : https://chaborz-saas.github.io/flint/flint.apk

## Stack

- **Mono-fichier** : tout l'app (HTML + CSS + JS vanilla) dans [`index.html`](index.html). Pas de build, pas de framework.
- **Données 100% locales** (`localStorage`), offline via `sw.js` (PWA).
- **Logo / icônes** : `logo.png` (header), `icon-192/512.png`, `apple-touch-icon.png`, `favicon-32.png`.
- Le wrapper Android natif + le plugin Health Connect sont dans le repo **[`flint-native`](https://github.com/chaborz-saas/flint-native)** (l'APK pointe sur cette page via `server.url`, donc il se met à jour quand on push ici).

## Fonctionnement

- **Aujourd'hui** : hero récup, 3 anneaux (récup / sommeil / effort), FC, activités du jour (détectées auto via la Loop), nutrition.
- **Récup** : score 0-100 (z-scores HRV/FC/resp/sommeil vs baseline 30j, seuils Whoop), Health Monitor, stress.
- **Sommeil** : stades, hypnogramme, besoin de sommeil, **Coach sommeil** (heure de coucher recommandée par objectif).
- **Charge** : strain 0-21, ratio aigu/chronique.
- **Tendances** : courbes jour-par-jour, corrélations comportements ↔ récup.
- Démo pré-remplie au 1er lancement (badge « DÉMO », disparaît dès une vraie synchro capteur).

## Dev / déploiement

```bash
# servir en local
python3 -m http.server 4174
# déployer = push sur main (GitHub Pages)
git add -A && git commit -m "..." && git push
```

Penser à **bumper la version** : `APP_VERSION` dans `index.html` **et** `CACHE` dans `sw.js` (sinon le cache PWA sert l'ancienne version).
