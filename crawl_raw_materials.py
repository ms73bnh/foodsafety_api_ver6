# -*- coding: utf-8 -*-
import io, re, sys, time, json, requests
from bs4 import BeautifulSoup
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_URL     = 'https://www.foodsafetykorea.go.kr'
LIST_AJAX    = BASE_URL + '/portal/board/boardList.do'
DETAIL_URL   = BASE_URL + '/portal/board/boardDetail.do'
DOWNLOAD_URL = BASE_URL + '/common/downloadAttchdFile.do'

PDF_DIR = Path('public/raw_material_pdf')
PDF_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'Referer': BASE_URL + '/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660',
    'X-Requested-With': 'XMLHttpRequest',
}
BASE_PARAMS = {
    'menu_no': '2660', 'menu_grp': 'MENU_NEW01', 'bbs_no': 'bbs987',
    'ctgry_no': '1207', 'ctgry_type_cd': 'CTG_TYPE01',
}

session = requests.Session()
session.headers.update(HEADERS)
try:
    session.get(BASE_URL + '/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660', timeout=10)
except Exception as e:
    pass

def fetch_all_list():
    all_items = []
    p1_data = {**BASE_PARAMS, 'start_idx': '1', 'show_cnt': '40'}
    r = session.post(LIST_AJAX, data=p1_data, timeout=15)
    d = r.json()
    total = int(d.get('total_cnt', 0))
    pages = (total + 39) // 40
    print(f'=== 총 {total}건 ({pages}페이지) 목록 수집 ===', flush=True)
    
    seen_ids = set()
    for p in range(1, pages + 1):
        try:
            p_data = {**BASE_PARAMS, 'start_idx': str(p), 'show_cnt': '40'}
            res = session.post(LIST_AJAX, data=p_data, timeout=15)
            items = res.json().get('list', [])
            for it in items:
                nid = str(it.get('ntctxt_no', ''))
                if nid and nid not in seen_ids:
                    seen_ids.add(nid)
                    all_items.append(it)
        except Exception as ex:
            print(f'  목록 오류 {p}페이지: {ex}', flush=True)
        time.sleep(0.05)
    return all_items

def parse_title_info(title):
    company_nm = ""
    recog_no = ""
    m = re.search(r'\(([^,\(\)]+?)\s*,\s*([^\)]+)\)\s*$', title)
    if m:
        company_nm = m.group(1).strip()
        recog_no = m.group(2).strip()
    return company_nm, recog_no

def parse_post_structured(text):
    fn = ''
    m_fn = re.search(r'기능성\s*내용\s*:\s*([^\n\r]+(?:\n(?!\s*[○*※\-\u25cb\u25a0]|\s*일일섭취량|\s*섭취)[^\n\r]+)*)', text)
    if m_fn:
        fn = m_fn.group(1).strip()

    daily = ''
    m_daily = re.search(r'일일섭취량\s*:\s*([^\n\r]+(?:\n(?!\s*[○*※\-\u25cb\u25a0]|\s*섭취\s*시|\s*기능성)[^\n\r]+)*)', text)
    if m_daily:
        daily = m_daily.group(1).strip()

    precautions = ''
    m_prec = re.search(r'섭취\s*시\s*주의사항\s*[:\n]\s*([^\n\r]+(?:\n(?!\s*[○*※\u25cb\u25a0]|\s*English|\s*기타)[^\n\r]+)*)', text)
    if m_prec:
        precautions = m_prec.group(1).strip()

    return fn, daily, precautions

