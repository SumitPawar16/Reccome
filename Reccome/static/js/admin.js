// User ka likha text page mein safe tareeke se dikhane ke liye (XSS se bachav)
function escapeHTML(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ================== TABS SWITCHING ==================
const tabs = document.querySelectorAll('.admin-tab');
const sections = document.querySelectorAll('.admin-section');

tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        if (tab.getAttribute('href') === '/logout') return;
        e.preventDefault();

        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        tab.classList.add('active');
        const target = tab.getAttribute('data-target');
        document.getElementById(target).classList.add('active');

        // Moderation tab open hone pe auto-load reviews
        if (target === 'dash-reviews') fetchReviews();
    });
});


// ================== 1. STATS ==================
async function fetchAdminStats() {
    try {
        const res  = await fetch('/api/admin/stats');
        const data = await res.json();
        document.getElementById('stat-users-count').innerText   = data.total_users   ?? 0;
        document.getElementById('stat-reviews-count').innerText = data.total_reviews ?? 0;
    } catch (e) { console.error("Stats fetch error:", e); }
}


// ================== 2. USERS HUB ==================
async function fetchUsersList() {
    try {
        const res   = await fetch('/api/admin/users');
        const users = await res.json();
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = '';

        users.forEach(user => {
            const initial  = user.name ? escapeHTML(user.name.charAt(0).toUpperCase()) : 'U';
            const isAdmin  = user.role === 'admin';
            const roleBadge = isAdmin
                ? `<span class="role-badge role-admin">Admin 👑</span>`
                : `<span class="role-badge role-member">Member</span>`;

            // Role toggle button — admin ko promote/demote karo
            const roleBtn = isAdmin
                ? `<button class="action-btn demote" onclick="changeRole(${escapeHTML(JSON.stringify(user.email))}, 'user')" title="Demote to Member"><i class="fa-solid fa-arrow-down"></i></button>`
                : `<button class="action-btn promote" onclick="changeRole(${escapeHTML(JSON.stringify(user.email))}, 'admin')" title="Promote to Admin"><i class="fa-solid fa-crown"></i></button>`;

            tbody.innerHTML += `
                <tr class="data-row">
                    <td>
                        <div class="user-cell">
                            <div class="user-avatar">${initial}</div>
                            <div class="user-info-text">
                                <strong>${escapeHTML(user.name)}</strong>
                                <small>${escapeHTML(user.email)}</small>
                            </div>
                        </div>
                    </td>
                    <td>${roleBadge}</td>
                    <td><span style="color:#f472b6; font-weight:600;">${user.liked_count ?? 0}</span></td>
                    <td><span style="color:#60a5fa; font-weight:600;">${user.watchlist_count ?? 0}</span></td>
                    <td style="text-align:right; display:flex; gap:8px; justify-content:flex-end;">
                        ${roleBtn}
                        <button class="action-btn ban" onclick="banUser(${escapeHTML(JSON.stringify(user.email))})" title="Ban User">
                            <i class="fa-solid fa-ban"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (e) { console.error("Users fetch error:", e); }
}

// Change role
async function changeRole(email, newRole) {
    const action = newRole === 'admin' ? 'promote to Admin' : 'demote to Member';
    if (!confirm(`Are you sure you want to ${action} ${email}?`)) return;

    try {
        const res    = await fetch('/api/admin/change_role', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email, role: newRole })
        });
        const result = await res.json();
        if (result.success) {
            fetchUsersList();
            fetchAdminStats();
        } else {
            alert(result.message || "Role change failed.");
        }
    } catch (e) { console.error("Role change error:", e); }
}

// Ban user
async function banUser(email) {
    if (!confirm(`WARNING: Permanently delete and ban ${email}?`)) return;
    try {
        const res    = await fetch('/api/admin/ban_user', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ email })
        });
        const result = await res.json();
        if (result.success) {
            alert("User banned! 🎯");
            fetchUsersList();
            fetchAdminStats();
        } else {
            alert(result.message || "Operation failed.");
        }
    } catch (e) { console.error("Ban error:", e); }
}


// ================== 3. MODERATION ==================
let allReviews = [];   // Cache karte hain filter ke liye

async function fetchReviews() {
    const container = document.getElementById('reviews-container');
    container.innerHTML = '<p style="color:var(--text-gray); text-align:center; padding:40px;">Loading...</p>';

    try {
        const res  = await fetch('/api/admin/reviews');
        allReviews = await res.json();
        renderReviews(allReviews);
    } catch (e) {
        container.innerHTML = '<p style="color:#ef4444; text-align:center;">Failed to load reviews.</p>';
    }
}

function renderReviews(reviews) {
    const container = document.getElementById('reviews-container');

    if (reviews.length === 0) {
        container.innerHTML = '<p style="color:var(--text-gray); text-align:center; padding:40px;">No reviews found.</p>';
        return;
    }

    container.innerHTML = '';
    reviews.forEach(rev => {
        const stars    = '⭐'.repeat(rev.rating || 0);
        const isHidden = rev.flagged;
        const date     = rev.timestamp ? new Date(rev.timestamp * 1000).toLocaleDateString('en-IN') : 'N/A';

        const card = document.createElement('div');
        card.className = 'review-mod-card' + (isHidden ? ' is-hidden' : '');
        card.innerHTML = `
            <div class="review-mod-header">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div class="mod-avatar">${rev.author ? escapeHTML(rev.author[0].toUpperCase()) : 'U'}</div>
                    <div>
                        <strong style="color:white; font-size:15px;">${escapeHTML(rev.author || 'Anonymous')}</strong>
                        <small style="display:block; color:var(--text-gray); font-size:12px;">${escapeHTML(rev.email || '')}</small>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:16px;">${stars}</div>
                    <small style="color:var(--text-gray); font-size:11px;">${date}</small>
                </div>
            </div>

            <div class="review-mod-movie">
                <i class="fa-solid fa-film" style="color:var(--primary-red);"></i>
                <span>${rev.movie_title ? escapeHTML(rev.movie_title) + ' &nbsp;·&nbsp; ' : ''}ID: ${escapeHTML(rev.movie_id)}</span>
            </div>

            <p class="review-mod-content">${escapeHTML(rev.content)}</p>

            <div class="review-mod-footer">
                <span class="mod-status-badge ${isHidden ? 'status-hidden' : 'status-visible'}">
                    ${isHidden ? '🚩 Hidden' : '✅ Visible'}
                </span>
                <button class="mod-action-btn ${isHidden ? 'btn-unhide' : 'btn-hide'}"
                    onclick="toggleFlag(${escapeHTML(JSON.stringify(String(rev.movie_id)))}, ${escapeHTML(JSON.stringify(rev.email))}, ${!isHidden}, this)">
                    ${isHidden ? '👁️ Unhide' : '🚩 Hide'}
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

// Filter — All / Visible / Hidden
function filterReviews(type, btn) {
    document.querySelectorAll('.mod-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (type === 'all')     renderReviews(allReviews);
    if (type === 'visible') renderReviews(allReviews.filter(r => !r.flagged));
    if (type === 'hidden')  renderReviews(allReviews.filter(r => r.flagged));
}

// Flag / Unflag
async function toggleFlag(movieId, email, flagValue, btn) {
    btn.disabled    = true;
    btn.innerText   = '...';

    try {
        const res    = await fetch('/api/admin/flag_review', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ movie_id: movieId, email, flagged: flagValue })
        });
        const result = await res.json();
        if (result.success) fetchReviews();   // Refresh the list
        else { btn.disabled = false; btn.innerText = 'Error'; }
    } catch (e) {
        btn.disabled  = false;
        btn.innerText = 'Error';
    }
}


// ================== ON PAGE LOAD ==================
window.addEventListener('load', () => {
    fetchAdminStats();
    fetchUsersList();
});