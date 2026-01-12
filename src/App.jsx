import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/Layout/MainLayout';
import PilotagePage from './pages/PilotagePage';
import RoadmapPage from './pages/RoadmapPage';
import MantisPage from './pages/MantisPage';
import OpenTopicsPage from './pages/OpenTopicsPage';
import OpenTopicDetailPage from './pages/OpenTopicDetailPage';
import DocumentationPage from './pages/DocumentationPage';
import './App.css';

function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/pilotage" replace />} />
          <Route path="/pilotage" element={<PilotagePage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route path="/mantis" element={<MantisPage />} />
          <Route path="/open-topics" element={<OpenTopicsPage />} />
          <Route path="/open-topics/:id" element={<OpenTopicDetailPage />} />
          <Route path="/documentation" element={<DocumentationPage />} />
        </Routes>
      </MainLayout>
    </Router>
  );
}

export default App;


