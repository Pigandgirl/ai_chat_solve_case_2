import asyncio
import logging
from typing import AsyncGenerator, Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


class LLMClient:

    def __init__(self):
        self.api_key = settings.MINIMAX_API_KEY
        self.base_url = settings.MINIMAX_BASE_URL
        self.model = settings.MINIMAX_MODEL
        self.max_retries = settings.LLM_MAX_RETRIES

    async def _request(
        self,
        messages: list,
        stream: bool = False,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        timeout: float = 120.0,
    ) -> dict:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()

    async def _request_with_retry(
        self,
        messages: list,
        stream: bool = False,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        timeout: float = 120.0,
    ) -> dict:
        last_exception = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return await self._request(messages, stream, max_tokens, temperature, timeout)
            except httpx.HTTPStatusError as e:
                if e.response.status_code < 500:
                    raise
                last_exception = e
                logger.warning(f"[LLM] HTTP {e.response.status_code}, retry {attempt}/{self.max_retries}")
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_exception = e
                logger.warning(f"[LLM] Network error: {e}, retry {attempt}/{self.max_retries}")

            if attempt < self.max_retries:
                await asyncio.sleep(2 ** (attempt - 1))

        logger.error(f"[LLM] All {self.max_retries} retries exhausted")
        raise last_exception

    async def chat(
        self,
        messages: list,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        timeout: float = 120.0,
    ) -> str:
        if not self.api_key:
            logger.error("[LLM] MiniMax API key not configured")
            return ""

        data = await self._request_with_retry(
            messages=messages,
            stream=False,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=timeout,
        )

        if "choices" in data and data["choices"]:
            return data["choices"][0]["message"]["content"]
        return ""

    async def chat_stream(
        self,
        messages: list,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        timeout: float = 120.0,
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            logger.error("[LLM] MiniMax API key not configured")
            yield ""
            return

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        last_exception = None
        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream(
                        "POST",
                        f"{self.base_url}/chat/completions",
                        json=payload,
                        headers=headers,
                    ) as response:
                        response.raise_for_status()
                        buffer = ""
                        async for chunk in response.aiter_text():
                            if not chunk:
                                continue
                            buffer += chunk
                            while "\n" in buffer:
                                line, buffer = buffer.split("\n", 1)
                                line = line.strip()
                                if line.startswith("data: "):
                                    data_str = line[6:]
                                    if data_str == "[DONE]":
                                        return
                                    try:
                                        import json
                                        data = json.loads(data_str)
                                        if "choices" in data and data["choices"]:
                                            delta = data["choices"][0].get("delta", {})
                                            content = delta.get("content", "")
                                            if content:
                                                yield content
                                    except json.JSONDecodeError:
                                        pass
                return
            except httpx.HTTPStatusError as e:
                if e.response.status_code < 500:
                    raise
                last_exception = e
                logger.warning(f"[LLM Stream] HTTP {e.response.status_code}, retry {attempt}/{self.max_retries}")
            except (httpx.TimeoutException, httpx.ConnectError) as e:
                last_exception = e
                logger.warning(f"[LLM Stream] Network error: {e}, retry {attempt}/{self.max_retries}")

            if attempt < self.max_retries:
                await asyncio.sleep(2 ** (attempt - 1))

        logger.error(f"[LLM Stream] All {self.max_retries} retries exhausted")
        if last_exception:
            yield f"[Error: {last_exception}]"


llm_client = LLMClient()
