/**
 * Progress Service
 * --------------------------------------------------------------
 * Bir ogrencinin bir kurstaki ilerleme yuzdesini bolum-tabanli
 * mantikla hesaplar ve CourseEnrollment.ilerleme_yuzdesi alanina
 * yazar.
 *
 * KURALLAR:
 * - Bir bolum, icindeki tum GORUNUR (gizli_mi=false) derslerin
 *   tamamlanmasi ile "bitmis" sayilir.
 * - Gizli dersler (gizli_mi=true) hem paydan hem paydadan dusurulur.
 *   Bu sayede egitmen yanlis/eski bir dersi gizlerse ogrenci kilitli
 *   kalmaz; gorunur derslerin hepsini tamamlamasi bolumu bitirmesine
 *   yeter.
 * - Icinde hic gorunur ders olmayan bolum, ilerleme hesabina dahil
 *   edilmez (bos bolum %0 ile sayilmaz, kursun gercek ilerlemesini
 *   carpitmaz).
 * - Ileride Quiz sistemi geldiginde sectionIsComplete fonksiyonu
 *   "bolumde quiz varsa quiz gecildi mi?" mantigiyla genisletilecek.
 *   Bu modulun kontrati ayni kalir.
 */

const { CourseSection, Lesson, LessonProgress, CourseEnrollment } = require('../models');

/**
 * Bir bolumun GORUNUR derslerinin hepsi tamamlandi mi?
 *
 * @param {Array} visibleLessons - gizli_mi=false olan dersler
 * @param {Set<string>} completedLessonIds - ogrencinin tamamladigi ders id'leri
 * @returns {boolean} bolum bitti mi
 */
const sectionIsComplete = (visibleLessons, completedLessonIds) => {
    if (!visibleLessons || visibleLessons.length === 0) {
        // Bos bolum (hic gorunur ders yok) "bitti" sayilmaz; ama
        // ilerleme hesabinda paya da paydadan da dusurulecek.
        return false;
    }
    return visibleLessons.every(l => completedLessonIds.has(l.id));
};

/**
 * Ogrencinin bir kurstaki ilerleme yuzdesini hesaplar ve
 * CourseEnrollment.ilerleme_yuzdesi alanini gunceller.
 *
 * @param {string} ogrenciId
 * @param {string} kursId
 * @returns {Promise<number>} hesaplanmis yuzde (0-100)
 */
const recalculateCourseProgress = async (ogrenciId, kursId) => {
    // 1) Bolumler + dersler (gizli olanlari filtreleyerek)
    const sections = await CourseSection.findAll({
        where: { kurs_id: kursId },
        include: [{
            model: Lesson,
            as: 'Lessons',
            attributes: ['id', 'gizli_mi'],
            required: false
        }]
    });

    // 2) Ogrencinin tamamladigi ders id'leri
    const completedRows = await LessonProgress.findAll({
        where: { ogrenci_id: ogrenciId, tamamlandi_mi: true },
        attributes: ['ders_id']
    });
    const completedLessonIds = new Set(completedRows.map(r => r.ders_id));

    // 3) Bolum bazinda say
    let countedSections = 0;   // payda: ilerleme hesabina giren bolum sayisi
    let completedSections = 0; // pay: bunlardan tamamlanmis olanlar

    for (const section of sections) {
        const visibleLessons = (section.Lessons || []).filter(l => !l.gizli_mi);

        if (visibleLessons.length === 0) {
            // Hic gorunur ders yok -> bolum hesaba katilmaz
            continue;
        }

        countedSections++;
        if (sectionIsComplete(visibleLessons, completedLessonIds)) {
            completedSections++;
        }
    }

    const yuzde = countedSections === 0
        ? 0
        : Math.round((completedSections / countedSections) * 100);

    // 4) CourseEnrollment.ilerleme_yuzdesi guncelle (kayit varsa)
    await CourseEnrollment.update(
        { ilerleme_yuzdesi: yuzde },
        { where: { ogrenci_id: ogrenciId, kurs_id: kursId } }
    );

    return yuzde;
};

/**
 * Bir bolumun, ogrenci icin "kilidi acik mi?" durumunu doner.
 * Ileride Quiz sistemi geldiginde "onceki bolumun quizini gecmis mi?"
 * kontrolu de buraya eklenecek.
 *
 * Su an: kursta bu bolumden onceki butun bolumlerin gorunur derslerinin
 * hepsi tamamlanmis olmali.
 *
 * @param {string} ogrenciId
 * @param {string} kursId
 * @param {string} bolumId
 * @returns {Promise<boolean>}
 */
const isSectionUnlockedForStudent = async (ogrenciId, kursId, bolumId) => {
    const sections = await CourseSection.findAll({
        where: { kurs_id: kursId },
        attributes: ['id', 'sira_numarasi'],
        include: [{
            model: Lesson,
            as: 'Lessons',
            attributes: ['id', 'gizli_mi'],
            required: false
        }],
        order: [['sira_numarasi', 'ASC']]
    });

    const target = sections.find(s => s.id === bolumId);
    if (!target) return false;

    const previousSections = sections.filter(s => s.sira_numarasi < target.sira_numarasi);
    if (previousSections.length === 0) return true; // Ilk bolum hep acik

    const completedRows = await LessonProgress.findAll({
        where: { ogrenci_id: ogrenciId, tamamlandi_mi: true },
        attributes: ['ders_id']
    });
    const completedLessonIds = new Set(completedRows.map(r => r.ders_id));

    return previousSections.every(prev => {
        const visible = (prev.Lessons || []).filter(l => !l.gizli_mi);
        if (visible.length === 0) return true; // Bos bolum kilit olamaz
        return sectionIsComplete(visible, completedLessonIds);
    });
};

module.exports = {
    sectionIsComplete,
    recalculateCourseProgress,
    isSectionUnlockedForStudent
};
