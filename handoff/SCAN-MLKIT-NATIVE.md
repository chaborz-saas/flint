# Scanner code-barres natif (ML Kit) — activation

Le scanner FLINT a **3 moteurs**, sélectionnés automatiquement par le front (`index.html`) :

1. **ML Kit natif** (plugin Capacitor) — si présent dans l'APK → vitesse native, le top.
2. **BarcodeDetector** (web/Android Chrome/WebView) — accéléré GPU, déjà actif aujourd'hui.
3. **ZXing** (repli iOS / vieux navigateurs).

Le front teste `window.Capacitor.Plugins.BarcodeScanner` : **présent → natif, absent → web**.
Donc **rien à changer côté front** — il bascule tout seul quand l'APK contient le plugin.

## Activer le natif (une seule fois)

```bash
cd ~/flint-native
bash setup-mlkit-scanner.sh        # npm install @capacitor-mlkit/barcode-scanning@^6 + npx cap sync android
cd android && ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ~/flint-app/flint.apk
```

Puis réinstaller l'APK sur le tél (`adb install -r ~/flint-app/flint.apk`).

## Ce qui est déjà préparé

- `~/flint-native/setup-mlkit-scanner.sh` — script d'install + sync.
- `AndroidManifest.xml` — permission `CAMERA` ajoutée.
- Front `index.html` (v259) — chemin natif câblé : `requestPermissions` → `isSupported` → `addListener('barcodesScanned')` → `startScan({})`, transparence du webview (classes `flx-native-scan`), torch via `enableTorch/disableTorch`, cleanup propre (`removeListener` puis `stopScan`).

## Points de vigilance (à valider sur le tél)

- **Version** : Capacitor 6.2.1 → plugin `@capacitor-mlkit/barcode-scanning@^6` (la 8.x exige Capacitor 8). Le script pin déjà `^6`.
- **Modèle ML Kit bundlé** (~2,4 Mo) → l'APK passe d'environ 8,7 Mo à ~11 Mo. Pas besoin de Google Play Services.
- **Caméra derrière le webview** : le plugin rend la caméra derrière la page ; le front rend le webview transparent pendant le scan (`html/body.flx-native-scan{background:transparent}` + `body.flx-native-scan>*:not(#flxBar){visibility:hidden}`). Si la caméra n'apparaît pas (écran noir), c'est qu'un conteneur racine opaque masque encore : vérifier le fond du wrapper de l'app.
- **minSdk 26** déjà OK (le plugin demande 26).
- Aucune modif de `MainActivity.java` nécessaire : le plugin npm s'auto-enregistre (contrairement aux plugins Kotlin custom Polar/HealthConnect).

## Si tu préfères ne PAS faire le build maintenant

Aucun problème : le scanner **web (BarcodeDetector)** est déjà en prod (v259) et tourne à vitesse quasi-native dans ton APK actuel. Le natif est un **bonus** activable quand tu veux.
