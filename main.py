import os
import re
import logging
import secrets
import json
import magic 
import traceback
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from flask_sqlalchemy import SQLAlchemy
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from sqlalchemy import text

# Integrare Vertex AI (Gemini)
import vertexai
from vertexai.generative_models import GenerativeModel, Tool
from vertexai.preview.generative_models import grounding


def _candidate_vertex_models():
    primary_model = os.environ.get("VERTEX_MODEL_NAME", "gemini-2.5-flash")
    candidates = [
        primary_model,
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash-002",
    ]
    # Preserve order and remove duplicates.
    return list(dict.fromkeys(candidates))

# 1. CONFIGURARE SISTEM
logging.basicConfig(level=logging.INFO)
app = Flask(__name__, static_folder='frontend/dist', static_url_path='')

app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')
if not app.config['SECRET_KEY']:
    logging.warning("SECRET_KEY not set! Session security is compromised.")

app.permanent_session_lifetime = timedelta(days=30)
CORS(app)

# --- Vertex AI Initialization ---
try:
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")
    location = os.environ.get("VERTEX_LOCATION", "global")
    if project_id:
        vertexai.init(project=project_id, location=location)
        logging.info(f"Vertex AI initialized for project: {project_id} in {location}")
    else:
        logging.warning("GOOGLE_CLOUD_PROJECT env var not set. Vertex AI might not work.")
except Exception as e:
    logging.error(f"Vertex AI initialization failed: {e}")

# Configurare Uploads Safe
UPLOAD_FOLDER = '/tmp/uploads'
try:
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
except Exception as e:
    logging.warning(f"Nu s-a putut crea folderul de upload: {e}")

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB Limit
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov', 'pdf'}
ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/quicktime', 'application/pdf']

# Security: Rate Limiter
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://"
)

db_uri = os.environ.get('DATABASE_URL', 'sqlite:////tmp/mara_system.db')
app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def is_allowed_mimetype(file_stream):
    try:
        mime = magic.Magic(mime=True) 
        file_mime_type = mime.from_buffer(file_stream.read(2048))
        file_stream.seek(0)
        return file_mime_type in ALLOWED_MIMES
    except Exception as e:
        logging.error(f"MIME Check failed: {e}")
        return False

def _is_video_media(media_url):
    if not media_url:
        return False
    lowered = media_url.lower()
    return lowered.endswith('.mp4') or lowered.endswith('.mov')

def _clamp_text(text_value, max_len=4000):
    if not text_value:
        return ""
    value = str(text_value).strip()
    return value[:max_len]

def _load_user_memory(username):
    if not username:
        return []
    try:
        row = UserIntelligence.query.filter_by(username=username).first()
        if not row or not row.mara_notes:
            return []
        parsed = json.loads(row.mara_notes)
        if isinstance(parsed, list):
            return parsed[-30:]
    except Exception:
        pass
    return []

def _save_user_memory(username, memories):
    if not username:
        return
    safe_memories = memories[-30:]
    safe_payload = _clamp_text(json.dumps(safe_memories, ensure_ascii=False), max_len=12000)
    try:
        row = UserIntelligence.query.filter_by(username=username).first()
        if not row:
            row = UserIntelligence(username=username, mara_notes=safe_payload)
            db.session.add(row)
        else:
            row.mara_notes = safe_payload
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logging.error(f"User memory save error: {e}")

def _extract_brain_signals(message):
    msg = (message or "").lower()
    topics = []
    patterns = {
        "trading": ["trading", "btc", "eth", "chart", "signal", "rsi", "ema"],
        "writers": ["scrie", "manuscris", "carte", "roman", "poezie", "eseu"],
        "creator": ["creator", "video", "feed", "post", "reels", "upload"],
        "membership": ["vip", "premium", "abonament", "membership"],
        "social": ["profil", "followers", "comentarii", "you", "like"],
    }
    for topic, words in patterns.items():
        if any(word in msg for word in words):
            topics.append(topic)
    tone = "neutral"
    if any(x in msg for x in ["urgent", "repede", "acum", "asap"]):
        tone = "urgent"
    elif any(x in msg for x in ["explică", "invata", "începător", "pas cu pas"]):
        tone = "teaching"
    return {
        "topics": topics,
        "tone": tone,
    }

