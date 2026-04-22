document.addEventListener('DOMContentLoaded', async () => {
    const list = document.getElementById('pendingCoursesList');
    if (!list) {
        console.error('[ADMIN COURSES] pendingCoursesList element bulunamadı.');
        return;
    }
    await fetchPendingCourses();
});

async function fetchPendingCourses() {
    const list = document.getElementById('pendingCoursesList');
    if (!list) return;

    try {
        list.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Yükleniyor...</td></tr>';
        
        const data = await ApiService.get('/admin/pending-courses');
        
        if (!data.success || !Array.isArray(data.courses)) {
            throw new Error('Geçersiz API yanıtı');
        }
        
        if (data.courses.length === 0) {
            list.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Onay bekleyen kurs yok</td></tr>';
            return;
        }
        
        list.innerHTML = data.courses.map(course => `
            <tr>
                <td><strong>${course.baslik}</strong></td>
                <td>${course.Egitmen ? course.Egitmen.ad + ' ' + course.Egitmen.soyad : 'Bilinmiyor'}</td>
                <td>${course.Category ? course.Category.ad : 'Belirtilmedi'}</td>
                <td>${course.fiyat > 0 ? course.fiyat + ' ₺' : 'Ücretsiz'}</td>
                <td><span class="badge bg-warning">${course.durum}</span></td>
                <td style="text-align: right;">
                    <button class="btn btn-info btn-sm" onclick="viewCourseDetails('${course.id}')">
                        <i class="fas fa-eye"></i> İncele
                    </button>
                    <button class="btn btn-success btn-sm" onclick="approveCourse('${course.id}')">
                        <i class="fas fa-check"></i> Onayla
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="rejectCourse('${course.id}')">
                        <i class="fas fa-times"></i> Reddet
                    </button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('[ADMIN COURSES FETCH] Hata:', error);
        list.innerHTML = `<tr><td colspan="6" class="text-danger"><strong>Hata:</strong> ${error.message}</td></tr>`;
    }
}

async function approveCourse(courseId) {
    if (!confirm('Bu kursu onaylamak istediğinize emin misiniz?')) return;

    try {
        const response = await ApiService.put(`/admin/approve-course/${courseId}`, {});
        alert('✓ Kurs başarıyla onaylandı ve yayına alındı!');
        await fetchPendingCourses();
    } catch (error) {
        console.error('[APPROVE COURSE] Hata:', error);
        alert('❌ Hata: ' + (error.message || 'Kurs onaylanırken bir hata oluştu'));
    }
}

async function rejectCourse(courseId) {
    const reason = prompt('Kurs neden reddediliyorsa sebebini kısa yazınız:');
    if (!reason || reason.trim() === '') {
        alert('⚠️ Lütfen bir sebep belirtiniz');
        return;
    }

    try {
        const response = await ApiService.put(`/admin/reject-course/${courseId}`, { sebep: reason });
        alert('✓ Kurs başarıyla reddedildi ve eğitmene geri gönderildi!');
        await fetchPendingCourses();
    } catch (error) {
        console.error('[REJECT COURSE] Hata:', error);
        alert('❌ Hata: ' + (error.message || 'Kurs reddedilirken bir hata oluştu'));
    }
}

async function viewCourseDetails(courseId) {
    try {
        const response = await ApiService.get(`/admin/courses/${courseId}`);
        const course = response.data;

        const egitmenAdSoyad = course.Egitmen ? `${course.Egitmen.ad} ${course.Egitmen.soyad}` : 'Bilinmiyor';
        const egitmenUnvan = course.Egitmen?.InstructorDetail?.unvan || 'Unvan Belirtilmemiş';

        let mufredatHtml = '';
        let toplamDersler = 0;
        let toplamSure = 0;

        if (course.Sections && course.Sections.length > 0) {
            mufredatHtml = course.Sections.map(sec => {
                const dersCount = (sec.Lessons || []).length;
                toplamDersler += dersCount;
                const bölümSüresi = (sec.Lessons || []).reduce((sum, les) => sum + (les.sure_saniye || 0), 0);
                toplamSure += bölümSüresi;

                return `
                    <div style="margin-bottom: 15px; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; background: #f8fafc;">
                        <div style="font-weight: 700; color: #1e293b; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                            <span><i class="fas fa-folder-open" style="color: #3b82f6;"></i> Bölüm ${sec.sira_numarasi}: ${sec.baslik}</span>
                            <span style="font-size: 0.85rem; background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px;">${dersCount} ders</span>
                        </div>
                        <ul style="list-style: none; padding-left: 0; margin: 0;">
                        ${(sec.Lessons || []).length > 0 ? sec.Lessons.map(les => {
                            let fileIcon = 'file';
                            let actionButtons = '';

                            // Yardımcı Fonksiyonlar
                            const isBunny = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                            const isYt = (str) => str && (str.includes('youtube.com') || str.includes('youtu.be'));
                            const isVimeo = (str) => str && str.includes('vimeo.com');

                            // --- 1. ANA DOSYA (BUNNY/PDF) VEYA ESKİ YANLIŞ KAYITLI LİNKLER ---
                            if (les.video_saglayici_id) {
                                if (isBunny(les.video_saglayici_id)) {
                                    fileIcon = 'video';
                                    actionButtons += `<button onclick="viewVideo('${les.video_saglayici_id}', '${response.bunnyLibraryId}')" style="background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px;"><i class="fas fa-play"></i> Video İzle</button>`;
                                } else if (isYt(les.video_saglayici_id) || isVimeo(les.video_saglayici_id)) {
                                    // SİHİRLİ DOKUNUŞ: Eski kayıtlarda dosya sütununa yanlışlıkla kaydedilen YT linklerini kurtarıyoruz
                                    fileIcon = 'youtube';
                                    actionButtons += `<button onclick="viewExternalVideo('${les.video_saglayici_id}')" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px;"><i class="fab fa-youtube"></i> Harici Video</button>`;
                                } else {
                                    fileIcon = 'file-pdf';
                                    actionButtons += `<button onclick="viewFile('${les.video_saglayici_id}')" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px;"><i class="fas fa-file-alt"></i> Belgeyi Aç</button>`;
                                }
                            }

                            // --- 2. HARİCİ KAYNAK (YENİ VE DOĞRU KAYITLAR) ---
                            // (Eski kayıtlarla aynı linkse iki buton basmaması için kontrol ekledik)
                            if (les.kaynak_url && les.kaynak_url !== les.video_saglayici_id) {
                                if (isYt(les.kaynak_url) || isVimeo(les.kaynak_url)) {
                                    if (fileIcon === 'file') fileIcon = 'youtube';
                                    actionButtons += `<button onclick="viewExternalVideo('${les.kaynak_url}')" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px;"><i class="fab fa-youtube"></i> Harici Video</button>`;
                                } else {
                                    if (fileIcon === 'file') fileIcon = 'link';
                                    actionButtons += `<a href="${les.kaynak_url}" target="_blank" style="background: #8b5cf6; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px;"><i class="fas fa-external-link-alt"></i> Ek Link</a>`;
                                }
                            }

                            // --- 3. QUIZ ÖZEL DURUMU ---
                            if (les.icerik_tipi === 'quiz') fileIcon = 'clipboard-list';

                            // --- 4. HİBRİT ROZETİ ---
                            const isHybrid = les.video_saglayici_id && les.kaynak_url && (les.video_saglayici_id !== les.kaynak_url);
                            const hybridBadge = isHybrid ? '<span style="font-size:0.7rem; background:#f59e0b; color:white; padding:2px 6px; border-radius:3px; margin-left:6px;"><i class="fas fa-layer-group"></i> Hibrit</span>' : '';

                            return `
                                <li style="padding: 12px; border-bottom: 1px dashed #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; flex-wrap: wrap; gap: 10px;">
                                    <span>
                                        <i class="fas fa-${fileIcon}" style="color: #64748b; margin-right: 8px;"></i> 
                                        ${les.sira_numarasi}. ${les.baslik}
                                        ${hybridBadge}
                                        ${les.onizleme_mi ? '<span style="font-size:0.75rem; background:#10b981; color:white; padding:2px 6px; border-radius:3px; margin-left:6px;">Ücretsiz</span>' : ''}
                                    </span>
                                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                                        <span style="font-weight: 600; color: #64748b; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; white-space: nowrap;">
                                            ${les.icerik_tipi === 'video' 
                                                ? (les.sure_saniye > 0 ? Math.floor(les.sure_saniye / 60) + ' dk' : 'Süre Yok')
                                                : (les.sure_saniye > 0 ? Math.floor(les.sure_saniye / 60) + ' dk tahmini' : 'Süre Yok')
                                            }
                                        </span>
                                        ${actionButtons}
                                    </div>
                                </li>
                            `;
                        }).join('') : '<li style="color:#ef4444; font-size:0.85rem; padding:8px;">Bu bölümde hiç ders yok!</li>'}
                        </ul>
                    </div>
                `;
            }).join('');
        } else {
            mufredatHtml = '<div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 8px; color: #dc2626;"><i class="fas fa-exclamation-circle"></i> <strong>Uyarı:</strong> Eğitmen müfredat eklememiş (Boş Kurs!)</div>';
        }

        document.getElementById('gmTitle').textContent = course.baslik;
        document.getElementById('gmPrice').textContent = course.fiyat > 0 ? `(${course.fiyat} ₺)` : '(Ücretsiz)';
        document.getElementById('gmInstructorName').textContent = egitmenAdSoyad;
        document.getElementById('gmInstructorTitle').textContent = egitmenUnvan;
        document.getElementById('gmLevel').textContent = course.seviye;
        document.getElementById('gmLanguage').textContent = course.dil;
        document.getElementById('gmCategory').textContent = course.Category ? course.Category.ad : 'Belirtilmedi';
        
        // --- SÜRE HESAPLAMA MATEMATİĞİ ---
        const saat = Math.floor(toplamSure / 3600);
        const dakika = Math.floor((toplamSure % 3600) / 60);
        const saniye = toplamSure % 60;
        
        let sureMetni = '';
        if (saat > 0) sureMetni += `${saat} saat `;
        if (dakika > 0 || saat > 0) sureMetni += `${dakika} dk `;
        sureMetni += `${saniye} sn`;

        const statsHtml = `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; margin-bottom: 15px; display: flex; gap: 20px; flex-wrap: wrap;">
                <div><strong>📚 Toplam Bölüm:</strong> ${course.Sections?.length || 0}</div>
                <div><strong>📖 Toplam Ders:</strong> ${toplamDersler}</div>
                <div><strong>⏱️ Toplam Süre:</strong> ${sureMetni}</div>
            </div>
        `;
        
        document.getElementById('gmCurriculumContainer').innerHTML = statsHtml + mufredatHtml;
        document.getElementById('godModeModal').style.display = 'flex';

    } catch (error) {
        console.error('[ADMIN] Hata:', error);
        alert('❌ Kurs detayları alınırken hata: ' + error.message);
    }
}

/**
 * Video İzle (BunnyCDN)
 */
window.viewVideo = (videoGuid, libraryId) => {
    if (!libraryId || libraryId === 'undefined') {
        alert("Sistem Hatası: BunnyCDN Library ID bulunamadı (.env dosyasını kontrol edin).");
        return;
    }

    const videoUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoGuid}?autoplay=false`;
    
    const videoModal = `
        <div id="videoViewer" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 10001; display: flex; align-items: center; justify-content: center;" onclick="if(event.target.id === 'videoViewer') this.remove()">
            <div style="width: 90%; max-width: 1000px; background: black; border-radius: 12px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
                <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
                    <iframe 
                        src="${videoUrl}" 
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
                        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen;"
                    ></iframe>
                </div>
                <div style="padding: 15px; background: #1e293b; color: white; text-align: center; font-size: 0.85rem;">
                    Kapatmak için dışarıya tıklayın veya ESC tuşuna basın
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', videoModal);
    
    const closeVideo = (e) => {
        if (e.key === 'Escape') {
            const elem = document.getElementById('videoViewer');
            if (elem) {
                elem.remove();
                document.removeEventListener('keydown', closeVideo);
            }
        }
    };
    document.addEventListener('keydown', closeVideo);
};

/**
 * Harici YouTube ve Vimeo Linklerini Akıllı Ayrıştırıcı ile Aç
 */
window.viewExternalVideo = (videoSource) => {
    let videoUrl = "";
    let directLink = videoSource; 
    
    console.log("[DEBUG] Ham Gelen URL:", videoSource);
    
    if (videoSource.includes('youtube.com') || videoSource.includes('youtu.be')) {
        const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = videoSource.match(regExp);
        const ytId = (match && match[2].length === 11) ? match[2] : null;
        
        console.log("[DEBUG] Ayrıştırılan YouTube ID:", ytId);

        if (ytId) {
            // SADELEŞTİRME: Autoplay, nocookie, rel=0 gibi tarayıcıyı tetikleyen tüm parametreleri sildik.
            // Sadece saf YouTube Embed linki:
            videoUrl = `https://www.youtube.com/embed/${ytId}`;
            directLink = `https://www.youtube.com/watch?v=${ytId}`; 
        } else {
            alert("YouTube ID'si ayrıştırılamadı. Lütfen linki kontrol edin.");
            return;
        }
    } else if (videoSource.includes('vimeo.com')) {
        const vimeoId = videoSource.split('vimeo.com/')[1]?.split('/')[0]?.split('?')[0];
        videoUrl = `https://player.vimeo.com/video/${vimeoId}`;
        directLink = `https://vimeo.com/${vimeoId}`;
    }

    const videoModal = `
        <div id="extVideoViewer" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.98); z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center;" onclick="if(event.target.id === 'extVideoViewer') this.remove()">
            
            <div style="width: 90vw; max-width: 1100px; display: flex; justify-content: flex-end; margin-bottom: 15px;">
                <a href="${directLink}" target="_blank" style="background: #ef4444; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 10px rgba(239, 68, 68, 0.3); transition: all 0.2s;">
                    <i class="fab fa-youtube"></i> Oynatıcı Hata Verirse Doğrudan Aç
                </a>
            </div>

            <div style="width: 90vw; max-width: 1100px; background: #000; border-radius: 16px; overflow: hidden; box-shadow: 0 0 50px rgba(0,0,0,0.8); border: 1px solid #334155;">
                <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden;">
                    <iframe 
                        src="${videoUrl}" 
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;" 
                        title="YouTube video player" 
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        referrerpolicy="strict-origin-when-cross-origin" 
                        allowfullscreen>
                    </iframe>
                </div>
                <div style="padding: 12px; background: #0f172a; color: #94a3b8; text-align: center; font-size: 0.85rem; font-weight: 500;">
                    <i class="fas fa-info-circle" style="color:#3b82f6;"></i> Kapatmak için dışarıya tıklayın veya ESC tuşuna basın
                </div>
            </div>

        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', videoModal);
    
    const closeEsc = (e) => {
        if (e.key === 'Escape') {
            document.getElementById('extVideoViewer')?.remove();
            document.removeEventListener('keydown', closeEsc);
        }
    };
    document.addEventListener('keydown', closeEsc);
};
/**
 * Dosya Aç (PDF, Word, Resim vb.) - BÜYÜK EKRAN VERSİYONU
 */
window.viewFile = (fileUrl) => {
    const extension = fileUrl.split('.').pop().toLowerCase();
    let content = '';
    
    if (['pdf'].includes(extension)) {
        // İframe yüksekliğini tam kapsayıcı (%100) yaptık
        content = `<iframe src="${fileUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: block;"></iframe>`;
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
        content = `<img src="${fileUrl}" style="width: 100%; height: 100%; object-fit: contain; margin: auto; display: block;">`;
    } else {
        content = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #334155; gap: 20px;">
                <i class="fas fa-file" style="font-size: 4rem; opacity: 0.5;"></i>
                <p style="font-size: 1.2rem; font-weight: 500;">Bu dosya türü tarayıcıda önizlenemiyor.</p>
                <a href="${fileUrl}" download style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 1.1rem; display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fas fa-download"></i> Dosyayı İndir
                </a>
            </div>
        `;
    }
    
    const fileModal = `
        <div id="fileViewer" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(15, 23, 42, 0.90); z-index: 99999; display: flex; align-items: center; justify-content: center;" onclick="if(event.target.id === 'fileViewer') this.remove()">
            
            <div style="width: 90vw; height: 90vh; background: #1e293b; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
                
                <div style="padding: 15px 20px; background: #0f172a; color: white; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                    <span style="font-weight: 600; font-size: 1.1rem;">Dosya Görüntüleyici</span>
                    <button onclick="document.getElementById('fileViewer').remove()" style="background: none; border: none; color: white; font-size: 1.8rem; cursor: pointer; padding: 0; line-height: 1; display: flex; align-items: center;">&times;</button>
                </div>
                
                <div style="flex-grow: 1; width: 100%; position: relative; background: #f8fafc;">
                    ${content}
                </div>

            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', fileModal);
};
function closeGodMode() {
    document.getElementById('godModeModal').style.display = 'none';
}

document.getElementById('godModeModal').addEventListener('click', (e) => {
    if (e.target.id === 'godModeModal') {
        closeGodMode();
    }
});