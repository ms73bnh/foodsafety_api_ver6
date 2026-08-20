const axios = require('axios');

const API_KEY = 'd753b2c401d242248da5';

async function testAlertApis() {
    const services = [
        { name: 'Recall (I0030)', id: 'I0030' },
        { name: 'Domestic Non-compliance (I2710)', id: 'I2710' },
        { name: 'Imported Non-compliance (I2715)', id: 'I2715' },
        { name: 'Administrative Measures (I2750)', id: 'I2750' }
    ];

    for (const service of services) {
        console.log(`\n--- Testing ${service.name} ---`);
        const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${service.id}/json/1/3`;
        try {
            const res = await axios.get(url);
            const data = res.data[service.id];
            if (data && data.row) {
                console.log(`Success! Found ${data.total_count} items.`);
                console.log('Fields:', Object.keys(data.row[0]));
                // Check for image fields
                const hasImageField = Object.keys(data.row[0]).some(k => k.toLowerCase().includes('img') || k.toLowerCase().includes('path') || k.toLowerCase().includes('file'));
                console.log('Has potential image field:', hasImageField);
                if (hasImageField) {
                    data.row.forEach(r => {
                        const imgKeys = Object.keys(r).filter(k => k.toLowerCase().includes('img') || k.toLowerCase().includes('path') || k.toLowerCase().includes('file'));
                        imgKeys.forEach(k => console.log(`  ${k}: ${r[k]}`));
                    });
                }
            } else {
                console.log('No data found or unexpected response structure.');
                console.log(JSON.stringify(res.data).substring(0, 200));
            }
        } catch (e) {
            console.error(`Error testing ${service.id}:`, e.message);
        }
    }
}

testAlertApis();
