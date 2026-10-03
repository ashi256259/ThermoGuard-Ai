const fs = require('fs');
let code = fs.readFileSync('src/pages/AlertsPage.tsx', 'utf8');

if (!code.includes('hotspots?: HotspotItem[];')) {
  code = code.replace(
    'interface AlertsPageProps {',
    'interface AlertsPageProps {\n  hotspots?: HotspotItem[];'
  );
  fs.writeFileSync('src/pages/AlertsPage.tsx', code);
}
