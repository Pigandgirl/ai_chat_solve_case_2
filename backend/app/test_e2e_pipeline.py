"""End-to-end pipeline test: Upload -> OCR -> Auto-Vector -> RAG Analysis"""
import asyncio, json, os, sys, time, io, logging

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
import httpx

PASS = "[OK]"
FAIL = "[FAIL]"

PDF_LEGAL_CONTENT = """行政复议申请书

申请人：张某某，男，汉族，1985年6月15日出生
住址：广东省广州市天河区体育西路123号
联系电话：13800138000

被申请人：广州市天河区市场监督管理局
地址：广州市天河区黄埔大道西363号

复议请求：
一、撤销被申请人作出的《行政处罚决定书》（穗天市监处字〔2024〕第056号）
二、依法确认被申请人在行政处罚过程中存在程序违法

事实与理由：
2024年3月10日，被申请人执法人员在未出示执法证件、未告知申请人权利义务的情况下，对申请人经营的"明发餐饮店"进行现场检查。检查过程中，被申请人执法人员李某某、王某某未按照《中华人民共和国行政处罚法》第五十五条的规定，进行全过程记录。

2024年4月15日，被申请人作出《行政处罚告知书》，以申请人"使用超过保质期的食品原料"为由，拟对申请人处以罚款人民币伍万元。申请人在法定期限内向被申请人提交了陈述申辩意见，但被申请人在2024年5月20日作出的《行政处罚决定书》中未对申请人的申辩理由作出任何回应。

申请人在收到行政处罚决定后，依法申请行政复议。申请人认为，被申请人在行政执法过程中存在以下违法事实：

第一，未按照法定程序进行执法。被申请人在现场检查时未出示执法证件、未告知相关权利义务，违反了法定程序。

第二，行政处罚的依据不足。申请人已提交进货台账证明所购食品原料均在保质期内，被申请人仅凭一名执法人员的主观判断即作出处罚决定，缺乏客观证据支持。

第三，被申请人未履行充分听取当事人意见的义务，对申请人的陈述申辩未予实质审查。

综上所述，被申请人的行政处罚行为违反法定程序，认定事实不清，证据不足。申请人依据《中华人民共和国行政复议法》第九条、第十一条之规定，特向贵机关申请行政复议，恳请依法撤销被申请人作出的行政处罚决定。

此致
广州市人民政府

申请人：张某某
2024年6月1日
"""


def make_test_pdf():
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    rect = fitz.Rect(50, 50, 545, 792)
    page.insert_textbox(rect, PDF_LEGAL_CONTENT, fontsize=11, fontname="china-s", align=0)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    buf.seek(0)
    return buf.read(), len(buf.getvalue())


async def login(client: httpx.AsyncClient) -> str:
    print("\n[Step 1] Login")
    try:
        resp = await client.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "admin", "password": "123456"},
        )
        data = resp.json()
        if resp.status_code == 200 and "token" in data:
            print(f"  {PASS} Logged in as '{data['user']['username']}'")
            return data["token"]
        else:
            print(f"  {FAIL} Login failed: {resp.status_code} {json.dumps(data, ensure_ascii=False)[:200]}")
            return ""
    except Exception as e:
        print(f"  {FAIL} Login error: {e}")
        return ""


async def health_check(client: httpx.AsyncClient) -> bool:
    print("\n[Step 0] Health check")
    try:
        resp = await client.get(f"{BASE_URL}/api/health")
        if resp.status_code == 200:
            print(f"  {PASS} Server OK: {resp.json()}")
            return True
        else:
            print(f"  {FAIL} Server not healthy: {resp.status_code}")
            return False
    except Exception as e:
        print(f"  {FAIL} Cannot reach server at {BASE_URL}: {e}")
        return False


async def create_test_case(client: httpx.AsyncClient, token: str) -> dict:
    print("\n[Step 2] Create test case")
    try:
        resp = await client.post(
            f"{BASE_URL}/api/cases",
            json={"case_name": "E2E测试-行政复议案件", "case_type": "招标投诉"},
            headers={"Authorization": f"Bearer {token}"},
        )
        data = resp.json()
        if resp.status_code == 200 and data.get("case"):
            case = data["case"]
            print(f"  {PASS} Created case id={case['id']}: {case['case_name']}")
            return case
        else:
            print(f"  {FAIL} Create case failed: {resp.status_code} {json.dumps(data, ensure_ascii=False)[:200]}")
            return {}
    except Exception as e:
        print(f"  {FAIL} Create case error: {e}")
        return {}


