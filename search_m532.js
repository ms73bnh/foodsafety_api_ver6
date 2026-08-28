async function searchM532Keywords() {
  const BASE_URL = 'https://www.mfds.go.kr';
  
  const keywords = ['건강기능식품', '기능성', '심의위원회', '건강기능'];
  
  for (const kw of keywords) {
    const encoded = encodeURIComponent(kw);
    const url = `${BASE_URL}/brd/m_532/list.do?srchTp=0&srchWord=${encoded}&page=1`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const html = await resp.text();
    
    // pagination or total count
    const totalMatch = html.match(/총\s*<strong[^>]*>([\d,]+)<\/strong>\s*건/i) ||
                       html.match(/총\s*([\d,]+)\s*건/i) ||
                       html.match(/page_info["']>[\s\S]*?(\d+)\s*\/\s*(\d+)/i);
    console.log(`Keyword [${kw}]: total count match ->`, totalMatch ? totalMatch[0] : 'None');
    
    // count pages
    const titles = [...html.matchAll(/<a\s+[^>]*href=["']([^"']*view\.do\?[^"']*)["'][^>]*class=["']title["'][^>]*>([\s\S]*?)<\/a>/gi)];
    console.log(`  Page 1 titles count: ${titles.length}`);
    for (const t of titles.slice(0, 3)) {
      console.log(`    - ${t[2].replace(/<[^>]+>/g, '').trim()}`);
    }
  }
}

searchM532Keywords();
