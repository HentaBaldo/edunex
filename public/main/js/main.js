document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadPublishedCourses();
    loadCategoriesForMenu();
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
        
        // Sadece JSON parse işlemini try-catch içine alıyoruz ki DOM hataları bizi sistemden atmasın
        try {
            user = JSON.parse(userJson);
        } catch (error) {
            console.error('[HATA] Kullanıcı verisi okunamadı.');
            logout(); 
            return;
        }
        
        // KRİTİK ÇÖZÜM: Navbar o sayfada yoksa veya henüz yüklenmediyse işlemi durdur, hata verme!
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
 * Yayınlanmış kursları backendden çeker ve arayüze basar
 */
async function loadPublishedCourses() {
    const grid = document.getElementById('courseGrid');
    
    // KRİTİK ÇÖZÜM 2: Profil sayfası gibi kurs grid'i olmayan sayfalarda hata vermesini engeller
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
            const categoryName = course.Category ? course.Category.ad : 'Genel';
            const instructorName = course.Egitmen ? `${course.Egitmen.ad} ${course.Egitmen.soyad}` : 'Uzman Eğitmen';
            const priceDisplay = course.fiyat > 0 ? `${course.fiyat} ₺` : 'Ücretsiz';

            const cardHtml = `
                <div class="course-card" style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fff; transition: transform 0.2s;">
                    <div style="height: 150px; background: #e2e8f0; display: flex; align-items: center; justify-content: center; font-size: 3rem;">📚</div>
                    <div style="padding: 20px;">
                        <span style="font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: bold;">${categoryName}</span>
                        <h3 style="margin: 10px 0; font-size: 1.1rem; color: #1e293b;">${course.baslik}</h3>
                        <p style="font-size: 0.9rem; color: #475569; margin-bottom: 15px;"><i class="fas fa-user-tie"></i> ${instructorName}</p>
                        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                            <span style="font-weight: 800; font-size: 1.2rem; color: #0f172a;">${priceDisplay}</span>
                            <a href="/main/course-detail.html?id=${course.id}" style="background: #2563eb; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 600;">İncele</a>
                        </div>
                    </div>
                </div>
            `;
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

/**
 * Sepet ikonunun yanındaki sayacı günceller.
 * Sessiz hata: sepet endpoint'i erişilemezse hiçbir şey göstermez.
 */
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
    
    // KRİTİK ÇÖZÜM 3: Mega menü o an sayfada yoksa kod hata vermeden dursun
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
// ÖNERİ SİSTEMİ - RECOMMENDATION ENGINE
// ==========================================

/**
 * Tek bir kurs kartı oluşturur (Ortak fonksiyon)
 * Tümü tarafından kullanılır: Personalized, Trending, Top-Rated
 * @param {Object} course - Kurs verisi
 * @returns {string} HTML string
 */
function renderCourseCard(course) {
    // 1. Veri Hazırlama
    const courseId = course.id || '';
    const courseTitle = course.baslik || 'Başlıksız Kurs';
    const courseDesc = course.alt_baslik || '';
    const instructorName = course.egitmen 
        ? `${course.egitmen.ad || ''} ${course.egitmen.soyad || ''}`.trim()
        : 'Bilinmeyen Eğitmen';
    const coursePrice = course.fiyat > 0 ? `${parseFloat(course.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
    const courseLevel = course.seviye || 'Temel';
    
    // 2. Rating Verisi (varsa)
    const avgRating = course.istatistikler?.ortalama_puan || null;
    const totalStudents = course.istatistikler?.toplam_ogrenci || 0;
    const ratingDisplay = avgRating 
        ? `<div style="color: #fbbf24; font-size: 0.9rem; margin: 8px 0;"><i class="fas fa-star"></i> ${avgRating} (${totalStudents} kayıt)</div>`
        : `<div style="color: #94a3b8; font-size: 0.9rem; margin: 8px 0;"><i class="fas fa-star"></i> Henüz puan yok</div>`;

    // 3. XSS Koruması
    const safeTitle = escapeHtml(courseTitle);
    const safeDesc = escapeHtml(courseDesc);
    const safeInstructor = escapeHtml(instructorName);

    // 4. HTML Oluştur
    return `
        <a href="/main/course-detail.html?id=${courseId}" class="course-card" style="text-decoration: none; color: inherit; transition: transform 0.2s, box-shadow 0.2s;">
            <div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: all 0.3s;">
                <!-- Kurs Kapak Fotoğrafı -->
                <div style="height: 160px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 3rem; position: relative; overflow: hidden;">
                    <i class="fas fa-book" style="opacity: 0.3;"></i>
                    ${course.Kategori ? `<span style="position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">${escapeHtml(course.Kategori.ad || course.kategori.ad || 'Genel')}</span>` : ''}
                </div>

                <!-- Kurs Bilgisi -->
                <div style="padding: 16px;">
                    <!-- Başlık -->
                    <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; color: #1e293b; line-height: 1.4; font-weight: 600;">
                        ${safeTitle}
                    </h3>

                    <!-- Alt Başlık -->
                    ${safeDesc ? `<p style="margin: 8px 0; font-size: 0.9rem; color: #64748b; line-height: 1.4;">${safeDesc}</p>` : ''}

                    <!-- Eğitmen -->
                    <p style="margin: 8px 0; font-size: 0.85rem; color: #64748b;">
                        <i class="fas fa-user-tie" style="margin-right: 4px;"></i>
                        ${safeInstructor}
                    </p>

                    <!-- Rating -->
                    ${ratingDisplay}

                    <!-- Fiyat -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 12px; margin-top: 12px;">
                        <span style="font-weight: 800; font-size: 1.2rem; color: #0f172a;">${coursePrice}</span>
                        <button style="background: #2563eb; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: background 0.2s;">
                            İncele →
                        </button>
                    </div>
                </div>
            </div>
        </a>
    `;
}

/**
 * Giriş yapmış öğrenciye kişiselleştirilmiş kurs önerileri yükle
 * @route GET /api/recommendations/personalized
 * 
 * ✅ FIX: recommendedGrid olmayan sayfalarda hata vermez
 */
async function loadPersonalizedRecommendations() {
    const recommendedGrid = document.getElementById('recommendedGrid');
    
    // ✅ DOM KONTROLÜ: Element yoksa fonksiyonu durdur
    if (!recommendedGrid) {
        console.log('[RECOMMENDATIONS] recommendedGrid bu sayfada yok, atlaniyor.');
        return;
    }

    const token = localStorage.getItem('edunex_token');
    const recommendedSection = document.getElementById('recommendedSection');

    // Giriş yapmamışsa bölümü gizle
    if (!token) {
        recommendedSection.style.display = 'none';
        return;
    }

    try {
        console.log('[RECOMMENDATIONS] Personalized öneriler yükleniyor...');
        
        const result = await ApiService.get('/recommendations/personalized');
        const courses = result.data || [];

        console.log('[RECOMMENDATIONS] Alınan veriler:', courses);

        // Bölümü göster
        recommendedSection.style.display = 'block';

        // Eğer öneri yoksa bilgi mesajı göster
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

        // Kursları render et
        recommendedGrid.innerHTML = '';
        courses.forEach(course => {
            const cardHtml = renderCourseCard(course);
            recommendedGrid.insertAdjacentHTML('beforeend', cardHtml);
        });

        console.log(`[RECOMMENDATIONS] ${courses.length} kişiselleştirilmiş kurs render edildi`);

    } catch (error) {
        console.error('[RECOMMENDATIONS] Personalized yükleme hatası:', error);
        recommendedGrid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                <p>Öneriler yüklenemedi. Lütfen daha sonra tekrar deneyin.</p>
            </div>
        `;
    }
}

