document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    loadCategoriesForMenu();
    loadPublishedCourses();
    await loadAllRecommendations();
});

/**
 * Kullanıcı oturum durumunu kontrol eder ve profesyonel navigasyon menüsünü günceller
 */
function checkAuth() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');
    const authContainer = document.getElementById('authNavContainer');
    
    // 1. Durum: Kullanıcı Giriş Yapmış
    if (token && userJson) {
        let user;
        
        try {
            user = JSON.parse(userJson);
        } catch (error) {
            console.error('[HATA] Kullanıcı verisi okunamadı.');
            logout(); 
            return;
        }
        
        if (!authContainer) return;

        // Kişinin rolüne göre doğru paneli belirle
        const dashboardLink = user.rol === 'egitmen' 
            ? '/instructor/dashboard.html' 
            : '/student/dashboard.html';

        const isStudent = user.rol === 'ogrenci';
        const cartIconHtml = isStudent ? `
            <a href="/student/cart.html" class="nav-cart-link" title="Sepetim" style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;color:#0f172a;text-decoration:none;margin-right:8px;transition:background .15s;">
                <i class="fas fa-shopping-cart" style="font-size:1.15rem;"></i>
                <span id="cartCountBadge" class="cart-count-badge" style="display:none;position:absolute;top:2px;right:2px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#ef4444;color:#fff;font-size:0.7rem;font-weight:700;line-height:18px;text-align:center;"></span>
            </a>
        ` : '';

        const studentDropdownItems = isStudent ? `
            <a href="/student/cart.html"><i class="fas fa-shopping-cart" style="width:20px;"></i> Sepetim</a>
            <a href="/student/orders.html"><i class="fas fa-receipt" style="width:20px;"></i> Siparişlerim</a>
        ` : '';

        authContainer.innerHTML = `
            ${cartIconHtml}
            <div class="user-dropdown">
                <button class="dropdown-trigger">
                    <i class="fas fa-user-circle" style="font-size: 1.2rem;"></i>
                    ${user.ad}
                    <i class="fas fa-chevron-down" style="font-size: 0.8rem; margin-left: 5px;"></i>
                </button>

                <div class="dropdown-content">
                    <a href="/profile/index.html"><i class="fas fa-id-badge" style="width:20px;"></i> Profil</a>
                    <a href="${dashboardLink}"><i class="fas fa-columns" style="width:20px;"></i> Panelim</a>
                    ${studentDropdownItems}
                    <hr>
                    <button onclick="logout()" class="text-danger"><i class="fas fa-sign-out-alt" style="width:20px;"></i> Çıkış Yap</button>
                </div>
            </div>
        `;

        if (isStudent) {
            updateCartBadge();
        }
    } 
    // 2. Durum: Kullanıcı Giriş YAPMAMIŞ (Ziyaretçi)
    else {
        if (authContainer) {
            authContainer.innerHTML = `
                <a href="/auth/index.html" class="btn-auth-blue">Giriş Yap / Kayıt Ol</a>
            `;
        }
    }
}

/**
 * Yayınlanmış kursları backendden çeker ve YENİ Ortak Kart Tasarımı ile basar
 */
async function loadPublishedCourses() {
    const grid = document.getElementById('courseGrid');
    
    if (!grid) return; 

    grid.innerHTML = '<div class="loading-state"><p>Kurslar yükleniyor, lütfen bekleyin...</p></div>';
    
    try {
        const result = await ApiService.get('/courses/published');
        const courses = result.data || [];
        
        if (courses.length === 0) {
            grid.innerHTML = '<p class="info-message">Henüz yayınlanmış bir kurs bulunmuyor.</p>';
            return;
        }

        grid.innerHTML = ''; 

        courses.forEach(course => {
            // YENİ EKLENEN KISIM: Eski hardcoded HTML silindi, ortak renderCourseCard kullanılıyor
            const cardHtml = renderCourseCard(course);
            grid.insertAdjacentHTML('beforeend', cardHtml);
        });

    } catch (error) {
        console.error("[HATA] Kurslar yüklenemedi:", error.message);
        grid.innerHTML = `
            <div class="error-container" style="text-align: center; color: #dc3545; padding: 20px;">
                <p>Şu anda kurslar yüklenemiyor.</p>
                <small>${error.message}</small>
            </div>
        `;
    }
}

function logout() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) {
        ApiService.logout();
    } else {
        localStorage.clear();
        window.location.reload();
    }
}

async function updateCartBadge() {
    const badge = document.getElementById('cartCountBadge');
    if (!badge) return;
    try {
        const result = await ApiService.get('/cart');
        const count = result?.data?.kalem_sayisi || 0;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    } catch (_) { /* sessiz */ }
}
window.updateCartBadge = updateCartBadge;

// ==========================================
// KATEGORİ VE MEGA MENÜ YÖNETİMİ
// ==========================================

