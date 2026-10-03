const fs = require('fs');
let code = fs.readFileSync('src/main.tsx', 'utf8');
code = code.replace(
  "import './index.css';",
  "import 'leaflet/dist/leaflet.css';\nimport './index.css';"
);
fs.writeFileSync('src/main.tsx', code);