/**
 * Trend olan (en çok kayıtlı) kursları yükle
 * @route GET /api/recommendations/trending
 * 
 * ✅ FIX: trendingGrid olmayan sayfalarda hata vermez
 */
async function loadTrendingCourses() {
    const trendingGrid = document.getElementById('trendingGrid');

    // ✅ DOM KONTROLÜ: Element yoksa fonksiyonu durdur
    if (!trendingGrid) {
        console.log('[RECOMMENDATIONS] trendingGrid bu sayfada yok, atlaniyor.');
        return;
    }

    try {
        console.log('[RECOMMENDATIONS] Trending kurslar yükleniyor...');
        
        const result = await ApiService.get('/recommendations/trending');
        const courses = result.data || [];

        console.log('[RECOMMENDATIONS] Trend kursu sayısı:', courses.length);

        if (courses.length === 0) {
            trendingGrid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #64748b;">
                    <p>Şu anda trend olan kurs bulunmuyor.</p>
                </div>
            `;
            return;
        }

        // Kursları render et
        trendingGrid.innerHTML = '';
        courses.forEach(course => {
            const cardHtml = renderCourseCard(course);
            trendingGrid.insertAdjacentHTML('beforeend', cardHtml);
        });

        console.log(`[RECOMMENDATIONS] ${courses.length} trend kurs render edildi`);

    } catch (error) {
        console.error('[RECOMMENDATIONS] Trending yükleme hatası:', error);
        trendingGrid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                <p>Trend kurslar yüklenemedi.</p>
            </div>
        `;
    }
}

/**
 * En yüksek puanlı kursları yükle
 * @route GET /api/recommendations/top-rated
 * 
 * ✅ FIX: topRatedGrid olmayan sayfalarda hata vermez
 */
async function loadTopRatedCourses() {
    const topRatedGrid = document.getElementById('topRatedGrid');

    // ✅ DOM KONTROLÜ: Element yoksa fonksiyonu durdur
    if (!topRatedGrid) {
        console.log('[RECOMMENDATIONS] topRatedGrid bu sayfada yok, atlaniyor.');
        return;
    }

    try {
        console.log('[RECOMMENDATIONS] Top-rated kurslar yükleniyor...');
        
        const result = await ApiService.get('/recommendations/top-rated');
        const courses = result.data || [];

        console.log('[RECOMMENDATIONS] Top-rated kurs sayısı:', courses.length);

        if (courses.length === 0) {
            topRatedGrid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #64748b;">
                    <p>Henüz puanlanmış kurs bulunmuyor.</p>
                </div>
            `;
            return;
        }

        // Kursları render et
        topRatedGrid.innerHTML = '';
        courses.forEach(course => {
            const cardHtml = renderCourseCard(course);
            topRatedGrid.insertAdjacentHTML('beforeend', cardHtml);
        });

        console.log(`[RECOMMENDATIONS] ${courses.length} top-rated kurs render edildi`);

    } catch (error) {
        console.error('[RECOMMENDATIONS] Top-rated yükleme hatası:', error);
        topRatedGrid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: #dc3545;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                <p>En yüksek puanlı kurslar yüklenemedi.</p>
            </div>
        `;
    }
}

/**
 * Tüm önerileri yükle (DOMContentLoaded'da çağrılır)
 */
async function loadAllRecommendations() {
    console.log('[RECOMMENDATIONS] Tüm öneri bölümleri başlatılıyor...');
    
    // Paralel yükle (performance için)
    await Promise.all([
        loadPersonalizedRecommendations(),
        loadTrendingCourses(),
        loadTopRatedCourses()
    ]);

    console.log('[RECOMMENDATIONS] Tüm bölümler yüklendi.');
}

/**
 * XSS Koruması - HTML escape
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// SAYFA YÜKLEMEDE ÇAĞIR
// ==========================================

// Mevcut DOMContentLoaded event listener'ına ekle
document.addEventListener('DOMContentLoaded', async () => {
    checkAuth();
    loadPublishedCourses();
    loadCategoriesForMenu();
    
    // ✅ ÖNERİ SİSTEMİNİ ÇAĞIR
    await loadAllRecommendations();
});