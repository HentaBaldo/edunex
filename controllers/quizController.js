/**
 * EduNex - Quiz Controller
 * Eğitmen CRUD + Öğrenci Submit/Fetch
 *
 * Kurallar:
 * - Her Lesson (icerik_tipi='quiz') için maksimum 1 Quiz.
 * - Öğrenci quiz'e erişmeden önce aynı bölümdeki tüm non-quiz
 *   görünür dersler 100% tamamlanmış olmalı.
 * - Sınırsız deneme; en yüksek puan geçerli.
 * - Quiz geçilince LessonProgress.tamamlandi_mi=true set edilir;
 *   böylece mevcut progressService hiç değişmeden çalışır.
 */

const { Op } = require('sequelize');
const {
    Quiz, QuizQuestion, QuizChoice, QuizAttempt, QuizAnswer,
    Lesson, CourseSection, LessonProgress, CourseEnrollment, Profile
} = require('../models');
const { recalculateCourseProgress } = require('../services/progressService');

// ─────────────────────────────────────────────
// YARDIMCI: Dersin kursa ait eğitmen id'sini doğrula
// ─────────────────────────────────────────────
async function getLessonWithOwnership(lessonId, instructorId) {
    const lesson = await Lesson.findByPk(lessonId, {
        include: [{
            model: CourseSection,
            attributes: ['id', 'kurs_id'],
            include: [{ association: 'Course', attributes: ['id', 'egitmen_id'] }]
        }]
    });
    if (!lesson) return null;
    const egitmenId = lesson.CourseSection?.Course?.egitmen_id;
    if (egitmenId !== instructorId) return null;
    return lesson;
}

