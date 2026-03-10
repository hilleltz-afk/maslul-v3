import sqlite3

conn = sqlite3.connect('maslul.db')
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cur.fetchall()
print('tables:', tables)
cur.execute("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='tenants';")
print('tenants table count:', cur.fetchone()[0])
conn.close()
