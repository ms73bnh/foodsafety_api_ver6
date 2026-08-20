// 이 스크립트는 백그라운드 환경에서 주기적으로 식품안전나라 API 동기화를 무한 루프로 수행합니다.
// pm2와 같은 프로세스 매니저를 통해 실행하거나 background 서비스로 실행할 수 있습니다.
// 실행 방법: node cron.js

const cron = require('node-cron');
const axios = require('axios');

console.log('Cron scheduler started.');
console.log('Scheduled to run API full sync every day at 08:00 AM (0 8 * * *).');

const startSyncLoop = async () => {
    let startIdx = 1;
    const limit = 1000;
    let keepGoing = true;
    let totalAdded = 0;
    let totalUpdated = 0;

    console.log(`[${new Date().toISOString()}] Cron job triggered: Starting FULL API sync loop...`);

    while (keepGoing) {
        try {
            console.log(`[Sync] Requesting ${startIdx} to ${startIdx + limit - 1}...`);
            const res = await axios.post('http://localhost:3000/api/sync', { startIdx, limit });
            const data = res.data;
            
            if (data.success) {
                totalAdded += data.addedCount;
                totalUpdated += data.updatedCount;
                console.log(`[Sync] Batch Success: Added ${data.addedCount}, Updated ${data.updatedCount}`);
                
                // 만약 가져온 로우 수가 limit보다 적거나, 데이터가 없다면 루프 종료
                if (data.fetchedRows < limit || data.fetchedRows === 0) {
                    console.log(`[Sync] Reached end of data at index ${startIdx}.`);
                    keepGoing = false;
                } else {
                    startIdx += limit;
                }
            } else {
                console.error(`[Sync] Server returned error:`, data.error);
                keepGoing = false;
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Sync Request Failed:`, error.message);
            keepGoing = false; // 에러 시 무한루프 방지를 위해 브레이크
        }
        
        // 서버 과부하 방지 1초 대기
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`[${new Date().toISOString()}] FULL Sync Completed! Total Added: ${totalAdded}, Total Updated: ${totalUpdated}`);
};

// 매일 오전 8시에 동기화 실행
cron.schedule('0 8 * * *', startSyncLoop);
