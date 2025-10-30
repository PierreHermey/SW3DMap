
## Contrôles

- **Rotation**: Clic gauche + glisser
- **Zoom**: Molette de la souris
- **Pan**: Clic droit + glisser
- **Info planète**: Cliquer sur une planète

## Technologies

- **Three.js** - Visualisation 3D
- **pdf-parse** - Extraction des données du PDF
- **Node.js** - Script de parsing
- **Vanilla JavaScript** - Pas de framework frontend

## Régions de la galaxie

| Couleur | Région |
|---------|--------|
| 🟦 Cyan | Deep Core |
| 🔵 Bleu | Core Worlds |
| 🟦 Bleu clair | Colonies |
| 🟠 Orange | Mid Rim |
| 🔴 Rouge | Outer Rim |
| 🟣 Magenta | Unknown Regions |
| 🟣 Violet | Wild Space |

## Scripts disponibles

- `npm run parse` - Parser le PDF et générer planets.json
- `npm run dev` - Lancer le serveur de développement
- `npm start` - Parser + lancer le serveur


✅ Projet Node.js créé avec succès!

📁 Structure:
  SW3DMap/
  ├── assets/          (placer ici le PDF et l'image)
  ├── parser/
  │   └── parse-planets.js
  ├── src/
  │   ├── index.html
  │   ├── main.js
  │   └── planets.json (sera généré)
  ├── package.json
  └── README.md

🚀 Prochaines étapes:
  1. npm install
  2. Copier le PDF dans assets/star_wars_galaxy.pdf
  3. npm run parse     # Parser le PDF
  4. npm run dev       # Lancer le serveur
  5. Ouvrir http://localhost:3000

💡 Ou tout en une fois: npm start

