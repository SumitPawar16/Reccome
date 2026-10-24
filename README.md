# Reccome - Movie Recommendation Platform

A full-stack web application for discovering movies, saving watchlists and sharing reviews.

**Live demo:** https://reccome.onrender.com

> The app is hosted on a free Render plan, so the first load after inactivity can take around a minute.

## Features

- Live movie search with multi-genre filtering and a trending-movies slider
- Movie detail pages with embedded trailers, cast information, runtime and platform availability (TMDB API)
- User authentication with 6-digit email OTP verification (10-minute expiry) and scrypt password hashing
- Role-based access control for user and admin permissions
- "Surprise Me" recommendation based on the user's saved genre preferences
- Watchlist, likes, star-rating reviews and comments, stored in MongoDB
- Admin dashboard for site analytics, user role management and content moderation

## Tech Stack

| Area | Technology |
|---|---|
| Backend | Python, Flask |
| Frontend | HTML5, CSS, JavaScript |
| Database | MongoDB |
| External API | TMDB (The Movie Database) |
| Email | smtplib (OTP verification) |

## Getting Started

1. Clone the repository

   ```bash
   git clone https://github.com/SumitPawar16/Reccome-v2.git
   cd Reccome-v2/Reccome
   ```

2. Install dependencies

   ```bash
   pip install -r requirements.txt
   ```

3. Create a `.env` file next to `app.py` (see `.env.example`)

   ```
   FLASK_SECRET_KEY=your_secret_key
   MONGODB_URI=your_mongodb_connection_string
   MAIL_SENDER_EMAIL=your_email_address
   MAIL_SENDER_PASSWORD=your_email_app_password
   TMDB_API_KEY=your_tmdb_api_key
   ```

4. Run the app

   ```bash
   python app.py
   ```

   Then open http://localhost:5000 in your browser.

## Author

**Sumit Pawar**
GitHub: [SumitPawar16](https://github.com/SumitPawar16) | LinkedIn: [sumit-pawar-979a19401](https://www.linkedin.com/in/sumit-pawar-979a19401)