def _build_brain_context(username, user_message):
    recent_posts = []
    recent_manuscripts = []
    try:
        recent_posts = Post.query.filter_by(username=username).order_by(Post.timestamp.desc()).limit(3).all()
        recent_manuscripts = Manuscript.query.filter_by(username=username).order_by(Manuscript.timestamp.desc()).limit(2).all()
    except Exception:
        pass

    posts_text = [f"post:{_clamp_text(p.content, 120)}" for p in recent_posts if p and p.content]
    manuscripts_text = [f"manuscris:{_clamp_text(m.title, 80)}" for m in recent_manuscripts if m and m.title]
    memory_rows = _load_user_memory(username)
    memory_text = [str(x) for x in memory_rows[-6:]]
    signals = _extract_brain_signals(user_message)

    context_lines = []
    if posts_text:
        context_lines.append("Activitate recentă utilizator: " + " | ".join(posts_text))
    if manuscripts_text:
        context_lines.append("Lucrări recente: " + " | ".join(manuscripts_text))
    if memory_text:
        context_lines.append("Memorie personală: " + " | ".join(memory_text))
    context_lines.append("Semnale conversație curentă: " + json.dumps(signals, ensure_ascii=False))

    return "\n".join(context_lines)

def _learn_from_interaction(username, user_message, mara_reply):
    if not username:
        return
    signals = _extract_brain_signals(user_message)
    memories = _load_user_memory(username)
    memory_item = {
        "t": datetime.utcnow().isoformat(timespec='seconds'),
        "topics": signals.get("topics", []),
        "tone": signals.get("tone", "neutral"),
        "u": _clamp_text(user_message, 220),
        "m": _clamp_text(mara_reply, 220),
    }
    memories.append(memory_item)
    _save_user_memory(username, memories)

def _detect_risky_actions(message):
    msg = (message or "").lower()
    risk_map = {
        "factory_reset": ["factory reset", "reset total", "șterge tot", "sterge tot", "wipe", "drop all"],
        "db_destructive": ["drop database", "truncate", "delete users", "șterge utilizatori", "sterge utilizatori"],
        "payments": ["charge", "transfer", "payment", "plată", "plata", "iban"],
        "infra_changes": ["kubectl", "deployment", "scale", "restart pods", "ingress", "cloudbuild"],
        "credential_access": ["secret", "parol", "password", "token", "api key", "credentials"],
    }
    detected = []
    for action, terms in risk_map.items():
        if any(t in msg for t in terms):
            detected.append(action)
    return detected

def _guardrail_assessment(user_role, message):
    risky = _detect_risky_actions(message)
    if not risky:
        return {
            "allow": True,
            "reason": "none",
            "risk_level": "low",
            "risky_actions": [],
            "requires_human_approval": False,
        }

    is_admin = (user_role or "").lower() == "admin"
    block_non_admin = any(x in risky for x in ["factory_reset", "db_destructive", "infra_changes", "credential_access"])
    if block_non_admin and not is_admin:
        return {
            "allow": False,
            "reason": "restricted_action_for_non_admin",
            "risk_level": "high",
            "risky_actions": risky,
            "requires_human_approval": True,
        }

    return {
        "allow": True,
        "reason": "allowed_with_guardrails",
        "risk_level": "medium" if risky else "low",
        "risky_actions": risky,
        "requires_human_approval": len(risky) > 0,
    }

def _build_execution_plan(user_message, signals, guardrails):
    topics = signals.get("topics", []) if signals else []
    tone = (signals or {}).get("tone", "neutral")

    goal = _clamp_text(user_message, 180)
    steps = []
    if "trading" in topics:
        steps.extend([
            "Identifică nivelul utilizatorului (începător/intermediar/avansat)",
            "Explică setup-ul de bază și managementul riscului",
            "Propune exerciții aplicate pe date curente de piață",
        ])
    if "writers" in topics:
        steps.extend([
            "Clarifică tipul de text dorit (carte/eseu/reportaj)",
            "Generează structură în capitole sau secțiuni",
            "Propune draft inițial și checklist de revizie",
        ])
    if "creator" in topics:
        steps.extend([
            "Definește obiectivul de conținut și publicul țintă",
            "Propune formatul optim (video/foto/feed)",
            "Creează calendar de publicare și metrici de succes",
        ])
    if "membership" in topics:
        steps.extend([
            "Verifică statusul actual al utilizatorului",
            "Explică beneficiile premium relevante pentru cerere",
            "Direcționează spre fluxul de activare cu confirmare umană",
        ])
    if "social" in topics:
        steps.extend([
            "Analizează activitatea recentă din profil",
            "Propune optimizări pentru engagement",
            "Schițează următorii pași de creștere comunitate",
        ])

    if not steps:
        steps = [
            "Clarifică obiectivul utilizatorului în 1-2 întrebări",
            "Oferă un plan scurt, executabil, în pași",
            "Verifică rezultatul și adaptează răspunsul următor",
        ]

    if tone == "urgent":
        steps.insert(0, "Livrează mai întâi varianta minimă care rezolvă imediat problema")
    elif tone == "teaching":
        steps.insert(0, "Structurează explicația de la bază la avansat")

    return {
        "goal": goal,
        "steps": steps[:6],
        "requires_human_approval": bool(guardrails.get("requires_human_approval")),
        "risk_level": guardrails.get("risk_level", "low"),
    }

