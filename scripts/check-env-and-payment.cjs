const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const clients = await p.client.findMany({
    select: { id: true, name: true, paymentConfig: true }
  });
  console.log('Clients count:', clients.length);
  clients.forEach(c => {
    let conf = c.paymentConfig;
    if (typeof conf === 'string') {
      try { conf = JSON.parse(conf); } catch (e) {}
    }
    console.log(`Client [${c.id}] ${c.name}:`, conf ? Object.keys(conf) : 'null');
    if (conf && conf.razorpay) {
      console.log('  razorpay config keys:', Object.keys(conf.razorpay));
    }
  });
}
main().catch(console.error).finally(() => p.$disconnect());