// ─────────────────────────────────────────────
// EĞİTMEN: GET /api/quiz/lesson/:lessonId
// ─────────────────────────────────────────────
exports.getQuizForInstructor = async (req, res, next) => {
    try {
        const { lessonId } = req.params;
        const instructorId = req.user.id;

        const lesson = await getLessonWithOwnership(lessonId, instructorId);
        if (!lesson) return res.status(404).json({ success: false, message: 'Ders bulunamadı veya yetkiniz yok.' });
        if (lesson.icerik_tipi !== 'quiz') {
            return res.status(400).json({ success: false, message: 'Bu ders quiz tipinde değil.' });
        }

        const quiz = await Quiz.findOne({
            where: { ders_id: lessonId },
            include: [{
                model: QuizQuestion,
                as: 'Questions',
                include: [{ model: QuizChoice, as: 'Choices', order: [['sira', 'ASC']] }],
                order: [['sira', 'ASC']]
            }]
        });

        return res.status(200).json({ success: true, data: quiz || null });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────
// EĞİTMEN: POST /api/quiz/lesson/:lessonId
// Upsert: varsa güncelle, yoksa oluştur.
// Body: { gecme_puani, sure_dakika, sorular: [{soru_metni, soru_tipi, secenekler: [{secenek_metni, dogru_mu}]}] }
// ─────────────────────────────────────────────
exports.upsertQuiz = async (req, res, next) => {
    try {
        const { lessonId } = req.params;
        const instructorId = req.user.id;
        const { gecme_puani = 70, sure_dakika = null, sorular = [] } = req.body;

        // Yetki
        const lesson = await getLessonWithOwnership(lessonId, instructorId);
        if (!lesson) return res.status(404).json({ success: false, message: 'Ders bulunamadı veya yetkiniz yok.' });
        if (lesson.icerik_tipi !== 'quiz') {
            return res.status(400).json({ success: false, message: 'Bu ders quiz tipinde değil.' });
        }

        // Validasyon
        if (!Number.isInteger(gecme_puani) || gecme_puani < 0 || gecme_puani > 100) {
            return res.status(400).json({ success: false, message: 'gecme_puani 0-100 arası tam sayı olmalı.' });
        }
        if (!Array.isArray(sorular) || sorular.length === 0) {
            return res.status(400).json({ success: false, message: 'En az 1 soru gerekli.' });
        }
        for (const [i, s] of sorular.entries()) {
            if (!s.soru_metni?.trim()) {
                return res.status(400).json({ success: false, message: `Soru ${i + 1}: soru metni boş olamaz.` });
            }
            if (!Array.isArray(s.secenekler) || s.secenekler.length < 2) {
                return res.status(400).json({ success: false, message: `Soru ${i + 1}: en az 2 seçenek gerekli.` });
            }
            const dogru = s.secenekler.filter(c => c.dogru_mu);
            if (dogru.length !== 1) {
                return res.status(400).json({ success: false, message: `Soru ${i + 1}: tam olarak 1 doğru cevap işaretlenmeli.` });
            }
        }

        // Quiz upsert
        let quiz = await Quiz.findOne({ where: { ders_id: lessonId } });
        if (quiz) {
            await quiz.update({ gecme_puani, sure_dakika });
            // Eski soruları ve seçenekleri sil (cascade)
            const oldQIds = await QuizQuestion.findAll({ where: { quiz_id: quiz.id }, attributes: ['id'] });
            if (oldQIds.length > 0) {
                const ids = oldQIds.map(q => q.id);
                await QuizChoice.destroy({ where: { soru_id: { [Op.in]: ids } } });
                await QuizQuestion.destroy({ where: { id: { [Op.in]: ids } } });
            }
        } else {
            quiz = await Quiz.create({ ders_id: lessonId, gecme_puani, sure_dakika });
        }

        // Yeni soruları ve seçenekleri oluştur
        for (const [si, s] of sorular.entries()) {
            const soru = await QuizQuestion.create({
                quiz_id: quiz.id,
                soru_metni: s.soru_metni.trim(),
                sira: si + 1,
                soru_tipi: s.soru_tipi || 'coktan_secmeli',
            });
            for (const [ci, c] of s.secenekler.entries()) {
                await QuizChoice.create({
                    soru_id: soru.id,
                    secenek_metni: c.secenek_metni.trim(),
                    dogru_mu: !!c.dogru_mu,
                    sira: ci + 1,
                });
            }
        }

        // Fresh fetch ile dön
        const result = await Quiz.findByPk(quiz.id, {
            include: [{
                model: QuizQuestion,
                as: 'Questions',
                include: [{ model: QuizChoice, as: 'Choices', order: [['sira', 'ASC']] }],
                order: [['sira', 'ASC']]
            }]
        });

        return res.status(200).json({ success: true, message: 'Quiz kaydedildi.', data: result });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────
// EĞİTMEN: DELETE /api/quiz/lesson/:lessonId
// ─────────────────────────────────────────────
exports.deleteQuiz = async (req, res, next) => {
    try {
        const { lessonId } = req.params;
        const instructorId = req.user.id;

        const lesson = await getLessonWithOwnership(lessonId, instructorId);
        if (!lesson) return res.status(404).json({ success: false, message: 'Ders bulunamadı veya yetkiniz yok.' });

        const quiz = await Quiz.findOne({ where: { ders_id: lessonId } });
        if (!quiz) return res.status(404).json({ success: false, message: 'Bu derse ait quiz yok.' });

        await quiz.destroy(); // cascade: sorular + seçenekler + denemeler + cevaplar
        return res.status(200).json({ success: true, message: 'Quiz silindi.' });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────
// ÖĞRENCİ: GET /api/quiz/by-lesson/:lessonId
// Öğrenci için quiz id'sini döndürür (dogru_mu yok).
// Kayıt kontrolü yapar.
// ─────────────────────────────────────────────
exports.getQuizIdForStudent = async (req, res, next) => {
    try {
        const { lessonId } = req.params;
        const ogrenciId = req.user.id;

        const quiz = await Quiz.findOne({
            where: { ders_id: lessonId },
            attributes: ['id', 'gecme_puani', 'sure_dakika', 'ders_id'],
            include: [{
                model: Lesson,
                attributes: ['id', 'baslik', 'bolum_id'],
                include: [{ model: CourseSection, attributes: ['id', 'kurs_id'] }]
            }]
        });

        if (!quiz) return res.status(404).json({ success: false, message: 'Bu derse ait quiz bulunamadı.' });

        const kursId = quiz.Lesson?.CourseSection?.kurs_id;
        if (!kursId) return res.status(404).json({ success: false, message: 'Kurs bilgisi alınamadı.' });

        // Kayıt kontrolü
        const enrollment = await CourseEnrollment.findOne({ where: { ogrenci_id: ogrenciId, kurs_id: kursId } });
        if (!enrollment) return res.status(403).json({ success: false, message: 'Bu kursa kayıtlı değilsiniz.' });

        return res.status(200).json({ success: true, data: { id: quiz.id } });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────
// ÖĞRENCİ: GET /api/quiz/:quizId/take
// dogru_mu alanı GİZLENİR; öğrenci kayıtlı olmalı.
// ─────────────────────────────────────────────
exports.getQuizForStudent = async (req, res, next) => {
    try {
        const { quizId } = req.params;
        const ogrenciId = req.user.id;

        const quiz = await Quiz.findByPk(quizId, {
            include: [{
                model: Lesson,
                attributes: ['id', 'baslik', 'bolum_id'],
                include: [{
                    model: CourseSection,
                    attributes: ['id', 'kurs_id']
                }]
            }]
        });
        if (!quiz) return res.status(404).json({ success: false, message: 'Quiz bulunamadı.' });

        const kursId = quiz.Lesson?.CourseSection?.kurs_id;
        if (!kursId) return res.status(404).json({ success: false, message: 'Kurs bilgisi alınamadı.' });

        // Kayıt kontrolü
        const enrollment = await CourseEnrollment.findOne({ where: { ogrenci_id: ogrenciId, kurs_id: kursId } });
        if (!enrollment) return res.status(403).json({ success: false, message: 'Bu kursa kayıtlı değilsiniz.' });

        // Bölümdeki non-quiz görünür dersler tamamlandı mı?
        const bolumId = quiz.Lesson.bolum_id;
        const siblingsRes = await Lesson.findAll({
            where: { bolum_id: bolumId, gizli_mi: false, id: { [Op.ne]: quiz.ders_id } }
        });
        if (siblingsRes.length > 0) {
            const progress = await LessonProgress.findAll({
                where: { ogrenci_id: ogrenciId, ders_id: { [Op.in]: siblingsRes.map(l => l.id) }, tamamlandi_mi: true }
            });
            if (progress.length < siblingsRes.length) {
                return res.status(403).json({
                    success: false,
                    message: 'Bu bölümdeki diğer dersleri tamamlamadan quiz\'e erişemezsiniz.',
                    code: 'QUIZ_LOCKED'
                });
            }
        }

        // Soruları çek — dogru_mu EXCLUDE
        const questions = await QuizQuestion.findAll({
            where: { quiz_id: quizId },
            attributes: ['id', 'soru_metni', 'sira', 'soru_tipi'],
            include: [{
                model: QuizChoice,
                as: 'Choices',
                attributes: ['id', 'secenek_metni', 'sira'], // dogru_mu yok!
                order: [['sira', 'ASC']]
            }],
            order: [['sira', 'ASC']]
        });

        // En iyi deneme (varsa)
        const bestAttempt = await QuizAttempt.findOne({
            where: { quiz_id: quizId, ogrenci_id: ogrenciId },
            order: [['puan', 'DESC']],
            attributes: ['id', 'puan', 'dogru_sayisi', 'toplam_soru', 'gecti_mi', 'createdAt']
        });

        return res.status(200).json({
            success: true,
            data: {
                quiz: {
                    id: quiz.id,
                    gecme_puani: quiz.gecme_puani,
                    sure_dakika: quiz.sure_dakika,
                    ders_baslik: quiz.Lesson?.baslik
                },
                questions,
                best_attempt: bestAttempt || null
            }
        });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────
// ÖĞRENCİ: GET /api/quiz/:quizId/my-result
// ─────────────────────────────────────────────
exports.getMyBestAttempt = async (req, res, next) => {
    try {
        const { quizId } = req.params;
        const ogrenciId = req.user.id;

        const best = await QuizAttempt.findOne({
            where: { quiz_id: quizId, ogrenci_id: ogrenciId },
            order: [['puan', 'DESC']],
        });

        const totalAttempts = await QuizAttempt.count({
            where: { quiz_id: quizId, ogrenci_id: ogrenciId }
        });

        return res.status(200).json({
            success: true,
            data: { best_attempt: best || null, toplam_deneme: totalAttempts }
        });
    } catch (err) {
        next(err);
    }
};

// ─────────────────────────────────────────────
// ÖĞRENCİ: POST /api/quiz/:quizId/submit
// Body: { cevaplar: [{ soru_id, secilen_secenek_id }] }
// ─────────────────────────────────────────────
exports.submitQuiz = async (req, res, next) => {
    try {
        const { quizId } = req.params;
        const ogrenciId = req.user.id;
        const { cevaplar = [] } = req.body;

        if (!Array.isArray(cevaplar) || cevaplar.length === 0) {
            return res.status(400).json({ success: false, message: 'Cevaplar boş olamaz.' });
        }

        // Quiz + sorular + doğru cevaplar
        const quiz = await Quiz.findByPk(quizId, {
            include: [{
                model: QuizQuestion,
                as: 'Questions',
                include: [{
                    model: QuizChoice,
                    as: 'Choices',
                    where: { dogru_mu: true },
                    attributes: ['id']
                }],
                order: [['sira', 'ASC']]
            }, {
                model: Lesson,
                attributes: ['id', 'bolum_id'],
                include: [{ model: CourseSection, attributes: ['id', 'kurs_id'] }]
            }]
        });
        if (!quiz) return res.status(404).json({ success: false, message: 'Quiz bulunamadı.' });

        const kursId = quiz.Lesson?.CourseSection?.kurs_id;
        const enrollment = await CourseEnrollment.findOne({ where: { ogrenci_id: ogrenciId, kurs_id: kursId } });
        if (!enrollment) return res.status(403).json({ success: false, message: 'Bu kursa kayıtlı değilsiniz.' });

        // Puanlama
        const totalSoru = quiz.Questions.length;
        let dogruSayisi = 0;

        // cevaplar dizisini map'e çevir (soru_id -> secilen_secenek_id)
        const cevapMap = {};
        for (const c of cevaplar) {
            if (c.soru_id) cevapMap[c.soru_id] = c.secilen_secenek_id || null;
        }

        const gradedAnswers = quiz.Questions.map(soru => {
            const dogru_secenek_id = soru.Choices?.[0]?.id || null;
            const secilen = cevapMap[soru.id] || null;
            const isCorrect = dogru_secenek_id && secilen === dogru_secenek_id;
            if (isCorrect) dogruSayisi++;
            return { soru_id: soru.id, secilen_secenek_id: secilen };
        });

        const puan = totalSoru === 0 ? 0 : Math.round((dogruSayisi / totalSoru) * 100);
        const gecti_mi = puan >= quiz.gecme_puani;

        // Deneme kaydet
        const attempt = await QuizAttempt.create({
            quiz_id: quizId,
            ogrenci_id: ogrenciId,
            puan,
            dogru_sayisi: dogruSayisi,
            toplam_soru: totalSoru,
            gecti_mi,
        });

        // Cevapları kaydet
        await QuizAnswer.bulkCreate(
            gradedAnswers.map(a => ({ deneme_id: attempt.id, soru_id: a.soru_id, secilen_secenek_id: a.secilen_secenek_id }))
        );

        // Geçti veya daha önce geçmişse LessonProgress.tamamlandi_mi = true
        const alreadyPassed = await LessonProgress.findOne({
            where: { ogrenci_id: ogrenciId, ders_id: quiz.ders_id, tamamlandi_mi: true }
        });
        if (gecti_mi || alreadyPassed) {
            await LessonProgress.upsert({
                ogrenci_id: ogrenciId,
                ders_id: quiz.ders_id,
                tamamlandi_mi: true,
                tamamlanma_tarihi: alreadyPassed ? alreadyPassed.tamamlanma_tarihi : new Date()
            });
        }

        // İlerleme yeniden hesapla
        const yeniYuzde = await recalculateCourseProgress(ogrenciId, kursId);

        return res.status(200).json({
            success: true,
            data: {
                puan,
                dogru_sayisi: dogruSayisi,
                toplam_soru: totalSoru,
                gecti_mi,
                gecme_puani: quiz.gecme_puani,
                ilerleme_yuzdesi: yeniYuzde,
                attempt_id: attempt.id,
            }
        });
    } catch (err) {
        next(err);
    }
};
