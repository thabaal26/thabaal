const fs = require('fs');
const content = fs.readFileSync('.env.local', 'utf8');
const lines = content.split('\n');
console.log('Total lines in .env.local:', lines.length);
lines.forEach((l, idx) => {
  if (l.includes('RAZORPAY') || l.includes('RZP')) {
    const parts = l.split('=');
    console.log(`Line ${idx + 1}: ${parts[0]} = [REDACTED ${parts[1] ? parts[1].trim().length : 0} chars]`);
  }
});
