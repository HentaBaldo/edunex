const { 
    Profile, 
    StudentDetail, 
    InstructorDetail, 
    StudentInterest,
    Category
} = require('../models');

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
            await InstructorDetail.update(
                { biyografi, baslik, unvan, deneyim_yili, iban_no },
                { where: { kullanici_id: userId } }
            );
        }

        return res.status(200).json({ success: true, message: 'Profil başarıyla güncellendi.' });
    } catch (error) {
        console.error('[PROFILE UPDATE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Güncelleme sırasında hata oluştu.' });
    }
};

/**
 * Profil fotoğrafı yükleme işlemi.
 */
exports.uploadAvatar = async (req, res) => {
    try {
        const userId = req.user.id;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Lütfen bir resim dosyası seçin.' });
        }

        // URL yolunu düzenliyoruz
        const imageUrl = `/uploads/avatars/${req.file.filename}`;

        await Profile.update(
            { profil_fotografi: imageUrl },
            { where: { id: userId } }
        );

        return res.status(200).json({ 
            success: true, 
            message: 'Profil fotoğrafı başarıyla güncellendi.',
            imageUrl: imageUrl
        });

    } catch (error) {
        console.error('[AVATAR UPLOAD ERROR]', error);
        return res.status(500).json({ success: false, message: 'Fotoğraf yüklenirken bir hata oluştu.' });
    }
};

/**
 * Kullanıcının kendi hesabını kalıcı olarak silmesi.
 */
exports.deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;

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