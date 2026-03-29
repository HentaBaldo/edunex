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
        try {
            const user = JSON.parse(userJson);
            
            // Kişinin rolüne göre doğru paneli belirle
            const dashboardLink = user.rol === 'egitmen' 
                ? '/instructor/dashboard.html' 
                : '/student/dashboard.html';

            // YENİ: Hover ile açılan profil menüsü (Dropdown)
            authContainer.innerHTML = `
                <div class="user-dropdown">
                    <button class="dropdown-trigger">
                        <i class="fas fa-user-circle" style="font-size: 1.2rem;"></i> 
                        ${user.ad} 
                        <i class="fas fa-chevron-down" style="font-size: 0.8rem; margin-left: 5px;"></i>
                    </button>
                    
                    <div class="dropdown-content">
                        <a href="/profile/index.html"><i class="fas fa-id-badge" style="width:20px;"></i> Profil</a>
                        <a href="${dashboardLink}"><i class="fas fa-columns" style="width:20px;"></i> Panelim</a>
                        <hr>
                        <button onclick="logout()" class="text-danger"><i class="fas fa-sign-out-alt" style="width:20px;"></i> Çıkış Yap</button>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('[HATA] Kullanıcı verisi okunamadı.');
            logout(); 
        }
    } 
    // 2. Durum: Kullanıcı Giriş YAPMAMIŞ (Ziyaretçi)
    else {
        authContainer.innerHTML = `
            <a href="/auth/index.html" class="btn-auth-blue">Giriş Yap / Kayıt Ol</a>
        `;
    }
}

/**
 * Yayınlanmış kursları backendden çeker ve arayüze basar
 */
async function loadPublishedCourses() {
    const grid = document.getElementById('courseGrid');
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

// ==========================================
// KATEGORİ VE MEGA MENÜ YÖNETİMİ
// ==========================================

window.allCategories = [];

async function loadCategoriesForMenu() {
    try {
        const result = await ApiService.get('/categories');
        const categories = result.data || [];
        window.allCategories = categories;
        const parentList = document.getElementById('parentList');
        
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