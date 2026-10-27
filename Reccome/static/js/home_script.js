// User ka likha text page mein safe tareeke se dikhane ke liye (XSS se bachav)
function escapeHTML(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ================== GLOBAL STORAGE (BULLETPROOF) ================== */
    let currentMovieId = null;
    let likedMovies = [];
    let myWatchlist = [];

    try {
        // Purane kharab data (empty objects) ko filter karke saaf rakhta hai
        let tempLiked = JSON.parse(localStorage.getItem('myLikedMovies')) || [];
        likedMovies = Array.isArray(tempLiked) ? tempLiked.filter(m => m && m.title && m.image) : [];

        let tempWatch = JSON.parse(localStorage.getItem('myWatchlist')) || [];
        myWatchlist = Array.isArray(tempWatch) ? tempWatch.filter(m => m && m.title && m.image) : [];
    } catch(e) {
        console.log("Storage reset done to prevent crash.");
    }
    // --- HERO SLIDER LOGIC ---
    let currentSlide = 0;
    let trendingMoviesData = [];

    async function fetchTrendingHero() {
        try {
            const response = await fetch(`/api/tmdb/trending/movie/day`);
            const data = await response.json();
            trendingMoviesData = data.results.slice(0, 5);
            renderHeroSlides();
            startHeroAutoplay();
        } catch (error) {
            console.error("Hero fetch failed:", error);
        }
    }

    // NAYA RENDER FUNCTION
    function renderHeroSlides() {
        const slider = document.getElementById('trending-hero');
        const dotsContainer = document.getElementById('hero-dots');
        
        slider.innerHTML = trendingMoviesData.map((movie, index) => `
            <div class="hero-slide ${index === 0 ? 'active' : ''}">
                <div class="hero-poster-wrapper">
                    <div class="hero-poster" style="background-image: url('https://image.tmdb.org/t/p/original${movie.backdrop_path}');"></div>
                    <div class="hero-overlay"></div>
                </div>
                <div class="hero-content">
                    <span class="trending-badge"><i class="fa-solid fa-fire"></i> Trending #${index + 1}</span>
                    <h1 class="hero-title">${movie.title}</h1>
                    <p class="hero-overview">${movie.overview}</p>
                    <div class="hero-actions">
                        <button class="btn-info" onclick="openMovieDetail(${movie.id}, '${movie.title.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', ${movie.vote_average.toFixed(1)}, 'https://image.tmdb.org/t/p/w500${movie.poster_path}')">
                        <i class="fa-solid fa-circle-info"></i> More Info
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        dotsContainer.innerHTML = trendingMoviesData.map((_, i) => 
            `<div class="dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></div>`
        ).join('');

        slider.addEventListener('scroll', () => {
            let index = Math.round(slider.scrollLeft / slider.clientWidth);
            currentSlide = index;
            document.querySelectorAll('#hero-dots .dot').forEach((d, i) => d.classList.toggle('active', i === index));
        });
    }   

    let heroInterval;
    function startHeroAutoplay() {
        clearInterval(heroInterval);
        heroInterval = setInterval(() => {
            currentSlide = (currentSlide + 1) % trendingMoviesData.length;
            showSlide(currentSlide);
        }, 8000); 
    }

    // DOT CLICK LOGIC
    function goToSlide(index) {
        currentSlide = index;
        showSlide(index);
        startHeroAutoplay(); // Timer reset
    }

    function showSlide(index) {
        const slider = document.getElementById('trending-hero');
        if(!slider) return;
        slider.scrollTo({
            left: slider.clientWidth * index,
            behavior: 'smooth'
        });
    }
    /* ================== 1. MOVIE DETAIL LOGIC ================== */
    async function openMovieDetail(movieId, movieTitle, rating, imageUrl) {
        currentMovieId = movieId;
        // 🔥 1. PATA KARO USER KAHAN THA AUR USE STORE KARO
        const genreSec = document.getElementById('genre-result-section');
        const homeSec = document.getElementById('home-section');
        const likedSec = document.getElementById('liked-section');
        const watchSec = document.getElementById('watchlist-section');
        const upcomingSec = document.getElementById('upcoming-section');
        
        // Jo bhi section abhi open hai, usko hide karo aur uska naam yaad rakh lo
        if (genreSec && !genreSec.classList.contains('hidden')) {
            window.lastViewedSection = 'genre';
            genreSec.classList.add('hidden');
        } else if (upcomingSec && !upcomingSec.classList.contains('hidden')) {  
            window.lastViewedSection = 'upcoming';
            upcomingSec.classList.add('hidden');
        } else if (likedSec && !likedSec.classList.contains('hidden')) {
            window.lastViewedSection = 'liked';
            likedSec.classList.add('hidden');
        } else if (watchSec && !watchSec.classList.contains('hidden')) {
            window.lastViewedSection = 'watchlist';
            watchSec.classList.add('hidden');
        } else {
            window.lastViewedSection = 'home'; // Default
            if (homeSec) homeSec.style.display = 'none';
        }

        // 🔥 2. Detail section show karo aur top par jao
        document.getElementById('movie-detail-section').classList.remove('hidden');
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });

        // --- Tera baaki ka data fetch aur UI logic same rahega ---
        const cleanRating = parseFloat(rating).toFixed(1); 
        document.querySelector('.movie-title').innerHTML = `${movieTitle} <span class="header-rating">⭐ ${cleanRating}</span>`;
        document.querySelector('.movie-card-poster').style.backgroundImage = `url('${imageUrl}')`;
        document.querySelector('.detail-backdrop').style.backgroundImage = `url('${imageUrl}')`;
        document.querySelector('.section p').innerText = "Fetching story and trailers... ⏳";
        document.querySelector('.metadata').innerHTML = "<span>Loading...</span>";
        
        if(document.getElementById('cast-list')) document.getElementById('cast-list').innerHTML = '';
        if(document.getElementById('recommendations-grid')) document.getElementById('recommendations-grid').innerHTML = '';
        const trailerContainer = document.getElementById('trailer-container');
        if(trailerContainer) trailerContainer.classList.add('hidden');

        try {
            const res = await fetch(`/api/movie-details?id=${movieId}`);
            const data = await res.json();

            if(!data.error) {
                if(data.backdrop) document.querySelector('.detail-backdrop').style.backgroundImage = `url('${data.backdrop}')`;
                const genresHtml = data.genres.join(' &nbsp;•&nbsp; ');
                document.querySelector('.metadata').innerHTML = `<span>${data.year}</span> • <span>${data.runtime}</span><div class="genres">${genresHtml}</div>`;
                
                // ==========================================
                // 🔥 NAYA: READ MORE LOGIC FOR DESCRIPTION
                // ==========================================
                const overviewElement = document.querySelector('.section p');
                const fullText = data.overview;
                const MAX_CHARS = 160; // 160 characters ke baad cut jayega

                if (fullText && fullText.length > MAX_CHARS) {
                    const shortText = fullText.substring(0, MAX_CHARS) + '...';
                    
                    overviewElement.innerHTML = `
                        <span class="desc-text">${shortText}</span>
                        <span class="read-more-btn" style="color: #ef4444; cursor: pointer; font-weight: 600; font-size: 13px; margin-left: 5px; transition: 0.2s;">Read more</span>
                    `;
                    
                    const readMoreBtn = overviewElement.querySelector('.read-more-btn');
                    readMoreBtn.onclick = function() {
                        const descSpan = overviewElement.querySelector('.desc-text');
                        if (this.innerText.includes('Read more')) {
                            descSpan.innerText = fullText;
                            this.innerText = ' Show less';
                        } else {
                            descSpan.innerText = shortText;
                            this.innerText = ' Read more';
                        }
                    };
                } else {
                    overviewElement.innerText = fullText || "No description available.";
                }
                // ==========================================

                const trailerIframe = document.getElementById('movie-trailer');
                if (data.trailer && trailerIframe) {
                    trailerIframe.src = `https://www.youtube.com/embed/${data.trailer}`;
                    trailerContainer.classList.remove('hidden');
                }

                const castList = document.getElementById('cast-list');
                if(castList && data.cast) {
                    castList.innerHTML = data.cast.map(c => `
                        <div class="cast-card">
                            <img src="${c.photo}" alt="${c.name}">
                            <p>${c.name}</p>
                            <span>${c.role}</span>
                        </div>
                    `).join('');
                }

                const recGrid = document.getElementById('recommendations-grid');
                if (recGrid) {
                    if (data.recommendations && data.recommendations.length > 0) {
                        recGrid.innerHTML = data.recommendations.map(r => {
                            const safeTitle = r.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                            const img = r.image || 'https://via.placeholder.com/200x300?text=No+Poster';
                
                            return `
                                <div class="rec-card" onclick="openMovieDetail(${r.id}, '${safeTitle}', '${r.rating || 'N/A'}', '${img}')">
                                    <img src="${img}" alt="${safeTitle}">
                                    <div class="rec-info">
                                        <h4>${r.title}</h4>
                                        <div class="rec-rating">⭐ ${r.rating || 'N/A'}</div>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    } else {
                        recGrid.innerHTML = "<p style='color: #94a3b8; padding: 20px;'>No similar movies found.</p>";
                    }
                }

                // OTT Providers (Where to Watch) Dikhane Ka Logic
                const ottList = document.getElementById('ott-providers-list');
                if (ottList) {
                    if (data.providers && data.providers.length > 0) {
                        ottList.innerHTML = data.providers.map(p => `
                            <div class="tooltip-container" style="display: inline-block; position: relative; margin-right: 10px;">
                                <img src="${p.logo}" alt="${p.name}" title="${p.name}" style="width: 45px; height: 45px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); cursor: pointer; border: 1px solid rgba(255,255,255,0.1); transition: transform 0.2s ease;">
                            </div>
                        `).join('');
                    } else {
                        ottList.innerHTML = '<span style="color: #94a3b8; font-size: 13px;">Currently not streaming on any major platform</span>';
                    }
                }

                // Real Reviews Dikhane Ka Logic
                const reviewsList = document.getElementById('reviewsList');
                if (reviewsList) {
                    reviewsList.innerHTML = ''; 
                    if (data.reviews && data.reviews.length > 0) {
                        data.reviews.forEach(rev => {
                            const starCount = rev.rating ? Math.round(rev.rating / 2) : 0; 
                            const starsHtml = '<i class="fa-solid fa-star" style="color: #fbbf24;"></i>'.repeat(starCount) + '<i class="fa-regular fa-star" style="color: #64748b;"></i>'.repeat(5 - starCount);
                            
                            reviewsList.innerHTML += `
                                <div class="write-review-card" style="margin-bottom: 15px; padding: 20px; background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px;">
                                    <div class="review-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                        <div class="user-info" style="display: flex; align-items: center; gap: 10px;">
                                            <div class="user-avatar" style="background: #ef4444; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${rev.author.charAt(0).toUpperCase()}</div>
                                            <strong>${escapeHTML(rev.author)}</strong>
                                        </div>
                                        <div class="star-rating">${starsHtml}</div>
                                    </div>
                                    <p style="color: #cbd5e1; font-size: 13px; line-height: 1.6;">"${escapeHTML(rev.content)}"</p>
                                </div>
                            `;
                        });
                    } else {
                         reviewsList.innerHTML = '<p style="color: #94a3b8; font-size: 13px;">No user reviews available for this movie.</p>';
                    }
                }
                loadUserReviews(movieId);
            } else {
                document.querySelector('.section p').innerText = "Details not found.";
            }
        } catch(e) {
            console.error("Detail Fetch Error:", e);
            document.querySelector('.section p').innerText = "Network error, please try again.";
        }

        const likeBtn = document.querySelector('.dt-like');
        likeBtn.setAttribute('data-title', movieTitle);
        likeBtn.onclick = (e) => { e.preventDefault(); toggleLike(likeBtn, movieId, movieTitle, rating, imageUrl); };
        
        const watchBtn = document.querySelector('.dt-watch');
        watchBtn.setAttribute('data-title', movieTitle);
        watchBtn.onclick = (e) => { e.preventDefault(); toggleWatchlist(watchBtn, movieId, movieTitle, rating, imageUrl); };

        syncButtons('.dt-like', movieTitle, likedMovies.some(m => m.title === movieTitle), 'fa-heart');
        syncButtons('.dt-watch', movieTitle, myWatchlist.some(m => m.title === movieTitle), 'fa-bookmark');
    }
        function closeMovieDetail() {
            // 1. Detail page hide karo
            document.getElementById('movie-detail-section').classList.add('hidden');
            
            // 🔥 2. WAPAS WAHIN JAO JAHAN SE AAYE THE (Smart Logic)
            if (window.lastViewedSection === 'genre') {
                const genreSec = document.getElementById('genre-result-section');
                if(genreSec) genreSec.classList.remove('hidden');
                } else if (window.lastViewedSection === 'upcoming') {
                const upcomingSec = document.getElementById('upcoming-section');
                if(upcomingSec) upcomingSec.classList.remove('hidden');;
            } else if (window.lastViewedSection === 'liked') {
                const likedSec = document.getElementById('liked-section');
                if(likedSec) likedSec.classList.remove('hidden');
            } else if (window.lastViewedSection === 'watchlist') {
                const watchSec = document.getElementById('watchlist-section');
                if(watchSec) watchSec.classList.remove('hidden');
            } else {
                const homeSec = document.getElementById('home-section');
                if(homeSec) homeSec.style.display = 'block';
            }

            // 3. Wapas aate hi smooth top pe scroll kar do
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    /* ================== REVIEWS LOGIC ================== */
    let currentRating = 0;

    function setRating(val) {
        currentRating = val;
        const stars = document.querySelectorAll('#starRating i');
        stars.forEach((star, index) => {
            if (index < val) {
                star.classList.remove('fa-regular');
                star.classList.add('fa-solid');
                star.style.color = '#fbbf24';
            } else {
                star.classList.remove('fa-solid');
                star.classList.add('fa-regular');
                star.style.color = '#475569';
            }
        });
    }

function postReview() {
    const text = document.getElementById('reviewInput').value;
    if (text.trim() === "")    { alert("Please write a review!"); return; }
    if (currentRating === 0)   { alert("Please give a star rating!"); return; }
 
    // currentMovieId is already set when movie detail panel opens
    // (it's the variable you use for trailer/like/watchlist — same one)
    const movieId    = currentMovieId;
    const movieTitle = document.querySelector('.movie-title')?.innerText || '';
 
    const btn = document.getElementById('postReviewBtn');
    if (btn) { btn.disabled = true; btn.innerText = 'Posting...'; }
 
    fetch('/api/submit_review', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            movie_id:    movieId,
            movie_title: movieTitle,
            review_text: text,
            rating:      currentRating
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            // DOM mein bhi dikhao (local prepend — same as before)
            const reviewDiv = document.createElement('div');
            reviewDiv.className = 'write-review-card posted-review';
            reviewDiv.innerHTML = `
                <div class="review-header">
                    <div class="user-info">
                        <div class="user-avatar">ME</div>
                        <strong>You</strong>
                    </div>
                    <div class="star-rating">
                        ${'<i class="fa-solid fa-star" style="color:#fbbf24"></i>'.repeat(currentRating)}
                        ${'<i class="fa-regular fa-star" style="color:#475569"></i>'.repeat(5 - currentRating)}
                    </div>
                </div>
                <p class="review-text">${escapeHTML(text)}</p>
                <small style="color:#64748b; font-size:11px;">Just now </small>
            `;
            document.getElementById('reviewsList').prepend(reviewDiv);
            document.getElementById('reviewInput').value = "";
            setRating(0);
        } else {
            alert(data.message || "Review post nahi hua. Try again!");
        }
    })
    .catch(err => {
        console.error("Review error:", err);
        alert("Network error! Please try again.");
    })
    .finally(() => {
        if (btn) { btn.disabled = false; btn.innerText = 'Post Review'; }
    });
}

function loadUserReviews(movieId) {
    fetch(`/api/get_reviews?movie_id=${movieId}`)
    .then(res => res.json())
    .then(data => {
        if (!data.success || data.reviews.length === 0) return;
 
        const reviewsList = document.getElementById('reviewsList');
        if (!reviewsList) return;
 
        // Section heading add karo
        const heading = document.createElement('p');
        heading.style.cssText = "color:#94a3b8; font-size:12px; margin:10px 0 5px; text-transform:uppercase; letter-spacing:1px;";
        heading.innerText = "Community Reviews";
        reviewsList.appendChild(heading);
 
        data.reviews.forEach(rev => {
            const stars = Math.round(rev.rating || 0);
            const div = document.createElement('div');
            div.className = 'write-review-card';
            div.style.cssText = "margin-bottom:15px; padding:20px; background:rgba(30,41,59,0.5); border:1px solid rgba(255,255,255,0.05); border-radius:12px;";
            div.innerHTML = `
                <div class="review-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div class="user-info" style="display:flex; align-items:center; gap:10px;">
                        <div class="user-avatar" style="background:#334155; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">
                            ${rev.author ? escapeHTML(rev.author[0].toUpperCase()) : 'U'}
                        </div>
                        <strong>${escapeHTML(rev.author || 'Anonymous')}</strong>
                    </div>
                    <div class="star-rating">
                        ${'<i class="fa-solid fa-star" style="color:#fbbf24; font-size:13px;"></i>'.repeat(stars)}
                        ${'<i class="fa-regular fa-star" style="color:#475569; font-size:13px;"></i>'.repeat(5 - stars)}
                    </div>
                </div>
                <p class="review-text" style="color:#cbd5e1; font-size:14px; line-height:1.6;">${escapeHTML(rev.content)}</p>
            `;
            reviewsList.appendChild(div);
        });
    })
    .catch(err => console.error("Could not load community reviews:", err));
}

    /* ================== 3. NAVIGATION ================== */
function showPage(pageId, element) {
    // 1. Sabse pehle "Genre Result" aur "Movie Detail" dono ko hide karo
    const genreResult = document.getElementById('genre-result-section');
    if (genreResult) genreResult.classList.add('hidden');
    
    const detailSec = document.getElementById('movie-detail-section');
    if (detailSec) detailSec.classList.add('hidden');

    // 🔥 2. BAAKI SAARE SECTIONS KO STRICTLY HIDE KARO
    const homeSec = document.getElementById('home-section');
    if (homeSec) homeSec.style.display = 'none'; // HOME HIDE HOGA YAHAN

    const likedSec = document.getElementById('liked-section');
    if (likedSec) likedSec.classList.add('hidden');

    const watchSec = document.getElementById('watchlist-section');
    if (watchSec) watchSec.classList.add('hidden');
    
    const upcomingSec = document.getElementById('upcoming-section');
    if (upcomingSec) upcomingSec.classList.add('hidden'); // UPCOMING BHI DEFAULT HIDE RAHEGA
    
    const profileSec = document.getElementById('profile-section');
    if (profileSec) profileSec.classList.add('hidden');

    // 3. Sidebar ki active classes saaf karo
    document.querySelectorAll('.nav-links a').forEach(link => link.classList.remove('active'));

    // 🔥 4. AB WAHI DIKHAO JO USER NE CLICK KIYA HAI
    if (pageId === 'home') {
        if (homeSec) homeSec.style.display = 'block';
    } else if (pageId === 'liked') {
        if (likedSec) likedSec.classList.remove('hidden');
        renderLikedMovies();
    } else if (pageId === 'watchlist') {
        if (watchSec) watchSec.classList.remove('hidden');
        renderWatchlist();
    } else if (pageId === 'upcoming') {
        if (upcomingSec) upcomingSec.classList.remove('hidden'); // SIRF UPCOMING DIKHEGA
        
        const grid = document.getElementById('upcoming-grid');
        if (grid && grid.innerHTML.trim() === '') { 
            fetchUpcomingMovies(); 
        }
    } else if (pageId === 'profile') {
        if (profileSec) { 
            profileSec.classList.remove('hidden'); 
            loadProfileData(); 
        }
    }

    // 5. Clicked link ko active class do
    if(element) element.classList.add('active');
}
    /* ================== 4. LIKE & WATCHLIST ================== */
    function toggleLike(btn, id, title, rating, image) {
        const index = likedMovies.findIndex(movie => movie.title === title);
        let isLiked = false;
        if (index === -1) { likedMovies.push({ id, title, rating, image }); isLiked = true; } 
        else { likedMovies.splice(index, 1); isLiked = false; }
        localStorage.setItem('myLikedMovies', JSON.stringify(likedMovies));
        
        syncButtons('.heart-btn', title, isLiked, 'fa-heart');
        syncButtons('.dt-like', title, isLiked, 'fa-heart');
        
        refreshActiveViews();
        toggleMovieInDB(id, title, 'liked_movies', rating, image); 
    }

    function toggleWatchlist(btn, id, title, rating, image) {
        const index = myWatchlist.findIndex(movie => movie.title === title);
        let isAdded = false;
        if (index === -1) { myWatchlist.push({ id, title, rating, image }); isAdded = true; } 
        else { myWatchlist.splice(index, 1); isAdded = false; }
        localStorage.setItem('myWatchlist', JSON.stringify(myWatchlist));
        
        syncButtons('.watchlist-btn', title, isAdded, 'fa-bookmark');
        syncButtons('.dt-watch', title, isAdded, 'fa-bookmark');
        
        refreshActiveViews();
        toggleMovieInDB(id, title, 'watchlist', rating, image);
    }

    function syncButtons(selector, title, isActive, iconName) {
        document.querySelectorAll(`${selector}[data-title="${title.replace(/"/g, '&quot;')}"]`).forEach(button => {
            const icon = button.querySelector('i');
            if (isActive) { 
                button.classList.add('active'); 
                icon.classList.remove('fa-regular'); icon.classList.add('fa-solid'); 
            } else { 
                button.classList.remove('active'); 
                icon.classList.remove('fa-solid'); icon.classList.add('fa-regular'); 
            }
        });
    }

    function refreshActiveViews() {
        if(!document.getElementById('liked-section').classList.contains('hidden')) renderLikedMovies();
        if(!document.getElementById('watchlist-section').classList.contains('hidden')) renderWatchlist();
        if(!document.getElementById('profile-section').classList.contains('hidden')) loadProfileData();
    }

    function createCard(movie) {
        if(!movie || !movie.title) return null;
        const card = document.createElement('div'); 
        card.className = 'card'; 
        card.style.backgroundImage = `url('${movie.image}')`;

        const safeTitle = movie.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const id = movie.id || Math.floor(Math.random() * 100000);
        
        // 🔥 YAHAN CHANGE HUA HAI
        card.onclick = function() { openMovieDetail(id, safeTitle, movie.rating, movie.image); };

        const isLiked = likedMovies.some(m => m.title === movie.title) ? 'active' : '';
        const isWatched = myWatchlist.some(m => m.title === movie.title) ? 'active' : '';
        
    card.innerHTML = `
            <div class="watchlist-btn ${isWatched}" data-title="${safeTitle}" onclick="event.stopPropagation(); toggleWatchlist(this, ${id}, '${safeTitle}', '${movie.rating}', '${movie.image}')">
                <i class="${isWatched ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
            </div>
            <div class="heart-btn ${isLiked}" data-title="${safeTitle}" onclick="event.stopPropagation(); toggleLike(this, ${id}, '${safeTitle}', '${movie.rating}', '${movie.image}')">
                <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
            </div>
            <div class="card-content"><span class="rating">⭐ ${movie.rating}</span><h3>${movie.title}</h3></div>`;
        return card;
    }
    function renderLikedMovies() {
        const grid = document.getElementById('liked-grid');
        grid.innerHTML = "";
        if(likedMovies.length === 0) { 
            document.getElementById('liked-empty-state').style.display = "flex"; 
            grid.style.display = "none";
            return; 
        }
        grid.style.display = "grid";
        document.getElementById('liked-empty-state').style.display = "none";
        likedMovies.forEach(m => {
            const c = createCard(m);
            if(c) grid.appendChild(c);
        });
    }

    function renderWatchlist() {
        const grid = document.getElementById('watchlist-grid');
        grid.innerHTML = "";
        if(myWatchlist.length === 0) { 
            document.getElementById('watchlist-empty-state').style.display = "flex"; 
            grid.style.display = "none";
            return; 
        }
        grid.style.display = "grid";
        document.getElementById('watchlist-empty-state').style.display = "none";
        myWatchlist.forEach(m => {
            const c = createCard(m);
            if(c) grid.appendChild(c);
        });
    }

    /* ================== 5. PROFILE LOGIC ================== */
    /* ================== 5. PROFILE LOGIC ================== */
    function loadProfileData() {
        const likedEl = document.getElementById('profile-liked-count'); 
        if(likedEl) likedEl.innerText = likedMovies.length;
        const watchEl = document.getElementById('profile-watchlist-count'); 
        if(watchEl) watchEl.innerText = myWatchlist.length;        
        const recEl = document.getElementById('profile-rec-count'); 
        if(recEl) recEl.innerText = localStorage.getItem('recLikedCount') || '0';
        fetch('/api/my_reviews_count')
        .then(res => res.json())
        .then(data => {
        const revEl = document.getElementById('profile-review-count');
        if (revEl) revEl.innerText = data.count ?? 0;
        })
        .catch(() => {});    
fetch('/api/user_data')
    .then(res => res.json())
    .then(data => {
        const vibeTextEl = document.getElementById('profile-vibe-text');
        if (!vibeTextEl) return;

        const genres = data.favorite_genres;
        if (genres && genres.length > 0) {
          
            vibeTextEl.innerHTML = genres.map(g =>
                `<span style="
                    display:inline-block;
                    background:rgba(239,68,68,0.15);
                    color:#ef4444;
                    border:1px solid rgba(239,68,68,0.3);
                    border-radius:20px;
                    padding:4px 14px;
                    font-size:13px;
                    font-weight:600;
                    margin:3px 4px;
                ">${g}</span>`
            ).join('');
        } else {
            vibeTextEl.innerText = "Not Set Yet";
        }
    })
    .catch(() => {
        const vibeTextEl = document.getElementById('profile-vibe-text');
        if (vibeTextEl) vibeTextEl.innerText = "Not Set Yet";
    });
}
    let myGenres = ['Action', 'Sci-Fi', 'Thriller'];
    let allGenresPool = ['Comedy', 'Horror', 'Romance', 'Adventure', 'Drama', 'Mystery'];

    function renderMyGenres() {
        const list = document.getElementById('myGenresList'); if(!list) return; list.innerHTML = '';
        myGenres.forEach(g => list.innerHTML += `<div class="p-genre-tag" onclick="removeGenre('${g}')">${g} <i class="fa-solid fa-xmark" style="margin-left:5px; font-size:10px; color:#ef4444;"></i></div>`);
    }

    /* ================== CAROUSEL SCROLL LOGIC ================== */
    function scrollCarousel(button, direction) {
        const wrapper = button.closest('.carousel-wrapper');
        if (!wrapper) return; 
        
        const container = wrapper.querySelector('.horizontal-scroll');
        if (container) {
            const scrollAmount = container.clientWidth * 0.95;
            // Pura rewind hata diya! Sirf smooth scroll hoga.
            container.scrollBy({ 
                left: direction * scrollAmount, 
                behavior: 'smooth' 
            });
        }
    }/* ================== DYNAMIC DATA FETCHING (TMDB API) ================== */
    function showSkeletons(containerId, count = 5) {
        const container = document.getElementById(containerId);
        if (!container) return;
        let skeletons = '';
        for (let i = 0; i < count; i++) {
            skeletons += `<div class="skeleton-card skeleton"></div>`;  
        }
        container.innerHTML = skeletons;
    }

    function generateMovieCardHTML(movie) {
        const id = movie.id || Math.floor(Math.random() * 100000);
        const title = movie.title || 'Unknown';
        const rating = movie.rating || 'N/A';
        const image = movie.image || 'https://via.placeholder.com/500x750?text=No+Poster';

        const isLiked = likedMovies.some(m => m.title === title) ? 'active' : '';
        const isWatched = myWatchlist.some(m => m.title === title) ? 'active' : '';
        const safeTitle = movie.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        
        return `
            <div class="card" style="background-image: url('${image}');" onclick="openMovieDetail(${id}, '${safeTitle}', '${rating}', '${image}')">
                <div class="watchlist-btn ${isWatched}" data-title="${safeTitle}" onclick="event.stopPropagation(); toggleWatchlist(this, ${id}, '${safeTitle}', '${rating}', '${image}')">
                    <i class="${isWatched ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
                </div>
                <div class="heart-btn ${isLiked}" data-title="${safeTitle}" onclick="event.stopPropagation(); toggleLike(this, ${id}, '${safeTitle}', '${rating}', '${image}')">
                    <i class="${isLiked ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </div>
                <div class="card-content"><span class="rating">⭐ ${rating}</span><h3>${title}</h3></div>
            </div>
        `;
    }

    async function fetchAndRenderMovies() {
        // Skeletons dikhao
        showSkeletons('action-movies-container');
        showSkeletons('comedy-movies-container');
        showSkeletons('horror-movies-container');

        try {
            const response = await fetch('/api/movies'); 
            const data = await response.json();

            const categories = {
                'action': data.action,
                'comedy': data.comedy,
                'horror': data.horror
            };

            for (const [id, movies] of Object.entries(categories)) {
                const el = document.getElementById(`${id}-movies-container`);
                if(el && movies) {
                    el.innerHTML = '';
                    movies.forEach(m => {
                        el.innerHTML += generateMovieCardHTML(m);
                    });
                }
            }
            console.log("✅ Movies loaded from Flask Backend!");
            setupInfiniteScroll();
        } catch (error) { 
            console.error("❌ Backend connection failed:", error); 
        }
    }

    /* ================== INFINITE SCROLL ================== */
    const genrePages   = { action: 2, comedy: 2, horror: 2 };
    const genreLoading = { action: false, comedy: false, horror: false };
    const genreContainerMap = {
        action: 'action-movies-container',
        comedy: 'comedy-movies-container',
        horror: 'horror-movies-container'
    };

    async function loadMoreMovies(genre) {
        if (genreLoading[genre]) return;
        genreLoading[genre] = true;

        const container = document.getElementById(genreContainerMap[genre]);
        if (!container) { genreLoading[genre] = false; return; }

        const loadingCard = document.createElement('div');
        loadingCard.className = 'skeleton-card skeleton';
        loadingCard.id = `loading-${genre}`;
        loadingCard.style.cssText = 'min-width:160px; height:240px; border-radius:12px; flex-shrink:0;';
        container.appendChild(loadingCard);

        try {
            const res    = await fetch(`/api/load_more_movies?genre=${genre}&page=${genrePages[genre]}`);
            const movies = await res.json();

            const lc = document.getElementById(`loading-${genre}`);
            if (lc) lc.remove();

            if (movies && movies.length > 0) {
                const sentinel = container.querySelector(`.sentinel-${genre}`);
                movies.forEach(movie => {
                    const temp = document.createElement('div');
                    temp.innerHTML = generateMovieCardHTML({
                        id:     movie.id,
                        title:  movie.title,
                        rating: parseFloat(movie.rating).toFixed(1),
                        image:  movie.image
                    });
                    container.insertBefore(temp.firstElementChild, sentinel);
                });
                genrePages[genre]++;
            }
        } catch (e) {
            console.error(`Load more error (${genre}):`, e);
            const lc = document.getElementById(`loading-${genre}`);
            if (lc) lc.remove();
        }
        genreLoading[genre] = false;
    }

    function setupInfiniteScroll() {
        Object.keys(genreContainerMap).forEach(genre => {
            const container = document.getElementById(genreContainerMap[genre]);
            if (!container) return;

            // Purana sentinel hata do (duplicate prevention)
            const old = container.querySelector(`.sentinel-${genre}`);
            if (old) old.remove();

            const sentinel = document.createElement('div');
            sentinel.className = `sentinel-${genre}`;
            sentinel.style.cssText = 'min-width:5px; height:100%; flex-shrink:0;';
            container.appendChild(sentinel);

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) loadMoreMovies(genre);
                });
            }, { root: container, threshold: 0.1 });

            observer.observe(sentinel);
        });
    }

    // --- DATABASE MEIN MOVIE SAVE KARNE KA FUNCTION ---
    async function toggleMovieInDB(movieId, movieTitle, listType, rating, image) {
        try {
            const response = await fetch('/api/toggle_movie', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    movie_id: movieId,
                    movie_title: movieTitle,
                    list_type: listType,
                    rating: rating,
                    image: image  
                })
            })

            const data = await response.json();
            
            if (data.success) {
                console.log(` ${movieTitle} (ID: ${movieId}) was ${data.action} in ${listType}!`);
            } else {
                console.error(data.message); 
            }
        } catch (error) {
            console.error("Error saving movie:", error);
        }
    }

    async function loadUserDataFromDB() {
        try {
            const response = await fetch('/api/user_data');
            const data = await response.json();

            if (data.success) {
                console.log("User data loaded from DB!", data);

                likedMovies = data.liked_movies || [];
                myWatchlist = data.watchlist || [];

                localStorage.setItem('myLikedMovies', JSON.stringify(likedMovies));
                localStorage.setItem('myWatchlist', JSON.stringify(myWatchlist));

                if (typeof refreshActiveViews === "function") {
                    refreshActiveViews();
                }
            }
        } catch (error) {
            console.error("Error fetching user data on login:", error);
        }
    }

    /* ================== INIT ================== */
    window.addEventListener('load', () => {
        fetchAndRenderMovies();
        fetchTrendingHero(); 
        setTimeout(() => {
            if(typeof openPopup === "function") openPopup();
        }, 1500);
    });
    /* ================== SEARCH UTILITIES ================== */
    function clearSearch() {
        const input = document.getElementById('main-search-input');
        const clearBtn = document.getElementById('search-clear-btn');
        const dropdown = document.getElementById('search-results');
        input.value = '';
        clearBtn.classList.remove('visible');
        dropdown.classList.add('hidden');
        input.focus();
    }
    // Ctrl+K / Cmd+K shortcut to focus search bar
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('main-search-input').focus();
        }
        // Escape key closes dropdown
        if (e.key === 'Escape') {
            const dropdown = document.getElementById('search-results');
            if (dropdown) dropdown.classList.add('hidden');
        }
    });
    // Show/hide clear (X) button as user types
    document.getElementById('main-search-input').addEventListener('input', function () {
        const clearBtn = document.getElementById('search-clear-btn');
        clearBtn.classList.toggle('visible', this.value.length > 0);
    });
    document.addEventListener('DOMContentLoaded', () => {
        // 1. Purana Database load karna
        loadUserDataFromDB();

    // ==========================================
        // 🎛️ 2. FILTER POPUP LOGIC (Connected to Search)
        // ==========================================
        const filterBtn = document.getElementById('filter-btn');
        const filterModal = document.getElementById('filter-modal');
        const closeFilterBtn = document.getElementById('close-filter');
        const applyFilterBtn = document.getElementById('apply-filter-btn');
        
        // 🔥 Ye array search logic aur filter ko connect karega
        window.activeFilterGenres = []; 
            // Update badge count whenever a pill checkbox changes
        function updateFilterBadge() {
            const selectedCount = document.querySelectorAll('.filter-pill input:checked').length;
            const badge = document.getElementById('filter-badge');
            const countLabel = document.getElementById('filter-count-label');
            badge.textContent = selectedCount;
            badge.classList.toggle('show', selectedCount > 0);
            filterBtn.classList.toggle('active-filter', selectedCount > 0);
            countLabel.textContent = selectedCount > 0 ? `(${selectedCount})` : '';
        }
        document.querySelectorAll('.filter-pill input').forEach(cb => {
            cb.addEventListener('change', updateFilterBadge);
        });

        if (filterBtn && filterModal) {
            filterBtn.addEventListener('click', () => {
                filterModal.classList.remove('hidden');
                setTimeout(() => filterModal.classList.add('show'), 10);
            });

            const closeModal = () => {
                filterModal.classList.remove('show');
                setTimeout(() => filterModal.classList.add('hidden'), 300);
            };

            closeFilterBtn.addEventListener('click', closeModal);
            filterModal.addEventListener('click', (e) => {
                if (e.target === filterModal) closeModal();
            });

            // Apply Button Logic
    applyFilterBtn.addEventListener('click', async () => {
        const selectedInputs = document.querySelectorAll('.filter-pill input:checked');
        const selectedGenres = Array.from(selectedInputs).map(i => i.value); // TMDB Genre IDs
        
        if (selectedGenres.length > 0) {
            // 1. Hide Home Section & Show Result Section
            document.getElementById('home-section').style.display = 'none';
            document.getElementById('genre-result-section').classList.remove('hidden');
            
            // 2. Set Loading State
            const grid = document.getElementById('genre-result-grid');
            grid.innerHTML = '<div class="skeleton-card skeleton"></div>'.repeat(10);
            
            // 3. Update Title based on selection
            const genreNames = Array.from(selectedInputs).map(i => i.parentElement.textContent.trim()).join(' • ');
            document.getElementById('genre-result-title').innerText = genreNames;

            // 4. TMDB Fetch API Call
            const genreIds = selectedGenres.join(',');
            
            try {
                const res = await fetch(`/api/tmdb/discover/movie?with_genres=${genreIds}&sort_by=popularity.desc`);
                const data = await res.json();
                
                grid.innerHTML = ''; // Clear loading skeletons

                if (data.results && data.results.length > 0) {
                    data.results.forEach(movie => {
                        // Tera original card generator use kar rahe hain
                        // Isse movie click par 'openMovieDetail' apne aap chalega
                        const cardHTML = generateMovieCardHTML({
                            id: movie.id,
                            title: movie.title,
                            rating: movie.vote_average.toFixed(1),
                            image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'https://via.placeholder.com/500x750'
                        });
                        grid.innerHTML += cardHTML;
                    });
                } else {
                    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px; color: var(--text-gray);">Bhai, is combination mein koi movie nahi mili. Kuch aur try kar!</div>';
                }
            } catch (error) {
                console.error("Filter Fetch Error:", error);
                grid.innerHTML = '<p>Error loading movies. Check internet.</p>';
            }
        }
        closeModal(); 
    });
    }
        // ==========================================
        // 🎡 3. NEW RANDOMIZER POPUP LOGIC
        // ==========================================
        const spinBtn = document.getElementById('random-spin-btn'); 
        const randomModal = document.getElementById('randomizer-modal');
        const closeRandomBtn = document.getElementById('close-randomizer');
        const loadingUI = document.getElementById('randomizer-loading');
        const resultUI = document.getElementById('randomizer-result');
        const randomWatchBtn = document.getElementById('random-watch-btn');

        if (spinBtn && randomModal) {
            // Modal Band Karna
            const closeRandomModal = () => {
                randomModal.classList.remove('show');
                setTimeout(() => randomModal.classList.add('hidden'), 300);
            };

            closeRandomBtn.addEventListener('click', closeRandomModal);
            randomModal.addEventListener('click', (e) => {
                if (e.target === randomModal) closeRandomModal();
            });

            // Spin Button Logic
            // Spin Button Logic (Updated for Premium UI)
            spinBtn.addEventListener('click', async () => {
                spinBtn.style.transition = "transform 0.5s ease";
                spinBtn.style.transform = "rotate(360deg)";

                randomModal.classList.remove('hidden');
                setTimeout(() => randomModal.classList.add('show'), 10);
                loadingUI.classList.remove('hidden');
                resultUI.classList.add('hidden');

                const randomPage = Math.floor(Math.random() * 10) + 1;
                
                // TMDB Genre Mapping to show names instead of IDs
                const genreMap = {28:"Action", 12:"Adventure", 16:"Animation", 35:"Comedy", 80:"Crime", 18:"Drama", 14:"Fantasy", 27:"Horror", 9648:"Mystery", 10749:"Romance", 878:"Sci-Fi", 53:"Thriller"};

                try {
                    const res = await fetch(`/api/tmdb/discover/movie?page=${randomPage}`);
                    const data = await res.json();
                    const randomMovie = data.results[Math.floor(Math.random() * data.results.length)];

                    const safeTitle = randomMovie.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const rating = randomMovie.vote_average.toFixed(1);
                    const imgUrl = `https://image.tmdb.org/t/p/w500${randomMovie.poster_path}`;

                    // Extract up to 2 Genre Names
                    let genreText = "Movie";
                    if(randomMovie.genre_ids && randomMovie.genre_ids.length > 0) {
                        genreText = randomMovie.genre_ids.map(id => genreMap[id]).filter(Boolean).slice(0, 2).join(' • ');
                    }

                    // Update Premium Card UI
                    document.getElementById('random-movie-poster').src = imgUrl;
                    document.getElementById('random-movie-title').innerText = randomMovie.title;
                    document.getElementById('random-movie-genres').innerText = genreText;
                    document.getElementById('random-movie-rating').innerText = rating;

                    // Watchlist Button Direct Click 
                    const watchlistBtn = document.getElementById('random-watchlist-btn');
                    watchlistBtn.innerHTML = `<i class="fa-solid fa-bookmark"></i> Add to Watchlist`; // Reset text
                    watchlistBtn.onclick = (e) => {
                        toggleWatchlist(e.currentTarget, randomMovie.id, safeTitle, rating, imgUrl);
                        e.currentTarget.innerHTML = `<i class="fa-solid fa-check"></i> Added!`;
                    };

                    // View Details Button Click
                    document.getElementById('random-watch-btn').onclick = () => {
                        closeRandomModal();
                        openMovieDetail(randomMovie.id, safeTitle, rating, imgUrl);
                    };

                    // 1.5s Suspense Delay
                    setTimeout(() => {
                        loadingUI.classList.add('hidden');
                        resultUI.classList.remove('hidden');
                    }, 1500);

                } catch (e) {
                    loadingUI.innerHTML = `<h3 style="color: white;">Oops! Network Error</h3>`;
                    console.error("Spin failed", e);
                }

                setTimeout(() => spinBtn.style.transform = "rotate(0deg)", 500);
            });
        }
    });
    // ==========================================
        // 🎡 3. NEW RANDOMIZER POPUP LOGIC (SMART AI UPDATE)
        // ==========================================
        const spinBtn = document.getElementById('random-spin-btn'); 
        const randomModal = document.getElementById('randomizer-modal');
        const closeRandomBtn = document.getElementById('close-randomizer');
        const loadingUI = document.getElementById('randomizer-loading');
        const resultUI = document.getElementById('randomizer-result');
        const randomWatchBtn = document.getElementById('random-watch-btn');

        if (spinBtn && randomModal) {
            // Modal Band Karna
            const closeRandomModal = () => {
                randomModal.classList.remove('show');
                setTimeout(() => randomModal.classList.add('hidden'), 300);
            };

            closeRandomBtn.addEventListener('click', closeRandomModal);
            randomModal.addEventListener('click', (e) => {
                if (e.target === randomModal) closeRandomModal();
            });

            // Spin Button Logic (Updated for Premium UI & AI Smart Logic)
            spinBtn.addEventListener('click', async () => {
                spinBtn.style.transition = "transform 0.5s ease";
                spinBtn.style.transform = "rotate(360deg)";

                randomModal.classList.remove('hidden');
                setTimeout(() => randomModal.classList.add('show'), 10);
                loadingUI.classList.remove('hidden');
                resultUI.classList.add('hidden');

                const randomPage = Math.floor(Math.random() * 10) + 1;
                
                // TMDB Genre Mapping to show names instead of IDs
                const genreMap = {28:"Action", 12:"Adventure", 16:"Animation", 35:"Comedy", 80:"Crime", 18:"Drama", 14:"Fantasy", 27:"Horror", 9648:"Mystery", 10749:"Romance", 878:"Sci-Fi", 53:"Thriller"};

                try {
                    // --- 🔥 NAYA CHANGE: SMART RANDOMIZER LOGIC ---
                    let url = `/api/tmdb/discover/movie?page=${randomPage}`;
                    
                    // Check karo agar user ne koi genre save kiya hai (Hidden input se)
                    const savedUserGenre = document.getElementById('user-saved-genre')?.value;
                    if (savedUserGenre) {
                        url += `&with_genres=${savedUserGenre}`; // URL mein user ka vibe filter add kar do
                    }

                    const res = await fetch(url);
                    const data = await res.json();
                    // ----------------------------------------------

                    const randomMovie = data.results[Math.floor(Math.random() * data.results.length)];

                    const safeTitle = randomMovie.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const rating = randomMovie.vote_average.toFixed(1);
                    const imgUrl = randomMovie.poster_path ? `https://image.tmdb.org/t/p/w500${randomMovie.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster';

                    // Extract up to 2 Genre Names
                    let genreText = "Movie";
                    if(randomMovie.genre_ids && randomMovie.genre_ids.length > 0) {
                        genreText = randomMovie.genre_ids.map(id => genreMap[id]).filter(Boolean).slice(0, 2).join(' • ');
                    }

                    // Update Premium Card UI
                    document.getElementById('random-movie-poster').src = imgUrl;
                    document.getElementById('random-movie-title').innerText = randomMovie.title;
                    document.getElementById('random-movie-genres').innerText = genreText;
                    document.getElementById('random-movie-rating').innerText = rating;

                    // Watchlist Button Direct Click 
                    const watchlistBtn = document.getElementById('random-watchlist-btn');
                    if (watchlistBtn) {
                        watchlistBtn.innerHTML = `<i class="fa-solid fa-bookmark"></i> Add to Watchlist`; // Reset text
                        watchlistBtn.onclick = (e) => {
                            if (typeof toggleWatchlist === 'function') {
                                toggleWatchlist(e.currentTarget, randomMovie.id, safeTitle, rating, imgUrl);
                            }
                            e.currentTarget.innerHTML = `<i class="fa-solid fa-check"></i> Added!`;
                        };
                    }

                    // View Details Button Click
                    const watchBtn = document.getElementById('random-watch-btn');
                    if (watchBtn) {
                        watchBtn.onclick = () => {
                            closeRandomModal();
                            if (typeof openMovieDetail === 'function') {
                                openMovieDetail(randomMovie.id, safeTitle, rating, imgUrl);
                            }
                        };
                    }

                    // 1.5s Suspense Delay
                    setTimeout(() => {
                        loadingUI.classList.add('hidden');
                        resultUI.classList.remove('hidden');
                    }, 1500);

                } catch (e) {
                    loadingUI.innerHTML = `<h3 style="color: white;">Oops! Network Error</h3>`;
                    console.error("Spin failed", e);
                }

                setTimeout(() => spinBtn.style.transform = "rotate(0deg)", 500);
            });
        }
    // ==========================================
        // 🔍 LIVE SEARCH + GENRE FILTER LOGIC
        // ==========================================
        const searchInput = document.getElementById('main-search-input');
        const searchDropdown = document.getElementById('search-results');
        let searchTimeout;

        if (searchInput && searchDropdown) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                clearTimeout(searchTimeout);
                
                if (query.length === 0) {
                    searchDropdown.classList.add('hidden');
                    return;
                }

                searchTimeout = setTimeout(async () => {
                    try {
                        const res = await fetch(`/api/tmdb/search/movie?query=${encodeURIComponent(query)}`);
                        const data = await res.json();
                        
                        searchDropdown.innerHTML = ''; 
                        
                        let finalMovies = data.results;
                        
                        if (window.activeFilterGenres && window.activeFilterGenres.length > 0) {
                            finalMovies = finalMovies.filter(movie => {
                                if (!movie.genre_ids) return false;
                                // Check karega ki movie mein unme se koi ek bhi selected genre hai ya nahi
                                return window.activeFilterGenres.some(id => movie.genre_ids.includes(id));
                            });
                        }

                        if (finalMovies.length === 0) {
                            searchDropdown.innerHTML = '<div style="padding: 15px; color: #94a3b8; text-align: center;">No such Movies..</div>';
                        } else {
                            // Filtered list mein se top 6 dikhao
                            finalMovies.slice(0, 6).forEach(movie => {
                                const imgUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : 'https://via.placeholder.com/45x65?text=No+Img';
                                const safeTitle = movie.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                                const rating = movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A';
                                const year = movie.release_date ? movie.release_date.split('-')[0] : 'Unknown';
                                
                                const itemHtml = `
                                    <div class="search-item" onclick="openMovieDetail(${movie.id}, '${safeTitle}', '${rating}', '${imgUrl}')">
                                        <img src="${imgUrl}" alt="${safeTitle}">
                                        <div class="search-item-info">
                                            <h4>${movie.title}</h4>
                                            <p><span style="color: #fbbf24; font-weight: bold;">⭐ ${rating}</span> &nbsp;•&nbsp; ${year}</p>
                                        </div>
                                    </div>  
                                `;      
                                searchDropdown.innerHTML += itemHtml;
                            });
                        }
                        searchDropdown.classList.remove('hidden');
                    } catch(err) {
                        console.error("Search failed:", err);
                    }
                }, 500); 
            });

            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
                    searchDropdown.classList.add('hidden');
                }
            });
        }
    // ==========================================
    // 🤖 AI SMART RECOMMENDATION (SAVE VIBE)
    // ==========================================
    async function saveUserVibe(genreId) {
        try {
            const res = await fetch('/api/save_genre', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ genre_id: genreId })
            });
            const data = await res.json();
            
            if (data.success) {
                // Hidden input ko turant update kar do taaki randomizer bina refresh kiye kaam kare
                document.getElementById('user-saved-genre').value = genreId;
                console.log("Vibe Saved successfully!");
                
                // User ko ek mast alert dikhao
                alert("Awesome! We've updated your recommendations. Try the 'Surprise Me' Randomizer now! 🎲");
                
                // Agar tera popup close karne ka koi function hai toh use yahan call kar lena
                // hidePopup(); 
            }
        } catch (e) {
            console.error("Failed to save vibe", e);
        }
    }
     // --- NAYA: UPCOMING MOVIES FETCH KARNE KA FUNCTION ---
    // --- NAYA: UPCOMING MOVIES FETCH KARNE KA FUNCTION (WITH DATES) ---
    async function fetchUpcomingMovies() {
        const grid = document.getElementById('upcoming-grid');
        if (!grid) return;

        grid.innerHTML = '<div class="skeleton-card skeleton"></div>'.repeat(10);

        try {
            const res = await fetch('/api/upcoming');
            const movies = await res.json();
            
            grid.innerHTML = ''; 

            if (movies.error) {
                grid.innerHTML = `<p style="color: #94a3b8; padding: 20px;">Movies load nahi ho payi. Network check kar!</p>`;
                return;
            }

            movies.forEach(m => {
                const safeTitle = m.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                
                // Date format karna (e.g., 2026-05-15 to 15 May 2026)
                let formattedDate = "Coming Soon";
                if(m.release_date && m.release_date !== 'N/A') {
                    const d = new Date(m.release_date);
                    formattedDate = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                }

                // 🔥 NAYA CUSTOM CARD JO RATING KI JAGAH DATE DIKHAYEGA
                const cardHtml = `
                    <div class="card" style="background-image: url('${m.image}'); border: 1px solid rgba(239, 68, 68, 0.3);" onclick="openMovieDetail(${m.id}, '${safeTitle}', '${m.rating}', '${m.image}')">
                        <div class="watchlist-btn" data-title="${safeTitle}" onclick="event.stopPropagation(); toggleWatchlist(this, ${m.id}, '${safeTitle}', '${m.rating}', '${m.image}')">
                            <i class="fa-regular fa-bookmark"></i>
                        </div>
                        <div class="card-content">
                            <span class="rating" style="background: rgba(239, 68, 68, 0.95); color: white; padding: 4px 10px; border-radius: 6px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">📅 ${formattedDate}</span>
                            <h3 style="margin-top: 8px;">${m.title}</h3>
                        </div>
                    </div>
                `;
                grid.innerHTML += cardHtml;
            });
            console.log("✅ Upcoming Movies loaded with Dates!");
            
        } catch (err) {
            console.error("Error fetching upcoming:", err);
        }
    }
