async function inspectCommitteeBoard() {
  const BASE_URL = 'https://www.mfds.go.kr';
  
  // 1. m_532 게시판 기본 확인
  console.log('--- Inspecting m_532 board ---');
  for (let p = 1; p <= 5; p++) {
    const url = `${BASE_URL}/brd/m_532/list.do?page=${p}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await resp.text();
    
    // 게시글 링크들 파싱
    const titles = [...html.matchAll(/<a\s+[^>]*href=["']([^"']*view\.do\?[^"']*)["'][^>]*class=["']title["'][^>]*>([\s\S]*?)<\/a>/gi)];
    console.log(`Page ${p}: ${titles.length} total posts`);
    for (const t of titles) {
      const titleText = t[2].replace(/<[^>]+>/g, '').trim();
      const href = t[1];
      console.log(`  - [${href.match(/seq=(\d+)/)?.[1]}] ${titleText}`);
    }
    if (titles.length === 0) break;
  }
}

inspectCommitteeBoard();
