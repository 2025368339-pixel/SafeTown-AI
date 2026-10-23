"""SafeTown AI v2: local student hackathon demonstration, not production deployment."""
from __future__ import annotations

import hashlib
from io import BytesIO
import hmac
import math
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
from PIL import Image, UnidentifiedImageError
from fastapi import Cookie, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion, Pipeline

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
UPLOADS = ROOT / 'uploads'
DB = DATA / 'safetown.db'
DATA.mkdir(exist_ok=True)
UPLOADS.mkdir(exist_ok=True)

app = FastAPI(title='SafeTown AI v2', version='2.0.0')
app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')

ZONES = {
    'A': 'North Residences',
    'B': 'Playground & Park',
    'C': 'Lakeside Walk',
    'D': 'Community Hub',
    'E': 'Commercial & Parking',
    'F': 'Main Entrance',
}
CATEGORIES = {
    'poor_lighting': 'Poor Lighting',
    'infrastructure_damage': 'Infrastructure Damage',
    'suspicious_activity': 'Suspicious Activity',
    'stray_animals': 'Stray Animals',
    'accident': 'Traffic / Accident',
    'crowd_disorder': 'Disturbance / Fighting',
    'weather_hazard': 'Weather / Flood Hazard',
    'other': 'Other Safety Hazard',
}
STATUSES = {'pending', 'verified', 'in_progress', 'resolved', 'rejected'}
URGENT_PHRASES = ['fire', 'kebakaran', 'smoke', 'asap tebal', 'weapon', 'senjata', 'attacking', 'serang',
                  'bleeding', 'berdarah', 'fight', 'bergaduh', 'gaduh', 'crash', 'accident', 'kemalangan',
                  'terperangkap', 'trapped', 'flooding', 'banjir', 'emergency', 'kecemasan']
MIME_EXT = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'}
MAX_UPLOAD = 4 * 1024 * 1024


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB, timeout=20)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA journal_mode=WAL')
    return c


