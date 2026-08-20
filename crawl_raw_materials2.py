import sys, io, re, time, json, requests
from bs4 import BeautifulSoup
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BASE_URL = "https://www.foodsafetykorea.go.kr"
LIST_AJAX = f"{BASE_URL}/portal/board/boardList.do"
DETAIL_URL = f"{BASE_URL}/portal/board/boardDetail.do"
DOWNLOAD_URL = f"{BASE_URL}/common/downloadAttchdFile.do"

PDF_DIR = Path("public") / "raw_material_pdf"
PDF_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Referer": f"{BASE_URL}/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660",
    "X-Requested-With": "XMLHttpRequest",
}
BASE_PARAMS = {
    "menu_no": "2660", "menu_grp": "MENU_NEW01", "bbs_no": "bbs987",
    "ctgry_no": "1207", "ctgry_type_cd": "CTG_TYPE01"
}

session = requests.Session()
session.headers.update(HEADERS)
session.get(f"{BASE_URL}/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660", timeout=30)

def get_list_page(page, show_cnt=40):
    r = session.get(LIST_AJAX, params={**BASE_PARAMS, "nPage": str(page), "show_cnt": str(show_cnt)}, timeout=20)
    d = r.json()
    return d.get("list", []), int(d.get("total_cnt", 0))

PATTERN = re.compile(r'downloadFile\s*\(\s*["\x27]([^"\x27]*)["\x27]\s*,\s*["\x27]([^"\x27]*)["\x27]\s*,\s*["\x27]([^"\x27]*)["\x27]\s*,\s*["\x27]([^"\x27]*)["\x27]\s*,\s*["\x27]([^"\x27]*)["\x27]\s*\)')

def get_detail(ntctxt_no):
    r = session.get(DETAIL_URL, params={"ntctxt_no": ntctxt_no, "menu_no": "2660", "menu_grp": "MENU_NEW01", "bbs_no": "bbs987"}, timeout=20)
    r.encoding = "utf-8"
    soup = BeautifulSoup(r.text, "lxml")
    content = ""
    for sel in ["div.board_view_con", "div.bbs_view_con", "div.view_cont", "div.cont_area"]:
        c = soup.select_one(sel)
        if c:
            content = c.get_text("\n", strip=True)
            break
    file_info = {}
    for a in soup.find_all("a"):
        href = a.get("href", "")
        if "downloadFile" in href:
            m = PATTERN.search(href)
            if m:
                file_info = {
                    "attachmentName": m.group(3),
                    "filePath": m.group(1),
                    "fileName": m.group(2),
                    "orgFileName": m.group(3),
                    "fileTypeCd": m.group(4),
                    "ecmFileNo": m.group(5),
                }
                break
    return content, file_info

def download_pdf(file_info, ntctxt_no):
    if not file_info.get("fileName"):
        return ""
    filename = f"rm_{ntctxt_no}.pdf"
    dest = PDF_DIR / filename
    if dest.exists():
        return f"/raw_material_pdf/{filename}"
    try:
        data = {
            "filePath": file_info["filePath"],
            "fileName": file_info["fileName"],
            "orgFileName": file_info.get("orgFileName", "file.pdf"),
            "file_type_cd": file_info.get("fileTypeCd", "pdf"),
            "ecm_file_no": file_info.get("ecmFileNo", ""),
        }
        r = session.post(DOWNLOAD_URL, data=data, timeout=30)
        if r.status_code == 200 and len(r.content) > 1000:
            with open(dest, "wb") as f:
                f.write(r.content)
            return f"/raw_material_pdf/{filename}"
    except Exception as e:
        pass
    return ""

items_p1, total = get_list_page(1, 40)
pages = (total + 39) // 40
print(f"Total: {total} items, {pages} pages")

all_data = []
for page in range(1, pages + 1):
    print(f"Page {page}/{pages}...")
    items, _ = get_list_page(page, 40)
    for item in items:
        ntctxt_no = item.get("ntctxt_no", "")
        title = item.get("titl", "").strip()
        if not title:
            continue
        no = str(item.get("no", ""))
        reg_date = (item.get("cret_dtm", "") or "")[:10]
        view_cnt = str(item.get("inqry_cnt", ""))
        content, file_info = get_detail(ntctxt_no)
        local_pdf = download_pdf(file_info, ntctxt_no) if file_info else ""
        all_data.append({
            "no": no, "ntctxtNo": ntctxt_no, "title": title,
            "regDate": reg_date, "viewCnt": view_cnt, "content": content,
            "attachmentName": file_info.get("attachmentName", ""),
            "filePath": file_info.get("filePath", ""),
            "fileName": file_info.get("fileName", ""),
            "orgFileName": file_info.get("orgFileName", ""),
            "fileTypeCd": file_info.get("fileTypeCd", ""),
            "ecmFileNo": file_info.get("ecmFileNo", ""),
            "localPdfPath": local_pdf,
        })
        time.sleep(0.15)
    print(f"  done. total so far: {len(all_data)}")

with open("raw_materials_data.json", "w", encoding="utf-8") as f:
    json.dump(all_data, f, ensure_ascii=False, indent=2)
print(f"Done! {len(all_data)} records saved.")
