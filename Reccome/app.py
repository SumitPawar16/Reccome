import os
from dotenv import load_dotenv
from flask import Flask, render_template, request, redirect, url_for, session, jsonify,flash
from pymongo import MongoClient
import time
import requests
from werkzeug.security import generate_password_hash, check_password_hash
import random
import secrets
import smtplib
from email.message import EmailMessage

# .env file se secrets load karo (local ke liye). Render pe Environment tab se aate hain.
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY')
if not app.secret_key:
    raise RuntimeError('FLASK_SECRET_KEY environment variable is not set')

# TMDB key (environment se)
TMDB_API_KEY = os.getenv('TMDB_API_KEY')


# --- CONNECTION ---
uri = os.getenv('MONGODB_URI')
if not uri:
    raise RuntimeError('MONGODB_URI environment variable is not set')
client = MongoClient(uri)
db = client['myflaskapp'] 
users_collection = db['users']
reviews_collection = db['reviews']
pending_signups_collection = db['pending_signups']

def send_otp_email(user_email, otp):
    SENDER_EMAIL = os.getenv('MAIL_SENDER_EMAIL')
    SENDER_PASSWORD = os.getenv('MAIL_SENDER_PASSWORD')
    
    msg = EmailMessage()
    msg['Subject'] = 'Reccome - Verify Your Account'
    msg['From'] = SENDER_EMAIL
    msg['To'] = user_email
    msg.set_content(f"Welcome to Reccome! 🎬\n\nYour OTP for registration is: {otp}\n\nThis OTP is valid for 10 minutes. Don't share this with anyone.")
    
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(SENDER_EMAIL, SENDER_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as e:
        print("Mail error:", e)
        return False

@app.route('/')
def home():
    if 'user' in session:
        return redirect(url_for('dashboard'))   
    return render_template('index.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'user' in session:
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        user_data = users_collection.find_one({"email": email})

        if user_data and check_password_hash(user_data['password'], password):
            session['email'] = user_data['email']
            session['user'] = user_data['name']
            session['role'] = user_data.get('role', 'user')
            
            if session['role'] == 'admin':
                return redirect(url_for('admin_panel'))
            return redirect(url_for('dashboard'))
        else:
            flash("Invalid Email or Password! Please try again.", "error")
            return redirect(url_for('login'))

    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST']) 
def signup():
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email') 
        password = request.form.get('password')

        # Khali fields allowed nahi
        if not name or not email or not password:
            flash("Please fill all the fields.", "error")
            return redirect(url_for('home'))
        
        # Check if email already exists
        if users_collection.find_one({"email": email}):
            flash("Email already registered. Please login.", "error")
            return redirect(url_for('login'))

        # 1. 6-Digit OTP Generate karo (secrets = secure random)
        otp = str(secrets.randbelow(900000) + 100000)
        
        # 2. Email pe OTP bhejo
        mail_sent = send_otp_email(email, otp)
        
        if mail_sent:
            # 3. Signup data + OTP database mein save karo (cookie mein nahi)
            #    OTP 10 minute (600 seconds) ke liye valid rahega
            pending_signups_collection.update_one(
                {"email": email},
                {"$set": {
                    "name": name,
                    "email": email,
                    "password": generate_password_hash(password),
                    "role": "user",
                    "otp": otp,
                    "expires_at": time.time() + 600,
                    "attempts": 0
                }},
                upsert=True
            )
            # Session mein sirf email rakho
            session['pending_email'] = email
            
            # OTP verification page pe bhej do
            return render_template('verify_otp.html', email=email)
        else:
            flash("OTP email could not be sent. Please try again.", "error")
            return redirect(url_for('home'))
            
    return redirect(url_for('home'))

# OTP CHECK KARNE KE LIYE ROUTE
@app.route('/verify_otp', methods=['GET', 'POST'])
def verify_otp():
    email = session.get('pending_email')

    if request.method == 'POST':
        user_otp = str(request.form.get('otp') or '')
        pending = pending_signups_collection.find_one({"email": email}) if email else None

        # Signup data nahi mila
        if not pending:
            flash("Session expired. Please sign up again.", "error")
            return redirect(url_for('home'))

        # OTP expire ho gaya
        if time.time() > pending['expires_at']:
            pending_signups_collection.delete_one({"email": email})
            session.pop('pending_email', None)
            flash("OTP expired. Please sign up again.", "error")
            return redirect(url_for('home'))

        # Zyada galat attempts
        if pending['attempts'] >= 5:
            pending_signups_collection.delete_one({"email": email})
            session.pop('pending_email', None)
            flash("Too many wrong attempts. Please sign up again.", "error")
            return redirect(url_for('home'))

        # Check if entered OTP matches the one we sent
        if secrets.compare_digest(user_otp, pending['otp']):
            # Email pehle se register to nahi ho gaya?
            if users_collection.find_one({"email": email}):
                pending_signups_collection.delete_one({"email": email})
                session.pop('pending_email', None)
                return redirect(url_for('login'))

            # OTP Sahi hai! Ab database mein user save karo
            new_user = {
                "name": pending['name'],
                "email": pending['email'],
                "password": pending['password'],
                "role": pending['role']
            }
            users_collection.insert_one(new_user)

            # Pending data clean karo aur login karo
            pending_signups_collection.delete_one({"email": email})
            session.pop('pending_email', None)

            session['user'] = new_user['name']
            session['email'] = new_user['email']
            session['role'] = new_user['role']

            return redirect(url_for('dashboard'))
        else:
            pending_signups_collection.update_one({"email": email}, {"$inc": {"attempts": 1}})
            flash("Wrong OTP. Please try again.", "error")
            # Wapas OTP page pe bhejo
            return render_template('verify_otp.html', email=email)

    return render_template('verify_otp.html', email=email or '')

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return redirect(url_for('login'))
    user_data = users_collection.find_one({"email": session['email']})
    fav_genre = user_data.get('favorite_genre', '') if user_data else ''
    
    return render_template('homepage.html', name=session['user'], email=session.get('email'), fav_genre=fav_genre)

# ==========================================
# 👑 GOD MODE (ADMIN PANEL) ROUTES & APIs
# ==========================================

@app.route('/admin')
def admin_panel():
    # Agar user nahi hai ya role admin nahi hai, toh access denied!
    if 'user' not in session or session.get('role') != 'admin':
        flash("Access Denied! Sirf Admin allowed hai.", "error")
        return redirect(url_for('dashboard'))
    
    # Apna naya premium admin page load karo
    return render_template('admin.html')

@app.route('/api/admin/stats', methods=['GET'])
def admin_stats():
    if session.get('role') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
    total_users   = users_collection.count_documents({"role": "user"})
    total_reviews = reviews_collection.count_documents({})
    return jsonify({"total_users": total_users, "total_reviews": total_reviews})

@app.route('/api/admin/users', methods=['GET'])
def admin_get_users():
    if session.get('role') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
 
    raw_users = list(users_collection.find({}, {"_id": 0, "password": 0}))
 
    # Har user ke liked + watchlist ka count add karo
    for u in raw_users:
        u['liked_count']     = len(u.get('liked_movies', []))
        u['watchlist_count'] = len(u.get('watchlist', []))
        # Heavy data frontend ko mat bhejo
        u.pop('liked_movies', None)
        u.pop('watchlist', None)
 
    return jsonify(raw_users)

@app.route('/api/admin/reviews', methods=['GET'])
def admin_get_reviews():
    if session.get('role') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
 
    all_reviews = list(reviews_collection.find({}, {"_id": 0}))
    all_reviews.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
    return jsonify(all_reviews)
 
 
# --- ADMIN: Review delete karo ---
@app.route('/api/admin/delete_review', methods=['POST'])
def admin_delete_review():
    if session.get('role') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
 
    data = request.json
    movie_id = data.get('movie_id')
    email    = data.get('email')
 
    result = reviews_collection.delete_one({
        "movie_id": str(movie_id),
        "email":    email
    })
 
    if result.deleted_count > 0:
        return jsonify({"success": True, "message": "Review delete ho gaya!"})
    return jsonify({"success": False, "message": "Review nahi mila."})
 
 
# --- ADMIN: Review flag/unflag karo (hide from public without deleting) ---
@app.route('/api/admin/flag_review', methods=['POST'])
def admin_flag_review():
    if session.get('role') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
 
    data     = request.json
    movie_id = data.get('movie_id')
    email    = data.get('email')
    flag     = data.get('flagged', True)   # True = hide, False = unhide
 
    reviews_collection.update_one(
        {"movie_id": str(movie_id), "email": email},
        {"$set": {"flagged": flag}}
    )
    return jsonify({"success": True, "flagged": flag})

@app.route('/api/admin/ban_user', methods=['POST'])
def admin_ban_user():
    if session.get('role') != 'admin': 
        return jsonify({"error": "Unauthorized"}), 403
    
    email_to_ban = request.json.get('email')
    
    if email_to_ban == session.get('email'):
        return jsonify({"success": False, "message": "You can't ban yourself!"})
    
    target_user = users_collection.find_one({"email": email_to_ban})
    if target_user and target_user.get('role') == 'admin':
        return jsonify({"success": False, "message": "You can't ban another Admin!"})
        
    result = users_collection.delete_one({"email": email_to_ban})
    
    if result.deleted_count > 0:
        return jsonify({"success": True})
    else:
        return jsonify({"success": False, "message": "User not found."})

@app.route('/api/admin/change_role', methods=['POST'])
def admin_change_role():
    if session.get('role') != 'admin':
        return jsonify({"error": "Unauthorized"}), 403
 
    data     = request.json
    email    = data.get('email')
    new_role = data.get('role')  # "user" ya "admin"
 
    if email == session.get('email'):
        return jsonify({"success": False, "message": "Apna role khud nahi badal sakte!"}), 400
 
    if new_role not in ['user', 'admin']:
        return jsonify({"success": False, "message": "Invalid role!"}), 400
 
    users_collection.update_one(
        {"email": email},
        {"$set": {"role": new_role}}
    )
    return jsonify({"success": True, "new_role": new_role})

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# --- NAYA ROUTE: AI VIBE SAVE KARNE KE LIYE ---
@app.route('/api/save_genre', methods=['POST'])
def save_genre():
    if 'email' not in session:
        return jsonify({"success": False, "message": "Not logged in"}), 401
        
    data = request.json
    genre_id = data.get('genre_id')
    
    # MongoDB mein user ki profile update karo
    users_collection.update_one(
        {"email": session['email']}, 
        {"$set": {"favorite_genre": genre_id}}
    )
    
    return jsonify({"success": True, "genre_id": genre_id})
# MOVIE API
@app.route('/api/movies', methods=['GET'])
def get_movies():
    time.sleep(2.5) 
    
    BASE_URL = 'https://api.themoviedb.org/3'
    IMG_URL = 'https://image.tmdb.org/t/p/w500'
    
    genres = {'action': 28, 'comedy': 35, 'horror': 27}
    movies_data = {}

    try:
        for name, genre_id in genres.items():
            res = requests.get(f"{BASE_URL}/discover/movie?api_key={TMDB_API_KEY}&with_genres={genre_id}")
            results = res.json().get('results', [])
            
            movies_data[name] = [
                {
                    "id": m['id'],
                    "title": m['title'],
                    "rating": str(m['vote_average']),
                    "image": f"{IMG_URL}{m['poster_path']}" if m['poster_path'] else "https://via.placeholder.com/400x600"
                } for m in results[:10]
            ]
        return jsonify(movies_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/movie-details', methods=['GET'])
def get_movie_details():
    movie_id = request.args.get('id') 
    BASE_URL = 'https://api.themoviedb.org/3'

    if not movie_id:
        return jsonify({"error": "Movie ID missing"}), 400

    try:
        # 🔥 MAGIC YAHAN HAI: append_to_response mein watch/providers aur reviews add kar diya
        detail_url = f"{BASE_URL}/movie/{movie_id}?api_key={TMDB_API_KEY}&append_to_response=videos,credits,recommendations,watch/providers,reviews"
        d = requests.get(detail_url).json()

        if 'id' not in d:
            return jsonify({"error": "Movie not found"}), 404

        videos = d.get('videos', {}).get('results', [])
        trailer_key = next((v['key'] for v in videos if v['site'] == 'YouTube' and v['type'] == 'Trailer'), None)

        cast_data = d.get('credits', {}).get('cast', [])
        processed_cast = [
            {
                "name": c['name'], 
                "role": c.get('character', 'Actor'), 
                "photo": f"https://image.tmdb.org/t/p/w200{c['profile_path']}" if c.get('profile_path') else "https://via.placeholder.com/100x100?text=No+Photo"
            } for c in cast_data[:8]
        ]

        rec_data = d.get('recommendations', {}).get('results', [])
        processed_recs = [
            {
                "id": r['id'],
                "title": r['title'],
                "image": f"https://image.tmdb.org/t/p/w500{r['poster_path']}" if r.get('poster_path') else "https://via.placeholder.com/200x300?text=No+Poster",
                "rating": round(r.get('vote_average', 0), 1)
            } for r in rec_data[:6]
        ]

        # 🔥 NAYA: Extract OTT Providers (India 'IN' or fallback to US)
        # 🔥 UPDATED: Stream + Rent/Buy Fallback Logic
        providers_data = d.get('watch/providers', {}).get('results', {})
        region_data = providers_data.get('IN') or providers_data.get('US') or {}
        
        # Pehle streaming check karo
        regional_providers = region_data.get('flatrate', [])
        
        # Agar streaming nahi hai, toh Rent wale providers check karo
        if not regional_providers:
            regional_providers = region_data.get('rent', [])
            
        # Agar Rent bhi nahi hai, toh Buy wale check karo
        if not regional_providers:
            regional_providers = region_data.get('buy', [])
            
        processed_providers = [
            {
                "name": p['provider_name'],
                "logo": f"https://image.tmdb.org/t/p/original{p['logo_path']}"
            } for p in regional_providers[:4] 
        ]
        # 🔥 NAYA: Extract Real Reviews
        reviews_data = d.get('reviews', {}).get('results', [])
        processed_reviews = [
            {
                "author": rev['author'],
                "rating": rev.get('author_details', {}).get('rating', 0),
                "content": rev['content'][:300] + "..." if len(rev['content']) > 300 else rev['content']
            } for rev in reviews_data[:3] # Top 3 reviews
        ]

        return jsonify({
            "id": movie_id,
            "overview": d.get('overview', "No synopsis available."),
            "year": d.get('release_date', "N/A")[:4],
            "runtime": f"{d.get('runtime', 0)//60}h {d.get('runtime', 0)%60}m" if d.get('runtime') else "N/A",
            "genres": [g['name'] for g in d.get('genres', [])],
            "backdrop": f"https://image.tmdb.org/t/p/original{d.get('backdrop_path')}" if d.get('backdrop_path') else None,
            "trailer": trailer_key,
            "cast": processed_cast,
            "recommendations": processed_recs,
            "providers": processed_providers, 
            "reviews": processed_reviews      
        })

    except Exception as e:
        print(f"Error: {e}") 
        return jsonify({"error": "Internal server error"}), 500
# --- LIKES AUR WATCHLIST KA ROUTE ---
@app.route('/api/toggle_movie', methods=['POST'])
def toggle_movie():
    if 'email' not in session:
        return jsonify({"success": False, "message": "Please login first!"}), 401
    
    data = request.json
    movie_id = data.get('movie_id')
    movie_title = data.get('movie_title')
    list_type = data.get('list_type') 
    rating = data.get('rating', 'N/A')  
    image = data.get('image', '') 
    
    if not movie_id or not list_type:
        return jsonify({"success": False, "message": "Missing data"}), 400

    email = session['email']
    movie_obj = {
        "id": movie_id,
        "title": movie_title,
        "rating": rating,
        "image": image
    }

    user = users_collection.find_one({"email": email})
    current_list = user.get(list_type, [])
    exists = any(item['id'] == movie_id for item in current_list if isinstance(item, dict))

    if exists:
        users_collection.update_one(
            {"email": email},
            {"$pull": {list_type: {"id": movie_id}}}
        )
        action = "removed"
    else:
        users_collection.update_one(
            {"email": email},
            {"$addToSet": {list_type: movie_obj}}
        )
        action = "added"
    return jsonify({"success": True, "action": action, "movie_id": movie_id, "movie_title": movie_title})

@app.route('/api/submit_review', methods=['POST'])
def submit_review():
    if 'email' not in session:
        return jsonify({"success": False, "message": "Please login first!"}), 401
 
    data = request.json
    movie_id  = data.get('movie_id')
    movie_title = data.get('movie_title', '')
    review_text = data.get('review_text', '').strip()
    rating      = data.get('rating', 0)
 
    if not movie_id or not review_text:
        return jsonify({"success": False, "message": "Movie ID aur review text dono chahiye!"}), 400
 
    # Ek user ek movie pe sirf 1 review de sakta hai
    existing = reviews_collection.find_one({
        "email": session['email'],
        "movie_id": str(movie_id)
    })
    if existing:
        return jsonify({"success": False, "message": "Tune already is movie ka review de diya hai!"}), 409
 
    review_doc = {
        "movie_id":    str(movie_id),
        "movie_title": movie_title,
        "email":       session['email'],
        "author":      session['user'],       
        "rating":      int(rating),
        "content":     review_text,
        "timestamp":   time.time(),              
        "flagged":     False                     
    }
 
    reviews_collection.insert_one(review_doc)
    return jsonify({"success": True, "message": "Review save ho gaya!"})

@app.route('/api/get_reviews', methods=['GET'])
def get_reviews():
    movie_id = request.args.get('movie_id')
    if not movie_id:
        return jsonify({"success": False, "message": "Movie ID missing"}), 400
 
    raw = list(reviews_collection.find(
        {"movie_id": str(movie_id), "flagged": False},   
        {"_id": 0, "email": 0}                           
    ))
    # Latest pehle
    raw.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
    return jsonify({"success": True, "reviews": raw})

# --- INFINITE SCROLL API ROUTE ---
@app.route('/api/load_more_movies', methods=['GET'])
def load_more_movies():
    genre = request.args.get('genre')
    page = request.args.get('page', 2)
    
    # IDs match karna
    genres = {'action': 28, 'comedy': 35, 'horror': 27}
    
    if genre not in genres:
        return jsonify({"error": "Invalid genre"}), 400

    try:
        # TMDB se NAYA page fetch karo
        res = requests.get(f"https://api.themoviedb.org/3/discover/movie?api_key={TMDB_API_KEY}&with_genres={genres[genre]}&page={page}")
        results = res.json().get('results', [])
        
        # Movies list format karke wapas bhejo
        movies = [
            {
                "id": m['id'],
                "title": m['title'],
                "rating": str(m['vote_average']),
                "image": f"https://image.tmdb.org/t/p/w500{m['poster_path']}" if m['poster_path'] else "https://via.placeholder.com/400x600"
            } for m in results[:15]
        ]
        return jsonify(movies)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

 # --- NAYA: UPCOMING MOVIES API ---
from datetime import datetime

# --- NAYA: STRICTLY FUTURE UPCOMING MOVIES API ---
@app.route('/api/upcoming', methods=['GET'])
def get_upcoming_movies():
    BASE_URL = 'https://api.themoviedb.org/3'
    IMG_URL = 'https://image.tmdb.org/t/p/w500'

    try:
        # Aaj ki date nikal rahe hain
        today = datetime.today().strftime('%Y-%m-%d')
        
        # TMDB Discover API use kar rahe hain (Strictly after today)
        url = f"{BASE_URL}/discover/movie?api_key={TMDB_API_KEY}&primary_release_date.gte={today}&sort_by=popularity.desc"
        res = requests.get(url)
        results = res.json().get('results', [])

        upcoming_data = [
            {
                "id": m['id'],
                "title": m['title'],
                "rating": str(round(m.get('vote_average', 0), 1)),
                "image": f"{IMG_URL}{m['poster_path']}" if m.get('poster_path') else "https://via.placeholder.com/400x600?text=No+Poster",
                "release_date": m.get('release_date', 'N/A')
            } for m in results[:15] 
        ]
        return jsonify(upcoming_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
# ==========================================
# 🤖 AI SMART RECOMMENDATION (POPUP LOGIC)
# ==========================================
@app.route('/api/ai-recommend', methods=['POST'])
def ai_recommend():
    if 'email' not in session:
        return jsonify({"success": False, "error": "Login required"})

    data = request.json
    selected_genres = data.get('genres', [])
    selected_mood = data.get('mood', '')

    BASE_URL = 'https://api.themoviedb.org/3'

    # TMDB Mapping
    genre_map = {'Action': 28, 'Comedy': 35, 'Horror': 27, 'Sci-Fi': 878, 'Drama': 18, 'Thriller': 53}
    mood_map = {'Happy': '35,16', 'Sad': '18', 'Excited': '28,12', 'Chill': '10749,35'}

    # Convert text to IDs
    genre_ids = [str(genre_map[g]) for g in selected_genres if g in genre_map]
    mood_genres = mood_map.get(selected_mood, "")

    final_filter = ",".join(genre_ids) if genre_ids else mood_genres
    
    # 💾 MONGODB SAVE: Pehla genre ID DB mein save karo Randomizer ke liye
    primary_genre_id = genre_ids[0] if genre_ids else (mood_genres.split(',')[0] if mood_genres else "28")
    users_collection.update_one(
        {"email": session['email']},
        {"$set": {
            "favorite_genre": primary_genre_id,
            "favorite_genres": selected_genres
        }}
    )

    # TMDB API Call
    url = f"{BASE_URL}/discover/movie?api_key={TMDB_API_KEY}&with_genres={final_filter}&sort_by=popularity.desc"

    try:
        import random
        res = requests.get(url).json()
        results = res.get('results', [])
        
        if not results:
            return jsonify({"success": False, "error": "No movies found"})

        # Top 5 mein se koi 1 random masterpiece uthao
        m = random.choice(results[:5]) 
        movie = {
            "id": m['id'],
            "title": m['title'],
            "rating": str(round(m.get('vote_average', 0), 1)),
            "image": f"https://image.tmdb.org/t/p/w500{m['poster_path']}" if m.get('poster_path') else "https://via.placeholder.com/400x600",
        }
        return jsonify({"success": True, "movie": movie, "saved_genre_id": primary_genre_id})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})
    
# ==========================================
# 👤 USER PROFILE & DATA ROUTES
# ==========================================
@app.route('/api/user_data', methods=['GET'])
def get_user_data():
    if 'email' not in session:
        return jsonify({"success": False, "error": "Not logged in"})
        
    user = users_collection.find_one({"email": session['email']})
    if not user:
        return jsonify({"success": False, "error": "User not found"})
        
    # TMDB Genre ID to Name Mapping
    genre_map = {"28":"Action", "35":"Comedy", "27":"Horror", "878":"Sci-Fi", "10749":"Romance", "18":"Drama", "53":"Thriller", "12":"Adventure", "16":"Animation", "80":"Crime"}
    fav_genre_id = user.get('favorite_genre', '')
    fav_genre_name = genre_map.get(str(fav_genre_id), "Not Set")

    return jsonify({
        "success": True,
        "watchlist": user.get('watchlist', []),
        "liked_movies": user.get('liked_movies', []),
        "favorite_genre": fav_genre_name,
        "favorite_genres": user.get('favorite_genres', [])
    })

@app.route('/api/my_reviews_count', methods=['GET'])
def my_reviews_count():
    if 'email' not in session:
        return jsonify({"success": False, "count": 0})
    count = reviews_collection.count_documents({"email": session['email']})
    return jsonify({"success": True, "count": count})

if __name__ == '__main__':
    app.run(debug=False)