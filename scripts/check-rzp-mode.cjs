const fs = require('fs');
const path = require('path');

function checkFile(f) {
  if (!fs.existsSync(f)) return;
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('rzp_live')) {
    console.log('Found rzp_live in:', f);
  }
  if (content.includes('rzp_test')) {
    console.log('Found rzp_test in:', f);
  }
}

['.env', '.env.local', '.env.production', '.env.vercel', '.env.example'].forEach(checkFile);
