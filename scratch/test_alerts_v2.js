const axios = require('axios');

const API_KEY = 'd753b2c401d242248da5';

async function testAlertApis() {
    const services = [
        { name: 'Recall', id: 'I0030' },
        { name: 'Domestic Non-compliance', id: 'I2620' }
    ];

    for (const service of services) {
        console.log(`\n--- Testing ${service.name} (${service.id}) ---`);
        const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${service.id}/json/1/3`;
        try {
            const res = await axios.get(url);
            const data = res.data[service.id];
            if (data && data.row) {
                console.log(`Success! Total: ${data.total_count}`);
                console.log('Sample Row:', JSON.stringify(data.row[0], null, 2));
            } else {
                console.log('No data found.');
                console.log(JSON.stringify(res.data).substring(0, 300));
            }
        } catch (e) {
            console.error(`Error:`, e.message);
        }
    }
}

testAlertApis();
