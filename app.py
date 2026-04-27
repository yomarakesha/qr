import io
import os
import re
import sqlite3
import time
from functools import wraps
from flask import Flask, g, jsonify, request, send_file, render_template, abort, session, redirect, url_for
from werkzeug.security import check_password_hash

import qrcode
from qrcode.constants import ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q, ERROR_CORRECT_H
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "contacts.db"))

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

ECL_MAP = {"L": ERROR_CORRECT_L, "M": ERROR_CORRECT_M, "Q": ERROR_CORRECT_Q, "H": ERROR_CORRECT_H}


def get_db():
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
    return db


@app.teardown_appcontext
def close_db(exc):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name   TEXT NOT NULL DEFAULT '',
            last_name   TEXT NOT NULL DEFAULT '',
            first_name  TEXT NOT NULL DEFAULT '',
            title       TEXT DEFAULT '',
            department  TEXT DEFAULT '',
            phone       TEXT DEFAULT '',
            email       TEXT DEFAULT '',
            file_name   TEXT DEFAULT '',
            size        INTEGER DEFAULT 600,
            ecl         TEXT DEFAULT 'M',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at    INTEGER NOT NULL
        )
    """)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(contacts)").fetchall()]
    if "full_name" not in cols:
        conn.execute("ALTER TABLE contacts ADD COLUMN full_name TEXT NOT NULL DEFAULT ''")
    if "qr_mode" not in cols:
        conn.execute("ALTER TABLE contacts ADD COLUMN qr_mode TEXT NOT NULL DEFAULT 'text'")
    conn.execute("""
        UPDATE contacts
           SET full_name = TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,''))
         WHERE (full_name IS NULL OR full_name = '')
    """)
    conn.commit()
    conn.close()


PHONE_RE = re.compile(r"^\+?[0-9 ()\-]+$")
QR_MODES = {"vcard", "text", "tel"}


def validate(data, partial=False):
    errors = {}
    if not partial or "fullName" in data:
        if not (data.get("fullName") or "").strip():
            errors["fullName"] = "Ady hökmany"
    phone = (data.get("phone") or "").strip()
    if phone:
        if not PHONE_RE.match(phone) or len(re.sub(r"\D", "", phone)) < 6:
            errors["phone"] = "Nädogry telefon"
    ecl = (data.get("ecl") or "M").upper()
    if ecl not in ECL_MAP:
        errors["ecl"] = "Düzediş derejesi L/M/Q/H bolmaly"
    mode = (data.get("qrMode") or "text").lower()
    if mode not in QR_MODES:
        errors["qrMode"] = "QR mode: vcard / text / tel"
    if mode == "tel" and not (data.get("phone") or "").strip():
        errors["phone"] = "Tel rejimi üçin telefon hökmany"
    size = data.get("size", 600)
    try:
        size_i = int(size)
        if size_i < 100 or size_i > 4000:
            errors["size"] = "Ölçeg 100..4000 bolmaly"
    except (TypeError, ValueError):
        errors["size"] = "Ölçeg san bolmaly"
    return errors


def row_to_dict(row):
    return {
        "id": row["id"],
        "fullName": row["full_name"] if "full_name" in row.keys() else "",
        "title": row["title"],
        "department": row["department"],
        "phone": row["phone"],
        "fileName": row["file_name"],
        "size": row["size"],
        "ecl": row["ecl"],
        "qrMode": (row["qr_mode"] if "qr_mode" in row.keys() else "text") or "text",
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def escape_vcard(s):
    return (s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def clean_phone(s):
    return re.sub(r"[\s()\-]", "", s or "")


def build_vcard(c):
    lines = ["BEGIN:VCARD", "VERSION:3.0"]
    name = (c.get("fullName") or "").strip()
    lines.append(f"N:{escape_vcard(name)};;;;")
    lines.append(f"FN:{escape_vcard(name)}")
    if c.get("department"):
        lines.append(f"ORG:{escape_vcard(c['department'])}")
    if c.get("title"):
        lines.append(f"TITLE:{escape_vcard(c['title'])}")
    if c.get("phone"):
        lines.append(f"TEL;TYPE=CELL:{clean_phone(c['phone'])}")
    lines.append("END:VCARD")
    return "\r\n".join(lines)


def build_text(c):
    parts = []
    if c.get("department"): parts.append(f"Bölüm: {c['department']}")
    if c.get("title"):      parts.append(f"Wezipe: {c['title']}")
    if c.get("fullName"):   parts.append(f"Ady: {c['fullName']}")
    if c.get("phone"):      parts.append(f"Tel.: {c['phone']}")
    return "\n".join(parts)


def build_payload(c):
    mode = (c.get("qrMode") or "text").lower()
    if mode == "vcard":
        return build_vcard(c)
    if mode == "tel":
        return "tel:" + clean_phone(c.get("phone") or "")
    return build_text(c)


# ---------- Auth ----------
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("user"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect(url_for("login", next=request.path))
        return f(*args, **kwargs)
    return wrapper


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""
        db = get_db()
        row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if row and check_password_hash(row["password_hash"], password):
            session["user"] = username
            nxt = request.args.get("next") or url_for("index")
            return redirect(nxt)
        error = "Ulanyjy ady ýa-da parol nädogry"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ---------- Routes ----------
@app.route("/")
@login_required
def index():
    return render_template("index.html", username=session.get("user"))


@app.get("/api/contacts")
@login_required
def list_contacts():
    q = request.args.get("q", "").strip().lower()
    db = get_db()
    rows = db.execute("SELECT * FROM contacts ORDER BY updated_at DESC").fetchall()
    items = [row_to_dict(r) for r in rows]
    if q:
        def hay(x):
            return " ".join([
                x["fullName"], x["department"], x["title"], x["phone"]
            ]).lower()
        items = [x for x in items if q in hay(x)]
    return jsonify(items)


@app.get("/api/contacts/<int:cid>")
@login_required
def get_contact(cid):
    db = get_db()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone()
    if not row:
        abort(404)
    return jsonify(row_to_dict(row))


@app.post("/api/contacts")
@login_required
def create_contact():
    data = request.get_json(silent=True) or {}
    errors = validate(data)
    if errors:
        return jsonify({"errors": errors}), 400
    now = int(time.time() * 1000)
    db = get_db()
    cur = db.execute(
        """INSERT INTO contacts
           (full_name, title, department, phone, file_name, size, ecl, qr_mode, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            (data.get("fullName") or "").strip(),
            (data.get("title") or "").strip(),
            (data.get("department") or "").strip(),
            (data.get("phone") or "").strip(),
            (data.get("fileName") or "").strip(),
            int(data.get("size") or 600),
            (data.get("ecl") or "M").upper(),
            (data.get("qrMode") or "text").lower(),
            now, now,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.put("/api/contacts/<int:cid>")
@login_required
def update_contact(cid):
    data = request.get_json(silent=True) or {}
    errors = validate(data)
    if errors:
        return jsonify({"errors": errors}), 400
    db = get_db()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone()
    if not row:
        abort(404)
    now = int(time.time() * 1000)
    db.execute(
        """UPDATE contacts SET
           full_name=?, title=?, department=?,
           phone=?, file_name=?, size=?, ecl=?, qr_mode=?, updated_at=?
           WHERE id=?""",
        (
            (data.get("fullName") or "").strip(),
            (data.get("title") or "").strip(),
            (data.get("department") or "").strip(),
            (data.get("phone") or "").strip(),
            (data.get("fileName") or "").strip(),
            int(data.get("size") or 600),
            (data.get("ecl") or "M").upper(),
            (data.get("qrMode") or "text").lower(),
            now, cid,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone()
    return jsonify(row_to_dict(row))


@app.delete("/api/contacts/<int:cid>")
@login_required
def delete_contact(cid):
    db = get_db()
    cur = db.execute("DELETE FROM contacts WHERE id = ?", (cid,))
    db.commit()
    if cur.rowcount == 0:
        abort(404)
    return "", 204


@app.get("/api/contacts/<int:cid>/vcard")
@login_required
def get_vcard(cid):
    db = get_db()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone()
    if not row:
        abort(404)
    c = row_to_dict(row)
    payload = build_payload(c)
    mime = "text/vcard; charset=utf-8" if c.get("qrMode") == "vcard" else "text/plain; charset=utf-8"
    return payload, 200, {"Content-Type": mime}


def render_qr_png(text, size=600, ecl="M"):
    qr = qrcode.QRCode(
        version=None,
        error_correction=ECL_MAP.get(ecl.upper(), ERROR_CORRECT_M),
        box_size=10,
        border=2,
    )
    qr.add_data(text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    img = img.resize((size, size), Image.NEAREST)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


@app.get("/api/contacts/<int:cid>/qr")
@login_required
def get_qr(cid):
    db = get_db()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone()
    if not row:
        abort(404)
    c = row_to_dict(row)
    size = int(request.args.get("size", c["size"] or 600))
    ecl = request.args.get("ecl", c["ecl"] or "M").upper()
    download = request.args.get("download") == "1"
    payload = build_payload(c)
    buf = render_qr_png(payload, size=size, ecl=ecl)
    filename = (c["fileName"] or f"contact_{cid}") + ".png"
    return send_file(
        buf,
        mimetype="image/png",
        as_attachment=download,
        download_name=filename,
    )


@app.post("/api/qr/preview")
@login_required
def preview_qr():
    data = request.get_json(silent=True) or {}
    errors = validate(data)
    if errors:
        return jsonify({"errors": errors}), 400
    size = int(data.get("size") or 600)
    ecl = (data.get("ecl") or "M").upper()
    payload = build_payload(data)
    buf = render_qr_png(payload, size=size, ecl=ecl)
    return send_file(buf, mimetype="image/png")


@app.post("/api/vcard/preview")
@login_required
def preview_vcard():
    data = request.get_json(silent=True) or {}
    errors = validate(data)
    if errors:
        return jsonify({"errors": errors}), 400
    return jsonify({"vcard": build_payload(data), "mode": (data.get("qrMode") or "text").lower()})


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