def password_hash(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or os.urandom(16)
    value = hashlib.scrypt(password.encode('utf-8'), salt=salt, n=2**14, r=8, p=1)
    return salt.hex() + '$' + value.hex()


def password_ok(password: str, stored: str) -> bool:
    try:
        salt_hex, _ = stored.split('$', 1)
        return hmac.compare_digest(password_hash(password, bytes.fromhex(salt_hex)), stored)
    except (ValueError, TypeError):
        return False


def create_user(c, email, password, name, role):
    c.execute('INSERT INTO users (email,password_hash,name,role,created_at) VALUES (?,?,?,?,?)',
              (email.lower(), password_hash(password), name, role, now()))


def init_db():
    with conn() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('resident','admin')),
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          resident_id INTEGER NOT NULL REFERENCES users(id),
          zone TEXT NOT NULL,
          description TEXT NOT NULL,
          resident_severity INTEGER NOT NULL CHECK(resident_severity BETWEEN 1 AND 5),
          verified_severity INTEGER CHECK(verified_severity BETWEEN 1 AND 5),
          category TEXT NOT NULL,
          ai_confidence REAL NOT NULL,
          needs_review INTEGER NOT NULL DEFAULT 0,
          urgent_flag INTEGER NOT NULL DEFAULT 0,
          possible_duplicate_of INTEGER,
          status TEXT NOT NULL DEFAULT 'pending',
          photo_filename TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS report_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
          actor_id INTEGER NOT NULL REFERENCES users(id),
          from_status TEXT,
          to_status TEXT NOT NULL,
          previous_severity INTEGER,
          new_severity INTEGER,
          note TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        ''')
        admin_email = os.getenv('SAFETOWN_ADMIN_EMAIL', 'admin@safetown.test').strip().lower()
        admin_password = os.getenv('SAFETOWN_ADMIN_PASSWORD', 'Admin@12345')
        if not c.execute('SELECT 1 FROM users WHERE email=?', (admin_email,)).fetchone():
            create_user(c, admin_email, admin_password, 'Township Security Admin', 'admin')
        resident_email = 'resident@safetown.test'
        if not c.execute('SELECT 1 FROM users WHERE email=?', (resident_email,)).fetchone():
            create_user(c, resident_email, 'Resident@12345', 'Demo Resident', 'resident')
        if c.execute('SELECT COUNT(*) FROM reports').fetchone()[0] == 0:
            seed_reports(c)


def seed_reports(c):
    admin_id = c.execute("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").fetchone()['id']
    resident_id = c.execute("SELECT id FROM users WHERE email='resident@safetown.test'").fetchone()['id']
    samples = [
        ('B', 'Anjing liar mengejar cyclist dekat playground', 4, 4, 'stray_animals', 'verified', 2),
        ('B', 'Anjing liar menggigit kanak-kanak dekat playground', 5, 5, 'stray_animals', 'verified', 4),
        ('B', 'Orang bergaduh dekat taman permainan', 4, None, 'crowd_disorder', 'pending', 1),
        ('C', 'Lampu jalan rosak dekat lakeside, sangat gelap', 5, 2, 'poor_lighting', 'in_progress', 5),
        ('E', 'Ada orang mencurigakan dekat parking', 4, None, 'suspicious_activity', 'pending', 1),
        ('A', 'Main perimeter gate broken and wide open at North Residences', 4, 4, 'infrastructure_damage', 'verified', 1),
        ('D', 'Cracked walkway has been repaired', 2, 2, 'infrastructure_damage', 'resolved', 24),
        ('F', 'Accident near the main entrance', 5, None, 'accident', 'pending', 0),
    ]
    for zone, desc, reported, confirmed, category, status, hrs in samples:
        when = (datetime.now(timezone.utc) - timedelta(hours=hrs)).isoformat()
        urgent = int(any(term in desc.lower() for term in URGENT_PHRASES))
        cur = c.execute('''INSERT INTO reports
            (resident_id,zone,description,resident_severity,verified_severity,category,ai_confidence,
             needs_review,urgent_flag,possible_duplicate_of,status,photo_filename,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
             (resident_id, zone, desc, reported, confirmed, category, .86, 0, urgent, None, status, None, when, when))
        c.execute('''INSERT INTO report_history(report_id,actor_id,from_status,to_status,previous_severity,
            new_severity,note,created_at) VALUES(?,?,?,?,?,?,?,?)''',
            (cur.lastrowid, resident_id, None, 'pending', None, reported, 'Demo resident report submitted', when))
        if status != 'pending':
            note = ('Severity adjusted after review' if confirmed != reported else 'Verified by security')
            c.execute('''INSERT INTO report_history(report_id,actor_id,from_status,to_status,previous_severity,
                new_severity,note,created_at) VALUES(?,?,?,?,?,?,?,?)''',
                (cur.lastrowid, admin_id, 'pending', status, reported, confirmed, note, when))


# AI model: category classification only. Resident rates severity, human verifies.
def train_classifier():
    data = pd.read_csv(DATA / 'training_data.csv')
    model = Pipeline([
        ('features', FeatureUnion([
            ('word', TfidfVectorizer(ngram_range=(1, 2), lowercase=True)),
            ('char', TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5), lowercase=True)),
        ])),
        ('classifier', MultinomialNB(alpha=.25)),
    ])
    model.fit(data['text'].astype(str), data['category'].astype(str))
    return model


CLASSIFIER = train_classifier()
init_db()


def classify_report(text):
    prob = CLASSIFIER.predict_proba([text])[0]
    pos = int(prob.argmax())
    category = str(CLASSIFIER.classes_[pos])
    confidence = float(prob[pos])
    low_confidence = confidence < .30
    return category, round(confidence, 4), int(low_confidence)


