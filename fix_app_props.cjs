const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');
code = code.replace(
  '<AlertsPage\n          initialSeverity={alertsInitialSeverity}\n          onSelectHotspot={handleInspectDetails}\n          onViewOnMap={handleViewOnMap}\n          onOpenTimeline={handleOpenTimeline}\n        />',
  '<AlertsPage\n          hotspots={hotspots}\n          initialSeverity={alertsInitialSeverity}\n          onSelectHotspot={handleInspectDetails}\n          onViewOnMap={handleViewOnMap}\n          onOpenTimeline={handleOpenTimeline}\n        />'
);
fs.writeFileSync('src/App.tsx', code);
