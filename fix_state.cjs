const fs = require('fs');
let code = fs.readFileSync('src/pages/AlertsPage.tsx', 'utf8');

code = code.replace(
  'const [selectedStatus, setSelectedStatus] = useState<string>("All");',
  'const [selectedStatus, setSelectedStatus] = useState<string>("All");\n  const [sortBy, setSortBy] = useState<string>("priority");'
);

fs.writeFileSync('src/pages/AlertsPage.tsx', code);