window.allCategories = [];

async function loadCategoriesForMenu() {
    const parentList = document.getElementById('parentList');
    if (!parentList) return;

    try {
        const result = await ApiService.get('/categories');
        const categories = result.data || [];
        window.allCategories = categories;
        
        const mainCategories = categories.filter(k => {
            const parentId = k.ust_kategori_id || k.ustKategoriId || k.KategoriId || k.parentId || k.parent_id || null;
            return parentId === null || parentId === undefined || parentId === ""; 
        });
        
        if (mainCategories.length > 0) {
            parentList.innerHTML = mainCategories.map(p => `
                <div class="cat-item p-item" onmouseenter="showChildCategories('${p.id}', this)">
                    ${p.ad} <i class="fas fa-chevron-right"></i>
                </div>
            `).join('');
        } else {
            parentList.innerHTML = '<p style="padding: 10px 20px; color: #64748b;">Kategori bulunamadı.</p>';
        }

    } catch (error) {
        console.error("[HATA] Mega menü kategorileri yüklenemedi:", error);
    }
}

function showChildCategories(parentId, element) {
    document.querySelectorAll('.p-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    document.getElementById('grandChildCol').style.display = 'none';
    
    const children = window.allCategories.filter(k => {
        const kParent = k.ust_kategori_id || k.ustKategoriId || k.KategoriId || k.parentId || k.parent_id;
        return kParent == parentId;
    });
    
    const childCol = document.getElementById('childCol');
    const childList = document.getElementById('childList');
    
    if (children.length > 0) {
        childCol.style.display = 'block';
        childList.innerHTML = children.map(c => `
            <div class="cat-item c-item" onmouseenter="showGrandChildCategories('${c.id}', this)">
                ${c.ad} <i class="fas fa-chevron-right"></i>
            </div>
        `).join('');
    } else {
        childCol.style.display = 'none';
    }
}

function showGrandChildCategories(childId, element) {
    document.querySelectorAll('.c-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    const grandChildren = window.allCategories.filter(k => {
        const kParent = k.ust_kategori_id || k.ustKategoriId || k.KategoriId || k.parentId || k.parent_id;
        return kParent == childId;
    });
    
    const grandChildCol = document.getElementById('grandChildCol');
    const grandChildList = document.getElementById('grandChildList');
    
    if (grandChildren.length > 0) {
        grandChildCol.style.display = 'block';
        grandChildList.innerHTML = grandChildren.map(g => `
            <div class="cat-item">
                ${g.ad}
            </div>
        `).join(''); 
    } else { 
        grandChildCol.style.display = 'none'; 
    }
}

// ==========================================
// ORTAK KART VE ÖNERİ SİSTEMİ
// ==========================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Verilen puana göre görsel yıldız (HTML) oluşturur
 */
function generateStarRatingHtml(rating, reviewCount) {
    if (!rating || rating === 0) {
        return `<div style="color: #94a3b8; font-size: 0.9rem; margin: 8px 0;">
                    <i class="far fa-star"></i> Henüz değerlendirilmedi
                </div>`;
    }

    const fullStars = Math.floor(rating);
    const hasHalfStar = (rating - fullStars) >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    let starsHtml = '';
    for (let i = 0; i < fullStars; i++) starsHtml += '<i class="fas fa-star"></i> ';
    if (hasHalfStar) starsHtml += '<i class="fas fa-star-half-alt"></i> ';
    for (let i = 0; i < emptyStars; i++) starsHtml += '<i class="far fa-star"></i> ';

    return `
        <div style="color: #fbbf24; font-size: 0.95rem; margin: 8px 0; display: flex; align-items: center; gap: 5px;">
            <span style="font-weight: bold; color: #b45309; margin-right: 2px;">${rating}</span>
            <span>${starsHtml}</span>
            <span style="color: #64748b; font-size: 0.85rem; margin-left: 4px;">(${reviewCount})</span>
        </div>
    `;
}

/**
 * Tek bir kurs kartı oluşturur (Ortak fonksiyon)
 */
