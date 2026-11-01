// `icon` is a lucide-react icon name
// Les entrées avec `group` sont rangées sous l'en-tête correspondant de la sidebar
export const navGroups = [
  { id: 'autres', label: 'Autres', icon: 'FolderOpen' }
];

export const navConfig = [
  {
    id: 'mantis-demarrage',
    path: '/mantis-demarrage',
    label: 'Mantis Démarrage',
    icon: 'Rocket',
    tabs: [
      { id: 'all-mantis', label: 'All Mantis' },
      { id: 'sd-en-cours', label: 'SD en cours' },
      { id: 'sd-testable', label: 'SD Testable' },
      { id: 'statistiques', label: 'Statistiques' }
    ]
  },
  {
    id: 'copro-demarrage',
    path: '/copro-demarrage',
    label: 'CoPro Démarrage',
    icon: 'Target',
    tabs: []
  },
  {
    id: 'mantis',
    path: '/mantis',
    label: 'Mantis Recette',
    icon: 'Bug',
    tabs: [
      { id: 'all-mantis', label: 'All Mantis' },
      { id: 'sd-en-cours', label: 'SD en cours' },
      { id: 'sd-testable', label: 'SD Testable' },
      { id: 'statistiques', label: 'Statistiques' }
    ]
  },
  {
    id: 'copro-new',
    path: '/copro-new',
    label: 'CoPro Recette',
    icon: 'ClipboardList',
    tabs: []
  },
  {
    id: 'pilotage',
    path: '/pilotage',
    label: 'Pilotage Recette',
    group: 'autres',
    icon: 'ChartColumn',
    tabs: []
  },
  {
    id: 'pilotage-demarrage',
    path: '/pilotage-demarrage',
    label: 'Pilotage Démarrage',
    group: 'autres',
    icon: 'ChartLine',
    tabs: []
  },
  {
    id: 'roadmap',
    path: '/roadmap',
    label: 'Roadmap',
    group: 'autres',
    icon: 'CalendarRange',
    tabs: []
  },
  {
    id: 'sujets-ouverts',
    path: '/open-topics',
    label: 'Sujets Ouverts',
    group: 'autres',
    icon: 'FolderKanban',
    tabs: []
  },
  {
    id: 'documentation',
    path: '/documentation',
    label: 'Documentation',
    group: 'autres',
    icon: 'BookOpen',
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
    icon: 'Download',
    tabs: []
  }
];
