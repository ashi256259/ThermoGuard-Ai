const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// replace "model_version: model_version," with "model_version: 'random_forest_v1.0.0',"
// but wait, in runHeuristicFallback we have "model_version: model_version" that is correct!
// How to distinguish?
// Let's just find the occurrences around line 1867, 2060, 2139.

const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('model_version: model_version')) {
    if (i > 1000) { // i.e. not in runHeuristicFallback which is at < 1000
      lines[i] = lines[i].replace('model_version: model_version', 'model_version: "random_forest_v1.0.0"');
    }
  }
}

fs.writeFileSync('server.ts', lines.join('\n'), 'utf8');
