const fs = require('fs');
const content = fs.readFileSync('.env.local', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  const eq = l.indexOf('=');
  if (eq > 0) {
    console.log(`Line ${idx + 1}: ${l.substring(0, eq)}`);
  } else {
    console.log(`Line ${idx + 1}: (empty or comment)`);
  }
});
