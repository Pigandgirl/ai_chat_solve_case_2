import asyncio
import logging
from datetime import datetime

from .celery_app import celery_app
from ..services.minio_service import minio_service
from ..services.ocr_service import ocr_service
from ..services.llm_client import llm_client
from ..config import settings

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.get_event_loop()
    if loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, coro)
            return future.result()
    return loop.run_until_complete(coro)


async def _update_progress(case_id: int, status: str, progress: int, message: str = "", extra: dict = None):
    import asyncpg
    try:
        dsn = settings.DATABASE_URL.replace("+asyncpg", "")
        conn = await asyncpg.connect(dsn)
        await conn.execute(
            """
            INSERT INTO case_processing_status (case_id, status, progress, error_message, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (case_id)
            DO UPDATE SET status = $2, progress = $3, error_message = $4, updated_at = $5
            """,
            case_id, status, progress, message, datetime.utcnow()
        )
        await conn.execute(
            "UPDATE cases SET status = $1, progress = $2, updated_at = $3 WHERE id = $4",
            "处理中" if progress < 100 else "已完成", progress, datetime.utcnow(), case_id
        )

        import redis
        r = redis.from_url(settings.REDIS_URL)
        import json
        payload = {
            "type": "progress",
            "case_id": case_id,
            "progress": progress,
            "status": status,
            "message": message,
        }
        if extra:
            payload.update(extra)
        r.publish(f"case_progress:{case_id}", json.dumps(payload))
        r.close()

        await conn.close()
    except Exception as e:
        logger.error(f"[Progress] Update error for case {case_id}: {e}")


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def process_case_documents(self, case_id: int):
    logger.info(f"[Task] Processing case {case_id} started")

    async def _process():
        import asyncpg
        dsn = settings.DATABASE_URL.replace("+asyncpg", "")
        conn = await asyncpg.connect(dsn)

        try:
            await _update_progress(case_id, "ocr_processing", 5, "正在准备文档处理...")

            documents = await conn.fetch(
                "SELECT id, original_name, storage_path, file_size FROM case_documents WHERE case_id = $1 ORDER BY id",
                case_id
            )

            if not documents:
                await _update_progress(case_id, "failed", 0, "没有找到文档")
                return

            total_docs = len(documents)

            await _update_progress(case_id, "ocr_processing", 8, f"正在统计文档页数... ({total_docs}个文档)")

            doc_page_counts = {}
            total_pages_all = 0
            for doc in documents:
                doc_id = doc["id"]
                doc_path = doc["storage_path"]
                try:
                    pdf_bytes = await minio_service.get_file(doc_path)
                    import fitz as _fitz
                    with _fitz.open(stream=pdf_bytes, filetype="pdf") as probe:
                        pages = probe.page_count
                    doc_page_counts[doc_id] = pages
                    total_pages_all += pages
                except Exception as e:
                    logger.warning(f"[Task] Cannot count pages for doc {doc_id}: {e}")
                    doc_page_counts[doc_id] = 1
                    total_pages_all += 1

            pages_completed = 0
            overall_confidences = []
            total_ocr_pages = 0

            for idx, doc in enumerate(documents):
                doc_id = doc["id"]
                doc_name = doc["original_name"]
                doc_path = doc["storage_path"]
                doc_total_pages = doc_page_counts.get(doc_id, 1)

                def make_page_callback(_doc_id, _doc_total_pages, _doc_name):
                    def on_page(current_page, total_pages):
                        nonlocal pages_completed
                        pages_completed += 1
                        pct = 10 + int(60 * pages_completed / max(total_pages_all, 1))
                        pct = min(pct, 70)
                        asyncio.create_task(_update_progress(
                            case_id, "ocr_processing", pct,
                            f"正在识别: {_doc_name} ({_doc_id}/{total_docs}) 第{current_page}/{total_pages}页"
                        ))
                    return on_page

                page_callback = make_page_callback(idx + 1, doc_total_pages, doc_name)

                try:
                    pdf_bytes = await minio_service.get_file(doc_path)
                    ocr_result = await ocr_service.process_pdf(pdf_bytes, doc_name, progress_callback=page_callback)

                    ocr_path = await minio_service.upload_ocr_result(case_id, doc_id, ocr_result)

                    await conn.execute(
                        """
                        UPDATE case_documents SET
                            ocr_done = TRUE,
                            ocr_result_path = $1,
                            ocr_confidence = $2,
                            page_count = $3,
                            is_scanned = $4,
                            error_message = NULL
                        WHERE id = $5
                        """,
                        ocr_path,
                        ocr_result["overall_confidence"],
                        ocr_result["total_pages"],
                        ocr_result["is_scanned"],
                        doc_id,
                    )

                    overall_confidences.append(ocr_result["overall_confidence"])
                    total_ocr_pages += ocr_result["total_pages"]

                    await _update_progress(
                        case_id, "ocr_processing", min(70, 10 + int(60 * pages_completed / max(total_pages_all, 1))),
                        f"已完成文档: {doc_name} ({idx + 1}/{total_docs})"
                    )

                    try:
                        analysis_pct = min(72, 70 + int(2 * (idx + 1) / max(total_docs, 1)))
                        await _update_progress(case_id, "ocr_processing", analysis_pct,
                                               f"正在AI分析文档: {doc_name} ({(idx + 1)}/{total_docs})")

                        page_texts = []
                        for page in ocr_result.get("pages", []):
                            text = page.get("text", "").strip()
                            if text:
                                page_texts.append(f"--- 第{page.get('page_num', '?')}页 ---\n{text}")
                        all_text = "\n\n".join(page_texts)

                        if all_text and len(all_text) > 50:
                            analysis_system = (
                                "你是一位资深法律案件分析专家，服务于粤省法智能辅助办案系统。"
                                "请基于文档内容进行专业分析，提取核心信息。"
                                "如果文档中缺少某类信息，如实说明'文档未明确提及'。"
                                "分析须严谨、客观，不要编造不存在的事实。"
                            )
                            analysis_prompt = (
                                f"请分析以下文档，该文档属于「{doc.get('category', '未知分类')}」分类：\n\n"
                                f"【文档名称】{doc_name}\n"
                                f"【总页数】{ocr_result.get('total_pages', 0)}页\n\n"
                                f"【文档内容】\n{all_text[:8000]}\n\n"
                                "请按以下结构进行完整分析：\n"
                                "1. **文档概要**：用2-3句话概括本文档的核心内容和性质\n"
                                "2. **核心事实**：本文档陈述的主要事实、主张或发现\n"
                                "3. **涉及主体**：本页提到的企业、机构、人员及其角色\n"
                                "4. **关键数据/日期/金额**：出现的重要数字、金额、日期等\n"
                                "5. **法律依据/政策引用**：引用的法律法规条款或政策文件\n"
                                "6. **与其他材料的关联**：本文档与其他材料目录的关联性说明\n\n"
                                "请用简洁的要点形式输出，每段控制在80字以内。"
                            )
                            analysis_messages = [
                                {"role": "system", "content": analysis_system},
                                {"role": "user", "content": analysis_prompt},
                            ]
                            doc_analysis = await llm_client.chat(analysis_messages, max_tokens=2048, temperature=0.3)
                            import re as _re2
                            doc_analysis = _re2.sub(r'<think>.*?</think>', '', doc_analysis, flags=_re2.DOTALL).strip()

                            await conn.execute(
                                "UPDATE case_documents SET analysis_done = TRUE, document_analysis = $1 WHERE id = $2",
                                doc_analysis, doc_id
                            )
                            logger.info(f"[Task] Document analysis completed for doc {doc_id}: {doc_name}")
                    except Exception as ae:
                        logger.warning(f"[Task] Document analysis failed for doc {doc_id}: {ae}")

                except Exception as doc_error:
                    logger.error(f"[Task] Error processing doc {doc_id}: {doc_error}")
                    pages_completed += doc_total_pages
                    pct = 10 + int(60 * pages_completed / max(total_pages_all, 1))
                    await conn.execute(
                        "UPDATE case_documents SET error_message = $1 WHERE id = $2",
                        str(doc_error), doc_id
                    )
                    await _update_progress(
                        case_id, "ocr_processing", min(pct, 70),
                        f"{doc_name} 处理失败: {str(doc_error)[:100]}"
                    )

            avg_conf = sum(overall_confidences) / len(overall_confidences) if overall_confidences else 0
            await _update_progress(case_id, "ocr_done", 70, f"OCR识别完成，{total_ocr_pages}页，平均置信度: {avg_conf:.2%}")

            low_conf_blocks_count = 0
            ocr_docs_for_vector = []
            for doc in documents:
                doc_row = await conn.fetchrow(
                    "SELECT ocr_result_path FROM case_documents WHERE id = $1", doc["id"]
                )
                if doc_row and doc_row["ocr_result_path"]:
                    try:
                        ocr_data = await minio_service.get_ocr_result(doc_row["ocr_result_path"])
                        low_blocks = ocr_service.get_low_confidence_blocks(ocr_data)
                        low_conf_blocks_count += len(low_blocks)
                        ocr_docs_for_vector.append({
                            "document_id": doc["id"],
                            "file_name": doc["original_name"],
                            "ocr_result": ocr_data,
                        })
                    except Exception:
                        pass

            if ocr_docs_for_vector:
                await _update_progress(case_id, "vector_processing", 72, "正在切割文本...")
                loop = asyncio.get_event_loop()
                try:
                    from ..services.vector_service import vector_service

                    def vector_progress(completed, total):
                        pct = 73 + int(22 * completed / max(total, 1))
                        asyncio.run_coroutine_threadsafe(
                            _update_progress(case_id, "vector_processing", min(pct, 95),
                                             f"正在构建知识库向量... {completed}/{total}"),
                            loop
                        )

                    collection_name = await loop.run_in_executor(
                        None, vector_service.create_knowledge_base, case_id, ocr_docs_for_vector, vector_progress
                    )
                    logger.info(f"[Task] Knowledge base '{collection_name}' created for case {case_id}")

                    await _update_progress(case_id, "auto_analysis", 95, "正在AI分析案件，提取案件名称和摘要...")
                    try:
                        retrieved = await loop.run_in_executor(
                            None,
                            lambda: vector_service.retrieve_law(
                                case_id,
                                "案件核心内容 当事人 争议焦点 案件事实 诉求",
                                top_k=8,
                            ),
                        )
                        if retrieved:
                            context_parts = []
                            for i, chunk in enumerate(retrieved, 1):
                                doc_name = chunk["metadata"].get("document_name", "?")
                                context_parts.append(
                                    f"[片段{i}] 来源:{doc_name}\n{chunk['content']}"
                                )
                            context_text = "\n\n".join(context_parts)

                            user_msg = (
                                f"=== 案件文档内容 ===\n{context_text}\n=== 内容结束 ===\n\n"
                                "请基于以上案件文档内容，提取以下关键信息并以JSON格式返回：\n"
                                '{{"case_name": "简洁的案件名称（25字以内，如：XX公司与XX公司关于XX的招标投诉案）", '
                                '"summary": "案件摘要（200字以内，概括案件类型、当事人双方、争议焦点、涉及金额、项目名称等关键信息）"}}\n'
                                "严格返回JSON格式，不要包含markdown标记或其他文字。"
                            )
                            system_prompt = (
                                "你是一位资深法律案件分析专家，服务于粤省法智能辅助办案系统。"
                                "请基于案件文档严格提取信息，不要编造不存在的事实。"
                                "如果文档中缺少某类信息，在摘要中如实说明'文档未明确提及'。"
                            )
                            messages = [
                                {"role": "system", "content": system_prompt},
                                {"role": "user", "content": user_msg},
                            ]

                            await _update_progress(case_id, "auto_analysis", 96, "正在调用AI大模型分析...")
                            reply = await llm_client.chat(messages, max_tokens=2048, temperature=0.3)

                            if reply:
                                import json as _json
                                import re as _re
                                clean = reply.strip()
                                match = _re.search(r"\{[^{}]*\}", clean, _re.DOTALL)
                                if match:
                                    try:
                                        result = _json.loads(match.group(0))
                                        generated_name = result.get("case_name", "").strip()
                                        generated_summary = result.get("summary", "").strip()

                                        if generated_name and generated_summary:
                                            await conn.execute(
                                                "UPDATE cases SET case_name = $1, summary = $2, updated_at = $3 WHERE id = $4",
                                                generated_name, generated_summary, datetime.utcnow(), case_id
                                            )
                                            logger.info(f"[Task] AI generated name='{generated_name}' for case {case_id}")
                                            await _update_progress(
                                                case_id, "auto_analysis", 98,
                                                f"案件名称: {generated_name}",
                                                extra={"case_name": generated_name, "summary": generated_summary}
                                            )
                                    except _json.JSONDecodeError as je:
                                        logger.warning(f"[Task] Failed to parse AI response JSON: {je}, raw={reply[:200]}")
                            else:
                                logger.warning(f"[Task] LLM returned empty response for case {case_id}")
                        else:
                            logger.warning(f"[Task] No relevant chunks retrieved for case {case_id}")
                    except ImportError:
                        logger.warning(f"[Task] vector_service or llm_client not available for auto-analysis")
                    except Exception as ae:
                        logger.error(f"[Task] Auto-analysis failed for case {case_id}: {ae}")

                    await _update_progress(case_id, "element_extraction", 99, "正在提取案件要素...")
                    try:
                        from ..services.case_element_service import extract_all_elements

                        elements = await extract_all_elements(case_id)
                        if elements:
                            import json as _json3
                            complainant_json = _json3.dumps(elements.get("complainant", {}), ensure_ascii=False)
                            respondent_json = _json3.dumps(elements.get("respondent", {}), ensure_ascii=False)
                            project_info_json = _json3.dumps(elements.get("project_info", {}), ensure_ascii=False)
                            complaint_items_json = _json3.dumps(elements.get("complaint_items", []), ensure_ascii=False)

                            await conn.execute(
                                """
                                UPDATE cases
                                SET complainant = $1::jsonb, respondent = $2::jsonb,
                                    project_info = $3::jsonb, complaint_items = $4::jsonb,
                                    updated_at = $5
                                WHERE id = $6
                                """,
                                complainant_json, respondent_json, project_info_json, complaint_items_json,
                                datetime.utcnow(), case_id
                            )
                            items_count = len(elements.get("complaint_items", []))
                            logger.info(
                                f"[Task] Elements extracted for case {case_id}: "
                                f"complainant={elements.get('complainant', {}).get('companyName', '?')}, "
                                f"respondent={elements.get('respondent', {}).get('companyName', '?')}, "
                                f"project={elements.get('project_info', {}).get('projectName', '?')}, "
                                f"complaint_items={items_count}"
                            )
                            await _update_progress(
                                case_id, "element_extraction", 99,
                                f"案件要素提取完成: {items_count}个投诉事项",
                                extra={
                                    "complainant": elements.get("complainant", {}),
                                    "respondent": elements.get("respondent", {}),
                                    "project_info": elements.get("project_info", {}),
                                    "complaint_items": elements.get("complaint_items", []),
                                }
                            )
                    except ImportError:
                        logger.warning(f"[Task] case_element_service not available for case {case_id}")
                    except Exception as ee:
                        logger.error(f"[Task] Element extraction failed for case {case_id}: {ee}")

                except ImportError:
                    logger.warning(f"[Task] vector_service not available, skipping knowledge base for case {case_id}")
                except Exception as ve:
                    logger.error(f"[Task] Vector indexing failed for case {case_id}: {ve}")

            await _update_progress(case_id, "ai_done", 100, f"处理完成。{total_docs}个文档，{total_ocr_pages}页，{low_conf_blocks_count}处低置信度文本")

        except Exception as e:
            logger.error(f"[Task] Case {case_id} processing failed: {e}")
            await _update_progress(case_id, "failed", 0, f"处理失败: {str(e)[:200]}")
            raise

        finally:
            await conn.close()

    _run_async(_process())
    return {"case_id": case_id, "status": "completed"}
