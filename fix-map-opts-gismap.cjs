const fs = require('fs');
let code = fs.readFileSync('src/components/GisMap.tsx', 'utf8');

code = code.replace(
  'zoomControl: false,',
  'zoomControl: false,\n      dragging: true,\n      tap: true,\n      touchZoom: true,\n      scrollWheelZoom: true,\n      doubleClickZoom: true,\n      boxZoom: true,'
);
fs.writeFileSync('src/components/GisMap.tsx', code);
