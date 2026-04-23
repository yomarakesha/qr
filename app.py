import io
import os
import re
import sqlite3
import time
from flask import Flask, g, jsonify, request, send_file, render_template, abort

import qrcode
from qrcode.constants import ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q, ERROR_CORRECT_H

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "contacts.db"))

app = Flask(__name__, template_folder="templates", static_folder="static")

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
            last_name   TEXT NOT NULL,
            first_name  TEXT NOT NULL,
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
    conn.commit()
    conn.close()


# ---------- Validation ----------
PHONE_RE = re.compile(r"^\+?[0-9 ()\-]+$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def validate(data, partial=False):
    errors = {}
    if not partial or "lastName" in data:
        if not (data.get("lastName") or "").strip():
            errors["lastName"] = "Familiýa hökmany"
    if not partial or "firstName" in data:
        if not (data.get("firstName") or "").strip():
            errors["firstName"] = "Ady hökmany"
    phone = (data.get("phone") or "").strip()
    if phone:
        if not PHONE_RE.match(phone) or len(re.sub(r"\D", "", phone)) < 6:
            errors["phone"] = "Nädogry telefon"
    email = (data.get("email") or "").strip()
    if email and not EMAIL_RE.match(email):
        errors["email"] = "Nädogry e-poçta"
    ecl = (data.get("ecl") or "M").upper()
    if ecl not in ECL_MAP:
        errors["ecl"] = "Düzediş derejesi L/M/Q/H bolmaly"
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
        "lastName": row["last_name"],
        "firstName": row["first_name"],
        "title": row["title"],
        "department": row["department"],
        "phone": row["phone"],
        "email": row["email"],
        "fileName": row["file_name"],
        "size": row["size"],
        "ecl": row["ecl"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


# ---------- vCard ----------
def escape_vcard(s):
    return (s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def clean_phone(s):
    return re.sub(r"[\s()\-]", "", s or "")


def build_vcard(c):
    lines = ["BEGIN:VCARD", "VERSION:3.0"]
    last = c.get("lastName") or ""
    first = c.get("firstName") or ""
    lines.append(f"N:{escape_vcard(last)};{escape_vcard(first)};;;")
    lines.append(f"FN:{escape_vcard((first + ' ' + last).strip())}")
    if c.get("department"):
        lines.append(f"ORG:{escape_vcard(c['department'])}")
    if c.get("title"):
        lines.append(f"TITLE:{escape_vcard(c['title'])}")
    if c.get("phone"):
        lines.append(f"TEL;TYPE=CELL:{clean_phone(c['phone'])}")
    if c.get("email"):
        lines.append(f"EMAIL:{c['email']}")
    lines.append("END:VCARD")
    return "\r\n".join(lines)


# ---------- Routes ----------
@app.route("/")
def index():
    return render_template("index.html")


@app.get("/api/contacts")
def list_contacts():
    q = request.args.get("q", "").strip().lower()
    db = get_db()
    rows = db.execute("SELECT * FROM contacts ORDER BY updated_at DESC").fetchall()
    items = [row_to_dict(r) for r in rows]
    if q:
        def hay(x):
            return " ".join([
                x["firstName"], x["lastName"], x["department"],
                x["title"], x["phone"], x["email"]
            ]).lower()
        items = [x for x in items if q in hay(x)]
    return jsonify(items)


@app.get("/api/contacts/<int:cid>")
def get_contact(cid):
    db = get_db()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone()
    if not row:
        abort(404)
    return jsonify(row_to_dict(row))


@app.post("/api/contacts")
def create_contact():
    data = request.get_json(silent=True) or {}
    errors = validate(data)
    if errors:
        return jsonify({"errors": errors}), 400
    now = int(time.time() * 1000)
    db = get_db()
    cur = db.execute(
        """INSERT INTO contacts
           (last_name, first_name, title, department, phone, email, file_name, size, ecl, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            (data.get("lastName") or "").strip(),
            (data.get("firstName") or "").strip(),
            (data.get("title") or "").strip(),
            (data.get("department") or "").strip(),
            (data.get("phone") or "").strip(),
            (data.get("email") or "").strip(),
            (data.get("fileName") or "").strip(),
            int(data.get("size") or 600),
            (data.get("ecl") or "M").upper(),
            now, now,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_dict(row)), 201


@app.put("/api/contacts/<int:cid>")
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
           last_name=?, first_name=?, title=?, department=?,
           phone=?, email=?, file_name=?, size=?, ecl=?, updated_at=?
           WHERE id=?""",
        (
            (data.get("lastName") or "").strip(),
            (data.get("firstName") or "").strip(),
            (data.get("title") or "").strip(),
            (data.get("department") or "").strip(),
            (data.get("phone") or "").strip(),
            (data.get("email") or "").strip(),
            (data.get("fileName") or "").strip(),
            int(data.get("size") or 600),
            (data.get("ecl") or "M").upper(),
            now, cid,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone()
    return jsonify(row_to_dict(row))


@app.delete("/api/contacts/<int:cid>")
def delete_contact(cid):
    db = get_db()
    cur = db.execute("DELETE FROM contacts WHERE id = ?", (cid,))
    db.commit()
    if cur.rowcount == 0:
        abort(404)
    return "", 204


@app.get("/api/contacts/<int:cid>/vcard")
def get_vcard(cid):
    db = get_db()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone()
    if not row:
        abort(404)
    vcard = build_vcard(row_to_dict(row))
    return vcard, 200, {"Content-Type": "text/vcard; charset=utf-8"}


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
    img = img.resize((size, size))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


@app.get("/api/contacts/<int:cid>/qr")
def get_qr(cid):
    db = get_db()
    row = db.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone()
    if not row:
        abort(404)
    c = row_to_dict(row)
    size = int(request.args.get("size", c["size"] or 600))
    ecl = request.args.get("ecl", c["ecl"] or "M").upper()
    download = request.args.get("download") == "1"
    vcard = build_vcard(c)
    buf = render_qr_png(vcard, size=size, ecl=ecl)
    filename = (c["fileName"] or f"contact_{cid}") + ".png"
    return send_file(
        buf,
        mimetype="image/png",
        as_attachment=download,
        download_name=filename,
    )


@app.post("/api/qr/preview")
def preview_qr():
    data = request.get_json(silent=True) or {}
    errors = validate(data)
    if errors:
        return jsonify({"errors": errors}), 400
    size = int(data.get("size") or 600)
    ecl = (data.get("ecl") or "M").upper()
    vcard = build_vcard(data)
    buf = render_qr_png(vcard, size=size, ecl=ecl)
    return send_file(buf, mimetype="image/png")


@app.post("/api/vcard/preview")
def preview_vcard():
    data = request.get_json(silent=True) or {}
    errors = validate(data)
    if errors:
        return jsonify({"errors": errors}), 400
    return jsonify({"vcard": build_vcard(data)})


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