def duplicate_match(c, zone: str, description: str):
    from sklearn.metrics.pairwise import cosine_similarity
    recent = (datetime.now(timezone.utc) - timedelta(hours=72)).isoformat()
    rows = c.execute('''SELECT id,description FROM reports WHERE zone=? AND status NOT IN ('resolved','rejected')
                        AND created_at>=? ORDER BY id DESC LIMIT 50''', (zone, recent)).fetchall()
    if not rows:
        return None
    tfidf = TfidfVectorizer(analyzer='char_wb', ngram_range=(3, 5))
    matrix = tfidf.fit_transform([description] + [r['description'] for r in rows])
    scores = cosine_similarity(matrix[0:1], matrix[1:]).ravel()
    index = int(scores.argmax())
    return int(rows[index]['id']) if scores[index] >= .65 else None


def recency(timestamp):
    try:
        age_hours = max(0, (datetime.now(timezone.utc) - datetime.fromisoformat(timestamp)).total_seconds()/3600)
    except (ValueError, TypeError):
        age_hours = 0
    return math.exp(-math.log(2) * age_hours / 48)  # half-life 48h


def zones_summary():
    with conn() as c:
        rows = c.execute('SELECT zone,status,resident_severity,verified_severity,created_at FROM reports').fetchall()
    out = []
    for zone, name in ZONES.items():
        zone_rows = [r for r in rows if r['zone'] == zone]
        contributing = [r for r in zone_rows if r['status'] in ('pending','verified','in_progress')]
        total = 0.0
        for r in contributing:
            is_verified = r['status'] != 'pending'
            severity = r['verified_severity'] if is_verified else r['resident_severity']
            total += severity * recency(r['created_at']) * (1.0 if is_verified else .5)
        score = min(100, round(100 * total / 15))
        level = 'red' if score >= 60 else 'yellow' if score >= 25 else 'green'
        out.append({
            'code': zone, 'name': name, 'score': score, 'level': level,
            'pending': sum(r['status']=='pending' for r in zone_rows),
            'verified': sum(r['status'] in ('verified','in_progress') for r in zone_rows),
            'active': len(contributing),
            'data_quality': 'no_reports' if not contributing else 'reports_available',
        })
    return out


def scrub_report(r, admin=False):
    d = dict(r)
    d['category_label'] = CATEGORIES.get(d['category'], 'Unknown Category')
    d['possible_duplicate_of'] = d.get('possible_duplicate_of') or None
    d['has_photo'] = bool(d.pop('photo_filename', None))
    if not admin:
        d.pop('resident_id', None)
    return d


def get_session(safetown_session: Optional[str]) -> dict:
    if not safetown_session:
        raise HTTPException(401, 'Please sign in')
    token_hash = hashlib.sha256(safetown_session.encode()).hexdigest()
    with conn() as c:
        row = c.execute('''SELECT u.id,u.name,u.email,u.role,s.expires_at FROM sessions s
                           JOIN users u ON u.id=s.user_id WHERE s.token_hash=?''', (token_hash,)).fetchone()
    if not row or row['expires_at'] <= now():
        raise HTTPException(401, 'Session expired; please sign in again')
    return dict(row)


def require_user(cookie):
    return get_session(cookie)


def require_admin(cookie):
    user = get_session(cookie)
    if user['role'] != 'admin':
        raise HTTPException(403, 'Admin role required')
    return user


class Login(BaseModel):
    email: str
    password: str

