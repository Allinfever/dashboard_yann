export const navConfig = [
  {
    id: 'pilotage',
    path: '/pilotage',
    label: 'Pilotage',
    icon: '📊',
    tabs: []
  },
  {
    id: 'roadmap',
    path: '/roadmap',
    label: 'Roadmap',
    icon: '🗓️',
    tabs: []
  },
  {
    id: 'mantis',
    path: '/mantis',
    label: 'Mantis',
    icon: '🐞',
    tabs: [
      { id: 'synthese-copro', label: 'Synthèse CoPro' },
      { id: 'all-mantis', label: 'All Mantis' },
      { id: 'sd-en-cours', label: 'SD en cours' },
      { id: 'sd-testable', label: 'SD Testable' },
      { id: 'minutes-created', label: 'Minutes - Created' },
      { id: 'minutes-tested', label: 'Minutes - Tested' },
      { id: 'mantis-rdd', label: 'Mantis RDD' }

    ]
  },
  {
    id: 'copro-new',
    path: '/copro-new',
    label: 'CoPro New',
    icon: '🆕',
    tabs: []
  },
  {
    id: 'sujets-ouverts',
    path: '/open-topics',
    label: 'Sujets Ouverts',
    icon: '📂',
    tabs: []
  },
  {
    id: 'documentation',
    path: '/documentation',
    label: 'Documentation',
    icon: '📚',
    tabs: [
      { id: 'general', label: 'Général' },
      { id: 'technical', label: 'Technique' },
      { id: 'processes', label: 'Processus' }
    ]
  },
  {
    id: 'mantis-extractor',
    path: '/mantis-extractor',
    label: 'Mantis & Notes Extractor',
    icon: '📥',
    tabs: []
  }
];

