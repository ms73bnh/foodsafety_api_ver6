const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDb() {
  const alerts = await prisma.food_alerts.findMany();
  let updated = 0;
  for (const alert of alerts) {
    try {
      const data = JSON.parse(alert.detailJson || '{}');
      let trueDate = '';
      if (alert.type === 'RECALL' || alert.type === 'INSPECTION') {
        trueDate = (data.CRET_DTM || '').split(' ')[0];
      } else if (alert.type === 'ADMIN_ACTION') {
        trueDate = (data.DSPS_DCSNDT || data.LAST_UPDT_DTM || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      }

      if (trueDate && trueDate !== alert.regDate) {
        await prisma.food_alerts.update({
          where: { id: alert.id },
          data: { regDate: trueDate }
        });
        updated++;
      }
    } catch(e) {
      console.error('Failed to parse for id ' + alert.id);
    }
  }
  console.log(`Updated ${updated} records.`);
}

fixDb().catch(console.error).finally(() => prisma.$disconnect());
