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

## Héberger sur Netlify

Cette app peut être déployée sur Netlify avec un frontend statique + fonctions serverless pour l'API locale.

### 1) Connecter le dépôt
- Ouvre Netlify → **Add new site** → **Import an existing project**.
- Connecte ton repo GitHub/GitLab/Bitbucket.

### 2) Paramètres de build
Le repo contient déjà `netlify.toml`, donc Netlify utilisera automatiquement :
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Functions directory**: `netlify/functions`

### 3) Déployer
- Clique **Deploy site**.
- Après déploiement, l'UI appelle toujours `/api/extract` et `/api/health`, redirigés vers les Netlify Functions.

### 4) Vérifier
- `GET https://<ton-site>.netlify.app/api/health` doit renvoyer `{ "ok": true }`.
- Charge un PDF dans l'UI et vérifie qu'un fichier Excel est généré.

## Détails techniques Netlify

- `netlify/functions/extract.cjs` expose `POST /api/extract`.
- `netlify/functions/health.cjs` expose `GET /api/health`.
- Les règles de redirection sont définies dans `netlify.toml`.
- Le code d'extraction est factorisé dans `backend/extractor.cjs` et partagé entre:
  - le serveur local `backend/server.cjs`,
  - les fonctions Netlify.


## Dépannage

- Si vous voyez encore **"An API Key must be set when running in a browser"**, c'est une ancienne version frontend en cache.
- Faites un **hard refresh** (`Ctrl+Shift+R` / `Cmd+Shift+R`) puis redéployez la dernière version Netlify.
- Cette version n'utilise pas Gemini côté navigateur; elle tente d'abord `/.netlify/functions/extract`, puis `/api/extract` en secours.
