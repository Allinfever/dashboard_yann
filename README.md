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
