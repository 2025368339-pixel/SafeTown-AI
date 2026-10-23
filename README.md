# SafeTown AI v2 — Complete Live Safety Heatmap Prototype

**Theme:** Sime Darby Property University Hackathon — Safety & Security  
**Product:** AI-assisted community incident reporting + live reported-risk map + management verification.

This is a **working, full-stack student prototype** with resident/admin roles, a real SQLite database, a trained text classifier, optional evidence photos, auditable case updates, and a continuously refreshed township heatmap.

> **Important:** The map and training reports are **synthetic**. The heatmap estimates **reported risk**, not actual crime probability or proof of safety. Do not rely on this app as an emergency-response system.

## 1. How to run on Windows

1. Install **Python 3.10 or newer** from https://www.python.org/downloads/ . During installation, select **Add Python to PATH**.
2. Extract the ZIP file anywhere on your PC.
3. Open the **SafeTown_AI_V2** folder.
4. Double-click **`run_windows.bat`**.
5. Wait for package installation and the server to start.
6. Open **http://127.0.0.1:8002** in Edge or Chrome.

**Do not double-click `index.html`.** The app needs the Python backend running.

### Manual Windows method

From a Command Prompt inside the project folder:

```bat
python -m pip install -r requirements.txt
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

For Mac/Linux:

```bash
python3 -m pip install -r requirements.txt
python3 -m uvicorn server:app --host 127.0.0.1 --port 8000
```

Press **Ctrl+C** in the terminal to stop the server.

## 2. Demo accounts

**Resident**
- Email: `resident@safetown.test`
- Password: `Resident@12345`

**Security administrator**
- Email: `admin@safetown.test`
- Password: `Admin@12345`

You can create new **resident** accounts through the sign-up form. Only an administrator can call admin endpoints, and admins cannot use resident report submission. Admin credentials are **demonstration-only**. Never expose this server publicly with these passwords. To change the initial admin account credentials, set `SAFETOWN_ADMIN_EMAIL` and `SAFETOWN_ADMIN_PASSWORD` **before the first run** (a user already seeded in the database is not overwritten).

## 3. What works in v2

| Function | Resident | Admin | System / AI |
|---|---|---|---|
| Login / logout | ✓ | ✓ | Secure session cookies + hashed passwords |
| Create resident account | ✓ | — | Account validation |
| View simulated 6-zone heatmap | ✓ | ✓ | Risk calculation, 12-second refresh |
| Submit an incident | ✓ | — | Persists in SQLite |
| Choose initial severity 1–5 | ✓ | — | Never overwritten |
| Attach photo (optional) | ✓ | — | Private JPEG/PNG/WebP storage |
| Classify incident text | — | — | TF-IDF + Multinomial Naive Bayes |
| Flag potential duplicate | — | ✓ (review) | TF-IDF text similarity within same zone |
| Flag urgent terms | — | ✓ (review) | Keyword flag; no automatic dispatch |
| Track personal report statuses | ✓ | ✓ | Timestamped history |
| Verify and confirm actual severity | — | ✓ | Recalculates risk |
| Correct severity with mandatory explanation | — | ✓ | Preserves original rating and audit history |
| Move to In progress / Resolved | — | ✓ | Updates case and map |
| Reject unsubstantiated report with reason | — | ✓ | Removes active map contribution |
| Review all incident records | — | ✓ | Server-enforced permission check |
| Rank zones and suggest patrol priority | — | ✓ | Transparent rule-based selection |
| Restore seeded demonstration incidents | — | ✓ | Demo reset (deletes all reports) |

No separate **"Add infrastructure fault"** button is present: residents report broken lamps, fences, cameras and similar issues through the **same reporting form**, as agreed for the revised design.

## 4. How the workflow works

**Resident** → Submits description, location, perceived severity (1–5), optional photo  
**AI** → Classifies **category** (not severity), estimates category confidence, optionally flags duplicate/urgent wording  
**Database** → Saves an unverified report and the original resident severity  
**Heatmap** → Shows **provisional reported risk** with an unverified-report weight  
**Admin** → Reviews description, supporting image, or site inspection evidence  
**Verification** → Confirms severity or corrects it with a written explanation; original severity is retained  
**Action** → Changes incident to In progress, then Resolved (or rejects unsubstantiated cases)  
**Heatmap** → Recalculates when severity or status changes  
**Resident** → Sees the same status changes and audit notes under **My reports**.

Statuses:

- **Pending** → **Verified** → **In progress** → **Resolved**
- **Pending** → **Rejected** (if report invalid / unsupported)
- **Verified** → **Resolved** (for issues addressed without a separate in-progress stage)

For an immediate threat, residents should call emergency services; a safety report alone does not dispatch help. Site inspections are optional or necessary depending on the nature of the report; not every report requires a physical visit.

## 5. Transparent risk scoring

For **each active report**:

```
Incident contribution = Severity × Recency factor × Verification weight
```

- Pending / unverified: **resident severity × 0.50 × recency**
- Verified or In progress: **admin-confirmed severity × 1.00 × recency**
- Resolved or Rejected: **0** current contribution
- Recency: exponential decay with **48-hour half-life**

```
Zone score = min(100, round(100 × sum(all active contributions) / 15))
```

Colours:

- 🟢 Green: <25 (lower reported risk)
- 🟡 Yellow: 25–59 (caution)
- 🔴 Red: 60+ (higher reported risk)

**Example:** Resident rates a broken light 5/5. Staff finds it is only 2/5. The database keeps **resident = 5** and saves **verified = 2**, with the staff's explanation. The risk recalculates using the verified rating. The numbers and thresholds are **prototypes** and are not validated public-safety risk measures.

## 6. 5-minute demonstration

1. Open **Resident** demo account.
2. Click **Report a hazard**.
3. Choose **Zone C — Lakeside Walk**.
4. Enter: `Lampu jalan rosak dekat lakeside walkway dan sangat gelap`.
5. Select severity **5 — Critical**, optionally attach a photo, and submit.
6. Show the **AI category: Poor Lighting**, resident severity **5/5**, and **Pending** status.
7. Open **My reports** to show tracking.
8. Sign out and sign in as **Security admin**.
9. Open **Incident review**, locate the new report, and click **Review**.
10. Set confirmed severity to **2**, enter: `Inspected the site: only one lamp is broken; the remaining pathway is lit.`, then **Verify report**.
11. Show that **original severity remains 5**, confirmed severity becomes **2**, and the report history records the justification.
12. Click **Start work**, then **Mark resolved** with note: `Maintenance replaced the lamp and confirmed it works.`
13. Observe the updated heatmap. Switch back to the resident account to see the new status and history.

You can restore all eight example incidents from **Security admin → Command centre → Reset demo reports**. Reset deletes incident reports and their history but keeps user accounts.

## 7. Project structure

```
SafeTown_AI_V2/
├─ server.py                     # FastAPI, SQLite, sessions, ML, risk, audit
├─ requirements.txt              # Python dependencies
├─ run_windows.bat               # Windows startup
├─ run_mac_linux.sh              # macOS/Linux startup
├─ test_smoke.py                 # Automated API workflow tests
├─ README.md                     # Instructions and method
├─ START_HERE.txt                # Quick instructions
├─ data/
│  └─ training_data.csv         # Synthetic Malay-English category training data
├─ uploads/                      # Private evidence photos, created at runtime
└─ static/
   ├─ index.html                 # Login and workspace layout
   ├─ styles.css                 # Responsive design
   └─ app.js                     # Frontend logic and live data polling
