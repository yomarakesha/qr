"""
Ulanyjy döretmek / parol çalyşmak üçin skript.

Ulanylyşy:
    python create_user.py <username>              # parol interaktiw soralar
    python create_user.py <username> <password>   # parol argumentden alynar
    python create_user.py --list                  # ulanyjylaryň sanawy
    python create_user.py --delete <username>     # ulanyjyny pozmak
"""

import getpass
import os
import sqlite3
import sys
import time

from werkzeug.security import generate_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "contacts.db"))


def ensure_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at    INTEGER NOT NULL
        )
    """)


def upsert_user(username, password):
    if not username or not username.strip():
        print("Ýalňyşlyk: ulanyjy ady boş bolmaly däl.")
        sys.exit(1)
    if not password or len(password) < 4:
        print("Ýalňyşlyk: parol azyndan 4 simwol bolmaly.")
        sys.exit(1)
    username = username.strip()
    pw_hash = generate_password_hash(password)
    now = int(time.time() * 1000)
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_table(conn)
        row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if row:
            conn.execute("UPDATE users SET password_hash = ? WHERE username = ?", (pw_hash, username))
            action = "täzelendi"
        else:
            conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, pw_hash, now),
            )
            action = "döredildi"
        conn.commit()
        print(f"Ulanyjy '{username}' {action}.")
    finally:
        conn.close()


def list_users():
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_table(conn)
        rows = conn.execute("SELECT username, created_at FROM users ORDER BY username").fetchall()
        if not rows:
            print("(ulanyjylar ýok)")
            return
        print(f"{'USERNAME':<24} CREATED")
        for u, c in rows:
            ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(c / 1000))
            print(f"{u:<24} {ts}")
    finally:
        conn.close()


def delete_user(username):
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_table(conn)
        cur = conn.execute("DELETE FROM users WHERE username = ?", (username,))
        conn.commit()
        if cur.rowcount:
            print(f"Ulanyjy '{username}' pozuldy.")
        else:
            print(f"Ulanyjy '{username}' tapylmady.")
    finally:
        conn.close()


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return
    if args[0] == "--list":
        list_users()
        return
    if args[0] == "--delete":
        if len(args) < 2:
            print("Ulanyş: python create_user.py --delete <username>")
            sys.exit(1)
        delete_user(args[1])
        return

    username = args[0]
    if len(args) >= 2:
        password = args[1]
    else:
        password = getpass.getpass("Parol: ")
        confirm = getpass.getpass("Paroly gaýtalaň: ")
        if password != confirm:
            print("Ýalňyşlyk: parollar gabat gelmeýär.")
            sys.exit(1)
    upsert_user(username, password)


if __name__ == "__main__":
    main()
