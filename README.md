# Dashboard Deloitte

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   cd server
   npm install
   cd ..
   ```

2. **Configuration**
   Create a `.env.local` file in the root directory with your Mantis credentials:
   ```env
   MANTIS_BASE_URL=https://mantis.stms.fr
   MANTIS_USERNAME=your_username
   MANTIS_PASSWORD=your_password
   MANTIS_SOURCE_QUERY_ID=1291
   ```

### Configuration Mantis
Les variables suivantes dans `.env.local` contrôlent l'intégration :
- `MANTIS_BASE_URL`: URL de base (ex: https://mantis.stms.fr)
- `MANTIS_USERNAME` / `MANTIS_PASSWORD`: Identifiants de connexion
- `MANTIS_SOURCE_QUERY_ID`: ID du filtre à charger (par défaut: 1291)
- `MANTIS_MAX_ENRICH`: Nombre maximum de colonnes "Priorité" à enrichir (Défaut: 200). Mettre à `0` pour désactiver l'enrichissement.

## Running the Application

Start both the backend server and frontend development server with a single command:

```bash
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:3001](http://localhost:3001)

## Features

- **Mantis Integration**: Automatically filters and exports defects from Mantis (Source Query ID 1291) via a custom Node.js backend.
- **SaaS Modern UI**: Clean aesthetics with persistent navigation and responsive tables.

## Dossiers

L'onglet **Dossiers** (`/dossiers`) centralise tout ce qui concerne un sujet : mails, échanges Teams, Mantis, documents, recherches. Chaque source est analysée par OpenAI, puis l'IA tient à jour une fiche de synthèse du dossier.

### Clé OpenAI

- Le plus simple : clique sur le bouton **Clé OpenAI** de la page Dossiers et colle la clé. Elle est vérifiée auprès d'OpenAI puis conservée sur le serveur dans `~/.dashboard-yann/data/dossiers_settings.json`. Elle survit aux redémarrages et aux déploiements.
- Autre possibilité : `OPENAI_API_KEY` dans `.env.local`. Une clé saisie dans l'interface est prioritaire.
- Variables optionnelles :
  - `OPENAI_MODEL` : modèle de la fiche et de l'assistant (défaut `gpt-5.5`) ;
  - `OPENAI_MODEL_FAST` : modèle de l'analyse de chaque source (défaut `gpt-5.4-mini`).
- Sans clé, les sources sont stockées mais pas analysées.

### Ajouter des sources

Dépose des fichiers dans la zone de dépôt, ou colle du texte ou une image (Ctrl+V n'importe où sur la page, puis Ctrl+Entrée pour valider le texte).

| Source | Traitement |
|---|---|
| `.eml`, `.msg` | Mail : expéditeur, destinataires, date et corps. Les images jointes sont extraites et analysées. Un bouton « Outlook » télécharge le mail pour l'ouvrir dans Outlook. |
| `.docx`, `.pdf`, `.xlsx` / `.xlsm` | Texte extrait. Un PDF scanné, sans couche texte, ne donne rien. |
| `.txt`, `.md`, `.csv`, `.json`, `.log`, `.html` | Lus tels quels. |
| Images (capture d'écran, photo…) | Analysées par l'IA et visibles en vignette (clic pour agrandir). |
| Numéros Mantis ou liens `view.php?id=` | Ajoutés comme sources Mantis, avec leurs détails. |
| URL seules | La page web est récupérée et analysée. |
| Autre texte collé | Note ou échange Teams. |

- Taille maximale : 25 Mo par fichier.
- Depuis Outlook sous Windows, le glisser-déposer d'un mail vers le navigateur ne fonctionne pas. Enregistre d'abord le mail en `.msg`, ou colle son texte.
- Un Mantis cité dans un mail ou un document est rattaché automatiquement au dossier, s'il est présent dans le cache Mantis.

### Fiche et assistant

- **Fiche** : la synthèse est régénérée automatiquement à chaque ajout de source. Elle contient :
  - le résumé et l'état (OK, attention, bloqué, terminé) ;
  - les décisions, les actions (à cocher), les questions ouvertes et les risques ;
  - les acteurs, les prochaines étapes et les Mantis liés.
  Chaque élément renvoie à ses sources (`S1`, `S2`…). Les cases cochées sont conservées quand la fiche est régénérée.
- **Assistant** : on pose ses questions au dossier, avec des raccourcis tout prêts (point d'avancement, blocages, mail de relance, compte rendu, préparation du CoPro).
- **Mes notes** : texte libre, non traité par l'IA.
- **Export** : la fiche s'exporte en Markdown (`/api/dossiers/:id/export.md`).

### Classement

- Les dossiers actifs sont rangés selon une priorité personnelle : **Priorité 1, 2, 3** et **À définir**. Elle est indépendante de la priorité Mantis.
- Pour changer la priorité, utilise les pastilles P1 / P2 / P3 / ? de la carte, ou fais glisser la carte vers un autre groupe.
- Déposer une carte sur une autre la place juste avant, ce qui fixe l'ordre à l'intérieur d'un groupe.
- Chaque carte affiche les Mantis rattachés avec leur état. La recherche trouve aussi les dossiers par numéro de Mantis.
- Un dossier passé au statut « Archivé » descend dans la section Archivés.

### Stockage

Les données sont dans `~/.dashboard-yann`, hors du dépôt, donc conservées entre les déploiements. On peut changer ce dossier avec `DASHBOARD_DATA_DIR`.

- `data/dossiers/<id>.json` : un fichier par dossier (sources, texte extrait, analyses, fiche, conversation) ;
- `uploads/dossiers/<id>/` : les fichiers déposés et les pièces jointes extraites des mails.
