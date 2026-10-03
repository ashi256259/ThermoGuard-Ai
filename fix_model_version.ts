import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('model_version: model_version')) {
    if (i > 1000) { 
      lines[i] = lines[i].replace('model_version: model_version', 'model_version: "random_forest_v1.0.0"');
    }
  }
}

fs.writeFileSync('server.ts', lines.join('\n'), 'utf8');
