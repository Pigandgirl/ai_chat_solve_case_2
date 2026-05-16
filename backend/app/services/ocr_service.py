import io
import base64
import fitz
import numpy as np
from PIL import Image
import cv2
import logging
import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class OCRService:

    @staticmethod
    def _pil_to_base64(pil_image: Image.Image, fmt: str = "PNG") -> str:
        buf = io.BytesIO()
        pil_image.save(buf, format=fmt)
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    @staticmethod
    def _preprocess_image(pil_image: Image.Image) -> Image.Image:
        img = np.array(pil_image)
        if len(img.shape) == 3 and img.shape[2] == 3:
            gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        elif len(img.shape) == 3 and img.shape[2] == 4:
            gray = cv2.cvtColor(img, cv2.COLOR_RGBA2GRAY)
        else:
            gray = img

        denoised = cv2.fastNlMeansDenoising(gray, h=10)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(denoised)
        _, binary = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return Image.fromarray(binary)

    @staticmethod
    def _deskew_image(image: np.ndarray) -> np.ndarray:
        coords = np.column_stack(np.where(image < 128))
        if len(coords) < 100:
            return image
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        angle = -angle if abs(angle) > 0.5 else 0
        if angle == 0:
            return image
        h, w = image.shape[:2]
        center = (w // 2, h // 2)
        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(image, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        return rotated

    @classmethod
    async def _call_siliconflow_ocr(cls, image_b64: str, content_type: str = "image/png") -> str:
        if not settings.SILICONFLOW_API_KEY:
            logger.error("[OCR] SiliconFlow API key not configured")
            return ""

        payload = {
            "model": settings.SILICONFLOW_OCR_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{content_type};base64,{image_b64}",
                                "detail": "high",
                            },
                        },
                        {
                            "type": "text",
                            "text": "<image>\nOCR this image.",
                        },
                    ],
                }
            ],
            "max_tokens": 4096,
            "temperature": 0.1,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.SILICONFLOW_BASE_URL}/chat/completions",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.SILICONFLOW_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            data = response.json()

        if "choices" in data and data["choices"]:
            return data["choices"][0]["message"]["content"]
        return ""

    @classmethod
    async def process_pdf(cls, pdf_bytes: bytes, pdf_name: str, progress_callback=None) -> dict:
        result = {
            "file_name": pdf_name,
            "total_pages": 0,
            "is_scanned": False,
            "pages": [],
            "overall_confidence": 0.0,
        }

        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            total_pages = doc.page_count
            result["total_pages"] = total_pages

            total_text_chars = 0
            for page_num in range(total_pages):
                page = doc[page_num]
                text = page.get_text()
                total_text_chars += len(text.strip())

            avg_chars_per_page = total_text_chars / max(total_pages, 1)
            is_scanned = avg_chars_per_page < 100
            result["is_scanned"] = is_scanned
            logger.info(f"[OCR] PDF '{pdf_name}': {total_pages} pages, avg {avg_chars_per_page:.0f} chars/page, scanned={is_scanned}")

            all_confidences = []

            for page_num in range(total_pages):
                page = doc[page_num]

                if is_scanned:
                    page_result = await cls._process_scanned_page_vlm(doc, page_num)
                else:
                    page_result = cls._process_text_page(page)

                result["pages"].append(page_result)
                if page_result["confidence"] > 0:
                    all_confidences.append(page_result["confidence"])

                if progress_callback:
                    progress_callback(page_num + 1, total_pages)

            doc.close()

            if all_confidences:
                result["overall_confidence"] = round(sum(all_confidences) / len(all_confidences), 4)
            else:
                result["overall_confidence"] = 0.0

            return result

        except Exception as e:
            logger.error(f"[OCR] PDF processing error: {e}")
            result["error"] = str(e)
            return result

    @staticmethod
    def _process_text_page(page: fitz.Page) -> dict:
        page_text = page.get_text("text")
        blocks = page.get_text("blocks")
        page_blocks = []
        for block in blocks:
            if block[6] == 0:
                page_blocks.append({
                    "text": block[4].strip(),
                    "bbox": list(block[:4]),
                    "confidence": 1.0,
                })
        return {
            "page_num": page.number + 1,
            "text": page_text.strip(),
            "confidence": 1.0,
            "blocks": page_blocks,
        }

    @classmethod
    async def _process_scanned_page_vlm(cls, doc: fitz.Document, page_num: int) -> dict:
        page_result = {
            "page_num": page_num + 1,
            "text": "",
            "confidence": 0.0,
            "blocks": [],
        }

        try:
            page = doc[page_num]
            mat = fitz.Matrix(2.0, 2.0)
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

            processed = cls._preprocess_image(img)
            deskewed_np = np.array(processed)
            deskewed_np = cls._deskew_image(deskewed_np)
            deskewed = Image.fromarray(deskewed_np)

            image_b64 = cls._pil_to_base64(deskewed, "PNG")
            ocr_text = await cls._call_siliconflow_ocr(image_b64, "image/png")

            if not ocr_text:
                fallback = page.get_text().strip()
                page_result["text"] = fallback or f"[Page {page_num + 1} - OCR service unavailable]"
                page_result["confidence"] = 0.0
                return page_result

            lines = [line.strip() for line in ocr_text.split("\n") if line.strip()]
            page_result["text"] = "\n".join(lines)

            blocks = []
            for i, line in enumerate(lines):
                confidence = cls._estimate_line_confidence(line)
                blocks.append({
                    "text": line,
                    "bbox": [50, 50 + i * 24, 500, 50 + (i + 1) * 24],
                    "confidence": confidence,
                })
            page_result["blocks"] = blocks

            confidences = [b["confidence"] for b in blocks]
            page_result["confidence"] = round(sum(confidences) / len(confidences), 4) if confidences else 0.0

        except Exception as e:
            logger.error(f"[OCR] Page {page_num + 1} VLM processing error: {e}")
            page_result["text"] = f"[Page {page_num + 1} - OCR error: {str(e)}]"
            page_result["confidence"] = 0.0

        return page_result

    @staticmethod
    def _estimate_line_confidence(text: str) -> float:
        if not text or len(text.strip()) < 2:
            return 0.3
        stripped = text.strip()
        char_count = len(stripped)
        if char_count < 5:
            return 0.5
        if char_count > 100:
            return 0.75
        return 0.85

    @staticmethod
    def get_low_confidence_blocks(ocr_result: dict, threshold: float = None) -> list:
        if threshold is None:
            threshold = settings.OCR_CONFIDENCE_THRESHOLD
        low_conf_blocks = []
        for page in ocr_result.get("pages", []):
            for block in page.get("blocks", []):
                if block.get("confidence", 0) < threshold:
                    low_conf_blocks.append({
                        "page_num": page["page_num"],
                        **block,
                    })
        return low_conf_blocks


ocr_service = OCRService()
