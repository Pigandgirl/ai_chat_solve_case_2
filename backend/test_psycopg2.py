import psycopg2

try:
    conn = psycopg2.connect(
        host="host.docker.internal",
        port=5432,
        user="law_user",
        password="law_pass_2024",
        database="law_case_system"
    )
    print("Connection successful!")
    
    cur = conn.cursor()
    cur.execute("SELECT username FROM users")
    rows = cur.fetchall()
    print(f"Users: {rows}")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
