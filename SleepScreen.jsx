// SleepScreen.jsx — interface hybride : image template statique + valeurs dynamiques en overlay.
// Principe : le PNG contient TOUT le design fixe (cards, ombres, icônes, illustration, labels).
// Le code n'ajoute QUE les textes variables, positionnés en absolu sur une base 941×1672.
//
// Tout se règle dans POSITIONS : top / left / width / size (=fontSize) / weight / color / font / align.
// Les unités sont en pixels de la BASE, converties en % (top/left) et en cqw (fontSize) → scale proportionnel.

import templateBg from "./assets/sleep/mockup_full.png"; // <-- ton image template

/* 1) Base de travail = dimensions exactes du PNG (ratio 9:16). */
const BASE = { w: 941, h: 1672 };

/* 2) Données dynamiques (à brancher sur ton vrai état / API). */
const sleepData = {
  status: "TRÈS BONNE NUIT",
  duration: "7h42",
  need: "Besoin 8h00",
  regularity: "Régularité 95%",
  bedtime: "23:06",
  wakeTime: "07:00",
  messageTitle: "Excellente nuit.",
  messageSubtitle: "Tu es dans ta cible.",
  recovery: "3h42",
  awake: "12",
  awakeUnit: "min",
  heartRate: "47",
  heartRateUnit: "bpm",
};

/* 3) Couleurs (depuis ta charte). */
const C = {
  ink: "#111111",
  grey: "#8D8983",
  violet: "#6D63F6",
  orange: "#F15A3A",
  green: "#2DBB6A",
};

/* 4) Positions — UNIQUE endroit à ajuster. Coordonnées en px sur la base 941×1672.
      align : 'center' | 'left'  (ancrage horizontal)
      anchorY : 'center' | 'top' (ancrage vertical)
      font : 'anton' (gros chiffres très gras) | 'inter' (texte). */
const POSITIONS = {
  status:    { top: 481,  left: 470, size: 29,  weight: 800, color: C.violet, font: "inter", align: "center", anchorY: "center", upper: true, spacing: 0.05 },
  duration:  { top: 592,  left: 470, size: 122, weight: 900, color: C.ink,    font: "anton", align: "center", anchorY: "center", spacing: -0.01 },
  need:      { top: 767,  left: 470, size: 25,  weight: 700, color: C.violet, font: "inter", align: "center", anchorY: "center" },
  bedtime:   { top: 946,  left: 334, size: 53,  weight: 900, color: C.ink,    font: "anton", align: "center", anchorY: "center" },
  wakeTime:  { top: 946,  left: 710, size: 53,  weight: 900, color: C.ink,    font: "anton", align: "center", anchorY: "center" },
  verdict:   { top: 1127, left: 230, size: 33,  weight: 800, color: C.ink,    font: "inter", align: "left",   anchorY: "center" },
  recovery:  { top: 1391, left: 152, size: 51,  weight: 900, color: C.ink,    font: "anton", align: "left",   anchorY: "center" },
  awake:     { top: 1391, left: 367, size: 51,  weight: 900, color: C.ink,    font: "anton", align: "left",   anchorY: "center" },
  heartRate: { top: 1391, left: 613, size: 51,  weight: 900, color: C.ink,    font: "anton", align: "left",   anchorY: "center" },
};

/* 5) Conversion config → style inline. cqw = 1% de la largeur du conteneur (container query unit). */
function styleFor(p) {
  return {
    position: "absolute",
    top: `${(p.top / BASE.h) * 100}%`,
    left: `${(p.left / BASE.w) * 100}%`,
    width: p.width != null ? `${(p.width / BASE.w) * 100}%` : undefined,
    transform: `translate(${p.align === "center" ? "-50%" : "0"}, ${p.anchorY === "center" ? "-50%" : "0"})`,
    fontSize: `${(p.size / BASE.w) * 100}cqw`,
    fontWeight: p.weight,
    color: p.color,
    textAlign: p.align,
    fontFamily: p.font === "anton" ? "'Anton', sans-serif" : "'Inter', sans-serif",
    fontStyle: p.font === "anton" ? "oblique 8deg" : "normal",
    letterSpacing: `${p.spacing ?? 0}em`,
    textTransform: p.upper ? "uppercase" : "none",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };
}

export default function SleepScreen() {
  const d = sleepData;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 465,            // largeur d'app mobile ; retire pour plein écran
        margin: "0 auto",
        aspectRatio: `${BASE.w} / ${BASE.h}`,   // garde le ratio exact, jamais d'étirement
        backgroundImage: `url(${templateBg})`,
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
        containerType: "inline-size",           // active les unités cqw
      }}
    >
      {/* statut */}
      <div style={styleFor(POSITIONS.status)}>{d.status}</div>

      {/* durée totale (le « h » plus petit, même couleur) */}
      <div style={styleFor(POSITIONS.duration)}>
        {d.duration.split(/(h)/i).map((part, i) =>
          part.toLowerCase() === "h" ? (
            <span key={i} style={{ fontSize: "0.58em" }}>h</span>
          ) : (
            part
          )
        )}
      </div>

      {/* besoin · régularité */}
      <div style={{ ...styleFor(POSITIONS.need), display: "inline-flex", alignItems: "center", gap: "0.45em" }}>
        <span aria-hidden style={{ fontSize: "1.15em" }}>◎</span>
        {`${d.need} · ${d.regularity}`}
      </div>

      {/* coucher / réveil */}
      <div style={styleFor(POSITIONS.bedtime)}>{d.bedtime}</div>
      <div style={styleFor(POSITIONS.wakeTime)}>{d.wakeTime}</div>

      {/* carte de validation */}
      <div style={styleFor(POSITIONS.verdict)}>
        <div style={{ fontWeight: "inherit", lineHeight: 1.05 }}>{d.messageTitle}</div>
        <div style={{ fontSize: "0.78em", fontWeight: 500, color: C.grey, marginTop: "0.32em" }}>
          {d.messageSubtitle}
        </div>
      </div>

      {/* métriques */}
      <div style={styleFor(POSITIONS.recovery)}>{d.recovery}</div>
      <div style={styleFor(POSITIONS.awake)}>
        {d.awake}
        <small style={{ fontSize: "0.5em", fontWeight: 700, color: C.grey, marginLeft: "0.12em", fontFamily: "'Inter', sans-serif", fontStyle: "normal" }}>
          {d.awakeUnit}
        </small>
      </div>
      <div style={styleFor(POSITIONS.heartRate)}>
        {d.heartRate}
        <small style={{ fontSize: "0.5em", fontWeight: 700, color: C.grey, marginLeft: "0.12em", fontFamily: "'Inter', sans-serif", fontStyle: "normal" }}>
          {d.heartRateUnit}
        </small>
      </div>
    </div>
  );
}

/*
RÉGLAGE RAPIDE
- Bouger un texte           → POSITIONS.<clé>.top / .left   (en px sur 941×1672)
- Changer une taille        → POSITIONS.<clé>.size          (px → auto-converti en cqw)
- Couleur / graisse / police→ .color / .weight / .font
- Largeur d'une zone        → .width (optionnel)
- Tout scale tout seul avec la largeur du conteneur (cqw + aspect-ratio).

POLICES : charge 'Anton' (gros chiffres) et 'Inter' (texte). Ex. next/font ou <link> Google Fonts.
TEMPLATE : le PNG ne doit PAS être retouché côté layout — il porte déjà cards/ombres/icônes/labels.
*/