class Register(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: str = Field(min_length=5, max_length=140)
    password: str = Field(min_length=8, max_length=100)

class Review(BaseModel):
    action: str
    verified_severity: Optional[int] = Field(default=None, ge=1, le=5)
    note: str = Field(default='', max_length=500)


def user_payload(user):
    return {'id':user['id'], 'name':user['name'], 'email':user['email'], 'role':user['role']}


@app.get('/')
def home():
    return FileResponse(ROOT/'static'/'index.html')

@app.get('/api/health')
def health():
    return {'ok': True, 'version': '2.0.0'}

@app.post('/api/auth/register', status_code=201)
def register(body: Register):
    email = body.email.strip().lower()
    name = body.name.strip()
    if '@' not in email or '.' not in email.split('@')[-1] or not name:
        raise HTTPException(400, 'Enter a valid name and email')
    with conn() as c:
        if c.execute('SELECT 1 FROM users WHERE email=?', (email,)).fetchone():
            raise HTTPException(409, 'Email is already registered')
        create_user(c, email, body.password, name, 'resident')
    return {'message': 'Resident account created. Please sign in.'}

@app.post('/api/auth/login')
def login(body: Login, response: Response):
    with conn() as c:
        row = c.execute('SELECT * FROM users WHERE email=?', (body.email.strip().lower(),)).fetchone()
        if not row or not password_ok(body.password, row['password_hash']):
            raise HTTPException(401, 'Incorrect email or password')
        token = secrets.token_urlsafe(40)
        c.execute('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)',
                  (hashlib.sha256(token.encode()).hexdigest(), row['id'],
                   (datetime.now(timezone.utc)+timedelta(days=7)).isoformat()))
    response.set_cookie('safetown_session',token,httponly=True,samesite='lax',max_age=7*24*3600,
                        secure=os.getenv('SAFETOWN_SECURE_COOKIES','0')=='1')
    return {'user':user_payload(row)}

@app.post('/api/auth/logout')
def logout(response: Response, safetown_session: Optional[str] = Cookie(None)):
    if safetown_session:
        with conn() as c:
            c.execute('DELETE FROM sessions WHERE token_hash=?',
                      (hashlib.sha256(safetown_session.encode()).hexdigest(),))
    response.delete_cookie('safetown_session')
    return {'ok': True}

@app.get('/api/auth/me')
def me(safetown_session: Optional[str] = Cookie(None)):
    return user_payload(require_user(safetown_session))

@app.get('/api/zones')
def get_zones(safetown_session: Optional[str] = Cookie(None)):
    require_user(safetown_session)
    return zones_summary()

@app.post('/api/reports', status_code=201)
async def new_report(
    zone: str = Form(...),
    description: str = Form(...),
    resident_severity: int = Form(...),
    photo: Optional[UploadFile] = File(None),
    safetown_session: Optional[str] = Cookie(None),
):
    user = require_user(safetown_session)
    if user['role'] != 'resident':
        raise HTTPException(403, 'Only residents can submit community reports')
    zone = zone.strip().upper()
    description = description.strip()
    if zone not in ZONES or len(description) < 10 or len(description) > 800 or resident_severity not in range(1,6):
        raise HTTPException(400, 'Provide a valid zone, description (10–800 characters), and severity (1–5)')
    filename = None
    if photo is not None and photo.filename:
        if photo.content_type not in MIME_EXT:
            raise HTTPException(400, 'Photo must be JPEG, PNG or WebP')
        contents = await photo.read(MAX_UPLOAD+1)
        if len(contents)>MAX_UPLOAD:
            raise HTTPException(413, 'Photo must be 4 MB or smaller')
        magic_ok = (
            (photo.content_type=='image/jpeg' and contents.startswith(b'\xff\xd8\xff')) or
            (photo.content_type=='image/png' and contents.startswith(b'\x89PNG\r\n\x1a\n')) or
            (photo.content_type=='image/webp' and contents[:4]==b'RIFF' and contents[8:12]==b'WEBP')
        )
        if not magic_ok:
            raise HTTPException(400, 'The file does not match its image type')
        try:
            with Image.open(BytesIO(contents)) as im:
                if im.width * im.height > 20_000_000:
                    raise HTTPException(400, 'Image dimensions are too large')
                im.verify()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise HTTPException(400, 'Photo appears invalid or corrupt')
        filename = secrets.token_hex(18) + MIME_EXT[photo.content_type]
        (UPLOADS/filename).write_bytes(contents)
    category, confidence, needs_review = classify_report(description)
    urgent_flag = int(any(p in description.lower() for p in URGENT_PHRASES) or resident_severity==5)
    with conn() as c:
        duplicate = duplicate_match(c,zone,description)
        stamp = now()
        cur = c.execute('''INSERT INTO reports
            (resident_id,zone,description,resident_severity,verified_severity,category,ai_confidence,
             needs_review,urgent_flag,possible_duplicate_of,status,photo_filename,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
            (user['id'],zone,description,resident_severity,None,category,confidence,
             needs_review,urgent_flag,duplicate,'pending',filename,stamp,stamp))
        report_id = cur.lastrowid
        c.execute('''INSERT INTO report_history
            (report_id,actor_id,from_status,to_status,previous_severity,new_severity,note,created_at)
             VALUES (?,?,?,?,?,?,?,?)''',
            (report_id,user['id'],None,'pending',None,resident_severity,'Report submitted by resident',stamp))
        item = c.execute('SELECT * FROM reports WHERE id=?',(report_id,)).fetchone()
    return {'report':scrub_report(item), 'message':'Report submitted and awaiting security verification'}

@app.get('/api/reports/mine')
def mine(safetown_session: Optional[str] = Cookie(None)):
    user = require_user(safetown_session)
    if user['role'] != 'resident':
        raise HTTPException(403,'Resident role required')
    with conn() as c:
        rows = c.execute('SELECT * FROM reports WHERE resident_id=? ORDER BY id DESC',(user['id'],)).fetchall()
    return [scrub_report(row) for row in rows]

@app.get('/api/reports')
def all_reports(safetown_session: Optional[str] = Cookie(None)):
    require_admin(safetown_session)
    with conn() as c:
        rows = c.execute('''SELECT r.*,u.name AS reporter_name FROM reports r
                            JOIN users u ON r.resident_id=u.id
                            ORDER BY CASE WHEN r.status='pending' THEN 0
                              WHEN r.status='verified' THEN 1 WHEN r.status='in_progress' THEN 2 ELSE 3 END,
                              r.urgent_flag DESC,r.resident_severity DESC,r.created_at DESC''').fetchall()
    return [scrub_report(row,admin=True) for row in rows]

@app.get('/api/reports/{report_id}')
def report_detail(report_id: int,safetown_session: Optional[str] = Cookie(None)):
    user = require_user(safetown_session)
    with conn() as c:
        row = c.execute('SELECT * FROM reports WHERE id=?',(report_id,)).fetchone()
        if not row:
            raise HTTPException(404,'Report not found')
        if user['role']!='admin' and user['id']!=row['resident_id']:
            raise HTTPException(403,'You cannot access this report')
        events = c.execute('''SELECT h.*,u.name AS actor_name FROM report_history h
                              JOIN users u ON u.id=h.actor_id WHERE report_id=? ORDER BY h.id''',
                              (report_id,)).fetchall()
    return {'report':scrub_report(row,admin=user['role']=='admin'), 'history':[dict(e) for e in events]}

@app.get('/api/reports/{report_id}/photo')
def get_photo(report_id: int,safetown_session: Optional[str] = Cookie(None)):
    user = require_user(safetown_session)
    with conn() as c:
        row = c.execute('SELECT resident_id,photo_filename FROM reports WHERE id=?',(report_id,)).fetchone()
    if not row or not row['photo_filename']:
        raise HTTPException(404,'Photo not available')
    if user['role']!='admin' and user['id'] != row['resident_id']:
        raise HTTPException(403,'You cannot access this photo')
    path = UPLOADS/row['photo_filename']
    if not path.exists():
        raise HTTPException(404,'Photo not found')
    return FileResponse(path)

@app.post('/api/reports/{report_id}/review')
def review_report(report_id: int,body: Review,safetown_session: Optional[str] = Cookie(None)):
    admin = require_admin(safetown_session)
    note = body.note.strip()
    action = body.action
    with conn() as c:
        row = c.execute('SELECT * FROM reports WHERE id=?',(report_id,)).fetchone()
        if not row:
            raise HTTPException(404,'Report not found')
        current = row['status']
        allowed = {
            'pending': {'verify':'verified','reject':'rejected'},
            'verified': {'start':'in_progress','resolve':'resolved'},
            'in_progress': {'resolve':'resolved'},
        }
        if action not in allowed.get(current,{}):
            raise HTTPException(409,f'Cannot perform {action} from {current} status')
        new_status = allowed[current][action]
        verified_severity = row['verified_severity']
        if action == 'verify':
            if body.verified_severity is None:
                raise HTTPException(400,'Admin must confirm severity from 1 to 5')
            verified_severity = body.verified_severity
            if verified_severity != row['resident_severity'] and len(note)<5:
                raise HTTPException(400,'Explain why the severity was changed (at least 5 characters)')
        if action == 'reject' and len(note)<5:
            raise HTTPException(400,'Reason is required when rejecting a report')
        if action == 'resolve' and len(note)<5:
            raise HTTPException(400,'Describe what action resolved the issue')
        stamp = now()
        c.execute('UPDATE reports SET status=?,verified_severity=?,updated_at=? WHERE id=?',
                  (new_status,verified_severity,stamp,report_id))
        c.execute('''INSERT INTO report_history
            (report_id,actor_id,from_status,to_status,previous_severity,new_severity,note,created_at)
            VALUES (?,?,?,?,?,?,?,?)''',
            (report_id,admin['id'],current,new_status,
             row['verified_severity'] if row['verified_severity'] is not None else row['resident_severity'],
             verified_severity if verified_severity is not None else row['resident_severity'],
             note or {'verify':'Report reviewed and verified','start':'Security/maintenance action started'}.get(action,'Status updated'),stamp))
        updated = c.execute('SELECT * FROM reports WHERE id=?',(report_id,)).fetchone()
    return {'report':scrub_report(updated,admin=True), 'message':f'Report {new_status.replace("_"," ")}. Risk map updated.'}

@app.get('/api/dashboard')
def dashboard(safetown_session: Optional[str] = Cookie(None)):
    require_admin(safetown_session)
    with conn() as c:
        counts = {r['status']:r['n'] for r in c.execute('SELECT status,COUNT(*) n FROM reports GROUP BY status')}
        urgent_pending = c.execute("SELECT COUNT(*) FROM reports WHERE status='pending' AND urgent_flag=1").fetchone()[0]
        corrected = c.execute('''SELECT COUNT(*) FROM reports WHERE verified_severity IS NOT NULL
                                 AND verified_severity!=resident_severity''').fetchone()[0]
    zones = zones_summary()
    top = max(zones,key=lambda z:z['score'])
    return {'counts':counts,'urgent_pending':urgent_pending,'severity_corrections':corrected,'zones':zones,
            'priority_zone':top, 'recommendation':
            f'Review active reports in Zone {top["code"]} ({top["name"]}) and consider patrol attention.'
            if top['active'] else 'No active incidents have been reported. Continue routine patrols.'}

@app.post('/api/demo/reset')
def reset_demo(safetown_session: Optional[str] = Cookie(None)):
    require_admin(safetown_session)
    with conn() as c:
        filenames = [r['photo_filename'] for r in c.execute('SELECT photo_filename FROM reports WHERE photo_filename IS NOT NULL')]
        c.execute('DELETE FROM report_history')
        c.execute('DELETE FROM reports')
        seed_reports(c)
    for filename in filenames:
        (UPLOADS/filename).unlink(missing_ok=True)
    return {'ok':True,'message':'Demo reports restored. User accounts were preserved.'}