```

The SQLite database `data/safetown.db` is created automatically on first start. A new ZIP contains **no pre-existing database**, so it starts fresh with demo cases.

## 8. Test the backend

After installing dependencies:

```bash
python test_smoke.py
```

This checks login, authorization, AI category classification, user-selected severity, mandatory correction notes, complete status changes, case history, photo access, duplicate flagging, and demo reset.

**Warning:** The smoke test restores the demo reports at the end and will delete current reports in the database. Do not run it on a database with important data.

## 9. Known limitations and next improvements

- Synthetic township geometry rather than real licensed township GIS layers.
- AI model trained on a small synthetic corpus; confidence is not proof of correctness; real evaluation and domain-specific data are needed.
- Duplicate detection is a similarity flag, not proof that a report is false.
- No actual sensor, CCTV, police, geolocation, SMS or emergency-dispatch integrations.
- Security verifies reports manually; inspection data and real patrol operations are not integrated.
- 12-second polling simulates "live" refresh on a shared local server, not a streaming real-time system.
- Local demo roles enforce API permissions and use salted password hashing, but production would additionally require HTTPS, CSRF protections, login rate limits, hardened upload scanning, password reset, privacy assessment and proper operational authorization.
- Green means **lower reported risk**, **not safe**. Zones with no reports should not be assumed hazard-free.
- Automated risk scaling and numerical thresholds are illustrative: actual operational safety decisions require governance and field validation.

## 10. Suggested pitch

> SafeTown AI helps township security teams identify and prioritise community safety concerns by converting residents' firsthand reports into AI-categorised, human-verified incidents on a dynamic risk map. Residents choose initial severity, while security management confirms facts and records any corrections, making safety information more structured, accountable, and actionable.


## NEW: Desktop + mobile browser support (same system)

The SAME FastAPI backend and SQLite database serve desktop Chrome/Edge and mobile Safari/Chrome.
No duplicated app or feature redesign is required. This release improves touch controls, mobile layout, navigation, modal review, input sizing, and overflow handling.

### Windows laptop + Android/iPhone on the SAME network

1. Extract the ZIP and start `run_windows.bat` on the Windows PC. Leave the window running.
2. Connect your PC and phone to the **same trusted Wi-Fi** (not a guest network with device isolation).
3. On Windows run `ipconfig` and find the Wi-Fi adapter **IPv4 Address**, e.g. `192.168.1.20`. The launcher may also print a suggested address.
4. On the PC open `http://127.0.0.1:8002`.
5. On your Android or iPhone, open Safari/Chrome and navigate to **`http://192.168.1.20:8002`** (replace with your actual PC IP). **Do not use `127.0.0.1` on the phone.**
6. Log in using the same demo resident/admin accounts. Reports and heatmap data are shared instantly by the same backend. Refresh or wait for the app's periodic refresh to see new data.
7. If the phone cannot connect, allow Python through Windows Defender Firewall for **Private networks only**, ensure same network, then retry. Campus Wi-Fi may block peer-to-peer connections: use a trusted personal hotspot instead.

