const fs = require('fs');
const file = 'src/services/api.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
  'const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {\n  const res = await apiFetch(input, init);',
  'const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {\n  const res = await fetch(input, init);'
);

fs.writeFileSync(file, code);
console.log("Fixed recursion in api.ts");
