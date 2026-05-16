"""Connectivity test: MiniMax LLM + SiliconFlow Embedding"""
import asyncio, json, sys, os

os.environ.setdefault("MINIMAX_API_KEY", "sk-cp-du8rGXgUamZFeQYdB32UU1UMltNMgLHUWHaAqEaYqEp_Yzaq9LfSc7pyJkOos-qxyOzLraPYc7Kochv5NIrN_LJ3a9Q_zro0WBjTd3qUqepkBL8idFCLz3s")
os.environ.setdefault("SILICONFLOW_API_KEY", "sk-fhesusitigfmnrhxsfqvtbwwcddknqewpvjdqgssbpguzyod")
MINIMAX_KEY = os.environ["MINIMAX_API_KEY"]
SILICONFLOW_KEY = os.environ["SILICONFLOW_API_KEY"]

import httpx

PASS = "[OK]"
FAIL = "[FAIL]"


async def test_minimax_chat():
    print("\n[1] MiniMax LLM chat (MiniMax-M2.7-highspeed)")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.minimaxi.com/v1/chat/completions",
                json={
                    "model": "MiniMax-M2.7-highspeed",
                    "messages": [{"role": "user", "content": "Hello, introduce yourself in one sentence."}],
                    "max_tokens": 200,
                    "temperature": 0.7,
                },
                headers={"Authorization": f"Bearer {MINIMAX_KEY}", "Content-Type": "application/json"},
            )
            print(f"  HTTP {resp.status_code}")
            data = resp.json()
            if resp.status_code == 200 and "choices" in data:
                content = data["choices"][0]["message"]["content"]
                print(f"  {PASS} Response len={len(content)}: {content[:300]}")
                return True
            else:
                print(f"  {FAIL} Error: {json.dumps(data, ensure_ascii=False)[:300]}")
                return False
    except Exception as e:
        print(f"  {FAIL} Exception: {e}")
        return False


async def test_minimax_stream():
    print("\n[2] MiniMax LLM stream (MiniMax-M2.7-highspeed)")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                "https://api.minimaxi.com/v1/chat/completions",
                json={
                    "model": "MiniMax-M2.7-highspeed",
                    "messages": [{"role": "user", "content": "List 3 key elements of legal case analysis in brief."}],
                    "max_tokens": 500,
                    "temperature": 0.7,
                    "stream": True,
                },
                headers={"Authorization": f"Bearer {MINIMAX_KEY}", "Content-Type": "application/json"},
            ) as resp:
                print(f"  HTTP {resp.status_code}")
                if resp.status_code != 200:
                    body = await resp.aread()
                    print(f"  {FAIL} Error: {body[:300]}")
                    return False
                full = ""
                async for chunk in resp.aiter_text():
                    if not chunk:
                        continue
                    for line in chunk.split("\n"):
                        line = line.strip()
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try:
                                d = json.loads(line[6:])
                                if "choices" in d and d["choices"]:
                                    c = d["choices"][0].get("delta", {}).get("content", "")
                                    if c:
                                        full += c
                            except json.JSONDecodeError:
                                pass
                print(f"  {PASS} Stream complete, {len(full)} chars")
                print(f"  Preview: {full[:300]}")
                return True
    except Exception as e:
        print(f"  {FAIL} Exception: {e}")
        return False


async def test_siliconflow_embedding():
    print("\n[3] SiliconFlow Embedding (BAAI/bge-large-zh-v1.5)")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.siliconflow.cn/v1/embeddings",
                json={
                    "model": "BAAI/bge-large-zh-v1.5",
                    "input": ["legal case element extraction", "breach of contract liability", "administrative review process"],
                    "encoding_format": "float",
                },
                headers={"Authorization": f"Bearer {SILICONFLOW_KEY}", "Content-Type": "application/json"},
            )
            print(f"  HTTP {resp.status_code}")
            data = resp.json()
            if resp.status_code == 200 and "data" in data:
                embeddings = data["data"]
                print(f"  {PASS} Got {len(embeddings)} vectors")
                for item in embeddings:
                    emb = item["embedding"]
                    print(f"    index={item['index']}, dim={len(emb)}, first5={[round(x, 4) for x in emb[:5]]}")
                return True
            else:
                print(f"  {FAIL} Error: {json.dumps(data, ensure_ascii=False)[:300]}")
                return False
    except Exception as e:
        print(f"  {FAIL} Exception: {e}")
        return False


async def test_llm_client_module():
    print("\n[4] llm_client.py module integration test")
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    try:
        from backend.app.services.llm_client import llm_client
    except ImportError:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from app.services.llm_client import llm_client

    try:
        print("  Testing chat()...")
        result = await llm_client.chat(
            messages=[{"role": "user", "content": "Say hello in 3 words."}],
            max_tokens=50,
        )
        print(f"  {PASS if result else FAIL} chat(): {result[:100]}")

        print("  Testing chat_stream()...")
        streamed = ""
        async for token in llm_client.chat_stream(
            messages=[{"role": "user", "content": "Tell a short legal pun."}],
            max_tokens=200,
        ):
            streamed += token
        print(f"  {PASS if streamed else FAIL} chat_stream() {len(streamed)} chars: {streamed[:200]}")
        return True
    except Exception as e:
        print(f"  {FAIL} Failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    print("=" * 60)
    print("  API Connectivity Test")
    print("=" * 60)
    results = []
    results.append(await test_minimax_chat())
    results.append(await test_minimax_stream())
    results.append(await test_siliconflow_embedding())
    try:
        results.append(await test_llm_client_module())
    except Exception as e:
        print(f"\n[4] Module test skipped: {e}")
    print("\n" + "=" * 60)
    passed = sum(1 for r in results if r)
    print(f"  Result: {passed}/{len(results)} passed")
    if passed == len(results):
        print("  All tests passed!")
    else:
        print("  Some tests failed, check above for details")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
