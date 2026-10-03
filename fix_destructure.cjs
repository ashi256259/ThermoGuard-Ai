const fs = require('fs');
let code = fs.readFileSync('src/pages/AlertsPage.tsx', 'utf8');

code = code.replace(
  'export const AlertsPage: React.FC<AlertsPageProps> = ({',
  'export const AlertsPage: React.FC<AlertsPageProps> = ({\n  hotspots,'
);

fs.writeFileSync('src/pages/AlertsPage.tsx', code);