def process_item(item):
    ntctxt_no = str(item.get('ntctxt_no', ''))
    title = (item.get('titl') or '').strip()
    no = str(item.get('no', ''))
    reg_date = str(item.get('cret_dtm', '') or '')[:10]
    view_cnt = str(item.get('inqry_cnt', ''))
    
    if not ntctxt_no or not title:
        return None
        
    company_nm, recog_no = parse_title_info(title)

    content = ""
    fn_text = ""
    daily_intake = ""
    precautions = ""
    file_info = {}

    try:
        r_det = session.get(DETAIL_URL, params={
            'ntctxt_no': ntctxt_no, 'menu_no': '2660',
            'menu_grp': 'MENU_NEW01', 'bbs_no': 'bbs987'
        }, timeout=8)
        r_det.encoding = 'utf-8'
        soup = BeautifulSoup(r_det.text, 'lxml')
        
        post = soup.select_one('div#_post') or soup.select_one('div.post') or soup.select_one('article')
        if post:
            content = post.get_text('\n', strip=True)
            fn_text, daily_intake, precautions = parse_post_structured(content)
        
        for a in soup.find_all('a'):
            href = a.get('href', '')
            if 'downloadFile' in href:
                m = re.search(
                    r"downloadFile\s*\(\s*['\"]([^'\"]*)['\"],\s*['\"]([^'\"]*)['\"],\s*['\"]([^'\"]*)['\"],\s*['\"]([^'\"]*)['\"],\s*['\"]([^'\"]*)['\"]",
                    href
                )
                if m:
                    file_info = {
                        'attachmentName': m.group(3),
                        'filePath': m.group(1),
                        'fileName': m.group(2),
                        'orgFileName': m.group(3),
                        'fileTypeCd': m.group(4),
                        'ecmFileNo': m.group(5),
                    }
                    break
    except Exception as ex:
        pass

    # PDF 경로 확인 (이미 다운로드된 경우 활용)
    local_pdf = ""
    filename = f'rm_{ntctxt_no}.pdf'
    dest = PDF_DIR / filename
    if dest.exists() and dest.stat().st_size > 1000:
        local_pdf = f'/raw_material_pdf/{filename}'
    elif file_info.get('fileName'):
        try:
            data = {
                'filePath': file_info['filePath'],
                'fileName': file_info['fileName'],
                'orgFileName': file_info.get('orgFileName', 'file.pdf'),
                'file_type_cd': file_info.get('fileTypeCd', 'pdf'),
                'ecm_file_no': file_info.get('ecmFileNo', ''),
            }
            r_dl = session.post(DOWNLOAD_URL, data=data, timeout=10)
            ct = r_dl.headers.get('content-type', '')
            if r_dl.status_code == 200 and len(r_dl.content) > 1000 and 'html' not in ct:
                with open(str(dest), 'wb') as f:
                    f.write(r_dl.content)
                local_pdf = f'/raw_material_pdf/{filename}'
        except Exception:
            pass

    return {
        'no': no,
        'ntctxtNo': ntctxt_no,
        'title': title,
        'companyNm': company_nm,
        'recogNo': recog_no,
        'regDate': reg_date,
        'viewCnt': view_cnt,
        'content': content,
        'functionalityText': fn_text,
        'dailyIntake': daily_intake,
        'precautions': precautions,
        'attachmentName': file_info.get('attachmentName', ''),
        'filePath': file_info.get('filePath', ''),
        'fileName': file_info.get('fileName', ''),
        'orgFileName': file_info.get('orgFileName', ''),
        'fileTypeCd': file_info.get('fileTypeCd', ''),
        'ecmFileNo': file_info.get('ecmFileNo', ''),
        'localPdfPath': local_pdf,
    }

def main():
    items = fetch_all_list()
    print(f'=== 총 {len(items)}건 본문 상세 내용 및 필드 병렬 수집 시작 ===', flush=True)
    
    results = []
    completed = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_item = {executor.submit(process_item, item): item for item in items}
        for future in as_completed(future_to_item):
            res = future.result()
            if res:
                results.append(res)
            completed += 1
            if completed % 50 == 0 or completed == len(items):
                print(f'  -> {completed}/{len(items)} 완료 (본문 수집률: {sum(1 for r in results if r["content"])}/{len(results)})', flush=True)

    # no 기준 내림차순 정렬
    try:
        results.sort(key=lambda x: int(x.get('no', 0) or 0), reverse=True)
    except Exception:
        pass

    with open('raw_materials_data.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f'=== 완료! 총 {len(results)}건 저장 (본문 포함: {sum(1 for r in results if r["content"])}건) ===', flush=True)

if __name__ == '__main__':
    main()