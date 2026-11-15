const fs = require('fs');
const c = fs.readFileSync('prisma/schema.prisma', 'utf8');
const lines = c.split('\n');
let inside = false;
lines.forEach(l => {
  if (l.startsWith('model Client {')) inside = true;
  if (inside) {
    if (l.trim().startsWith('//')) return;
    console.log(l);
    if (l.startsWith('}')) inside = false;
  }
});
