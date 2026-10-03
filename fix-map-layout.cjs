const fs = require('fs');
let code = fs.readFileSync('src/pages/DashboardPage.tsx', 'utf8');

code = code.replace(
  '<div ref={mapContainerRef} className="w-full h-full min-h-0 z-0" />',
  '<div ref={mapContainerRef} className="absolute inset-0 z-10" />'
);

// We need to raise the legend and attribution to z-[400] which they already are.
fs.writeFileSync('src/pages/DashboardPage.tsx', code);
