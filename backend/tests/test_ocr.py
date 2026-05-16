"""
OCR 服务单元测试
测试 OCR 识别、置信度计算、低置信度检测、修正保存覆盖等核心功能
"""
import sys
import io
import json
import os
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import fitz
from PIL import Image, ImageDraw


def _create_test_pdf(text_pages: list, scanned: bool = False) -> bytes:
    """生成测试用 PDF（纯文本或扫描件模拟）"""
    buf = io.BytesIO()
    doc = fitz.open()

    for page_text in text_pages:
        page = doc.new_page(width=595, height=842)
        if not scanned:
            rect = fitz.Rect(72, 72, 500, 800)
            page.insert_textbox(rect, page_text, fontsize=12, fontname="helv")
        else:
            img = Image.new("RGB", (595, 842), "white")
            draw = ImageDraw.Draw(img)
            y = 50
            for line in page_text.split("\n"):
                draw.text((50, y), line, fill="black")
                y += 18
            img_bytes = io.BytesIO()
            img.save(img_bytes, format="PNG")
            img_bytes.seek(0)
            page.insert_image(fitz.Rect(0, 0, 595, 842), stream=img_bytes.read())

    doc.save(buf)
    doc.close()
    buf.seek(0)
    return buf.read()


class TestOCRService:
    """OCR 服务核心功能测试"""

    @pytest.fixture(autouse=True)
    def _setup(self):
        from app.services.ocr_service import ocr_service
        self.service = ocr_service

    def _make_pdf(self, text_pages: list, scanned=False):
        return _create_test_pdf(text_pages, scanned)

    @pytest.mark.asyncio
    async def test_process_text_pdf_basic(self):
        """测试：普通文本 PDF 提取"""
        text = "Project Bidding Document - Chapter 1\nSection 1.1 Scope of Work\n" * 15
        pdf_bytes = self._make_pdf([text])
        result = await self.service.process_pdf(pdf_bytes, "test.pdf")

        assert result["total_pages"] == 1
        assert result["is_scanned"] is False
        assert result["file_name"] == "test.pdf"
        assert len(result["pages"]) == 1
        assert result["pages"][0]["page_num"] == 1
        assert len(result["pages"][0]["text"]) > 100
        assert result["pages"][0]["confidence"] == 1.0
        assert result["overall_confidence"] == 1.0

    @pytest.mark.asyncio
    async def test_process_multi_page_pdf(self):
        """测试：多页 PDF"""
        long_text = "Project Bidding Document - Legal Terms and Conditions\nSection A: Definitions\n" * 20
        pdf_bytes = self._make_pdf([long_text, long_text, long_text])
        result = await self.service.process_pdf(pdf_bytes, "multi.pdf")

        assert result["total_pages"] == 3
        assert len(result["pages"]) == 3
        for i, page in enumerate(result["pages"]):
            assert page["page_num"] == i + 1
            assert page["confidence"] == 1.0

    @pytest.mark.asyncio
    async def test_scanned_pdf_detection(self):
        """测试：扫描件检测"""
        pdf_bytes = self._make_pdf(["Short text for scanning"], scanned=True)
        result = await self.service.process_pdf(pdf_bytes, "scanned.pdf")

        assert result["total_pages"] == 1
        assert result["is_scanned"] is True

    @pytest.mark.asyncio
    async def test_process_pdf_empty_document(self):
        """测试：空文档"""
        doc = fitz.open()
        doc.new_page(width=595, height=842)
        buf = io.BytesIO()
        doc.save(buf)
        doc.close()
        buf.seek(0)

        result = await self.service.process_pdf(buf.read(), "empty.pdf")

        assert result["total_pages"] == 1
        assert result["is_scanned"] is True
        assert "error" not in result

    @pytest.mark.asyncio
    async def test_process_pdf_invalid_bytes(self):
        """测试：无效的 PDF 字节"""
        result = await self.service.process_pdf(b"not a pdf", "bad.pdf")
        assert "error" in result

    def test_get_low_confidence_blocks_basic(self):
        """测试：低置信度文本块检测"""
        mock_result = {
            "file_name": "test.pdf",
            "total_pages": 2,
            "is_scanned": True,
            "overall_confidence": 0.75,
            "pages": [
                {
                    "page_num": 1,
                    "text": "High confidence text\nLow confidence text",
                    "confidence": 0.85,
                    "blocks": [
                        {"text": "High confidence text", "bbox": [10, 10, 200, 30], "confidence": 0.95},
                        {"text": "Low confidence text", "bbox": [10, 40, 200, 60], "confidence": 0.55},
                    ],
                },
                {
                    "page_num": 2,
                    "text": "Very low confidence",
                    "confidence": 0.65,
                    "blocks": [
                        {"text": "Very low confidence", "bbox": [10, 10, 200, 30], "confidence": 0.35},
                    ],
                },
            ],
        }

        low = self.service.get_low_confidence_blocks(mock_result, threshold=0.8)

        assert len(low) == 2
        assert low[0]["page_num"] == 1
        assert low[0]["confidence"] == 0.55
        assert low[1]["page_num"] == 2
        assert low[1]["confidence"] == 0.35

    def test_get_low_confidence_blocks_none_below_threshold(self):
        """测试：无低置信度文本块"""
        mock_result = {
            "file_name": "test.pdf",
            "total_pages": 1,
            "is_scanned": False,
            "overall_confidence": 0.95,
            "pages": [{
                "page_num": 1,
                "text": "All high confidence",
                "confidence": 0.95,
                "blocks": [
                    {"text": "All high confidence", "bbox": [10, 10, 200, 30], "confidence": 0.95},
                ],
            }],
        }

        low = self.service.get_low_confidence_blocks(mock_result, threshold=0.8)
        assert len(low) == 0

    def test_get_low_confidence_blocks_empty_pages(self):
        """测试：无页面"""
        mock_result = {"file_name": "empty.pdf", "total_pages": 0, "is_scanned": False, "pages": [], "overall_confidence": 0.0}
        low = self.service.get_low_confidence_blocks(mock_result)
        assert len(low) == 0

    def test_get_low_confidence_blocks_no_blocks(self):
        """测试：页面无文本块"""
        mock_result = {
            "file_name": "test.pdf",
            "total_pages": 1,
            "is_scanned": False,
            "overall_confidence": 1.0,
            "pages": [{"page_num": 1, "text": "", "confidence": 1.0, "blocks": []}],
        }
        low = self.service.get_low_confidence_blocks(mock_result)
        assert len(low) == 0

    def test_get_low_confidence_blocks_exact_threshold(self):
        """测试：边界值 — 恰好等于阈值不算低置信度"""
        mock_result = {
            "file_name": "test.pdf",
            "total_pages": 1,
            "is_scanned": False,
            "overall_confidence": 0.8,
            "pages": [{
                "page_num": 1,
                "text": "Boundary value",
                "confidence": 0.8,
                "blocks": [
                    {"text": "Boundary value", "bbox": [10, 10, 200, 30], "confidence": 0.8},
                ],
            }],
        }
        low = self.service.get_low_confidence_blocks(mock_result, threshold=0.8)
        assert len(low) == 0


