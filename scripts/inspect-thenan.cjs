const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.client.findUnique({ where: { id: 'cmuwjyb250000e09sx8q748cl' }, select: { paymentConfig: true } })
  .then(c => console.log('Thenan paymentConfig:', c.paymentConfig))
  .finally(() => p.$disconnect());
