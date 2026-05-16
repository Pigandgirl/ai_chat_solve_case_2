"""
Case element extraction service.
Uses RAG retrieval + LLM to extract structured info from uploaded documents.
Populates: complainant, respondent, project_info, complaint_items
"""
import json
import re
import logging
from typing import Dict, Any, List

from ..config import settings
from .vector_service import vector_service
from .llm_client import llm_client
from .element_prompts import (
    SYSTEM_PROMPT,
    SECTION_QUERIES,
    SECTION_PROMPTS,
)

logger = logging.getLogger(__name__)

DEFAULT_COMPLAINANT = {"companyName": "", "address": "", "complaintDate": "", "hasProtested": ""}
DEFAULT_RESPONDENT = {"companyName": "", "address": ""}
DEFAULT_PROJECT_INFO = {"projectName": "", "projectCode": "", "biddingCompany": "", "purchaser": "", "agency": ""}


def _extract_json(text: str) -> Any:
    """Robust JSON extraction from LLM output (handles markdown code blocks, etc.)."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    code_match = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, re.DOTALL)
    if code_match:
        text = code_match.group(1)

    brace_start = text.find("{")
    bracket_start = text.find("[")
    if brace_start == -1 and bracket_start == -1:
        return None

    if bracket_start != -1 and (brace_start == -1 or bracket_start < brace_start):
        start = bracket_start
        depth = 0
        in_string = False
        escape = False
        for i, ch in enumerate(text[start:], start):
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"' and not escape:
                in_string = not in_string
            if not in_string:
                if ch == "[":
                    depth += 1
                elif ch == "]":
                    depth -= 1
                    if depth == 0:
                        candidate = text[start : i + 1]
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            break
    else:
        start = brace_start
        depth = 0
        in_string = False
        escape = False
        for i, ch in enumerate(text[start:], start):
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"' and not escape:
                in_string = not in_string
            if not in_string:
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        candidate = text[start : i + 1]
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            break

    return None


def _build_context(retrieved: List[dict]) -> str:
    """Build context string from retrieved chunks."""
    if not retrieved:
        return "（未检索到相关文档内容）"

    parts = []
    total_len = 0
    max_len = 4000
    for i, chunk in enumerate(retrieved[:10], 1):
        content = chunk["content"]
        if total_len + len(content) > max_len:
            remaining = max_len - total_len
            if remaining > 50:
                parts.append(f"[片段{i}] {content[:remaining]}...")
            break
        parts.append(f"[片段{i}] {content}")
        total_len += len(content)

    return "\n\n".join(parts)


async def _extract_section(case_id: int, section_name: str) -> Any:
    """Extract a single section using RAG + LLM."""
    query = SECTION_QUERIES.get(section_name, "")
    retrieved = vector_service.retrieve_law(case_id, query, top_k=8)

    context = _build_context(retrieved)
    prompt_template = SECTION_PROMPTS.get(section_name, "")
    user_prompt = prompt_template.replace("{context}", context)

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    try:
        raw = await llm_client.chat(messages, max_tokens=1024, temperature=0.1)
        logger.info(f"[Element] {section_name} raw response: {raw[:300]}")

        result = _extract_json(raw)
        if result is None:
            logger.warning(f"[Element] Failed to parse JSON for {section_name}: {raw[:200]}")
            return None

        return result
    except Exception as e:
        logger.error(f"[Element] Extraction failed for {section_name}: {e}")
        return None


async def extract_all_elements(case_id: int) -> Dict[str, Any]:
    """Extract all case elements from the knowledge base."""
    if not settings.MINIMAX_API_KEY:
        logger.warning("[Element] MiniMax API key not configured")
        return {}

    sections = {}

    complainant = await _extract_section(case_id, "complainant")
    if complainant and isinstance(complainant, dict):
        sections["complainant"] = complainant
    else:
        sections["complainant"] = DEFAULT_COMPLAINANT

    respondent = await _extract_section(case_id, "respondent")
    if respondent and isinstance(respondent, dict):
        sections["respondent"] = respondent
    else:
        sections["respondent"] = DEFAULT_RESPONDENT

    project_info = await _extract_section(case_id, "project_info")
    if project_info and isinstance(project_info, dict):
        sections["project_info"] = project_info
    else:
        sections["project_info"] = DEFAULT_PROJECT_INFO

    complaint_items = await _extract_section(case_id, "complaint_items")
    if complaint_items and isinstance(complaint_items, list):
        sections["complaint_items"] = complaint_items
    else:
        sections["complaint_items"] = []

    logger.info(f"[Element] Extracted all elements for case {case_id}: "
                f"complainant={sections.get('complainant')}, "
                f"respondent={sections.get('respondent')}, "
                f"project_info={sections.get('project_info')}, "
                f"complaint_items={len(sections.get('complaint_items', []))} items")
    return sections


case_element_service = {
    "extract_all": extract_all_elements,
}
