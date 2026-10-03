const fs = require('fs');
const file = 'src/services/api.ts';
let code = fs.readFileSync(file, 'utf8');

const patch = `
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const res = await originalFetch(...args);
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

code = code.replace('const API_BASE_URL', patch + '\nconst API_BASE_URL');
fs.writeFileSync(file, code);
console.log("Patched api.ts");
