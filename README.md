# Relevé bancaire PDF → Excel (local)

Application web pour convertir des PDF en fichiers Excel, avec extraction **100% locale** (sans API Gemini).

## Prérequis

- Node.js 18+

## Lancer en local

1. Installer les dépendances :
   ```bash
   npm install
   ```
2. Démarrer le backend local :
   ```bash
   npm run server
   ```
3. Dans un autre terminal, démarrer le front :
   ```bash
   npm run dev
   ```

Le frontend tourne sur `http://localhost:3000` et envoie les requêtes d'extraction au backend local sur `http://localhost:8787` via le proxy Vite.

## Notes

- Aucun appel à Gemini n'est utilisé.
- Extraction locale renforcée: lecture des content streams PDF (y compris FlateDecode), extraction des opérateurs de texte (`Tj`/`TJ`) puis reconstruction des tableaux par blocs de lignes.
- Selon la qualité du PDF (scan image/non textuel), un OCR local serait nécessaire pour des résultats parfaits.
