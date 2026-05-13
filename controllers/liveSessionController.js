/**
 * EduNex Canlı Oturum (Live Session) Controller
 * Jitsi tabanlı canlı ders oturumlarının yönetimi + heartbeat ile yoklama.
 */

const crypto = require('crypto');
const { Op } = require('sequelize');
const { uploadVideoToBunny } = require('../services/bunnyService');
const { notifyMultipleUsers } = require('../services/notificationService');
const {
    sequelize,
    LiveSession,
    LiveSessionAttendance,
    Course,
    CourseEnrollment,
    Profile,
    InstructorFollower,
} = require('../models');

/**
 * Kurs sahibi eğitmen kontrolü. Sahibiyse Course'u döner, değilse 403 atar.
 */
async function assertInstructorOwnsCourse(courseId, userId) {
    const course = await Course.findByPk(courseId, {
        attributes: ['id', 'egitmen_id', 'baslik'],
    });
    if (!course) {
        const err = new Error('Kurs bulunamadı.');
        err.statusCode = 404;
        throw err;
    }
    if (course.egitmen_id !== userId) {
        const err = new Error('Bu kurs üzerinde yetkiniz yok.');
        err.statusCode = 403;
        throw err;
    }
    return course;
}

/**
 * Kurs - kullanıcı erişim kontrolü:
 *  - Eğitmen ise kurs sahibi olmalı.
 *  - Öğrenci ise kursa kayıtlı olmalı.
 * Erişim varsa kullanıcı rolünü (egitmen/ogrenci) döner.
 */
async function resolveCourseAccess(courseId, user) {
    const course = await Course.findByPk(courseId, {
        attributes: ['id', 'egitmen_id', 'baslik'],
    });
    if (!course) {
        const err = new Error('Kurs bulunamadı.');
        err.statusCode = 404;
        throw err;
    }

    if (user.rol === 'egitmen' && course.egitmen_id === user.id) {
        return { course, role: 'egitmen' };
    }

    const enrollment = await CourseEnrollment.findOne({
        where: { ogrenci_id: user.id, kurs_id: courseId },
        attributes: ['id'],
    });
    if (enrollment) {
        return { course, role: 'ogrenci' };
    }

    const err = new Error('Bu kursa erişim yetkiniz yok.');
    err.statusCode = 403;
    throw err;
}

/**
 * POST /api/live-sessions
 * Body: { kurs_id, baslik, aciklama?, baslangic_tarihi (ISO), sure_dakika? }
 * Sadece kursun eğitmeni oluşturabilir.
 */