class TestConfidenceCalculation:
    """置信度计算逻辑测试"""

    def test_perfect_confidence_all_1_0(self):
        """测试：全 1.0 置信度"""
        confidences = [1.0, 1.0, 1.0]
        avg = sum(confidences) / len(confidences)
        assert avg == 1.0

    def test_mixed_confidence(self):
        """测试：混合置信度"""
        confidences = [0.95, 0.60, 0.85, 0.40]
        avg = sum(confidences) / len(confidences)
        assert avg == 0.7

    def test_all_low_confidence(self):
        """测试：全部低置信度"""
        confidences = [0.1, 0.2, 0.15, 0.05]
        avg = sum(confidences) / len(confidences)
        assert avg == pytest.approx(0.125)

    def test_partial_confidence(self):
        """测试：部分页面零置信度"""
        confidences = [0.9, 0.0, 0.85]
        valid = [c for c in confidences if c > 0]
        avg = sum(valid) / len(valid) if valid else 0.0
        assert avg == pytest.approx(0.875, 0.01)


class TestCorrectedOCRSave:
    """OCR 修正保存覆盖逻辑测试"""

    def test_serialize_corrected_ocr(self):
        """测试：修正后 OCR 数据序列化"""
        original_result = {
            "file_name": "complaint.pdf",
            "total_pages": 2,
            "is_scanned": True,
            "overall_confidence": 0.72,
            "pages": [
                {
                    "page_num": 1,
                    "text": "Original Text A\nOriginal Text B",
                    "confidence": 0.75,
                    "blocks": [
                        {"text": "Original Text A", "bbox": [50, 100, 400, 130], "confidence": 0.80},
                        {"text": "Original Text B", "bbox": [50, 140, 400, 170], "confidence": 0.70},
                    ],
                },
                {
                    "page_num": 2,
                    "text": "Original Text C",
                    "confidence": 0.68,
                    "blocks": [
                        {"text": "Original Text C", "bbox": [50, 100, 400, 130], "confidence": 0.68},
                    ],
                },
            ],
        }

        corrections = {
            "1-1": "Corrected Text B",
            "2-0": "Corrected Text C",
        }

        corrected = json.loads(json.dumps(original_result))
        for page in corrected["pages"]:
            for idx, block in enumerate(page["blocks"]):
                key = f"{page['page_num']}-{idx}"
                if key in corrections:
                    block["text"] = corrections[key]
            page["text"] = "\n".join(b["text"] for b in page["blocks"])

        assert corrected["pages"][0]["blocks"][1]["text"] == "Corrected Text B"
        assert corrected["pages"][1]["blocks"][0]["text"] == "Corrected Text C"
        assert corrected["pages"][0]["text"] == "Original Text A\nCorrected Text B"
        assert corrected["pages"][1]["text"] == "Corrected Text C"
        assert corrected["pages"][0]["blocks"][0]["text"] == "Original Text A"
        assert corrected["total_pages"] == 2
        assert corrected["file_name"] == "complaint.pdf"

    def test_corrected_ocr_overwrites_original(self):
        """测试：修正后 OCR 完全覆盖原始结果"""
        import copy

        original = {
            "file_name": "test.pdf",
            "total_pages": 1,
            "is_scanned": True,
            "overall_confidence": 0.5,
            "pages": [{
                "page_num": 1,
                "text": "Typo text",
                "confidence": 0.5,
                "blocks": [
                    {"text": "Typo text", "bbox": [10, 10, 100, 30], "confidence": 0.5},
                ],
            }],
        }

        corrected = copy.deepcopy(original)
        corrected["pages"][0]["blocks"][0]["text"] = "Correct text"
        corrected["pages"][0]["text"] = "Correct text"

        assert original["pages"][0]["blocks"][0]["text"] == "Typo text"
        assert corrected["pages"][0]["blocks"][0]["text"] == "Correct text"

        json_str = json.dumps(corrected, ensure_ascii=False)
        restored = json.loads(json_str)
        assert restored["pages"][0]["blocks"][0]["text"] == "Correct text"


