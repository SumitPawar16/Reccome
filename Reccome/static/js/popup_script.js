let loadingTimerInterval = null;

function openPopup() { 
    document.getElementById('popupOverlay').style.display = 'flex'; 
    document.getElementById('main-wrapper').classList.add('blur-effect'); 
    resetPopup(); 
}

function closePopup() { 
    document.getElementById('popupOverlay').style.display = 'none'; 
    document.getElementById('main-wrapper').classList.remove('blur-effect'); 
    if (typeof loadProfileData === "function") loadProfileData(); 
}

function resetPopup() { 
    document.getElementById('step1').classList.remove('hidden'); 
    document.getElementById('step2').classList.add('hidden'); 
    document.getElementById('loadingStep').classList.add('hidden'); 
    document.getElementById('resultStep').classList.add('hidden'); 
    document.querySelectorAll('.opt-card').forEach(el => el.classList.remove('selected')); 
    document.getElementById('nextBtn').classList.remove('active'); 
    document.getElementById('finishBtn').classList.remove('active'); 
}

let selectedGenres = 0;

function selectItem(element, type) {
    if (type === 'genre') {
        element.classList.toggle('selected');
        selectedGenres = document.querySelectorAll('#step1 .selected').length;
        const btn = document.getElementById('nextBtn');
        if (selectedGenres > 0) btn.classList.add('active'); 
        else btn.classList.remove('active');
    } else if (type === 'mood') {
        document.querySelectorAll('#step2 .opt-card').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        document.getElementById('finishBtn').classList.add('active');
    }
}

function goToStep2() { 
    document.getElementById('step1').classList.add('hidden'); 
    document.getElementById('step2').classList.remove('hidden'); 
}

function goToStep1() { 
    document.getElementById('step2').classList.add('hidden'); 
    document.getElementById('step1').classList.remove('hidden'); 
}

// ==========================================
// 🧠 LIVE API CALL TO FLASK BACKEND
// ==========================================
async function startLoading() { 
    // Step 2 / Result hide karo, Loading dikhao
    document.getElementById('step2').classList.add('hidden'); 
    document.getElementById('resultStep').classList.add('hidden');
    document.getElementById('loadingStep').classList.remove('hidden'); 

    // ── Real Timer Start ──
    const timerEl = document.getElementById('loadingTimer');
    const startTime = Date.now();
    if (timerEl) timerEl.textContent = '0.0s';
    if (loadingTimerInterval) clearInterval(loadingTimerInterval);
    loadingTimerInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (timerEl) timerEl.textContent = elapsed + 's';
    }, 100);

    // User ne jo Genre aur Mood select kiya hai, usko padho
    const selectedGenresElements = document.querySelectorAll('#step1 .opt-card.selected');
    const selectedGenres = Array.from(selectedGenresElements).map(el => el.innerText.replace(/[^a-zA-Z\- ]/g, '').trim());
    
    const selectedMoodElement = document.querySelector('#step2 .opt-card.selected');
    const selectedMood = selectedMoodElement ? selectedMoodElement.innerText.replace(/[^a-zA-Z\- ]/g, '').trim() : '';

    try {
        // Flask (/api/ai-recommend) ko data bhejo
        const res = await fetch('/api/ai-recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ genres: selectedGenres, mood: selectedMood })
        });
        
        const data = await res.json();

        // ── Timer Stop ──
        clearInterval(loadingTimerInterval);
        loadingTimerInterval = null;

        if (data.success) {
            const movie = data.movie;
            const safeTitle = movie.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            // Hidden input update karo taaki randomizer kaam kare
            if (data.saved_genre_id && document.getElementById('user-saved-genre')) {
                document.getElementById('user-saved-genre').value = data.saved_genre_id;
            }

            // UI mein Live Data daalo (Image, Title, Rating)
            document.getElementById('recImage').src = movie.image;
            document.getElementById('recTitle').innerText = movie.title;
            document.getElementById('recRating').innerText = movie.rating;

            // Next Recommendation Button
            const nextBtn = document.getElementById('popupNextBtn');
            if (nextBtn) {
                nextBtn.onclick = () => startLoading();
            }

            const detailsBtn = document.getElementById('popupDetailsBtn');
            if (detailsBtn) {
                detailsBtn.onclick = () => {
                    closePopup();
                    if (typeof openMovieDetail === 'function') {
                        openMovieDetail(movie.id, safeTitle, movie.rating, movie.image);
                    }
                };
            }

            // Loading hatao, Result dikhao
            document.getElementById('loadingStep').classList.add('hidden'); 
            document.getElementById('resultStep').classList.remove('hidden');

        } else {
            alert("Oops! Could not find a movie. Try different vibes.");
            closePopup();
        } 

    } catch (e) {
        // ── Timer Stop on Error ──
        clearInterval(loadingTimerInterval);
        loadingTimerInterval = null;
        console.error("AI Fetch Failed:", e);
        alert("Network Error! Checking your connection.");
        closePopup();
    }
}

function giveFeedback(element, type) {
    const icons = element.closest('.thumbs').querySelectorAll('i');
    icons.forEach(i => { 
        i.classList.remove('active-like', 'active-dislike'); 
        i.classList.replace('fa-solid', 'fa-regular'); 
    });
    element.classList.remove('fa-regular'); 
    element.classList.add('fa-solid');
    if (type === 'like') {
        element.classList.add('active-like');
        let currentCount = parseInt(localStorage.getItem('recLikedCount') || '0');
        if (!element.dataset.clicked) { 
            currentCount++; 
            localStorage.setItem('recLikedCount', currentCount); 
            element.dataset.clicked = "true"; 
        }
    } else { 
        element.classList.add('active-dislike'); 
    }
}