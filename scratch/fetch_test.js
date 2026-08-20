const axios = require('axios');

async function test() {
  const API_KEY = 'd753b2c401d242248da5';
  const url = `http://openapi.foodsafetykorea.go.kr/api/${API_KEY}/I1250/json/1/5`;
  try {
    const res = await axios.get(url);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('Error fetching API:', err.message);
  }
}

test();
