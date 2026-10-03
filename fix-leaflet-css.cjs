const fs = require('fs');
let code = fs.readFileSync('src/index.css', 'utf8');
code = code.replace(
  'z-index: 10;',
  'z-index: 10;\n  touch-action: none !important;'
);
fs.writeFileSync('src/index.css', code);
