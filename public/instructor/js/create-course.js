/**
 * EduNex Egitmen - Kurs Olusturma Isleyisi
 * Version: 2.0 (Production Ready)
 */

let _createQuill = null;

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        alert('Lütfen giriş yapınız.');
        window.location.href = '/auth/index.html';
        return;
    }

    if (window.Quill) {
        _createQuill = new Quill('#createQuillContainer', {
            theme: 'snow',
            placeholder: 'Kursunuz hakkında detaylı bilgi verin...',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['link'],
                    ['clean']
                ]
            }
        });
    }

    await loadCategories();
    initCreateCourseForm();
    initThumbnailPreview();
});

function initThumbnailPreview() {
    const input = document.getElementById('thumbnailInput');
    if (!input) return;
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const previewEl = document.getElementById('thumbnailPreview');
            const placeholder = document.getElementById('thumbnailPlaceholder');
            if (previewEl) { previewEl.src = ev.target.result; previewEl.style.display = 'block'; }
            if (placeholder) placeholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Kategorileri yükle
 */
async function loadCategories() {
    const categorySelect = document.getElementById('kategori_id');
    if (!categorySelect) return;

    try {
        const result = await ApiService.get('/categories');
        const categories = result.data || [];

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.ad;
            categorySelect.appendChild(option);
        });

    } catch (error) {
        console.error('[CATEGORIES] Hata:', error.message);
    }
}

/**
 * Form submit handler
 */
function initCreateCourseForm() {
    const form = document.getElementById('createCourseForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const messageDiv = document.getElementById('courseMessage');
        const submitBtn = form.querySelector('button[type="submit"]');

        if (messageDiv) {
            messageDiv.textContent = "Kurs kaydediliyor, lütfen bekleyin...";
            messageDiv.className = "message-box active";
        }
        if (submitBtn) submitBtn.disabled = true;

        try {
            // Form verilerini topla
            const baslik = document.getElementById('baslik')?.value?.trim();
            const alt_baslik = document.getElementById('alt_baslik')?.value?.trim();
            const aciklama = _createQuill
                ? _createQuill.root.innerHTML.replace(/<p><br><\/p>/g, '').trim()
                : (document.getElementById('aciklama')?.value?.trim() || '');
            const kategori_id = document.getElementById('kategori_id')?.value;
            const fiyat = parseFloat(document.getElementById('fiyat')?.value) || 0;
            const dil = document.getElementById('dil')?.value || 'Turkce';
            const seviye = document.getElementById('seviye')?.value || 'Tum Seviyeler';
            const gereksinimler = document.getElementById('gereksinimler')?.value?.trim();
            const kazanimlar = document.getElementById('kazanimlar')?.value?.trim();

            // Validasyon
            const aciklamaText = _createQuill ? _createQuill.getText().trim() : aciklama;
            if (!baslik || !aciklamaText || !kategori_id) {
                throw new Error('Başlık, açıklama ve kategori zorunlu alanlar.');
            }

            if (baslik.length < 5) {
                throw new Error('Başlık en az 5 karakter olmalıdır.');
            }

            if (aciklamaText.length < 20) {
                throw new Error('Açıklama en az 20 karakter olmalıdır.');
            }

            if (fiyat < 0) {
                throw new Error('Fiyat negatif olamaz.');
            }

            console.log('[CREATE COURSE] Validasyon başarılı');

            // Payload oluştur
            const payload = {
                baslik,
                alt_baslik: alt_baslik || '',
                aciklama,
                kategori_id,
                fiyat,
                dil,
                seviye,
                gereksinimler: gereksinimler || '',
                kazanimlar: kazanimlar || ''
            };

            console.log('[CREATE COURSE] Payload hazırlandı:', payload);
            console.log('[CREATE COURSE] API\'ye POST isteği gönderiliyor...');

            // API çağrısı
            const result = await ApiService.post('/courses', payload);

            if (result.status === 'success' || result.success) {
                const courseId = result.data?.id;
                const thumbnailFile = document.getElementById('thumbnailInput')?.files?.[0];

                if (courseId && thumbnailFile) {
                    if (messageDiv) messageDiv.textContent = 'Kapak fotoğrafı yükleniyor...';
                    try {
                        const formData = new FormData();
                        formData.append('thumbnail', thumbnailFile);
                        const token = localStorage.getItem('edunex_token');
                        await fetch(`/api/courses/${courseId}/thumbnail`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData
                        });
                    } catch (thumbErr) {
                        console.warn('[CREATE COURSE] Thumbnail yüklenemedi:', thumbErr.message);
                    }
                }

                if (messageDiv) {
                    messageDiv.textContent = result.message || "✓ Kurs başarıyla oluşturuldu!";
                    messageDiv.className = "message-box success active";
                }

                setTimeout(() => {
                    window.location.href = '/instructor/dashboard.html';
                }, 1500);
            }

        } catch (error) {
            console.error("[CREATE COURSE] Kurs oluşturma hatası:", error);

            let errorMessage = error.message || 'Bilinmeyen hata oluştu.';

            // Rate limit hatası
            if (error.statusCode === 429) {
                errorMessage = 'Günde maksimum 5 kurs oluşturabilirsiniz. Yarın tekrar deneyin.';
            }
            // Validasyon hatası
            else if (error.statusCode === 400) {
                errorMessage = errorMessage;
            }

            if (messageDiv) {
                messageDiv.textContent = `❌ Hata: ${errorMessage}`;
                messageDiv.className = "message-box error active";
            }
            
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}