import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import './App.css';

// Each tab is loaded on demand, so the first visit only downloads the page it opens
const PilotagePage = lazy(() => import('./pages/PilotagePage'));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'));
const MantisPage = lazy(() => import('./pages/MantisPage'));
const OpenTopicsPage = lazy(() => import('./pages/OpenTopicsPage'));
const OpenTopicDetailPage = lazy(() => import('./pages/OpenTopicDetailPage'));
const DocumentationPage = lazy(() => import('./pages/DocumentationPage'));
const MantisExtractorPage = lazy(() => import('./pages/MantisExtractorPage'));
const CoProNewPage = lazy(() => import('./pages/CoProNewPage'));
const DossiersPage = lazy(() => import('./pages/DossiersPage'));
const DossierDetailPage = lazy(() => import('./pages/DossierDetailPage'));

function App() {
  return (
    <Router>
      <MainLayout>
        <Suspense fallback={<div className="page-loading">Chargement…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/mantis-demarrage?tab=all-mantis" replace />} />
            <Route path="/pilotage" element={<PilotagePage title="Pilotage Recette" />} />
            <Route path="/pilotage-demarrage" element={<PilotagePage key="demarrage" source="demarrage" title="Pilotage Démarrage" mantisPath="/mantis-demarrage" showDeadlines={false} />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/mantis" element={<MantisPage title="Mantis Recette" />} />
            <Route path="/mantis-demarrage" element={<MantisPage key="demarrage" source="demarrage" title="Mantis Démarrage" />} />
            <Route path="/open-topics" element={<OpenTopicsPage />} />
            <Route path="/open-topics/:id" element={<OpenTopicDetailPage />} />
            <Route path="/dossiers" element={<DossiersPage />} />
            <Route path="/dossiers/:id" element={<DossierDetailPage />} />
            <Route path="/documentation" element={<DocumentationPage />} />
            <Route path="/mantis-extractor" element={<MantisExtractorPage />} />
            <Route path="/copro-new" element={<CoProNewPage title="CoPro Recette" />} />
            <Route path="/copro-demarrage" element={<CoProNewPage key="demarrage" source="demarrage" title="CoPro Démarrage" />} />
          </Routes>
        </Suspense>
      </MainLayout>
    </Router>
  );
}

export default App;


