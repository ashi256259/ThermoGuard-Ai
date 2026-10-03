const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');
code = code.replace(/\/\* Force Leaflet drag functionality \*\/.*/s, '');
fs.writeFileSync('src/index.css', code);
