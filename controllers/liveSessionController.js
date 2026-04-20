/**
 * EduNex Canlı Oturum (Live Session) Controller
 * Jitsi tabanlı canlı ders oturumlarının yönetimi + heartbeat ile yoklama.
 */

const crypto = require('crypto');
const { Op } = require('sequelize');
const {
    sequelize,
    LiveSession,
    LiveSessionAttendance,
    Course,
    CourseEnrollment,
    Profile,
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
        const { kurs_id, baslik, aciklama, baslangic_tarihi, sure_dakika } = req.body;

        if (!kurs_id || !baslik || !baslangic_tarihi) {
            const err = new Error('kurs_id, baslik ve baslangic_tarihi zorunludur.');
            err.statusCode = 400;
            throw err;
        }

        await assertInstructorOwnsCourse(kurs_id, req.user.id);

        const odaAdi = `edunex-${kurs_id.slice(0, 8)}-${crypto.randomBytes(8).toString('hex')}`;

        const session = await LiveSession.create({
            kurs_id,
            egitmen_id: req.user.id,
            baslik,
            aciklama: aciklama || null,
            baslangic_tarihi,
            sure_dakika: sure_dakika || 60,
            jitsi_oda_adi: odaAdi,
            durum: 'planlandi',
        });

        return res.status(201).json({ success: true, data: session });
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

        const allowed = ['baslik', 'aciklama', 'baslangic_tarihi', 'sure_dakika', 'durum'];
        for (const key of allowed) {
            if (req.body[key] !== undefined) session[key] = req.body[key];
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

        await resolveCourseAccess(session.kurs_id, req.user);

        const profile = await Profile.findByPk(req.user.id, {
            attributes: ['id', 'ad', 'soyad', 'eposta'],
        });

        const isInstructor = session.egitmen_id === req.user.id;

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

        await resolveCourseAccess(session.kurs_id, req.user);

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
                attributes: ['id', 'ad', 'soyad', 'eposta'],
            }],
            order: [['toplam_dakika', 'DESC']],
        });

        return res.status(200).json({
            success: true,
            data: {
                session: {
                    id: session.id,
                    baslik: session.baslik,
                    baslangic_tarihi: session.baslangic_tarihi,
                    sure_dakika: session.sure_dakika,
                },
                attendances,
            },
        });
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