def _compute_confidence(user_message, mara_reply, signals, selected_model, guardrails, fallback_used):
    score = 0.58

    if selected_model and "2.5" in selected_model:
        score += 0.10
    elif selected_model and "2.0" in selected_model:
        score += 0.07
    else:
        score += 0.04

    if signals.get("topics"):
        score += 0.08
    if signals.get("tone") == "teaching":
        score += 0.03
    if len(_clamp_text(mara_reply, 2000)) > 60:
        score += 0.05
    if fallback_used:
        score -= 0.06

    risk_level = guardrails.get("risk_level", "low")
    if risk_level == "medium":
        score -= 0.05
    elif risk_level == "high":
        score -= 0.12

    score = max(0.0, min(0.99, score))
    return round(score, 2)

# 3. ORM Models
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, unique=True, nullable=False)
    password = db.Column(db.String, nullable=False)
    role = db.Column(db.String, default='user')
    nickname = db.Column(db.String)
    bio = db.Column(db.Text, default='Digital Architect')
    location = db.Column(db.String, default='Mars Orbit')
    avatar = db.Column(db.String, nullable=True)
    cover = db.Column(db.String, nullable=True)

class Post(db.Model):
    __tablename__ = 'posts'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False)
    content = db.Column(db.Text)
    media_url = db.Column(db.String, nullable=True)
    likes = db.Column(db.Integer, default=0)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class MaraEvolution(db.Model):
    __tablename__ = 'mara_evolution'
    id = db.Column(db.Integer, primary_key=True)
    file_path = db.Column(db.String)
    proposed_code = db.Column(db.Text)
    status = db.Column(db.String, default='pending')
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class UserProgress(db.Model):
    __tablename__ = 'user_progress'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False)
    lesson_id = db.Column(db.String, nullable=False)
    completed = db.Column(db.Integer, default=0)
    badge = db.Column(db.String, nullable=True)
    __table_args__ = (db.UniqueConstraint('username', 'lesson_id', name='_user_lesson_uc'),)

class Manuscript(db.Model):
    __tablename__ = 'manuscripts'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False)
    title = db.Column(db.String)
    content = db.Column(db.Text)
    cover_url = db.Column(db.String, nullable=True)
    type = db.Column(db.String)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class Comment(db.Model):
    __tablename__ = 'comments'
    id = db.Column(db.Integer, primary_key=True)
    target_id = db.Column(db.Integer, nullable=False)
    target_type = db.Column(db.String, nullable=False)
    username = db.Column(db.String, nullable=False)
    content = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class UserIntelligence(db.Model):
    __tablename__ = 'user_intelligence'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, unique=True)
    mara_notes = db.Column(db.Text)

class PasswordResetToken(db.Model):
    __tablename__ = 'password_reset_tokens'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String, nullable=False)
    token = db.Column(db.String, unique=True, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)

class PlatformTelemetry(db.Model):
    __tablename__ = 'platform_telemetry'
    id = db.Column(db.Integer, primary_key=True)
    total_users = db.Column(db.Integer)
    manuscripts_count = db.Column(db.Integer)
    pending_evolutions = db.Column(db.Integer)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class MaraKnowledgeBase(db.Model):
    __tablename__ = 'mara_knowledge_base'
    id = db.Column(db.Integer, primary_key=True)
    source_title = db.Column(db.String)
    concepts = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

