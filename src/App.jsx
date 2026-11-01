import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import PilotagePage from './pages/PilotagePage';
import RoadmapPage from './pages/RoadmapPage';
import MantisPage from './pages/MantisPage';
import OpenTopicsPage from './pages/OpenTopicsPage';
import OpenTopicDetailPage from './pages/OpenTopicDetailPage';
import DocumentationPage from './pages/DocumentationPage';
import MantisExtractorPage from './pages/MantisExtractorPage';
import CoProNewPage from './pages/CoProNewPage';
import './App.css';

function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/mantis-demarrage?tab=all-mantis" replace />} />
          <Route path="/pilotage" element={<PilotagePage title="Pilotage Recette" />} />
          <Route path="/pilotage-demarrage" element={<PilotagePage key="demarrage" source="demarrage" title="Pilotage Démarrage" mantisPath="/mantis-demarrage" showDeadlines={false} />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/mantis" element={<MantisPage title="Mantis Recette" />} />
          <Route path="/mantis-demarrage" element={<MantisPage key="demarrage" source="demarrage" title="Mantis Démarrage" />} />
          <Route path="/open-topics" element={<OpenTopicsPage />} />
          <Route path="/open-topics/:id" element={<OpenTopicDetailPage />} />
          <Route path="/documentation" element={<DocumentationPage />} />
          <Route path="/mantis-extractor" element={<MantisExtractorPage />} />
          <Route path="/copro-new" element={<CoProNewPage title="CoPro Recette" />} />
          <Route path="/copro-demarrage" element={<CoProNewPage key="demarrage" source="demarrage" title="CoPro Démarrage" />} />
        </Routes>
      </MainLayout>
    </Router>
  );
}

export default App;


