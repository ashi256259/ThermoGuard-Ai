const fs = require('fs');
let code = fs.readFileSync('src/components/GisMap.tsx', 'utf8');
code = code.replace(
  '<div ref={mapContainerRef} className="w-full h-full min-h-0 z-0"',
  '<div ref={mapContainerRef} className="absolute inset-0 z-10"'
);
fs.writeFileSync('src/components/GisMap.tsx', code);