def init_db_orm():
    try:
        with app.app_context():
            db.create_all()
            admin_email = "theoraul29@gmail.com"
            if not User.query.filter_by(username=admin_email).first():
                admin_pass = generate_password_hash("Gshock199123!")
                admin_user = User(username=admin_email, password=admin_pass, role="admin", nickname="Raul")
                db.session.add(admin_user)
                db.session.commit()
                logging.info("Admin user created.")
    except Exception as e:
        logging.error(f"DB Init Error (Non-fatal): {e}")

init_db_orm()

# --- 3. RUTE NAVIGARE & STATIC ---


# Servește frontend-ul modern la orice rută necunoscută (SPA support)
from flask import send_from_directory

@app.route('/')
def root():
    return send_from_directory(app.static_folder, 'index.html')

# Catch-all pentru orice altă rută care nu e API sau static explicit
@app.route('/<path:path>')
def catch_all(path):
    try:
        return send_from_directory(app.static_folder, path)
    except Exception:
        return send_from_directory(app.static_folder, 'index.html')

@app.route('/login')
def login_page():
    return send_from_directory(app.static_folder, 'login.html')

@app.route('/signup')
def signup_page():
    return send_from_directory(app.static_folder, 'signup.html')

@app.route('/index')
def index_page():
    if 'user' not in session: return redirect(url_for('login_page'))
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/reels')
def reels_page():
    # Acces universal la vizualizare Reels
    return send_from_directory(app.static_folder, 'reels.html')

@app.route('/writers-hub')
def writers_hub_page():
    if 'user' not in session: return redirect(url_for('login_page'))
    return send_from_directory(app.static_folder, 'writershub.html')

@app.route('/trading-academy')
def trading_academy_page():
    if 'user' not in session: return redirect(url_for('login_page'))
    return send_from_directory(app.static_folder, 'trading-academy.html')

@app.route('/membership')
def membership_page():
    if 'user' not in session: return redirect(url_for('login_page'))
    return send_from_directory(app.static_folder, 'membership.html')

@app.route('/creator-panel')
def creator_panel_page():
    if 'user' not in session: return redirect(url_for('login_page'))
    return send_from_directory(app.static_folder, 'creator-panel.html')

@app.route('/you')
def you_page():
    # Acces universal la vizualizare You
    return send_from_directory(app.static_folder, 'you.html')

@app.route('/admin-dashboard')
def admin_dashboard_page():
    if 'user' not in session or session.get('role') != 'admin': return redirect(url_for('login_page'))
    return send_from_directory(app.static_folder, 'admin_dashboard.html')

@app.route('/reset-password')
def reset_password_page():
    return send_from_directory(app.static_folder, 'reset_password.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))

# --- 4. API ENDPOINTS ---

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    try:
        user = User.query.filter_by(username=data['username']).first()
        
        if user and check_password_hash(user.password, data['password']):
            session.permanent = True 
            session['user'] = user.username
            session['role'] = user.role
            return jsonify({"status": "success"})
        return jsonify({"status": "error"}), 401
    except Exception as e:
        logging.error(f"Login Error: {e}")
        return jsonify({"status": "error", "message": "Server Error"}), 500

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    u = data.get('username')
    p = data.get('password')
    if not u or not p: return jsonify({"status": "error", "message": "Missing data"}), 400
    
    if len(p) < 8:
        return jsonify({"status": "error", "message": "Password too weak"}), 400
    
    hashed_pw = generate_password_hash(p)
    try:
        new_user = User(username=u, password=hashed_pw, role='user', nickname=u.split('@')[0] if '@' in u else u)
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"status": "success"})
    except Exception as e:
        app.logger.error(f"Error during signup: {e}")
        return jsonify({"status": "error", "message": "User already exists or DB error"}), 400

@app.route('/api/request-password-reset', methods=['POST'])
def request_password_reset():
    if not request.is_json:
        return jsonify({"status": "error", "message": "Request must be JSON."}), 415

    data = request.get_json()
    email = data.get('email')
    if not email:
        return jsonify({"status": "error", "message": "Email is required."}), 400

    try:
        user = User.query.filter_by(username=email).first()
        if user:
            token = secrets.token_urlsafe(32)
            expires_at = datetime.utcnow() + timedelta(minutes=15)
            new_token = PasswordResetToken(username=email, token=token, expires_at=expires_at)
            db.session.add(new_token)
            db.session.commit()
            reset_link = url_for('reset_password_page', token=token, _external=True)
            logging.info(f"PASSWORD RESET LINK for {email}: {reset_link}")

        return jsonify({"status": "success", "message": "If an account with that email exists, a reset link has been generated."})
    except Exception as e:
        # Log the full traceback for detailed debugging
        tb_str = traceback.format_exc()
        logging.error(f"Password Reset Request Error: {e}\n{tb_str}")
        # Return a more specific error message to the frontend
        return jsonify({"status": "error", "message": f"Server error: {e}"}), 500

