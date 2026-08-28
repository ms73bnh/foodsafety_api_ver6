const { PrismaClient } = require('@prisma/client');

const supabase = new PrismaClient({
  datasources: {
    db: {
      url: "postgres://postgres.ijbsgdkgnqtccokjbdac:U94AULAfaQLXWvKb@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true"
    }
  }
});

async function checkCommitteeTables() {
  try {
    const meetings = await supabase.$queryRawUnsafe('SELECT count(*) as cnt FROM "committee_meetings"').catch(e => e.message);
    const agendas = await supabase.$queryRawUnsafe('SELECT count(*) as cnt FROM "committee_agendas"').catch(e => e.message);
    const chunks = await supabase.$queryRawUnsafe('SELECT count(*) as cnt FROM "committee_chunks"').catch(e => e.message);
    console.log('Committee meetings in Supabase:', meetings);
    console.log('Committee agendas in Supabase:', agendas);
    console.log('Committee chunks in Supabase:', chunks);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await supabase.$disconnect();
  }
}

checkCommitteeTables();