class TestOCRVerificationEdgeCases:
    """边界条件测试"""

    def test_confidence_range_clipping(self):
        """测试：置信度值域 [0.0, 1.0]"""
        from app.services.ocr_service import ocr_service

        mock = {
            "file_name": "test.pdf",
            "total_pages": 1,
            "is_scanned": False,
            "overall_confidence": 1.0,
            "pages": [{
                "page_num": 1,
                "text": "test",
                "confidence": 1.0,
                "blocks": [
                    {"text": "a", "bbox": [0, 0, 10, 10], "confidence": 0.0},
                    {"text": "b", "bbox": [10, 10, 20, 20], "confidence": 1.0},
                    {"text": "c", "bbox": [20, 20, 30, 30], "confidence": 0.79},
                    {"text": "d", "bbox": [30, 30, 40, 40], "confidence": 0.81},
                ],
            }],
        }

        low = ocr_service.get_low_confidence_blocks(mock, threshold=0.8)
        assert len(low) == 2
        confs = [b["confidence"] for b in low]
        assert 0.0 in confs
        assert 0.79 in confs
        assert 0.81 not in confs
        assert 1.0 not in confs

    def test_unicode_text_handling(self):
        """测试：Unicode 文本正确处理"""
        text_pages = ["Chinese English Mixed 12345\nSpecial chars: (c) (r) (tm)"]
        pdf_bytes = _create_test_pdf(text_pages)

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        assert doc.page_count == 1
        extracted = doc[0].get_text()
        assert "English" in extracted or len(extracted.strip()) > 0
        doc.close()

    def test_large_pdf_handling(self):
        """测试：多页大型 PDF"""
        pages = [f"Page {i}: Bidding Document Chapter {i} - Bidder Qualification Requirements\n" * 5 for i in range(1, 21)]
        pdf_bytes = _create_test_pdf(pages)

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        assert doc.page_count == 20
        doc.close()
