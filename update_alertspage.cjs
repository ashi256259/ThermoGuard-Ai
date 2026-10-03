const fs = require('fs');
let code = fs.readFileSync('src/pages/AlertsPage.tsx', 'utf8');

// Add sortBy state
code = code.replace(
  'const [selectedStatus, setSelectedStatus] = useState<string>("ACTIVE");',
  'const [selectedStatus, setSelectedStatus] = useState<string>("ACTIVE");\n  const [sortBy, setSortBy] = useState<string>("priority");'
);

// Destructure hotspots
code = code.replace(
  'const AlertsPage: React.FC<AlertsPageProps> = ({ onSelectHotspot, onViewOnMap, onOpenTimeline, initialSeverity }) => {',
  'const AlertsPage: React.FC<AlertsPageProps> = ({ hotspots, onSelectHotspot, onViewOnMap, onOpenTimeline, initialSeverity }) => {'
);

fs.writeFileSync('src/pages/AlertsPage.tsx', code);