@app.route('/api/perform-password-reset', methods=['POST'])
def perform_password_reset():
    token = request.json.get('token')
    new_password = request.json.get('password')

    if not token or not new_password:
        return jsonify({"status": "error", "message": "Token and password are required."}), 400

    try:
        token_entry = PasswordResetToken.query.filter_by(token=token).first()

        if token_entry and datetime.utcnow() < token_entry.expires_at:
            user = User.query.filter_by(username=token_entry.username).first()
            if not user: return jsonify({"status": "error", "message": "Invalid token."}), 400
            user.password = generate_password_hash(new_password)
            db.session.delete(token_entry)
            db.session.commit()
            return jsonify({"status": "success", "message": "Password has been reset successfully."})
        else:
            return jsonify({"status": "error", "message": "Invalid or expired token."}), 400
    except Exception as e:
        logging.error(f"Perform Password Reset Error: {e}")
        return jsonify({"status": "error", "message": "Server error during password update."}), 500

@app.route('/api/user-info')
def user_info():
    if 'user' not in session: return jsonify({"role": "guest"}), 401
    try:
        user = User.query.filter_by(username=session['user']).first()
        if not user:
            return jsonify({"role": "guest", "nickname": "Unknown"}), 404
        return jsonify({"role": user.role, "nickname": user.nickname})
    except Exception:
        return jsonify({"role": "guest", "nickname": "Error"})

@app.route('/api/profile')
def get_profile():
    if 'user' not in session: return jsonify({}), 401
    try:
        user = User.query.filter_by(username=session['user']).first()
        if not user: return jsonify({"error": "User not found"}), 404
        
        progress = UserProgress.query.filter_by(username=session['user']).filter(UserProgress.badge.isnot(None)).all()
        badges = [p.badge for p in progress]
        
        return jsonify({
            "nickname": user.nickname, "bio": user.bio, "location": user.location, 
            "avatar": user.avatar, "cover": user.cover, "role": user.role,
            "badges": badges
        })
    except Exception as e:
        logging.error(f"Profile error: {e}")
        return jsonify({}), 500

@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    if 'user' not in session: return jsonify({"status": "error"}), 401
    target = request.form.get('target')
    if target not in ['avatar', 'cover']:
        return jsonify({"status": "error", "message": "Invalid target"}), 400

    file = request.files.get('file')
    if file and allowed_file(file.filename) and is_allowed_mimetype(file.stream):
        filename = secure_filename(file.filename)
        save_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(save_path)
        url = f"/uploads/{filename}"
        
        try:
            user = User.query.filter_by(username=session['user']).first()
            setattr(user, target, url)
            db.session.commit()
            return jsonify({"status": "success", "url": url})
        except Exception as e:
            logging.error(f"DB Image Update Error: {e}")
            return jsonify({"status": "error"}), 500
    return jsonify({"status": "error"}), 400

@app.route('/api/update-profile', methods=['POST'])
def update_profile():
    if 'user' not in session: return jsonify({"status": "error"}), 401
    data = request.json
    try:
        user = User.query.filter_by(username=session['user']).first()
        user.bio = data.get('bio')
        user.location = data.get('location')
        db.session.commit()
        return jsonify({"status": "success"})
    except Exception:
        return jsonify({"status": "error"}), 500

