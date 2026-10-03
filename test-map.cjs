const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');
code = code.replace(
  'zoomControl: false,',
  'zoomControl: false,\n      dragging: true,\n      tap: true,'
);
fs.writeFileSync('src/pages/DashboardPage.tsx', code);
