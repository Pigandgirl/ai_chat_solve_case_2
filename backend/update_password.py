import psycopg2

hashed = "$2b$12$ndRC0ta6/EFtp0A8heC5OuTUVKqun37DSejdnYH//VEA3.TFjX6k."

conn = psycopg2.connect(
    host="postgres",
    user="law_user",
    password="law_pass_2024",
    database="law_case_system"
)
cur = conn.cursor()
cur.execute("UPDATE users SET password = %s WHERE username = %s", (hashed, "admin"))
conn.commit()
print("Password updated successfully")
cur.close()
conn.close()