@app.route('/api/posts', methods=['GET', 'POST'])
def handle_posts():
    if request.method == 'GET':
        try:
            posts_db = Post.query.order_by(Post.timestamp.desc()).limit(50).all()
            posts = [{"id": p.id, "user": p.username, "content": p.content, "media": p.media_url, "likes": p.likes, "time": str(p.timestamp)} for p in posts_db]
            return jsonify(posts)
        except Exception as e:
            logging.error(f"Get Posts Error: {e}")
            return jsonify([])

    if request.method == 'POST':
        if 'user' not in session:
            return jsonify({"status": "error", "message": "Not logged in"}), 401
        user = User.query.filter_by(username=session['user']).first()
        is_premium = False
        if user:
            role = (user.role or '').lower()
            is_premium = role in ['admin', 'premium', 'vip']
        content = request.form.get('content')
        file = request.files.get('file')
        media_url = None
        # Userii non-premium pot posta doar text sau imagini, nu video/audio/alte fișiere
        if not is_premium:
            if file:
                ext = os.path.splitext(file.filename)[1].lower()
                if ext not in ['.jpg', '.jpeg', '.png', '.gif']:
                    return jsonify({"status": "error", "message": "Doar imagini permise pentru conturi gratuite."}), 403
        if file and allowed_file(file.filename) and is_allowed_mimetype(file.stream):
            filename = secure_filename(file.filename)
            file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
            media_url = f"/uploads/{filename}"
        try:
            new_post = Post(username=session['user'], content=content, media_url=media_url)
            db.session.add(new_post)
            db.session.commit()
            return jsonify({"status": "success", "premium_tools": is_premium})
        except Exception as e:
            logging.error(f"Create Post Error: {e}")
            return jsonify({"status": "error"}), 500
    
    return jsonify({"status": "error", "message": "Method not allowed"}), 405

@app.route('/api/reels', methods=['GET'])
def get_reels():
    try:
        posts_db = Post.query.order_by(Post.timestamp.desc()).limit(100).all()
        reels = []
        for p in posts_db:
            if not _is_video_media(p.media_url):
                continue
            reels.append({
                "id": p.id,
                "videoUrl": p.media_url,
                "author": p.username,
                "caption": p.content or "",
                "audioName": "Mara Original",
                "likes": str(p.likes or 0),
                "shares": "0",
            })
        return jsonify(reels)
    except Exception as e:
        logging.error(f"Get Reels Error: {e}")
        return jsonify([]), 500

@app.route('/api/writers/library', methods=['GET'])
def writers_library():
    try:
        manuscripts = Manuscript.query.order_by(Manuscript.timestamp.desc()).limit(100).all()
        result = []
        for m in manuscripts:
            result.append({
                "id": m.id,
                "title": m.title or "Fără titlu",
                "content": m.content or "",
                "author": m.username,
                "likes": 0,
                "genre": m.type or "General",
                "comments": [],
            })
        return jsonify(result)
    except Exception as e:
        logging.error(f"Writers Library Error: {e}")
        return jsonify([]), 500

@app.route('/api/writers/publish', methods=['POST'])
def writers_publish():
    data = request.json or {}
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()
    genre = (data.get('genre') or 'General').strip()

    if not title or not content:
        return jsonify({"status": "error", "message": "Title and content are required."}), 400

    username = session.get('user') or data.get('author') or 'Mara'

    try:
        manuscript = Manuscript(
            username=username,
            title=title,
            content=content,
            type=genre,
        )
        db.session.add(manuscript)
        db.session.commit()
        return jsonify({
            "id": manuscript.id,
            "title": manuscript.title,
            "content": manuscript.content,
            "author": manuscript.username,
            "likes": 0,
            "genre": manuscript.type,
            "comments": [],
        })
    except Exception as e:
        db.session.rollback()
        logging.error(f"Writers Publish Error: {e}")
        return jsonify({"status": "error", "message": "Publish failed."}), 500

@app.route('/api/user/vip-status', methods=['GET'])
def user_vip_status():
    if 'user' not in session:
        return jsonify({"isPremium": False}), 401

    try:
        user = User.query.filter_by(username=session['user']).first()
        if not user:
            return jsonify({"isPremium": False}), 404
        role = (user.role or '').lower()
        return jsonify({"isPremium": role in ['admin', 'premium', 'vip']})
    except Exception as e:
        logging.error(f"VIP status error: {e}")
        return jsonify({"isPremium": False}), 500

