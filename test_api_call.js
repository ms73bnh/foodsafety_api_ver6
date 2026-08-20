const axios = require('axios');

async function main() {
  try {
    const res = await axios.get('http://localhost:3000/api/ingredients/170/products?limit=10');
    console.log('--- API 응답 데이터 ---');
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error('API 호출 에러:', e);
  }
}

main();
