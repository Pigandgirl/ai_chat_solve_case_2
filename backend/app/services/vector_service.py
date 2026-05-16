import os
import logging
from typing import List, Optional

import httpx

try:
    import chromadb
    from chromadb import EmbeddingFunction
    HAS_CHROMADB = True
except ImportError:
    chromadb = None
    EmbeddingFunction = None
    HAS_CHROMADB = False

try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    HAS_LANGCHAIN = True
except ImportError:
    RecursiveCharacterTextSplitter = None
    HAS_LANGCHAIN = False

from ..config import settings

logger = logging.getLogger(__name__)


class SiliconFlowEmbeddingFunction(EmbeddingFunction):
    def __init__(self, api_key: str, base_url: str, model_name: str):
        self.api_key = api_key
        self.base_url = base_url
        self.model_name = model_name
        self._client = httpx.Client(timeout=120.0)

    def _embed_single(self, text: str) -> Optional[List[float]]:
        payload = {
            "model": self.model_name,
            "input": [text],
            "encoding_format": "float",
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            response = self._client.post(
                f"{self.base_url}/embeddings",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            if "data" in data and len(data["data"]) > 0:
                return data["data"][0]["embedding"]
        except Exception as e:
            logger.error(f"[Vector] Embedding API error for text[{len(text)} chars]: {e}")
        return None

    def __call__(self, input: List[str]) -> List[List[float]]:
        if not input or all(not t or not t.strip() for t in input):
            return [[0.0] * 1024 for _ in input]

        embeddings: List[List[float]] = []
        zero_vec = [0.0] * 1024
        success_count = 0

        for idx, text in enumerate(input):
            if not text or not text.strip():
                embeddings.append(zero_vec)
                continue
            result = self._embed_single(text)
            if result is not None:
                embeddings.append(result)
                success_count += 1
            else:
                embeddings.append(zero_vec)

        logger.info(f"[Vector] Embedded {success_count}/{len(input)} chunks, dim=1024")
        return embeddings


class VectorService:

    def __init__(self):
        self.chroma_path = settings.CHROMA_PERSIST_DIR
        if HAS_CHROMADB:
            self.embedding_fn = SiliconFlowEmbeddingFunction(
                api_key=settings.SILICONFLOW_API_KEY,
                base_url=settings.SILICONFLOW_BASE_URL,
                model_name=settings.SILICONFLOW_EMBEDDING_MODEL,
            )
        else:
            self.embedding_fn = None
        if HAS_LANGCHAIN:
            self.text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=512,
                chunk_overlap=50,
                separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
            )
        else:
            self.text_splitter = None
        os.makedirs(self.chroma_path, exist_ok=True)

    def _get_client(self) -> chromadb.PersistentClient:
        return chromadb.PersistentClient(path=self.chroma_path)

    @staticmethod
    def _extract_text_from_ocr_result(ocr_result: dict) -> str:
        texts = []
        for page in ocr_result.get("pages", []):
            page_text = page.get("text", "")
            if page_text:
                texts.append(page_text)
        return "\n\n".join(texts)

    def create_knowledge_base(self, case_id: int, documents_ocr: List[dict], progress_callback=None) -> str:
        if not HAS_CHROMADB or not HAS_LANGCHAIN:
            raise RuntimeError("chromadb and langchain are required for vector operations")

        collection_name = f"case_{case_id}"
        all_chunks = []
        all_metadatas = []

        for doc_data in documents_ocr:
            doc_id = doc_data.get("document_id", "unknown")
            doc_name = doc_data.get("file_name", "unknown")
            ocr_result = doc_data.get("ocr_result", {})

            full_text = self._extract_text_from_ocr_result(ocr_result)
            if not full_text.strip():
                logger.warning(f"[Vector] No text in document {doc_id}")
                continue

            chunks = self.text_splitter.split_text(full_text)
            logger.info(f"[Vector] Document '{doc_name}' split into {len(chunks)} chunks")

            for chunk_idx, chunk in enumerate(chunks):
                all_chunks.append(chunk)
                all_metadatas.append({
                    "case_id": case_id,
                    "document_id": doc_id,
                    "document_name": doc_name,
                    "chunk_index": chunk_idx,
                })

        if not all_chunks:
            logger.warning(f"[Vector] No chunks to index for case {case_id}")
            return collection_name

        client = self._get_client()

        try:
            client.delete_collection(collection_name)
        except Exception:
            pass

        collection = client.create_collection(
            name=collection_name,
            embedding_function=self.embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )

        ids = [f"case{case_id}_doc{d['document_id']}_chunk{d['chunk_index']}" for d in all_metadatas]

        batch_size = 50
        total_chunks = len(all_chunks)
        for i in range(0, total_chunks, batch_size):
            batch_end = min(i + batch_size, total_chunks)
            collection.add(
                ids=ids[i:batch_end],
                documents=all_chunks[i:batch_end],
                metadatas=all_metadatas[i:batch_end],
            )
            logger.info(f"[Vector] Indexed chunks {i + 1}-{batch_end}/{total_chunks}")
            if progress_callback:
                progress_callback(batch_end, total_chunks)

        logger.info(f"[Vector] Knowledge base '{collection_name}' created with {total_chunks} chunks")
        return collection_name

    def retrieve_law(self, case_id: int, query: str, top_k: int = 3) -> List[dict]:
        if not HAS_CHROMADB:
            logger.warning("[Vector] chromadb not available for retrieval")
            return []

        collection_name = f"case_{case_id}"

        client = self._get_client()

        try:
            collection = client.get_collection(
                name=collection_name,
                embedding_function=self.embedding_fn,
            )
        except Exception:
            logger.warning(f"[Vector] Collection '{collection_name}' not found")
            return []

        results = collection.query(
            query_texts=[query],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

        retrieved = []
        if results and results["documents"] and results["documents"][0]:
            for i in range(len(results["documents"][0])):
                retrieved.append({
                    "content": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "score": 1.0 - results["distances"][0][i] if results["distances"] else 0.0,
                })

        logger.info(f"[Vector] Retrieved {len(retrieved)} results for query: '{query[:50]}...'")
        return retrieved


vector_service = VectorService()