@app.route('/api/trading/signals', methods=['GET'])
def trading_signals():
    prompt = (
        "Generează un semnal scurt pentru BTC și ETH în format clar: "
        "Bias (Bullish/Bearish/Neutral), niveluri cheie și risc. "
        "Răspuns în limba română, max 3 propoziții."
    )

    try:
        for model_name in _candidate_vertex_models():
            try:
                model = GenerativeModel(model_name=model_name)
                response = model.generate_content(prompt)
                text_reply = response.text if response and response.text else "Niciun semnal detectat."
                return jsonify({"content": text_reply})
            except Exception as model_err:
                err_text = str(model_err)
                if (
                    "was not found" in err_text
                    or "Publisher Model" in err_text
                    or "does not have access" in err_text
                ):
                    logging.warning(f"Trading model unavailable: {model_name}; trying fallback.")
                    continue
                raise
    except Exception as e:
        logging.error(f"Trading signal generation error: {e}")

    return jsonify({
        "content": "Semnal fallback: piața este volatilă. Așteaptă confirmare pe volum și păstrează risk management strict."
    })

@app.route('/api/brain/status', methods=['GET'])
def brain_status():
    if 'user' not in session:
        return jsonify({"status": "unauthorized"}), 401
    username = session.get('user')
    memory_rows = _load_user_memory(username)
    return jsonify({
        "status": "ok",
        "user": username,
        "memory_items": len(memory_rows),
        "last_topics": memory_rows[-1].get("topics", []) if memory_rows else [],
    })

@app.route('/api/brain/learn', methods=['POST'])
def brain_learn():
    if 'user' not in session:
        return jsonify({"status": "unauthorized"}), 401
    note = _clamp_text((request.json or {}).get("note"), 220)
    if not note:
        return jsonify({"status": "error", "message": "Missing note"}), 400

    username = session.get('user')
    memories = _load_user_memory(username)
    memories.append({
        "t": datetime.utcnow().isoformat(timespec='seconds'),
        "topics": ["manual"],
        "tone": "manual",
        "u": "manual_note",
        "m": note,
    })
    _save_user_memory(username, memories)
    return jsonify({"status": "success", "memory_items": len(memories)})

@app.route('/api/brain/plan', methods=['POST'])
def brain_plan():
    if 'user' not in session:
        return jsonify({"status": "unauthorized"}), 401

    payload = request.json or {}
    message = _clamp_text(payload.get("message"), 600)
    if not message:
        return jsonify({"status": "error", "message": "Missing message"}), 400

    role = session.get('role', 'user')
    signals = _extract_brain_signals(message)
    guardrails = _guardrail_assessment(role, message)
    plan = _build_execution_plan(message, signals, guardrails)

    return jsonify({
        "status": "ok",
        "signals": signals,
        "guardrails": guardrails,
        "plan": plan,
    })

