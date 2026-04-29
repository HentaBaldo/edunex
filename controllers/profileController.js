const path = require('path');
const fs = require('fs');
const {
    Profile,
    StudentDetail,
    InstructorDetail,
    StudentInterest,
    Category,
    Course,
    CourseEnrollment
} = require('../models');
const { uploadFileToBunnyStorage, deleteFileFromBunnyStorage } = require('../services/bunnyService');

/**
 * Avatar dosyasını Bunny Storage'a yüklemeyi dener; başarısızsa
 * /uploads/avatars/ kalıcı yerel klasöre taşır.
 *
 * @param {object} uploadedFile - multer file objesi (req.file)
 * @returns {Promise<{publicUrl: string, source: 'bunny'|'local'}>}
 */
const persistAvatar = async (uploadedFile) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${uploadedFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const remoteName = `avatars/${safeName}`;

    const result = await uploadFileToBunnyStorage(uploadedFile.path, remoteName);
    if (result.success) {
        try {
            if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
        } catch (e) {
            console.warn(`[AVATAR] Temp temizleme uyarısı: ${e.message}`);
        }
        return { publicUrl: result.publicUrl, source: 'bunny' };
    }

    // FALLBACK: Yerel kalıcı klasöre taşı
    const avatarsDir = path.join(__dirname, '..', 'uploads', 'avatars');
    if (!fs.existsSync(avatarsDir)) {
        fs.mkdirSync(avatarsDir, { recursive: true });
    }
    const finalLocalPath = path.join(avatarsDir, safeName);
    fs.renameSync(uploadedFile.path, finalLocalPath);
    console.warn(`[AVATAR] Bunny başarısız, yerel diske düştü: /uploads/avatars/${safeName}`);
    return { publicUrl: `/uploads/avatars/${safeName}`, source: 'local' };
};

/**
 * Eski avatar URL'sine göre eski dosyayı temizler.
 * Bunny URL ise Bunny'den, /uploads/avatars/ ise yerel diskten siler.
 */
const cleanupOldAvatar = async (oldUrl) => {
    if (!oldUrl) return;
    try {
        if (/^https?:\/\//i.test(oldUrl)) {
            await deleteFileFromBunnyStorage(oldUrl);
        } else if (oldUrl.startsWith('/uploads/avatars/')) {
            const localPath = path.join(__dirname, '..', oldUrl);
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        }
    } catch (e) {
        console.warn(`[AVATAR CLEANUP] Eski avatar silinemedi: ${e.message}`);
    }
};

/**
 * Kullanıcının profil bilgilerini rolüne göre getirir.
 * Öğrenciler için ilgi alanlarını (kategorileri) güvenli bir şekilde manuel çeker.
 */
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. Sadece temel detaylarla profili getir (Category tablosunu dahil etmeden)
        const profile = await Profile.findByPk(userId, {
            include: [
                { model: StudentDetail },
                { model: InstructorDetail }
            ]
        });

        if (!profile) {
            return res.status(404).json({ success: false, message: 'Profil bulunamadı.' });
        }

        // 2. Profili JSON formatına çevir (Üzerine sonradan veri ekleyebilmek için)
        const profileData = profile.toJSON();
        profileData.Interests = []; // Frontend'in hata vermemesi için boş dizi atıyoruz

        // 3. Eğer kullanıcı öğrenciyse, StudentInterest tablosundan ilgi alanlarını manuel bul
        if (profileData.rol === 'ogrenci') {
            const studentInterests = await StudentInterest.findAll({
                where: { ogrenci_id: userId },
                attributes: ['kategori_id']
            });

            // Frontend'in beklediği [{ id: "kategori_id" }] formatına çeviriyoruz
            profileData.Interests = studentInterests.map(item => ({
                id: item.kategori_id
            }));
        }

        return res.status(200).json({ success: true, data: profileData });
    } catch (error) {
        console.error('[PROFILE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Profil getirilirken hata oluştu.' });
    }
};