exports.createSession = async (req, res, next) => {
    try {
        const {
            kurs_id,
            baslik,
            aciklama,
            baslangic_tarihi,
            sure_dakika,
            yayin_tipi,
            kayit_alinsin_mi,
        } = req.body;

        if (!baslik || !baslangic_tarihi) {
            const err = new Error('baslik ve baslangic_tarihi zorunludur.');
            err.statusCode = 400;
            throw err;
        }

        if (new Date(baslangic_tarihi) < new Date()) {
            const err = new Error('Geçmiş bir tarihe canlı ders planlanamaz.');
            err.statusCode = 400;
            throw err;
        }

        // Defansif tip belirleme: yayin_tipi açıkça 'genel' ise veya kurs_id boş ise → genel.
        // Sadece yayin_tipi='kursa_ozel' VE kurs_id dolu olduğunda kursa_ozel olarak işle.
        const istenenTip = yayin_tipi === 'genel' ? 'genel' : (yayin_tipi || 'kursa_ozel');
        const tip = (istenenTip === 'kursa_ozel' && kurs_id) ? 'kursa_ozel' : 'genel';
        let finalKursId = null;
        let odaPrefix;

        if (tip === 'kursa_ozel') {
            await assertInstructorOwnsCourse(kurs_id, req.user.id);
            finalKursId = kurs_id;
            odaPrefix = 'kurs';
        } else {
            finalKursId = null;
            odaPrefix = 'genel';
        }

        // Jitsi oda adi: tip etiketi + tam UUID (122-bit entropy).
        // crypto.randomUUID() Node 14.17+ standardidir; tirelerini cikariyoruz cunki
        // bazi Jitsi deploy'lari URL'de tireyi yorumluyor (guvenli karakter seti: [a-z0-9]).
        const odaUuid = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')).replace(/-/g, '');
        const odaAdi = `edunex-${odaPrefix}-${odaUuid}`;

        const session = await LiveSession.create({
            kurs_id: finalKursId,
            egitmen_id: req.user.id,
            baslik,
            aciklama: aciklama || null,
            baslangic_tarihi,
            sure_dakika: sure_dakika || 60,
            jitsi_oda_adi: odaAdi,
            durum: 'planlandi',
            yayin_tipi: tip,
            kayit_alinsin_mi: !!kayit_alinsin_mi,
        });

        // --- TIP-BAZLI BILDIRIM DAGITIMI (notificationService uzerinden) ---
        // Kural:
        //   - kursa_ozel: SADECE bu kursa kayitli ogrencilere (kurs_kayitlari)
        //   - genel:      egitmenin TUM takipcilerine (egitmen_takipcileri)
        // NON-BLOCKING: bildirim hatasi oturum olusturmayi bozmamali.
        try {
            let aliciIdList = [];
            let payload;

            if (tip === 'kursa_ozel') {
                const enrolls = await CourseEnrollment.findAll({
                    where: { kurs_id: finalKursId },
                    attributes: ['ogrenci_id'],
                });
                aliciIdList = enrolls.map(e => e.ogrenci_id);
                payload = {
                    baslik: 'Yeni Canlı Ders Planlandı',
                    mesaj: `Kursunuza yeni bir canlı ders eklendi: "${baslik}".`,
                    tip: 'canli_yayin',
                    baglanti_linki: `/main/course-detail.html?id=${finalKursId}`,
                };
            } else {
                // 'genel' (webinar)
                const followers = await InstructorFollower.findAll({
                    where: { egitmen_id: req.user.id },
                    attributes: ['ogrenci_id'],
                });
                aliciIdList = followers.map(f => f.ogrenci_id);
                payload = {
                    baslik: 'Yeni Canlı Yayın!',
                    mesaj: `Takip ettiğiniz eğitmen yeni bir canlı yayın planladı: "${baslik}".`,
                    tip: 'canli_yayin',
                    baglanti_linki: `/main/live-sessions.html`,
                };
            }

            await notifyMultipleUsers(aliciIdList, payload);
        } catch (notifyErr) {
            console.error('[NOTIFY ERROR] canli_yayin bildirimi olusturulamadi:', notifyErr.message);
        }

        return res.status(201).json({ success: true, data: session });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/live-sessions/public
 * Herkese açık (token gerektirmeyen) genel yayınlar listesi.
 * Sadece yayin_tipi='genel' ve durum != 'iptal' olanlar; eğitmen profili ile.
 */
exports.getPublicLiveSessions = async (req, res, next) => {
    try {
        const sessions = await LiveSession.findAll({
            where: {
                yayin_tipi: 'genel',
                durum: { [Op.ne]: 'iptal' },
            },
            include: [{
                model: Profile,
                as: 'Egitmen',
                attributes: ['id', 'ad', 'soyad', 'profil_fotografi'],
            }],
            order: [['baslangic_tarihi', 'ASC']],
        });

        return res.status(200).json({ success: true, data: sessions });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/live-sessions/my-sessions
 * Eğitmenin tüm canlı yayınları (genel + kursa_ozel), tarihe göre azalan sıralı.
 * Kursa özel olanlar için Course.baslik include edilir.
 */
exports.getMyLiveSessions = async (req, res, next) => {
    try {
        const sessions = await LiveSession.findAll({
            where: { egitmen_id: req.user.id },
            include: [{
                model: Course,
                attributes: ['id', 'baslik'],
                required: false,
            }],
            order: [['baslangic_tarihi', 'DESC']],
        });

        return res.status(200).json({ success: true, data: sessions });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/live-sessions/course/:courseId
 * Kursa ait tüm oturumları getirir. Eğitmen veya kayıtlı öğrenci erişebilir.
 */
exports.getSessionsByCourse = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { role } = await resolveCourseAccess(courseId, req.user);

        const sessions = await LiveSession.findAll({
            where: { kurs_id: courseId },
            order: [['baslangic_tarihi', 'ASC']],
        });

        return res.status(200).json({ success: true, data: sessions, meta: { role } });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /api/live-sessions/:id
 * Oturum bilgisi günceller. Sadece eğitmen (oturum sahibi) güncelleyebilir.
 * yayin_tipi değişikliklerinde kurs_id otomatik normalize edilir:
 *  - genel  → kurs_id zorla null
 *  - kursa_ozel → kurs_id zorunlu + sahiplik kontrolü
 */
exports.updateSession = async (req, res, next) => {
    try {
        const { id } = req.params;
        const session = await LiveSession.findByPk(id);
        if (!session) {
            const err = new Error('Oturum bulunamadı.');
            err.statusCode = 404;
            throw err;
        }
        if (session.egitmen_id !== req.user.id) {
            const err = new Error('Bu oturum üzerinde yetkiniz yok.');
            err.statusCode = 403;
            throw err;
        }

        const allowed = ['baslik', 'aciklama', 'baslangic_tarihi', 'sure_dakika', 'durum', 'kayit_alinsin_mi'];
        for (const key of allowed) {
            if (req.body[key] !== undefined) session[key] = req.body[key];
        }

        // yayin_tipi + kurs_id güncellemesi (defansif normalizasyon)
        if (req.body.yayin_tipi !== undefined) {
            const yeniTip = req.body.yayin_tipi === 'genel' ? 'genel' : 'kursa_ozel';
            if (yeniTip === 'genel') {
                session.yayin_tipi = 'genel';
                session.kurs_id = null;
            } else {
                const yeniKursId = req.body.kurs_id || session.kurs_id;
                if (!yeniKursId) {
                    const err = new Error('Kursa özel yayın için kurs_id zorunludur.');
                    err.statusCode = 400;
                    throw err;
                }
                await assertInstructorOwnsCourse(yeniKursId, req.user.id);
                session.yayin_tipi = 'kursa_ozel';
                session.kurs_id = yeniKursId;
            }
        } else if (req.body.kurs_id !== undefined && session.yayin_tipi === 'kursa_ozel') {
            // yayin_tipi değişmiyor ama kurs_id güncellenmek isteniyor
            await assertInstructorOwnsCourse(req.body.kurs_id, req.user.id);
            session.kurs_id = req.body.kurs_id;
        }

        await session.save();

        return res.status(200).json({ success: true, data: session });
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /api/live-sessions/:id
 */
exports.deleteSession = async (req, res, next) => {
    try {
        const { id } = req.params;
        const session = await LiveSession.findByPk(id);
        if (!session) {
            const err = new Error('Oturum bulunamadı.');
            err.statusCode = 404;
            throw err;
        }
        if (session.egitmen_id !== req.user.id) {
            const err = new Error('Bu oturum üzerinde yetkiniz yok.');
            err.statusCode = 403;
            throw err;
        }
        await session.destroy();
        return res.status(200).json({ success: true, message: 'Oturum silindi.' });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/live-sessions/:id/join
 * Oturum odasına katılım için gerekli bilgileri döner (kullanıcı doğrulaması + oda adı).
 */
exports.joinSession = async (req, res, next) => {
    try {
        const { id } = req.params;
        const session = await LiveSession.findByPk(id);
        if (!session) {
            const err = new Error('Oturum bulunamadı.');
            err.statusCode = 404;
            throw err;
        }
        if (session.durum === 'iptal') {
            const err = new Error('Bu oturum iptal edilmiştir.');
            err.statusCode = 410;
            throw err;
        }
        if (session.durum === 'tamamlandi') {
            const err = new Error('Bu oturum sona ermiştir.');
            err.statusCode = 410;
            throw err;
        }

        const isOwner = session.egitmen_id === req.user.id;

        // ENTERPRISE ACCESS CONTROL
        // Sahibi olmayan herkes icin tip-bazli yetki dogrulamasi yapilir:
        //   - kursa_ozel: kurs_id zorunlu + kurs_kayitlari tablosunda kayit zorunlu
        //   - genel:      tum giris yapmis kullanicilara acik (webinar)
        // kurs_id null olan kursa_ozel oturum corrupt durumdur; 403 ile kapatiyoruz.
        if (!isOwner) {
            if (session.yayin_tipi === 'kursa_ozel') {
                if (!session.kurs_id) {
                    const err = new Error('Oturum yapilandirmasi hatali (kurs_id eksik). Egitmenle iletisime gecin.');
                    err.statusCode = 403;
                    throw err;
                }
                // KESIN KONTROL: ogrenci/baska egitmen kursa kayitli mi?
                // resolveCourseAccess: rol === egitmen + course owner -> izin; degilse CourseEnrollment kontrol; ikisi de yoksa 403.
                await resolveCourseAccess(session.kurs_id, req.user);
            }
            // 'genel' yayinlarda ek kontrole gerek yok — token sahibi her kullanici girebilir.
        }

        const profile = await Profile.findByPk(req.user.id, {
            attributes: ['id', 'ad', 'soyad', 'eposta'],
        });

        const isInstructor = isOwner;

        return res.status(200).json({
            success: true,
            data: {
                session: {
                    id: session.id,
                    baslik: session.baslik,
                    aciklama: session.aciklama,
                    baslangic_tarihi: session.baslangic_tarihi,
                    sure_dakika: session.sure_dakika,
                    durum: session.durum,
                },
                room: {
                    oda_adi: session.jitsi_oda_adi,
                    domain: 'meet.jit.si',
                },
                user: {
                    id: profile.id,
                    displayName: `${profile.ad} ${profile.soyad}`.trim(),
                    email: profile.eposta,
                    moderator: isInstructor,
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/live-sessions/:id/heartbeat
 * Öğrenci canlı oturumda iken her 60 saniyede bir çağrılır.
 * UPSERT: kullanıcı/oturum çifti yoksa oluştur, varsa toplam_dakika +1.
 */
exports.heartbeat = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const session = await LiveSession.findByPk(id, { transaction: t });
        if (!session) {
            await t.rollback();
            const err = new Error('Oturum bulunamadı.');
            err.statusCode = 404;
            throw err;
        }

        // Genel yayınlar herkese açık; kurs erişimi sadece kursa_ozel için kontrol edilir.
        if (session.yayin_tipi === 'kursa_ozel' && session.kurs_id) {
            await resolveCourseAccess(session.kurs_id, req.user);
        }

        const now = new Date();

        let attendance = await LiveSessionAttendance.findOne({
            where: { kullanici_id: userId, canli_oturum_id: id },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!attendance) {
            attendance = await LiveSessionAttendance.create({
                kullanici_id: userId,
                canli_oturum_id: id,
                toplam_dakika: 1,
                ilk_katilim_tarihi: now,
                son_heartbeat_tarihi: now,
            }, { transaction: t });
        } else {
            attendance.toplam_dakika = (attendance.toplam_dakika || 0) + 1;
            attendance.son_heartbeat_tarihi = now;
            await attendance.save({ transaction: t });
        }

        await t.commit();

        return res.status(200).json({
            success: true,
            data: {
                toplam_dakika: attendance.toplam_dakika,
                son_heartbeat_tarihi: attendance.son_heartbeat_tarihi,
            },
        });
    } catch (error) {
        if (!t.finished) await t.rollback();
        next(error);
    }
};

/**
 * GET /api/live-sessions/:id/attendance
 * Sadece oturum sahibi eğitmen erişebilir. Öğrenci bazında toplam dakika raporu.
 * Attendance hesaplaması: katılım_dakika / toplam_dakika (null/0'a karşı korumalı).
 */
exports.getAttendance = async (req, res, next) => {
    try {
        const { id } = req.params;
        const session = await LiveSession.findByPk(id);
        if (!session) {
            const err = new Error('Oturum bulunamadı.');
            err.statusCode = 404;
            throw err;
        }
        if (session.egitmen_id !== req.user.id) {
            const err = new Error('Yetkisiz erişim.');
            err.statusCode = 403;
            throw err;
        }

        const attendances = await LiveSessionAttendance.findAll({
            where: { canli_oturum_id: id },
            include: [{
                model: Profile,
                attributes: ['id', 'ad', 'soyad', 'eposta', 'rol'],
            }],
            order: [['toplam_dakika', 'DESC']],
        });

        const sureDakika = session.sure_dakika || 1;
        const studentAttendances = attendances
            .filter(a => a.Profile?.rol === 'ogrenci')
            .map(a => ({
                ...a.toJSON(),
                katilim_orani: Math.min(100, Math.round(((a.toplam_dakika || 0) / sureDakika) * 100)),
            }));

        return res.status(200).json({
            success: true,
            data: {
                session: {
                    id: session.id,
                    baslik: session.baslik,
                    baslangic_tarihi: session.baslangic_tarihi,
                    sure_dakika: session.sure_dakika,
                },
                attendances: studentAttendances,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /api/live-sessions/:id/start
 * Eğitmen "Yayına Gir" butonuna basınca durum'u 'devam_ediyor' yapar
 * ve oda adı + Jitsi domain bilgisini geri döner.
 */
exports.startSession = async (req, res, next) => {
    try {
        const { id } = req.params;
        const session = await LiveSession.findByPk(id);
        if (!session) {
            const err = new Error('Oturum bulunamadı.');
            err.statusCode = 404;
            throw err;
        }
        if (session.egitmen_id !== req.user.id) {
            const err = new Error('Bu oturum üzerinde yetkiniz yok.');
            err.statusCode = 403;
            throw err;
        }
        if (session.durum === 'iptal') {
            const err = new Error('İptal edilmiş ders başlatılamaz.');
            err.statusCode = 410;
            throw err;
        }
        if (session.durum === 'tamamlandi') {
            const err = new Error('Tamamlanmış ders tekrar başlatılamaz.');
            err.statusCode = 400;
            throw err;
        }

        if (session.durum !== 'devam_ediyor') {
            session.durum = 'devam_ediyor';
            await session.save();
        }

        return res.status(200).json({
            success: true,
            data: {
                id: session.id,
                durum: session.durum,
                jitsi_oda_adi: session.jitsi_oda_adi,
                redirect_url: `/canli-ders/${session.jitsi_oda_adi}`,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /api/live-sessions/:id/status
 * Oturum durumunu günceller (planlandi, devam_ediyor, tamamlandi, iptal).
 * Sadece oturum sahibi eğitmen güncelleyebilir.
 */
exports.updateSessionStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { durum } = req.body;

        if (!durum || !['planlandi', 'devam_ediyor', 'tamamlandi', 'iptal'].includes(durum)) {
            const err = new Error('Geçersiz durum değeri.');
            err.statusCode = 400;
            throw err;
        }

        const session = await LiveSession.findByPk(id);
        if (!session) {
            const err = new Error('Oturum bulunamadı.');
            err.statusCode = 404;
            throw err;
        }

        if (session.egitmen_id !== req.user.id) {
            const err = new Error('Bu oturum üzerinde yetkiniz yok.');
            err.statusCode = 403;
            throw err;
        }

        session.durum = durum;
        await session.save();

        return res.status(200).json({ success: true, data: session });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/live-sessions/upcoming
 * Öğrencinin kayıtlı olduğu kurslardaki yaklaşan canlı oturumlar (son 30 gün + gelecek).
 */
exports.getUpcomingForStudent = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const enrollments = await CourseEnrollment.findAll({
            where: { ogrenci_id: userId },
            attributes: ['kurs_id'],
        });

        const courseIds = enrollments.map(e => e.kurs_id).filter(Boolean);
        if (courseIds.length === 0) {
            return res.status(200).json({ success: true, data: [] });
        }

        const now = new Date();
        const sessions = await LiveSession.findAll({
            where: {
                kurs_id: { [Op.in]: courseIds },
                durum: { [Op.in]: ['planlandi', 'devam_ediyor'] },
                baslangic_tarihi: { [Op.gte]: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
            },
            include: [{
                model: Course,
                attributes: ['id', 'baslik'],
            }],
            order: [['baslangic_tarihi', 'ASC']],
            limit: 20,
        });

        return res.status(200).json({ success: true, data: sessions });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/live-sessions/:id/upload-recording
 * Canlı ders kaydını Bunny.net'e yükle ve kayit_video_url'yi güncelle.
 * Dosya req.file.path'te multer tarafından sağlanır.
 */
exports.uploadSessionRecording = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!req.file) {
            const err = new Error('Dosya gereklidir.');
            err.statusCode = 400;
            throw err;
        }

        const session = await LiveSession.findByPk(id);
        if (!session) {
            const err = new Error('Oturum bulunamadı.');
            err.statusCode = 404;
            throw err;
        }

        if (session.egitmen_id !== req.user.id) {
            const err = new Error('Bu oturum üzerinde yetkiniz yok.');
            err.statusCode = 403;
            throw err;
        }

        const bunnyResult = await uploadVideoToBunny(
            req.file.path,
            `live-recording-${session.id}-${session.baslik}`
        );

        // Bunny Stream izlenebilir embed URL formati:
        //   https://iframe.mediadelivery.net/embed/<LIBRARY_ID>/<VIDEO_GUID>
        // Eski "https://video.bunnycdn.com/<guid>" yapisi cdn root'una gider, oynatilamaz.
        // BUNNY_LIBRARY_ID env'i bunny servisi tarafindan zaten dogrulaniyor.
        const libraryId = process.env.BUNNY_LIBRARY_ID;
        session.kayit_video_url = libraryId
            ? `https://iframe.mediadelivery.net/embed/${libraryId}/${bunnyResult.guid}`
            : `https://video.bunnycdn.com/${bunnyResult.guid}`; // defansif fallback
        await session.save();

        return res.status(200).json({
            success: true,
            data: {
                guid: bunnyResult.guid,
                video_url: session.kayit_video_url,
                message: 'Video başarıyla kuyruğa eklendi.',
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/live-sessions/active
 * Öğrenci ana sayfası için aktif dersleri listele.
 * Mantık:
 *  - devam_ediyor: tarih filtresi YOK (ders başladığı için geçmiş olabilir)
 *  - planlandi: sadece gelecek tarihliler (baslangic_tarihi >= now)
 *  - Görünürlük: yayin_tipi='genel' (tümü) VEYA yayin_tipi='kursa_ozel' + öğrenci kursa kayıtlı
 * Response: { devam_edenler: [...], planlananlar: [...] }
 */
exports.getActiveSessions = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const now = new Date();

        const enrollments = await CourseEnrollment.findAll({
            where: { ogrenci_id: userId },
            attributes: ['kurs_id'],
        });

        const courseIds = enrollments.map(e => e.kurs_id).filter(Boolean);

        // Görünürlük: yayin_tipi='genel' (herkese) VEYA kursa_ozel + kayıtlı kurs.
        // Op.or'i where içine doğrudan yazıyoruz (spread Symbol-key kayıplarını önlemek için).
        const visibilityOr = [
            { yayin_tipi: 'genel' },
        ];
        if (courseIds.length > 0) {
            visibilityOr.push({
                yayin_tipi: 'kursa_ozel',
                kurs_id: { [Op.in]: courseIds },
            });
        }

        const includeBlock = [
            {
                model: Profile,
                as: 'Egitmen',
                attributes: ['id', 'ad', 'soyad'],
            },
            {
                model: Course,
                attributes: ['id', 'baslik'],
                required: false, // Genel yayınlarda kurs olmayabilir (LEFT JOIN)
            },
        ];

        const devamEdenler = await LiveSession.findAll({
            where: {
                durum: 'devam_ediyor',
                [Op.or]: visibilityOr,
            },
            include: includeBlock,
            order: [['baslangic_tarihi', 'ASC']],
            limit: 50,
            subQuery: false,
        });

        const planlananlar = await LiveSession.findAll({
            where: {
                durum: 'planlandi',
                baslangic_tarihi: { [Op.gte]: now },
                [Op.or]: visibilityOr,
            },
            include: includeBlock,
            order: [['baslangic_tarihi', 'ASC']],
            limit: 50,
            subQuery: false,
        });

        return res.status(200).json({
            success: true,
            data: {
                devam_edenler: devamEdenler,
                planlananlar: planlananlar,
            },
        });
    } catch (error) {
        console.error('[getActiveSessions] HATA:', error.message, error.stack);
        next(error);
    }
};
