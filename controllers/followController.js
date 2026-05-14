/**
 * EduNex Takip (Follow) Controller
 * Ogrenci -> Egitmen takip iliskileri.
 */

const { InstructorFollower, InstructorDetail, Profile } = require('../models');
const { sendNotification } = require('../services/notificationService');

/**
 * Takip et / Takipten cik (toggle).
 * Sadece 'ogrenci' rolu cagirabilir.
 * @route POST /api/follows/:egitmen_id
 */
exports.toggleFollow = async (req, res, next) => {
    try {
        if (req.user?.rol !== 'ogrenci') {
            const err = new Error('Sadece ogrenciler egitmen takip edebilir.');
            err.statusCode = 403;
            throw err;
        }

        const ogrenci_id = req.user.id;
        const { egitmen_id } = req.params;

        if (!egitmen_id) {
            const err = new Error('Egitmen ID gereklidir.');
            err.statusCode = 400;
            throw err;
        }

        if (egitmen_id === ogrenci_id) {
            const err = new Error('Kendinizi takip edemezsiniz.');
            err.statusCode = 400;
            throw err;
        }

        // Hedef gercekten egitmen mi?
        const egitmen = await InstructorDetail.findByPk(egitmen_id);
        if (!egitmen) {
            const err = new Error('Egitmen bulunamadi.');
            err.statusCode = 404;
            throw err;
        }

        const existing = await InstructorFollower.findOne({
            where: { ogrenci_id, egitmen_id },
        });

        if (existing) {
            await existing.destroy();
            return res.status(200).json({
                status: 'success',
                message: 'Egitmen takipten cikarildi.',
                data: { takip_ediyor: false, egitmen_id },
            });
        }

        const created = await InstructorFollower.create({ ogrenci_id, egitmen_id });

        // --- TAKIPCI BILDIRIMI (yalniz YENI takipte; takipten cikinca spam yok) ---
        // Non-blocking: bildirim hatasi takip kaydini geri almamali.
        try {
            const ogrenci = await Profile.findByPk(ogrenci_id, { attributes: ['ad', 'soyad'] });
            const ogrenciAd = ogrenci ? `${ogrenci.ad || ''} ${ogrenci.soyad || ''}`.trim() || 'Yeni bir ogrenci' : 'Yeni bir ogrenci';
            await sendNotification({
                kullanici_id: egitmen_id,
                baslik: 'Yeni Takipçi',
                mesaj: `${ogrenciAd} sizi takip etmeye başladı.`,
                tip: 'takip',
                baglanti_linki: `/main/instructor-profile.html?id=${egitmen_id}`,
                kaynak_id: created.id,
            });
        } catch (notifyErr) {
            console.error('BİLDİRİM KAYIT HATASI: [NOTIFY ERROR] Takipci bildirimi olusturulamadi:', {
                ogrenci_id, egitmen_id,
                message: notifyErr.message,
                stack: notifyErr.stack,
            });
        }

        return res.status(201).json({
            status: 'success',
            message: 'Egitmen takip edildi.',
            data: { takip_ediyor: true, takip_id: created.id, egitmen_id },
        });
    } catch (error) {
        console.error('[FOLLOW ERROR]', {
            op: 'toggleFollow',
            kullanici_id: req.user?.id,
            egitmen_id: req.params?.egitmen_id,
            name: error.name,
            message: error.message,
            original: error.original?.message,
        });
        next(error);
    }
};

/**
 * Ogrencinin takip ettigi egitmenleri listeler.
 * @route GET /api/follows/my-instructors
 */
exports.getMyInstructors = async (req, res, next) => {
    try {
        if (req.user?.rol !== 'ogrenci') {
            const err = new Error('Bu islem sadece ogrenciler icindir.');
            err.statusCode = 403;
            throw err;
        }
        const ogrenci_id = req.user.id;

        const follows = await InstructorFollower.findAll({
            where: { ogrenci_id },
            include: [{
                model: InstructorDetail,
                attributes: ['kullanici_id', 'unvan', 'baslik', 'biyografi', 'deneyim_yili'],
                include: [{
                    model: Profile,
                    attributes: ['id', 'ad', 'soyad', 'eposta', 'profil_fotografi'],
                    required: false,
                }],
                required: true,
            }],
            order: [['id', 'DESC']],
        });

        return res.status(200).json({
            status: 'success',
            data: {
                toplam: follows.length,
                egitmenler: follows.map(f => ({
                    takip_id: f.id,
                    egitmen: f.InstructorDetail,
                })),
            },
        });
    } catch (error) {
        console.error('[FOLLOW ERROR]', {
            op: 'getMyInstructors',
            kullanici_id: req.user?.id,
            name: error.name,
            message: error.message,
            original: error.original?.message,
        });
        next(error);
    }
};

/**
 * Egitmenin takipcilerini (ogrencileri) listeler.
 * @route GET /api/follows/my-followers
 */
exports.getMyFollowers = async (req, res, next) => {
    try {
        if (req.user?.rol !== 'egitmen') {
            const err = new Error('Bu islem sadece egitmenler icindir.');
            err.statusCode = 403;
            throw err;
        }
        const egitmen_id = req.user.id;

        // findAndCountAll: count tablo bazlidir (LIMIT/OFFSET'ten bagimsiz),
        // ileride sayfalama eklediğimizde toplam bilgisi sabit kalir.
        const { rows: followers, count } = await InstructorFollower.findAndCountAll({
            where: { egitmen_id },
            include: [{
                model: Profile,
                attributes: ['id', 'ad', 'soyad', 'eposta', 'profil_fotografi'],
                required: true,
            }],
            order: [['id', 'DESC']],
        });

        return res.status(200).json({
            status: 'success',
            data: {
                toplam: count,
                followerCount: count,
                ogrenciler: followers.map(f => ({
                    takip_id: f.id,
                    ogrenci: f.Profile,
                })),
            },
        });
    } catch (error) {
        console.error('[FOLLOW ERROR]', {
            op: 'getMyFollowers',
            kullanici_id: req.user?.id,
            name: error.name,
            message: error.message,
            original: error.original?.message,
        });
        next(error);
    }
};
