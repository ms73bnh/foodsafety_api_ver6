
const axios = require('axios');
const API_KEY = 'd753b2c401d242248da5';

async function testFetch() {
  const services = [
    { id: 'I0490', name: 'recalls' },
    { id: 'I2620', name: 'inspections' },
    { id: 'I2810', name: 'imported' }
  ];

  for (const s of services) {
    console.log(`--- Fetching ${s.name} (${s.id}) ---`);
    try {
      const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/${s.id}/json/1/1`;
      const res = await axios.get(url);
      console.log(JSON.stringify(res.data[s.id]?.row?.[0], null, 2));
    } catch (e) {
      console.error(`Error fetching ${s.name}: ${e.message}`);
    }
  }
}

testFetch();
