// Les entrées avec `group` sont rangées sous l'en-tête correspondant de la sidebar
export const navGroups = [
  { id: 'autres', label: 'Autres', icon: '🗂️' }
];

export const navConfig = [
  {
    id: 'mantis',
    path: '/mantis',
    label: 'Mantis Recette',
    icon: '🐞',
    tabs: [
      { id: 'all-mantis', label: 'All Mantis' },
      { id: 'sd-en-cours', label: 'SD en cours' },
      { id: 'sd-testable', label: 'SD Testable' }
    ]
  },
  {
    id: 'copro-new',
    path: '/copro-new',
    label: 'CoPro',
    icon: '🆕',
    tabs: []
  },
  {
    id: 'pilotage',
    path: '/pilotage',
    label: 'Pilotage',
    group: 'autres',
    icon: '📊',
    tabs: []
  },
  {
    id: 'roadmap',
    path: '/roadmap',
    label: 'Roadmap',
    group: 'autres',
    icon: '🗓️',
    tabs: []
  },
  {
    id: 'sujets-ouverts',
    path: '/open-topics',
    label: 'Sujets Ouverts',
    group: 'autres',
    icon: '📂',
    tabs: []
  },
  {
    id: 'documentation',
    path: '/documentation',
    label: 'Documentation',
    group: 'autres',
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
    group: 'autres',
    icon: '📥',
    tabs: []
  }
];
