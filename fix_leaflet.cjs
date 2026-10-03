const fs = require('fs');

function removeTap(path) {
  let code = fs.readFileSync(path, 'utf8');
  code = code.replace(/tap: true,/g, '');
  fs.writeFileSync(path, code);
}

removeTap('src/components/GisMap.tsx');
removeTap('src/pages/DashboardPage.tsx');
