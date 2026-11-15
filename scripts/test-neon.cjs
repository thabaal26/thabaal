const { Client } = require('pg');
const dns = require('dns');
const fs = require('fs');
dns.setServers(['8.8.8.8']);

dns.resolve4('ep-flat-king-b3vocmqy-pooler.c-4.ap-southeast-1.aws.neon.tech', async (err, addrs) => {
  if (err) {
    console.error('DNS error:', err);
    return;
  }
  const ip = addrs[0];
  const envText = fs.readFileSync('.env', 'utf8');
  const m = envText.match(/DATABASE_URL="([^"]+)"/);
  const originalUrl = new URL(m[1]);
  const client = new Client({
    host: ip,
    port: parseInt(originalUrl.port || '5432', 10),
    user: originalUrl.username,
    password: originalUrl.password,
    database: originalUrl.pathname.replace(/^\//, ''),
    ssl: {
      servername: originalUrl.hostname,
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('Connected to Neon!');

    // Check all columns of Client
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'Client'
      ORDER BY ordinal_position;
    `);
    console.log('Client columns count:', cols.rows.length);
    const hasWorkspaceMode = cols.rows.some(c => c.column_name === 'workspaceMode');
    console.log('Has workspaceMode column:', hasWorkspaceMode);

    // Check clients
    const clients = await client.query('SELECT id, name FROM "Client";');
    console.log('All Clients:', clients.rows);

    // Check customer counts per client
    const custCounts = await client.query(`
      SELECT "clientId", count(*) 
      FROM "Customer" 
      GROUP BY "clientId";
    `);
    console.log('Customer counts per client:', custCounts.rows);

    // Check templates for Finforte
    const ffTemplates = await client.query(`
      SELECT id, name, status, category, language 
      FROM "Template" 
      WHERE "clientId" = 'c_finforte_001';
    `);
    console.log('Finforte templates count:', ffTemplates.rows.length);
    console.log('Finforte templates:', ffTemplates.rows);

    // Check WhatsApp numbers per client
    const numbers = await client.query(`
      SELECT "clientId", "phoneNumberId", "businessAccountId", "displayPhone", "verifiedName", "qualityRating", "messagingTier"
      FROM "WhatsAppNumber";
    `);
    console.log('WhatsApp numbers:', numbers.rows);

    // Check MetaAppCredential and WhatsAppConnection tables
    const tableExists = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('MetaAppCredential', 'WhatsAppConnection', 'WorkspaceMode');
    `);
    console.log('Tables found:', tableExists.rows);

    await client.end();
  } catch (e) {
    console.error('Error:', e);
  }
});
