const fs = require('fs');
const file = 'src/services/api.ts';
let code = fs.readFileSync(file, 'utf8');

// Remove the old patch
code = code.replace(/const originalFetch = window\.fetch;[\s\S]*?return res;\n};\n/, '');

// Insert the new custom fetcher
const newPatch = `
const apiFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await fetch(input, init);
  if (res.status === 401) {
    const clone = res.clone();
    try {
      const json = await clone.json();
      if (json.error === "SESSION_EXPIRED_OR_INVALID" || (json.message && json.message.includes("Session token is invalid"))) {
        localStorage.removeItem("thermoguard_auth_token");
        window.location.reload();
      }
    } catch (e) {}
  }
  return res;
};
`;

code = code.replace('const API_BASE_URL', newPatch + '\nconst API_BASE_URL');

// Replace all uses of fetch( to apiFetch(
code = code.replace(/\bawait fetch\(/g, 'await apiFetch(');

fs.writeFileSync(file, code);
console.log("Fixed api.ts");