function renderCourseCard(course) {
    const courseId = course.id || '';
    const courseTitle = course.baslik || 'Başlıksız Kurs';
    const courseDesc = course.alt_baslik || '';
    
    let instructorName = 'Uzman Eğitmen';
    if (course.Egitmen) {
        instructorName = `${course.Egitmen.ad || ''} ${course.Egitmen.soyad || ''}`.trim();
    } else if (course.egitmen) {
        instructorName = `${course.egitmen.ad || ''} ${course.egitmen.soyad || ''}`.trim();
    }

    const coursePrice = course.fiyat > 0 ? `${parseFloat(course.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
    const categoryName = course.Kategori?.ad || course.kategori?.ad || 'Genel';
    
    const avgRating = course.istatistikler?.ortalama_puan || 0;
    const totalReviews = course.istatistikler?.toplam_yorum || 0;
    
    const ratingDisplay = generateStarRatingHtml(avgRating, totalReviews);

    const safeTitle = escapeHtml(courseTitle);
    const safeInstructor = escapeHtml(instructorName);

    return `
        <a href="/main/course-detail.html?id=${courseId}" class="course-card" style="text-decoration: none; color: inherit; transition: transform 0.2s, box-shadow 0.2s;">
            <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #fff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); transition: all 0.3s; height: 100%; display: flex; flex-direction: column;">
                
                <div style="height: 160px; background: linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 3rem; position: relative;">
                    <i class="fas fa-laptop-code" style="opacity: 0.8;"></i>
                    <span style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.5px;">
                        ${escapeHtml(categoryName)}
                    </span>
                </div>

                <div style="padding: 20px; display: flex; flex-direction: column; flex-grow: 1;">
                    <h3 style="margin: 0 0 10px 0; font-size: 1.15rem; color: #0f172a; line-height: 1.4; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${safeTitle}
                    </h3>

                    <p style="margin: 0 0 10px 0; font-size: 0.9rem; color: #475569;">
                        <i class="fas fa-chalkboard-teacher" style="margin-right: 6px; color: #94a3b8;"></i>
                        ${safeInstructor}
                    </p>

                    ${ratingDisplay}

                    <div style="flex-grow: 1;"></div>

                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 12px;">
                        <span style="font-weight: 800; font-size: 1.3rem; color: #0f172a;">${coursePrice}</span>
                        <span style="color: #2563eb; font-size: 0.9rem; font-weight: 700;">İncele <i class="fas fa-arrow-right" style="margin-left: 4px;"></i></span>
                    </div>
                </div>
            </div>
        </a>
    `;
}

async function loadPersonalizedRecommendations() {
    const recommendedGrid = document.getElementById('recommendedGrid');
    if (!recommendedGrid) return;

    const token = localStorage.getItem('edunex_token');
    const recommendedSection = document.getElementById('recommendedSection');

    if (!token) {
        recommendedSection.style.display = 'none';
        return;
    }

    try {
        const result = await ApiService.get('/recommendations/personalized');
        const courses = result.data || [];

        recommendedSection.style.display = 'block';

        if (courses.length === 0) {
            recommendedGrid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: white;">
                    <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                    <p>Henüz kişiselleştirilmiş öneriler oluşturulamadı. Lütfen ilgi alanlarınızı profil sayfasında ayarlayın.</p>
                    <a href="/profile/index.html" style="color: white; text-decoration: underline; margin-top: 10px; display: inline-block;">Profil Ayarlarına Git →</a>
                </div>
            `;
            return;
        }

        recommendedGrid.innerHTML = '';
        courses.forEach(course => {
            const cardHtml = renderCourseCard(course);
            recommendedGrid.insertAdjacentHTML('beforeend', cardHtml);
        });
    } catch (error) {
        recommendedGrid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #dc3545;">
                <p>Öneriler yüklenemedi. Lütfen daha sonra tekrar deneyin.</p>
            </div>
        `;
    }
}

async function loadTrendingCourses() {
    const trendingGrid = document.getElementById('trendingGrid');
    if (!trendingGrid) return;

    try {
        const result = await ApiService.get('/recommendations/trending');
        const courses = result.data || [];

        if (courses.length === 0) {
            trendingGrid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #64748b;">
                    <p>Şu anda trend olan kurs bulunmuyor.</p>
                </div>
            `;
            return;
        }

        trendingGrid.innerHTML = '';
        courses.forEach(course => {
            const cardHtml = renderCourseCard(course);
            trendingGrid.insertAdjacentHTML('beforeend', cardHtml);
        });
    } catch (error) {
        trendingGrid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #dc3545;">
                <p>Trend kurslar yüklenemedi.</p>
            </div>
        `;
    }
}

async function loadTopRatedCourses() {
    const topRatedGrid = document.getElementById('topRatedGrid');
    if (!topRatedGrid) return;

    try {
        const result = await ApiService.get('/recommendations/top-rated');
        const courses = result.data || [];

        if (courses.length === 0) {
            topRatedGrid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #64748b;">
                    <p>Henüz puanlanmış kurs bulunmuyor.</p>
                </div>
            `;
            return;
        }

        topRatedGrid.innerHTML = '';
        courses.forEach(course => {
            const cardHtml = renderCourseCard(course);
            topRatedGrid.insertAdjacentHTML('beforeend', cardHtml);
        });
    } catch (error) {
        topRatedGrid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #dc3545;">
                <p>En yüksek puanlı kurslar yüklenemedi.</p>
            </div>
        `;
    }
}

async function loadAllRecommendations() {
    await Promise.all([
        loadPersonalizedRecommendations(),
        loadTrendingCourses(),
        loadTopRatedCourses()
    ]);
}