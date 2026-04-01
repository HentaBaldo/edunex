const { Profile, StudentDetail, InstructorDetail } = require('../models');

/**
 * Kullanicinin profil bilgilerini rolüne göre getirir.
 */
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user.id; // Auth middleware'den gelen ID

        const profile = await Profile.findByPk(userId, {
            include: [
                { model: StudentDetail },
                { model: InstructorDetail }
            ]
        });

        if (!profile) {
            return res.status(404).json({ success: false, message: 'Profil bulunamadı.' });
        }

        return res.status(200).json({ success: true, data: profile });
    } catch (error) {
        console.error('[PROFILE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Profil getirilirken hata olustu.' });
    }
};

/**
 * Profil ve detay bilgilerini günceller.
 */
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 1. Frontend'den gelen TÜM verileri req.body içinden alıyoruz
        const { 
            ad, soyad, sehir, website, // Genel
            linkedin, instagram, x_twitter, youtube, facebook, tiktok, // Sosyal Medya
            profil_herkese_acik_mi, alinan_kurslari_goster, // Ayarlar
            biyografi, baslik, unvan, deneyim_yili, iban_no, egitim_seviyesi // Detaylar
        } = req.body;

        // 2. Ana profil bilgilerini güncelle (profiller tablosu)
        await Profile.update(
            { 
                ad, soyad, sehir, website,
                linkedin, instagram, x_twitter, youtube, facebook, tiktok,
                profil_herkese_acik_mi, alinan_kurslari_goster
            },
            { where: { id: userId } }
        );

        // 3. Role göre detay tablosunu güncelle
        const profile = await Profile.findByPk(userId);
        
        if (profile.rol === 'ogrenci') {
            await StudentDetail.update(
                { biyografi, baslik, egitim_seviyesi },
                { where: { kullanici_id: userId } }
            );
        } else if (profile.rol === 'egitmen') {
            await InstructorDetail.update(
                { biyografi, baslik, unvan, deneyim_yili, iban_no },
                { where: { kullanici_id: userId } }
            );
        }

        return res.status(200).json({ success: true, message: 'Profil basariyla guncellendi.' });
    } catch (error) {
        console.error('[PROFILE UPDATE ERROR]', error);
        return res.status(500).json({ success: false, message: 'Guncelleme sirasinda hata olustu.' });
    }
};

exports.uploadAvatar = async (req, res) => {
    try {
        const userId = req.user.id; // verifyToken'dan gelir

        // Multer dosyayı başarıyla kaydettiyse req.file dolu gelir
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Lütfen bir resim dosyası seçin.' });
        }

        // Veritabanına kaydedilecek URL yolu (public klasörü zaten app.js'de statik olduğu için direkt /uploads... ile başlar)
        const imageUrl = `/uploads/avatars/${req.file.filename}`;

        // Profile modelini güncelle (Sende modelin adı Profile ise bu şekilde kalabilir)
        const { Profile } = require('../models');
        await Profile.update(
            { profil_fotografi: imageUrl },
            { where: { id: userId } } // veya sende kullanici_id ise onu yazmalısın
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