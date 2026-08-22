// node test_gemini_key.js
const KEY = 'AQ.Ab8RN6L2PBQ5P18T9DSCwKxBKTL36iC-xnK9PNTCfbSvKcnh3w';

async function testKey() {
  // 1. 사용 가능한 모델 목록 조회
  const listRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${KEY}`
  );
  const listData = await listRes.json();

  if (!listRes.ok) {
    console.log('❌ API 키 오류:', JSON.stringify(listData, null, 2));
    return;
  }

  const flashModels = (listData.models || [])
    .filter(m => m.name.includes('flash'))
    .map(m => `${m.name} — ${m.supportedGenerationMethods?.join(', ')}`);

  console.log('✅ API 키 정상. Flash 모델 목록:');
  flashModels.forEach(m => console.log(' ', m));

  if (flashModels.length === 0) {
    console.log('⚠️ 사용 가능한 flash 모델이 없습니다.');
  }
}

testKey().catch(console.error);