async def upload_pdf(client: httpx.AsyncClient, token: str, case_id: int, pdf_bytes: bytes) -> dict:
    print("\n[Step 3] Upload test PDF")
    try:
        files = {"files": ("E2E_test_行政复议申请书.pdf", pdf_bytes, "application/pdf")}
        resp = await client.post(
            f"{BASE_URL}/api/cases/{case_id}/upload",
            files=files,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
        )
        data = resp.json()
        if resp.status_code == 200:
            docs = data.get("documents", [])
            doc_ids = [d["id"] for d in docs]
            print(f"  {PASS} Uploaded {len(docs)} document(s), ids={doc_ids}")
            return data
        else:
            print(f"  {FAIL} Upload failed: {resp.status_code} {json.dumps(data, ensure_ascii=False)[:300]}")
            return {}
    except Exception as e:
        print(f"  {FAIL} Upload error: {e}")
        return {}


async def wait_for_processing_complete(client: httpx.AsyncClient, token: str, case_id: int, timeout_sec=300) -> dict:
    print(f"\n[Step 4] Wait for full processing (OCR + Vector, timeout={timeout_sec}s)")
    start = time.time()
    last_status = ""
    while time.time() - start < timeout_sec:
        try:
            resp = await client.get(
                f"{BASE_URL}/api/cases/{case_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            if resp.status_code == 200:
                case = resp.json()
                progress = case.get("progress", 0)
                status = case.get("status", "")

                elapsed = int(time.time() - start)
                status_msg = f"progress={progress}% status={status} ({elapsed}s)"
                if status_msg != last_status:
                    print(f"  {status_msg}")
                    last_status = status_msg

                if progress >= 100 and status == "已完成":
                    docs = case.get("documents", [])
                    ocr_done = [d for d in docs if d.get("ocr_done")]
                    print(f"  {PASS} Processing complete: {len(ocr_done)}/{len(docs)} docs OCR'd")
                    return case
                elif status == "failed":
                    proc = case.get("processing_status", {})
                    print(f"  {FAIL} Processing failed: {proc.get('error_message', 'unknown')}")
                    return case

                await asyncio.sleep(3)
            else:
                print(f"  {FAIL} Status check error: {resp.status_code}")
                break
        except Exception as e:
            print(f"  {FAIL} Status check error: {e}")
            break

    print(f"  {FAIL} Processing timed out after {timeout_sec}s")
    return {}


async def verify_auto_vector_kb(case_id: int) -> bool:
    print("\n[Step 5] Verify auto-built knowledge base")
    try:
        abs_dir = os.path.dirname(os.path.abspath(__file__))
        parent_dir = os.path.dirname(abs_dir)
        if parent_dir not in sys.path:
            sys.path.insert(0, parent_dir)
        if abs_dir not in sys.path:
            sys.path.insert(0, abs_dir)
        from app.services.vector_service import vector_service

        from chromadb import PersistentClient
        client = PersistentClient(path=vector_service.chroma_path)
        collection = client.get_collection(f"case_{case_id}")
        count = collection.count()
        print(f"  {PASS} Knowledge base 'case_{case_id}' auto-created with {count} chunks")
        return True
    except Exception as e:
        print(f"  {FAIL} Knowledge base verification error: {e}")
        return False


async def test_rag_analysis(client: httpx.AsyncClient, token: str, case_id: int) -> bool:
    print("\n[Step 6] Test RAG-enhanced case analysis")
    queries = [
        "本案中申请人提出了哪些复议请求",
        "被申请人在执法过程中存在哪些程序违法",
        "本案涉及哪些法律依据",
        "罚款金额是多少，处罚依据是什么",
    ]

    all_ok = True
    for query in queries:
        try:
            resp = await client.post(
                f"{BASE_URL}/api/cases/{case_id}/analyze",
                json={"query": query, "stream": False},
                headers={"Authorization": f"Bearer {token}"},
                timeout=120.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                answer = data.get("answer", "")
                chunks = data.get("retrieved_chunks", [])
                top_score = chunks[0]["score"] if chunks else 0
                print(f"  Query: '{query}'")
                print(f"    Retrieved: {len(chunks)} chunks, top_score={top_score:.4f}")
                answer_preview = answer[:200].replace("\n", " ")
                print(f"    Answer: {answer_preview}...")
                print(f"    {PASS}")
            else:
                print(f"  {FAIL} Query '{query}' failed: {resp.status_code} {resp.text[:200]}")
                all_ok = False
        except Exception as e:
            print(f"  {FAIL} Query '{query}' error: {e}")
            all_ok = False

    return all_ok


async def test_element_extraction(client: httpx.AsyncClient, token: str, case_id: int) -> bool:
    print("\n[Step 7] Test case element extraction (4 sections: complainant, respondent, project_info, complaint_items)")
    try:
        resp = await client.post(
            f"{BASE_URL}/api/cases/{case_id}/extract-elements",
            headers={"Authorization": f"Bearer {token}"},
            timeout=180.0,
        )
        if resp.status_code == 200:
            data = resp.json()
            elements = data.get("elements", {})

            complainant = elements.get("complainant", {})
            respondent = elements.get("respondent", {})
            project_info = elements.get("project_info", {})
            complaint_items = elements.get("complaint_items", [])

            print(f"  complainant.companyName = '{complainant.get('companyName', '')}'")
            print(f"  complainant.address = '{complainant.get('address', '')}'")
            print(f"  complainant.complaintDate = '{complainant.get('complaintDate', '')}'")
            print(f"  complainant.hasProtested = '{complainant.get('hasProtested', '')}'")
            print(f"  respondent.companyName = '{respondent.get('companyName', '')}'")
            print(f"  respondent.address = '{respondent.get('address', '')}'")
            print(f"  project_info.projectName = '{project_info.get('projectName', '')}'")
            print(f"  project_info.projectCode = '{project_info.get('projectCode', '')}'")
            print(f"  project_info.biddingCompany = '{project_info.get('biddingCompany', '')}'")
            print(f"  project_info.purchaser = '{project_info.get('purchaser', '')}'")
            print(f"  project_info.agency = '{project_info.get('agency', '')}'")
            print(f"  complaint_items = {len(complaint_items)} items")
            for i, item in enumerate(complaint_items):
                print(f"    [{i+1}] title='{item.get('title','')[:50]}' content='{item.get('content','')[:60]}' legalBasis='{item.get('legalBasis','')[:60]}'")

            has_complainant = bool(complainant.get("companyName") or complainant.get("address"))
            has_respondent = bool(respondent.get("companyName") or respondent.get("address"))
            has_project = bool(project_info.get("projectName") or project_info.get("projectCode"))
            has_items = len(complaint_items) > 0

            filled = sum([has_complainant, has_respondent, has_project, has_items])
            print(f"  Sections with data: {filled}/4")
            print(f"  {PASS if filled >= 2 else FAIL} Element extraction")
            return filled >= 2
        else:
            print(f"  {FAIL} Extract failed: {resp.status_code} {resp.text[:300]}")
            return False
    except Exception as e:
        print(f"  {FAIL} Extract error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def cleanup(client: httpx.AsyncClient, token: str, case_id: int):
    print(f"\n[Cleanup] Deleting test case {case_id}")
    try:
        resp = await client.delete(
            f"{BASE_URL}/api/cases/{case_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code == 200:
            print(f"  {PASS} Cleaned up case {case_id}")
        else:
            print(f"  [info] Delete returned {resp.status_code}")
    except Exception as e:
        print(f"  [info] Cleanup error: {e}")


def print_summary(stages: dict):
    print("\n" + "=" * 60)
    print("  E2E Pipeline Test Summary")
    print("=" * 60)
    for name, ok in stages.items():
        marker = PASS if ok else FAIL
        print(f"  {marker} {name}")
    passed = sum(1 for v in stages.values() if v)
    print(f"  ---")
    print(f"  Result: {passed}/{len(stages)} stages passed")
    if passed == len(stages):
        print("  All stages passed - pipeline is fully connected!")
    else:
        print("  Some stages failed - check logs above")
    print("=" * 60)


async def main():
    print("=" * 60)
    print("  E2E Pipeline Test: Upload -> OCR -> Auto-Vector -> RAG Analysis")
    print(f"  Server: {BASE_URL}")
    print("=" * 60)

    stages = {}
    case_id = 0

    async with httpx.AsyncClient(timeout=120.0) as client:
        stages["Health check"] = await health_check(client)
        if not stages["Health check"]:
            print("\n  Server not running. Start the backend and try again.")
            print_summary(stages)
            return

        token = await login(client)
        stages["Login"] = bool(token)
        if not token:
            print_summary(stages)
            return

        case = await create_test_case(client, token)
        stages["Create case"] = bool(case)
        if not case:
            print_summary(stages)
            return
        case_id = case["id"]

        pdf_bytes, pdf_size = make_test_pdf()
        print(f"  Generated test PDF: {pdf_size} bytes")

        upload_data = await upload_pdf(client, token, case_id, pdf_bytes)
        stages["Upload PDF"] = bool(upload_data and upload_data.get("documents"))
        if not stages["Upload PDF"]:
            await cleanup(client, token, case_id)
            print_summary(stages)
            return

        processed_case = await wait_for_processing_complete(client, token, case_id, timeout_sec=300)
        stages["OCR + Auto-Vector"] = bool(processed_case and processed_case.get("progress", 0) >= 100)

        if stages["OCR + Auto-Vector"]:
            stages["Verify KB"] = await verify_auto_vector_kb(case_id)
        else:
            stages["Verify KB"] = False

        if stages.get("Verify KB"):
            stages["RAG Analysis"] = await test_rag_analysis(client, token, case_id)
        else:
            stages["RAG Analysis"] = False

        if stages.get("Verify KB"):
            stages["Element Extraction"] = await test_element_extraction(client, token, case_id)
        else:
            stages["Element Extraction"] = False

        await cleanup(client, token, case_id)

    print_summary(stages)


if __name__ == "__main__":
    asyncio.run(main())
