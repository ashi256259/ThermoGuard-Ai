const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');

code = code.replace(
  'zoomControl: false,\n      dragging: true,\n      tap: true,',
  'zoomControl: false,\n      dragging: true,\n      tap: true,\n      touchZoom: true,\n      scrollWheelZoom: true,\n      doubleClickZoom: true,\n      boxZoom: true,'
);
fs.writeFileSync('src/pages/DashboardPage.tsx', code);
