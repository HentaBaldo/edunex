const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
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

// Sifre minimum uzunluk — register akisinda enforce edilmiyor olabilir, ama bilincli
// olarak SADECE bu islemde (change-password) enforce ediyoruz; ekibin diger akislari
// bozulmasin diye baska yere dokunmuyoruz.
const MIN_PASSWORD_LENGTH = 8;

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
 * TCKN savunmaci dogrulama (backend).
 * Frontend zaten daha guclu (mod-10) algoritmayi kosuyor; burada sadece
 * format-katmanli kontrol yapilir (Frontend bypass'a karsi).
 * @returns {string} normalize edilmis 11 haneli TCKN
 * @throws  format uymazsa Error (statusCode=400)
 */
function ensureValidTcknOrThrow(rawTckn) {
    const v = String(rawTckn || '').replace(/\D/g, '');
    if (!/^[1-9]\d{10}$/.test(v)) {
        const err = new Error('T.C. Kimlik Numarası 11 haneli olmalı ve 0 ile başlayamaz.');
        err.statusCode = 400;
        throw err;
    }
    return v;
}

/**
 * IBAN savunmaci dogrulama (backend).
 * @returns {string} normalize edilmis IBAN (bosluksuz, BUYUK harf)
 * @throws  format uymazsa Error (statusCode=400)
 */
function ensureValidIbanOrThrow(rawIban) {
    const v = String(rawIban || '').replace(/[\s-]/g, '').toUpperCase();
    if (!/^TR\d{24}$/.test(v)) {
        const err = new Error('IBAN "TR" ile başlamalı ve toplam 26 karakter olmalıdır.');
        err.statusCode = 400;
        throw err;
    }
    return v;
}

/**
 * Telefon savunmaci dogrulama: E.164 + Turkiye on eki (+90 + 10 hane).
 * Bos veya null kabul edilir (zorunlu degil).
 */
function normalizeOptionalPhone(rawPhone) {
    if (!rawPhone) return null;
    const d = String(rawPhone).replace(/\D/g, '');
    let normalized;
    if (d.startsWith('90') && d.length === 12) normalized = '+' + d;
    else if (d.startsWith('0') && d.length === 11) normalized = '+9' + d;
    else if (d.length === 10) normalized = '+90' + d;
    else {
        const err = new Error('Telefon numarası geçersiz. +90 ülke kodu dahil 12 haneli olmalıdır.');
        err.statusCode = 400;
        throw err;
    }
    return normalized;
}

/**
 * Profil ve detay bilgilerini günceller.
 * İlgi alanları (interests) dizisini de senkronize eder.
 */
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const {
            ad, soyad, sehir, website,
            phone, identity_number,
            linkedin, instagram, x_twitter, youtube, facebook, tiktok,
            profil_herkese_acik_mi, alinan_kurslari_goster,
            biyografi, baslik, unvan, deneyim_yili, iban_no, egitim_seviyesi,
            interests // Frontend'den gelen kategori ID dizisi
        } = req.body;

        // Rol bilgisini cek - egitmen icin TCKN/IBAN zorunlu, ogrenci icin opsiyonel.
        const existingProfile = await Profile.findByPk(userId, { attributes: ['rol'] });
        if (!existingProfile) {
            return res.status(404).json({ success: false, message: 'Profil bulunamadi.' });
        }
        const isEgitmen = existingProfile.rol === 'egitmen';

        // --- DEFANSIF VALIDASYON (frontend bypass'ina karsi) ---
        // Telefonu normalize et; gecersizse 400 fail-fast.
        const normalizedPhone = normalizeOptionalPhone(phone);

        // TCKN: doluysa katı doğrula; egitmense bos olamaz.
        let normalizedTckn = null;
        if (identity_number) {
            normalizedTckn = ensureValidTcknOrThrow(identity_number);
        } else if (isEgitmen) {
            return res.status(400).json({
                success: false,
                message: 'Eğitmen hesapları için T.C. Kimlik Numarası zorunludur.',
            });
        }

        // IBAN: doluysa katı doğrula; egitmense bos olamaz.
        let normalizedIban = null;
        if (iban_no) {
            normalizedIban = ensureValidIbanOrThrow(iban_no);
        } else if (isEgitmen) {
            return res.status(400).json({
                success: false,
                message: 'Eğitmen hesapları için IBAN zorunludur.',
            });
        }

        // 1. Ana profil bilgilerini güncelle
        // Not: phone ve identity_number ALANLARI sadece istek payload'unda mevcutsa
        // override edilir. Aksi halde (frontend hic gondermemisse) eski deger korunur.
        const profileUpdatePayload = {
            ad, soyad, sehir, website,
            linkedin, instagram, x_twitter, youtube, facebook, tiktok,
            profil_herkese_acik_mi, alinan_kurslari_goster,
        };
        if (phone !== undefined) profileUpdatePayload.phone = normalizedPhone;
        if (identity_number !== undefined && normalizedTckn) profileUpdatePayload.identity_number = normalizedTckn;

        await Profile.update(profileUpdatePayload, { where: { id: userId } });

        // 2. Role göre detay tablolarını ve ilgi alanlarını güncelle
        const profile = existingProfile;

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
            // IBAN normalize edilmis (bosluksuz BUYUK harf) sekilde kayda gider;
            // boylece iyzicoService.createSubMerchant'ta tekrar temizlemeye gerek kalmaz.
            const ibanDeger = normalizedIban; // egitmense yukaridaki validasyon sayesinde dolu

            // Sadece update yapmak yerine, kaydın varlığını kontrol ediyoruz
            const [detail, created] = await InstructorDetail.findOrCreate({
                where: { kullanici_id: userId },
                defaults: { biyografi, baslik, unvan, deneyim_yili, iban_no: ibanDeger }
            });

            // Eğer kayıt zaten varsa (created false ise), verileri güncelle
            if (!created) {
                await InstructorDetail.update(
                    { biyografi, baslik, unvan, deneyim_yili, iban_no: ibanDeger },
                    { where: { kullanici_id: userId } }
                );
            }
        }

        return res.status(200).json({ success: true, message: 'Profil başarıyla güncellendi.' });
    } catch (error) {
        // 400 (validasyon) hatalarini istemciye orijinal mesajla doneriz
        if (error.statusCode === 400) {
            return res.status(400).json({ success: false, message: error.message });
        }
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

/**
 * Giriş yapmış kullanıcının kendi şifresini güncellemesi.
 * @route PUT /api/profile/change-password
 * body: { currentPassword, newPassword, newPasswordConfirm }
 *
 * AKIS:
 *  1) Tum alanlarin dolulugunu ve newPassword === confirm esitligini dogrula.
 *  2) Yeni sifrenin minimum uzunluk kriterini sagladigini dogrula.
 *  3) DB'den kullaniciyi cek (req.user.id'den geliyor; auth middleware garanti eder).
 *  4) bcrypt.compare ile mevcut sifreyi kontrol et (timing-safe).
 *  5) Yeni sifre eski ile ayniysa reddet (UX/guvenlik).
 *  6) bcrypt.hash ile yenisini hash'le ve guncelle.
 *
 * TUM ROLLER (ogrenci/egitmen/admin) icin tek endpoint — Profile tablosu merkezi.
 */
exports.changePassword = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { currentPassword, newPassword, newPasswordConfirm } = req.body;

        // === ADIM 1: Input Validasyonu ===
        if (!currentPassword || !newPassword || !newPasswordConfirm) {
            const error = new Error('Mevcut şifre, yeni şifre ve yeni şifre tekrarı alanları zorunludur.');
            error.statusCode = 400;
            throw error;
        }

        if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
            const error = new Error(`Yeni şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
            error.statusCode = 400;
            throw error;
        }

        if (newPassword !== newPasswordConfirm) {
            const error = new Error('Yeni şifre ile şifre tekrarı eşleşmiyor.');
            error.statusCode = 400;
            throw error;
        }

        // === ADIM 2: Kullaniciyi Cek ===
        // Sadece gerekli sutunlar — N+1 / agir join'lere gerek yok.
        const user = await Profile.findByPk(userId, { attributes: ['id', 'eposta', 'sifre'] });
        if (!user) {
            const error = new Error('Kullanıcı bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // === ADIM 3: Mevcut Sifre Dogrulamasi ===
        // bcrypt.compare timing-safe oldugu icin yan-kanal saldirilarina karsi guvenli.
        const isCurrentValid = await bcrypt.compare(currentPassword, user.sifre);
        if (!isCurrentValid) {
            const error = new Error('Mevcut şifre hatalı.');
            error.statusCode = 401;
            throw error;
        }

        // === ADIM 4: Yeni Sifre Eski Sifreyle Ayni mi? ===
        // Ayniysa update etmenin anlami yok; ayrica kullaniciya net feedback verelim.
        const isSameAsOld = await bcrypt.compare(newPassword, user.sifre);
        if (isSameAsOld) {
            const error = new Error('Yeni şifre mevcut şifreyle aynı olamaz.');
            error.statusCode = 400;
            throw error;
        }

        // === ADIM 5: Hash & Update ===
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await user.update({ sifre: hashedPassword });

        console.log(`[PROFILE] Sifre guncellendi: ${user.eposta} (${userId})`);

        // NOT: JWT stateless; aktif tokenlari sunucudan invalidate edemiyoruz.
        // Frontend "guvenligin icin tekrar giris yap" mesajiyla logout etmeli.
        return res.status(200).json({
            success: true,
            message: 'Şifreniz başarıyla güncellendi. Güvenliğiniz için lütfen tekrar giriş yapın.'
        });

    } catch (error) {
        // 4xx hatalarini istemciye orijinal mesajla doneriz (frontend yakalar).
        if (error.statusCode && error.statusCode < 500) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        console.error('[CHANGE PASSWORD ERROR]', error);
        next(error);
    }
};