/**
 * Profil ve detay bilgilerini günceller.
 * İlgi alanları (interests) dizisini de senkronize eder.
 */
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const { 
            ad, soyad, sehir, website,
            linkedin, instagram, x_twitter, youtube, facebook, tiktok,
            profil_herkese_acik_mi, alinan_kurslari_goster,
            biyografi, baslik, unvan, deneyim_yili, iban_no, egitim_seviyesi,
            interests // Frontend'den gelen kategori ID dizisi
        } = req.body;

        // 1. Ana profil bilgilerini güncelle
        await Profile.update(
            { 
                ad, soyad, sehir, website,
                linkedin, instagram, x_twitter, youtube, facebook, tiktok,
                profil_herkese_acik_mi, alinan_kurslari_goster
            },
            { where: { id: userId } }
        );

        // 2. Role göre detay tablolarını ve ilgi alanlarını güncelle
        const profile = await Profile.findByPk(userId);
        
        if (profile.rol === 'ogrenci') {
            // Detayları güncelle
            await StudentDetail.update(
                { biyografi, baslik, egitim_seviyesi },
                { where: { kullanici_id: userId } }
            );

            // İlgi Alanlarını Senkronize Et (Öncekileri sil, yenileri ekle)
            if (interests && Array.isArray(interests)) {
                await StudentInterest.destroy({ where: { ogrenci_id: userId } });
                
                if (interests.length > 0) {
                    const interestRecords = interests.map(catId => ({
                        ogrenci_id: userId,
                        kategori_id: catId
                    }));
                    await StudentInterest.bulkCreate(interestRecords);
                }
            }

        } else if (profile.rol === 'egitmen') {
            // Sadece update yapmak yerine, kaydın varlığını kontrol ediyoruz
            const [detail, created] = await InstructorDetail.findOrCreate({
                where: { kullanici_id: userId },
                defaults: { biyografi, baslik, unvan, deneyim_yili, iban_no }
            });
        
            // Eğer kayıt zaten varsa (created false ise), verileri güncelle
            if (!created) {
                await InstructorDetail.update(
                    { biyografi, baslik, unvan, deneyim_yili, iban_no },
                    { where: { kullanici_id: userId } }
                );
            }
        }

        return res.status(200).json({ success: true, message: 'Profil başarıyla güncellendi.' });
    } catch (error) {
        console.error('[PROFILE UPDATE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Güncelleme sırasında hata oluştu.' });
    }
};

/**
 * Profil fotoğrafı yükleme işlemi.
 * Önce Bunny Storage'a yüklemeyi dener, başarısızsa yerel kalıcı klasöre düşer.
 * Eski avatar varsa (Bunny veya yerel) temizlenir.
 */
exports.uploadAvatar = async (req, res) => {
    try {
        const userId = req.user.id;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Lütfen bir resim dosyası seçin.' });
        }

        // Eski avatarı bul ki yenisi başarılı olunca silelim
        const existing = await Profile.findByPk(userId, { attributes: ['profil_fotografi'] });
        const oldAvatarUrl = existing?.profil_fotografi || null;

        // Yeni avatarı kalıcı yere koy
        const stored = await persistAvatar(req.file);

        await Profile.update(
            { profil_fotografi: stored.publicUrl },
            { where: { id: userId } }
        );

        // Eski avatarı arka planda temizle (await etmiyoruz, response'u bekletmesin)
        cleanupOldAvatar(oldAvatarUrl);

        return res.status(200).json({
            success: true,
            message: 'Profil fotoğrafı başarıyla güncellendi.',
            imageUrl: stored.publicUrl,
            storage: stored.source // 'bunny' veya 'local'
        });

    } catch (error) {
        console.error('[AVATAR UPLOAD ERROR]', error);
        // Hata durumunda temp dosyayı temizle
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        return res.status(500).json({ success: false, message: 'Fotoğraf yüklenirken bir hata oluştu.' });
    }
};

/**
 * Kullanıcının kendi hesabını kalıcı olarak silmesi.
 * Avatar varsa (Bunny veya yerel) önce temizlenir.
 */
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;

        const profile = await Profile.findByPk(userId, { attributes: ['rol', 'profil_fotografi'] });

        // Yayında kursu olan ve aktif öğrencisi bulunan eğitmen hesabı silinemez
        if (profile?.rol === 'egitmen') {
            const activeCourses = await Course.findAll({
                where: { egitmen_id: userId, durum: 'yayinda' },
                attributes: ['id'],
            });
            if (activeCourses.length > 0) {
                const courseIds = activeCourses.map(c => c.id);
                const enrollmentCount = await CourseEnrollment.count({
                    where: { kurs_id: courseIds },
                });
                if (enrollmentCount > 0) {
                    return res.status(403).json({
                        success: false,
                        message: `Hesabınız silinemiyor: ${enrollmentCount} aktif öğrencisi bulunan yayında kursunuz var. Lütfen önce kurslarınızı arşivleyin veya öğrencilerle ilgili işlemleri tamamlayın.`,
                    });
                }
            }
        }
        if (profile?.profil_fotografi) {
            await cleanupOldAvatar(profile.profil_fotografi);
        }

        // Cascade silme ayarı veritabanında yoksa manuel temizlik gerekebilir
        // Ancak genellikle Profile silindiğinde bağlı detaylar otomatik silinir.
        await Profile.destroy({ where: { id: userId } });

        return res.status(200).json({
            success: true,
            message: 'Hesabınız başarıyla silindi. Sizi tekrar aramızda görmeyi umuyoruz.'
        });
    } catch (error) {
        console.error('[ACCOUNT DELETE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Hesap silinirken bir hata oluştu.' });
    }
};