const { 
    Profile, 
    StudentDetail, 
    InstructorDetail, 
    Category, 
    Course, 
    CourseEnrollment 
} = require('../models');

/**
 * Tüm Kullanıcıları Listele (Sayfalı)
 * @route GET /api/admin/users
 */
exports.getAllUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const rol = req.query.rol || null;

        console.log(`[ADMIN] Kullanıcı listesi istendi - Sayfa: ${page}, Rol: ${rol}`);

        const where = rol ? { rol } : {};

        const { count, rows } = await Profile.findAndCountAll({
            where,
            // Liste ekranı için temel bilgiler yeterli
            attributes: ['id', 'ad', 'soyad', 'eposta', 'rol'],
            order: [['ad', 'ASC']],
            limit,
            offset
        });

        const totalPages = Math.ceil(count / limit);

        return res.status(200).json({
            success: true,
            data: rows,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: count,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error(`[ADMIN] Kullanıcı listeleme hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Kullanıcı Detaylarını Getir (TAM VERİTABANI UYUMLU - Tanrı Modu)
 * @route GET /api/admin/users/:id
 */
exports.getUserDetail = async (req, res, next) => {
    try {
        const { id } = req.params;

        console.log(`[ADMIN] Kullanıcı detayı (Full Data) inceleniyor: ${id}`);

        // Veritabanındaki tüm profiller, sosyal medya ve detay tablolarını dahil ediyoruz
        const user = await Profile.findOne({
            where: { id },
            attributes: { exclude: ['sifre'] }, // Güvenlik için sadece şifre hariç her şey (website, facebook, tiktok vb.)
            include: [
                { 
                    model: StudentDetail,
                    // ogrenci_detaylari tablosundaki tüm alanlar (egitim_seviyesi, baslik, biyografi)
                    include: [{ model: Category, attributes: ['id', 'ad'], through: { attributes: [] } }] 
                },
                { 
                    model: InstructorDetail,
                    // egitmen_detaylari tablosundaki tüm alanlar (unvan, deneyim_yili, iban_no, baslik, biyografi)
                    include: [{ model: Category, attributes: ['id', 'ad'], through: { attributes: [] } }]
                }
            ]
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
        }

        // İstatistikleri Hesapla (Eğitmen için kurs durumları, Öğrenci için ilerleme)
        let stats = {};

        if (user.rol === 'egitmen') {
            const courses = await Course.findAll({ where: { egitmen_id: id }, attributes: ['durum'] });
            stats = {
                toplam: courses.length,
                aktif: courses.filter(c => c.durum === 'yayinda').length,
                taslak: courses.filter(c => c.durum === 'taslak').length,
                onayBekleyen: courses.filter(c => c.durum === 'onay_bekliyor').length
            };
        } else if (user.rol === 'ogrenci') {
            const enrollments = await CourseEnrollment.findAll({ where: { ogrenci_id: id }, attributes: ['ilerleme_yuzdesi'] });
            stats = {
                toplam: enrollments.length,
                tamamlanan: enrollments.filter(e => e.ilerleme_yuzdesi === 100).length,
                devamEden: enrollments.filter(e => e.ilerleme_yuzdesi < 100).length
            };
        }

        return res.status(200).json({
            success: true,
            data: user,
            stats: stats
        });
    } catch (error) {
        console.error(`[ADMIN] Detay çekme hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Kullanıcı Güncelle (GÜVENLİ: Sadece Ad ve Soyad Değişimi)
 * @route PUT /api/admin/users/:id
 */
exports.updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { ad, soyad } = req.body; 

        const user = await Profile.findOne({ where: { id } });

        if (!user) {
            return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
        }

        // Güvenlik Kararı: Rol değişimi yapılmıyor, sadece isim bilgileri güncelleniyor.
        await user.update({ ad, soyad });

        return res.status(200).json({
            success: true,
            message: 'Kullanıcı bilgileri başarıyla güncellendi.',
            data: user
        });
    } catch (error) {
        console.error(`[ADMIN] Kullanıcı güncelleme hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Kullanıcı Sil (Güvenli: Kendini ve diğer adminleri silemez)
 * @route DELETE /api/admin/users/:id
 */
exports.deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const requestUserId = req.user.id; // Token'dan gelen admin ID

        const user = await Profile.findOne({ where: { id } });

        if (!user) {
            return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
        }

        // Kendini silme engeli
        if (user.id === requestUserId) {
            return res.status(403).json({ success: false, message: 'Kendi hesabınızı bu panelden silemezsiniz.' });
        }

        // Diğer adminleri silme engeli
        if (user.rol === 'admin') {
            return res.status(403).json({ success: false, message: 'Sistem yöneticileri bu panelden silinemez.' });
        }

        await user.destroy();

        return res.status(200).json({
            success: true,
            message: 'Kullanıcı hesabı başarıyla silindi.'
        });
    } catch (error) {
        console.error(`[ADMIN] Kullanıcı silme hatası: ${error.message}`);
        next(error);
    }
};

module.exports = {
    getAllUsers: exports.getAllUsers,
    getUserDetail: exports.getUserDetail,
    updateUser: exports.updateUser,
    deleteUser: exports.deleteUser
};