import asyncio
import asyncpg

async def test_connection():
    print("Testing asyncpg connection...")
    try:
        conn = await asyncpg.connect(
            host='localhost',
            port=5432,
            user='law_user',
            password='law_pass_2024',
            database='law_case_system',
            timeout=30
        )
        print("✓ Connection established!")

        # Test query
        result = await conn.fetch("SELECT * FROM users LIMIT 1")
        print(f"✓ Query successful: {result}")

        await conn.close()
        print("✓ Connection closed")
        return True
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

asyncio.run(test_connection())