### Home screen app shortcut

- On iPhone Safari: Share → Add to Home Screen.
- On Android Chrome: menu → Add to Home screen.
- Full PWA installation with service-worker offline behavior is **not** included. Proper installability on a phone generally requires HTTPS or a qualifying secure context. The system still runs as a normal browser app via LAN HTTP.

### Limitations and security precautions

- The host computer must be ON and the Python server running; this is **not** an always-online cloud app.
- **Do not put this prototype on public Wi-Fi, forward router ports, or expose it to the internet**: demo credentials, real-user information and HTTP (unencrypted) traffic are not appropriate for a public deployment.
- Use fake reports and sample photos for judging. For real deployment use HTTPS, strong account setup, CSRF/rate-limiting controls, operational monitoring and a managed host/database.
- Browser UI is responsive across Windows, macOS, Android and iOS. Native iOS/Android binaries are not included or needed for the web prototype.


## HCI mobile reporting redesign (v3)

Open `http://127.0.0.1:8002` on desktop or `http://YOUR-LAPTOP-IP:8002` on your phone (same Wi-Fi).

On **Resident → Report a hazard**, inputs are vertically ordered and the two supporting topics are collapsed below the submit button. This layout is one-column at **all screen widths** to avoid iPhone / in-app-browser viewport quirks. Severity choices appear as large stacked touch targets on smaller screens.

**Important:** Close the previous 8001 server before starting the new system to avoid confusion. This v3 launcher intentionally uses 8002 so old and new versions cannot be mistaken for each other. Cache-busted CSS/JS ensure you see the latest mobile design.