@app.route('/api/chat', methods=['POST'])
@limiter.limit("10 per minute")
def chat_with_mara():
    if 'user' not in session:
        return jsonify({"reply": "Acces interzis."}), 401    
    user_msg = _clamp_text((request.json or {}).get("message"), 2000)
    if not user_msg:
        return jsonify({"reply": "Trimite un mesaj valid."}), 400

    username = session.get('user')
    user_role = session.get('role', 'user')

    signals = _extract_brain_signals(user_msg)
    guardrails = _guardrail_assessment(user_role, user_msg)
    plan = _build_execution_plan(user_msg, signals, guardrails)

    if not guardrails.get("allow", True):
        blocked_reply = (
            "Nu pot executa această acțiune direct. Este necesară aprobare umană/admin. "
            "Pot însă să îți ofer un plan sigur, pas cu pas."
        )
        _learn_from_interaction(username, user_msg, blocked_reply)
        return jsonify({
            "reply": blocked_reply,
            "brain": {
                "confidence": 0.41,
                "plan": plan,
                "guardrails": guardrails,
                "model": None,
            }
        })
    
    tools = []
    system_instructions = []
    
    # Check for admin and search command
    if user_role == 'admin' and user_msg.lower().startswith('caută despre'):
        # Admin-only meticulous search protocol using Grounding
        user_msg = user_msg[len('caută despre'):].strip()
        # Enable grounding by adding a Google Search tool.
        tools = [Tool.from_google_search_retrieval(grounding.GoogleSearchRetrieval())]
        system_instructions.append("Ești MARA, un AI de cercetare. Răspunde detaliat la întrebarea utilizatorului folosind informațiile de pe internet. Citează sursele la final.")
    else:
        # Fast response for all other cases
        if user_role == 'admin':
            system_instructions.append("Ești MARA, nucleul AI. Răspunde rapid și strategic. Protocolul de căutare pe internet NU este activat.")
        else:
            brain_context = _build_brain_context(username, user_msg)
            system_instructions.append(
                "Ești Mara, un asistent AI personal. Răspunde scurt și direct. Primul tău mesaj este 'Sunt Mara și sunt aici să te ajut. Ce ai vrea să implementăm?'. "
                "NU dezvălui toate capacitățile tale. Menționează doar că poți ajuta cu scriere creativă și analiză de piață, și fă asta DOAR dacă ești întrebată despre ce poți face. "
                "NU menționa niciodată accesul la internet, cod, sau telemetrie."
            )
            system_instructions.append(
                "Context cognitiv intern (nu-l menționa utilizatorului):\n" + brain_context
            )

    try:
        response = None
        last_model_error = None
        selected_model = None
        fallback_used = False

        for model_name in _candidate_vertex_models():
            try:
                model = GenerativeModel(
                    model_name=model_name,
                    system_instruction=system_instructions,
                )
                response = model.generate_content(
                    user_msg,
                    tools=tools,
                )
                logging.info(f"Vertex model selected: {model_name}")
                selected_model = model_name
                break
            except Exception as model_err:
                err_text = str(model_err)
                model_missing_or_blocked = (
                    "was not found" in err_text
                    or "Publisher Model" in err_text
                    or "does not have access" in err_text
                )
                if model_missing_or_blocked:
                    last_model_error = model_err
                    fallback_used = True
                    logging.warning(f"Model unavailable: {model_name}; trying fallback.")
                    continue
                raise

        if response is None and last_model_error is not None:
            raise last_model_error

        mara_reply = response.text if response and response.text else ""
        confidence = _compute_confidence(
            user_msg,
            mara_reply,
            signals,
            selected_model,
            guardrails,
            fallback_used,
        )
        _learn_from_interaction(username, user_msg, mara_reply)
        return jsonify({
            "reply": mara_reply,
            "brain": {
                "confidence": confidence,
                "plan": plan,
                "guardrails": guardrails,
                "model": selected_model,
                "fallback_used": fallback_used,
            }
        })

    except Exception as e:
        logging.error(f"Vertex AI Chat Error: {e}")
        tb_str = traceback.format_exc()
        logging.error(tb_str)
        return jsonify({"reply": "Sistemul AI este momentan indisponibil (Vertex AI Error)."}), 500

@app.route('/api/telemetry')
def get_telemetry():
    if 'user' not in session or session.get('role') != 'admin': return jsonify([]), 403
    try:
        telemetry_data = PlatformTelemetry.query.order_by(PlatformTelemetry.timestamp.desc()).limit(50).all()
        result = [{"users": r.total_users, "manuscripts": r.manuscripts_count, "evolutions": r.pending_evolutions, "time": str(r.timestamp)} for r in telemetry_data]
        return jsonify(result)
    except Exception:
        return jsonify([])

@app.route('/api/admin/factory-reset', methods=['POST'])
def factory_reset():
    if 'user' not in session or session.get('role') != 'admin':
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    try:
        # Delete all user-generated content
        db.session.query(Post).delete()
        db.session.query(Manuscript).delete()
        db.session.query(Comment).delete()
        db.session.query(UserProgress).delete()
        db.session.query(UserIntelligence).filter(UserIntelligence.username != "theoraul29@gmail.com").delete()
        db.session.query(PasswordResetToken).delete()
        
        # Delete all users except the admin
        db.session.query(User).filter(User.username != "theoraul29@gmail.com").delete()
        
        db.session.commit()
        return jsonify({"status": "success", "message": "Platform data has been reset. Only the admin account remains."})
    except Exception as e:
        db.session.rollback()
        logging.error(f"Factory Reset Error: {e}")
        return jsonify({"status": "error", "message": f"An error occurred during reset: {e}"}), 500

# --- HEALTH CHECKS (Kubernetes) ---
@app.route('/healthz')
@limiter.exempt
def health_check():
    # Liveness probe: Doar returnează 200 OK dacă serverul rulează
    return "OK", 200

@app.route('/readyz')
@limiter.exempt
def readiness_check():
    # Readiness probe: Verifică dacă putem comunica cu baza de date
    try:
        db.session.execute(text('SELECT 1'))
        return "Ready", 200
    except Exception as e:
        return f"Not Ready: {e}", 500

# --- RUN SERVER ---
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
