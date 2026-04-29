// controllers/recommendationController.js
// EduNex Kurs Öneri Motoru - 5 Modüllü Kolaboratif Filtreleme Algoritması

const {
    Course,
    CourseEnrollment,
    Profile,
    Category,
    StudentInterest,
    sequelize
} = require('../models');
const { Op, literal, QueryTypes } = require('sequelize');

// ============================================================
// YARDIMCI: Sequelize kurs nesnesini frontend formatına çevir
// Hem ORM nesneleri hem de ham SQL sonuçları için çalışır
// ============================================================
function kursBicimlendir(kurs) {
    const degerler = kurs.dataValues || kurs;
    const egitmen  = kurs.Egitmen  || kurs.egitmen  || null;
    const kategori = kurs.Category || kurs.Kategori || kurs.kategori || null;

    return {
        id:        degerler.id,
        baslik:    degerler.baslik,
        alt_baslik: degerler.alt_baslik || '',
        fiyat:     degerler.fiyat ? parseFloat(degerler.fiyat).toFixed(2) : '0.00',
        seviye:    degerler.seviye || 'Başlangıç',
        egitmen: egitmen ? {
            id:    egitmen.id    || degerler.egitmen_id,
            ad:    egitmen.ad    || '',
            soyad: egitmen.soyad || ''
        } : {
            id:    degerler.egitmen_id,
            ad:    degerler.egitmen_ad    || '',
            soyad: degerler.egitmen_soyad || ''
        },
        kategori: kategori ? {
            id: kategori.id || degerler.kategori_id,
            ad: kategori.ad || ''
        } : {
            id: degerler.kategori_id,
            ad: degerler.kategori_ad || ''
        },
        istatistikler: {
            toplam_ogrenci: parseInt(degerler.toplam_ogrenci || 0),
            ortalama_puan:  degerler.ortalama_puan
                                ? parseFloat(degerler.ortalama_puan).toFixed(2)
                                : null,
            toplam_yorum:   parseInt(degerler.toplam_yorum || degerler.yorum_sayisi || 0)
        }
    };
}

// ============================================================
// ÖZEL (INTERNAL) FONKSİYONLAR — route handler değil
// ============================================================

/**
 * MODÜL 1 (İÇ): En çok kayıt olunan kursları döndürür
 */
async function _enPopulerKurslariGetir(sinir = 8) {
    const kurslar = await Course.findAll({
        where: { durum: 'yayinda', silindi_mi: false },
        attributes: [
            'id', 'baslik', 'alt_baslik', 'fiyat', 'seviye', 'egitmen_id', 'kategori_id',
            [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'toplam_ogrenci'],
            [literal('(SELECT ROUND(AVG(puan), 2) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'ortalama_puan'],
            [literal('(SELECT COUNT(*) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'toplam_yorum']
        ],
        include: [
            { model: Profile,   as: 'Egitmen', attributes: ['id', 'ad', 'soyad'] },
            { model: Category,  attributes: ['id', 'ad'] }
        ],
        order: [
            [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'DESC']
        ],
        limit:    sinir,
        subQuery: false
    });
    return kurslar.map(kursBicimlendir);
}

/**
 * MODÜL 2 (İÇ): Satış hacmine göre popüler kategoriler + kategori başı örnek kurslar
 */
async function _populerKategorileriGetir(sinir = 6) {
    // Kategori başına toplam benzersiz öğrenci ve kurs sayısını hesapla
    const populerKategoriler = await sequelize.query(
        `SELECT
            kat.id,
            kat.ad,
            kat.slug,
            COUNT(DISTINCT kk.ogrenci_id) AS toplam_kayit,
            COUNT(DISTINCT kk.kurs_id)    AS kurs_sayisi
         FROM kategoriler kat
         INNER JOIN kurslar k         ON k.kategori_id = kat.id AND k.durum = 'yayinda'
         INNER JOIN kurs_kayitlari kk ON kk.kurs_id = k.id
         GROUP BY kat.id, kat.ad, kat.slug
         ORDER BY toplam_kayit DESC
         LIMIT :sinir`,
        { replacements: { sinir }, type: QueryTypes.SELECT }
    );

    if (!populerKategoriler || populerKategoriler.length === 0) return [];

    // Her popüler kategori için max 3 kurs — tek sorgu, N+1 yok
    const kategoriIdleri = populerKategoriler.map(k => k.id);
    const ornekKurslar = await Course.findAll({
        where: { kategori_id: { [Op.in]: kategoriIdleri }, durum: 'yayinda' },
        attributes: [
            'id', 'baslik', 'fiyat', 'seviye', 'kategori_id',
            [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'toplam_ogrenci'],
            [literal('(SELECT ROUND(AVG(puan), 2) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'ortalama_puan'],
            [literal('(SELECT COUNT(*) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'toplam_yorum']
        ],
        include: [{ model: Profile, as: 'Egitmen', attributes: ['id', 'ad', 'soyad'] }],
        order: [[literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'DESC']],
        subQuery: false
    });

    // Kursları kategorilere göre grupla
    const kurslarGruplu = {};
    ornekKurslar.forEach(kurs => {
        const katId = kurs.kategori_id;
        if (!kurslarGruplu[katId]) kurslarGruplu[katId] = [];
        if (kurslarGruplu[katId].length < 3) {
            kurslarGruplu[katId].push(kursBicimlendir(kurs));
        }
    });

    return populerKategoriler.map(kat => ({
        id:   kat.id,
        ad:   kat.ad,
        slug: kat.slug,
        istatistikler: {
            toplam_kayit: parseInt(kat.toplam_kayit),
            kurs_sayisi:  parseInt(kat.kurs_sayisi)
        },
        ornek_kurslar: kurslarGruplu[kat.id] || []
    }));
}

/**
 * MODÜL 3 (İÇ): Ham SQL ile kurs bazlı collaborative filtering
 * tohumKursId kursunu alanların başka ne aldığını hesaplar
 */
async function _birlikteAlinanKurslariGetir(tohumKursId, sinir = 8) {
    const sonuclar = await sequelize.query(
        `SELECT
            k.id,
            k.baslik,
            k.alt_baslik,
            k.fiyat,
            k.seviye,
            k.egitmen_id,
            k.kategori_id,
            COUNT(DISTINCT kk2.ogrenci_id)                                              AS birlikte_alinma_sayisi,
            (SELECT COUNT(*)         FROM kurs_kayitlari WHERE kurs_id = k.id)          AS toplam_ogrenci,
            (SELECT ROUND(AVG(puan), 2) FROM yorumlar    WHERE kurs_id = k.id)          AS ortalama_puan,
            (SELECT COUNT(*)         FROM yorumlar        WHERE kurs_id = k.id)          AS toplam_yorum,
            p.ad    AS egitmen_ad,
            p.soyad AS egitmen_soyad,
            kat.ad  AS kategori_ad
         FROM kurs_kayitlari kk1
         INNER JOIN kurs_kayitlari kk2
             ON  kk1.ogrenci_id = kk2.ogrenci_id
             AND kk2.kurs_id   != :tohumKursId
         INNER JOIN kurslar     k   ON kk2.kurs_id    = k.id   AND k.durum = 'yayinda'
         INNER JOIN profiller   p   ON k.egitmen_id   = p.id
         INNER JOIN kategoriler kat ON k.kategori_id  = kat.id
         WHERE kk1.kurs_id = :tohumKursId
         GROUP BY
             k.id, k.baslik, k.alt_baslik, k.fiyat, k.seviye,
             k.egitmen_id, k.kategori_id, p.ad, p.soyad, kat.ad
         ORDER BY birlikte_alinma_sayisi DESC
         LIMIT :sinir`,
        { replacements: { tohumKursId, sinir }, type: QueryTypes.SELECT }
    );

    return (sonuclar || []).map(kursBicimlendir);
}

/**
 * MODÜL 4 (İÇ): Kategori bazlı çapraz-satış öneri algoritması
 * tohumKategoriId kategorisinden kurs alanların istatistiksel olarak hangi
 * diğer kategorilere yöneldiğini hesaplar; her kategori için örnek kursları döndürür
 */
async function _kategoriCarprazGetir(tohumKategoriId, sinir = 5) {
    const carprazKategoriler = await sequelize.query(
        `SELECT
            kat.id,
            kat.ad,
            kat.slug,
            COUNT(DISTINCT kk2.ogrenci_id) AS ortak_kullanici_sayisi
         FROM kurs_kayitlari kk1
         INNER JOIN kurslar k1
             ON  kk1.kurs_id    = k1.id
             AND k1.kategori_id = :tohumKategoriId
         INNER JOIN kurs_kayitlari kk2 ON kk1.ogrenci_id = kk2.ogrenci_id
         INNER JOIN kurslar k2
             ON  kk2.kurs_id    = k2.id
             AND k2.durum       = 'yayinda'
             AND k2.kategori_id != :tohumKategoriId
         INNER JOIN kategoriler kat ON k2.kategori_id = kat.id
         GROUP BY kat.id, kat.ad, kat.slug
         ORDER BY ortak_kullanici_sayisi DESC
         LIMIT :sinir`,
        { replacements: { tohumKategoriId, sinir }, type: QueryTypes.SELECT }
    );

    if (!carprazKategoriler || carprazKategoriler.length === 0) return [];

    // Her çapraz kategori için max 4 örnek kurs — tek sorgu
    const carprazKatIdleri = carprazKategoriler.map(k => k.id);
    const ornekKurslar = await Course.findAll({
        where: { kategori_id: { [Op.in]: carprazKatIdleri }, durum: 'yayinda' },
        attributes: [
            'id', 'baslik', 'fiyat', 'seviye', 'kategori_id',
            [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'toplam_ogrenci'],
            [literal('(SELECT ROUND(AVG(puan), 2) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'ortalama_puan'],
            [literal('(SELECT COUNT(*) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'toplam_yorum']
        ],
        include: [{ model: Profile, as: 'Egitmen', attributes: ['id', 'ad', 'soyad'] }],
        order: [[literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'DESC']],
        subQuery: false
    });

    const kurslarGruplu = {};
    ornekKurslar.forEach(kurs => {
        const katId = kurs.kategori_id;
        if (!kurslarGruplu[katId]) kurslarGruplu[katId] = [];
        if (kurslarGruplu[katId].length < 4) {
            kurslarGruplu[katId].push(kursBicimlendir(kurs));
        }
    });

    return carprazKategoriler.map(kat => ({
        id:    kat.id,
        ad:    kat.ad,
        slug:  kat.slug,
        ortak_kullanici_sayisi: parseInt(kat.ortak_kullanici_sayisi),
        ornek_kurslar: kurslarGruplu[kat.id] || []
    }));
}

/**
 * MODÜL 5 (İÇ): Min yorum şartıyla en yüksek puanlı kurslar
 */
async function _enCokBegenilenGetir(sinir = 8, minYorum = 5) {
    const kurslar = await Course.findAll({
        where: { durum: 'yayinda', silindi_mi: false },
        attributes: [
            'id', 'baslik', 'alt_baslik', 'fiyat', 'seviye', 'egitmen_id', 'kategori_id',
            [literal('(SELECT ROUND(AVG(puan), 2) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'ortalama_puan'],
            [literal('(SELECT COUNT(*) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'toplam_yorum'],
            [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'toplam_ogrenci']
        ],
        include: [
            { model: Profile,  as: 'Egitmen', attributes: ['id', 'ad', 'soyad'] },
            { model: Category, attributes: ['id', 'ad'] }
        ],
        having: literal(`(SELECT COUNT(*) FROM yorumlar WHERE yorumlar.kurs_id = Course.id) >= ${parseInt(minYorum)}`),
        order: [
            [literal('(SELECT ROUND(AVG(puan), 2) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'DESC'],
            [literal('(SELECT COUNT(*) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'DESC']
        ],
        limit:    sinir,
        subQuery: false
    });
    return kurslar.map(kursBicimlendir);
}

/**
 * MODÜL 6 (İÇ): En popüler eğitmenler — toplam öğrenci sayısına göre
 */
async function _populerEgitmenleriGetir(sinir = 6) {
    const sonuclar = await sequelize.query(
        `SELECT
            p.id,
            p.ad,
            p.soyad,
            p.profil_fotografi,
            COALESCE(ed.unvan, '') AS unvan,
            COUNT(DISTINCT kk.ogrenci_id)               AS toplam_ogrenci,
            COUNT(DISTINCT k.id)                         AS toplam_kurs,
            ROUND(AVG(y.puan), 1)                        AS ortalama_puan,
            COUNT(DISTINCT CONCAT(y.kurs_id, y.ogrenci_id)) AS toplam_yorum
         FROM profiller p
         INNER JOIN kurslar k
             ON k.egitmen_id = p.id AND k.durum = 'yayinda' AND k.silindi_mi = 0
         LEFT JOIN kurs_kayitlari kk ON kk.kurs_id = k.id
         LEFT JOIN yorumlar y        ON y.kurs_id  = k.id
         LEFT JOIN egitmen_detaylari ed ON ed.kullanici_id = p.id
         WHERE p.rol = 'egitmen'
         GROUP BY p.id, p.ad, p.soyad, p.profil_fotografi, ed.unvan
         HAVING COUNT(DISTINCT k.id) >= 1
         ORDER BY COUNT(DISTINCT kk.ogrenci_id) DESC, ROUND(AVG(y.puan), 1) DESC
         LIMIT :sinir`,
        { replacements: { sinir }, type: QueryTypes.SELECT }
    );

    return (sonuclar || []).map(e => ({
        id:               e.id,
        ad:               e.ad,
        soyad:            e.soyad,
        profil_fotografi: e.profil_fotografi || null,
        unvan:            e.unvan || '',
        istatistikler: {
            toplam_ogrenci: parseInt(e.toplam_ogrenci || 0),
            toplam_kurs:    parseInt(e.toplam_kurs    || 0),
            ortalama_puan:  e.ortalama_puan ? parseFloat(e.ortalama_puan).toFixed(1) : null,
            toplam_yorum:   parseInt(e.toplam_yorum   || 0)
        }
    }));
}

/**
 * Seed kurs yoksa: platformun en çok kayıtlı kursunu seed olarak kullan
 */
async function _enPopulerTohumKursuBul() {
    const [satir] = await sequelize.query(
        `SELECT kurs_id FROM kurs_kayitlari GROUP BY kurs_id ORDER BY COUNT(*) DESC LIMIT 1`,
        { type: QueryTypes.SELECT }
    );
    return satir ? satir.kurs_id : null;
}

/**
 * Seed kategori yoksa: platformun en çok kayıtlı kategorisini seed olarak kullan
 */
async function _enPopulerTohumKategorisiniBul() {
    const [satir] = await sequelize.query(
        `SELECT k.kategori_id
         FROM kurs_kayitlari kk
         INNER JOIN kurslar k ON kk.kurs_id = k.id AND k.durum = 'yayinda'
         GROUP BY k.kategori_id
         ORDER BY COUNT(*) DESC
         LIMIT 1`,
        { type: QueryTypes.SELECT }
    );
    return satir ? satir.kategori_id : null;
}

// ============================================================
// MODÜL 1 — PUBLIC ROUTE HANDLER: En Popüler Kurslar
// @route GET /api/recommendations/populer-kurslar
// @access Public
// ============================================================
exports.getEnPopulerKurslar = async (req, res, next) => {
    try {
        const sinir = Math.min(parseInt(req.query.sinir) || 8, 20);
        const veri  = await _enPopulerKurslariGetir(sinir);

        return res.status(200).json({
            status: 'basarili',
            mesaj:  `En popüler ${veri.length} kurs getirildi.`,
            veri
        });
    } catch (hata) {
        console.error('[EN_POPULER] Hata:', hata.message);
        next(hata);
    }
};

// ============================================================
// MODÜL 2 — PUBLIC ROUTE HANDLER: Popüler Kategoriler
// @route GET /api/recommendations/populer-kategoriler
// @access Public
// ============================================================
exports.getPopulerKategoriler = async (req, res, next) => {
    try {
        const sinir = Math.min(parseInt(req.query.sinir) || 6, 12);
        const veri  = await _populerKategorileriGetir(sinir);

        return res.status(200).json({
            status: 'basarili',
            mesaj:  `${veri.length} popüler kategori getirildi.`,
            veri
        });
    } catch (hata) {
        console.error('[POPULER_KATEGORILER] Hata:', hata.message);
        next(hata);
    }
};

// ============================================================
// MODÜL 3 — PUBLIC ROUTE HANDLER: Bunu Alanlar Şunu da Aldı
// @route GET /api/recommendations/birlikte-alinan?kurs_id=UUID
// @access Public
// ============================================================
exports.getBirlikteAlinan = async (req, res, next) => {
    try {
        const tohumKursId = req.query.kurs_id;
        if (!tohumKursId) {
            return res.status(400).json({
                status: 'hata',
                mesaj:  '`kurs_id` query parametresi zorunludur.'
            });
        }

        const sinir = Math.min(parseInt(req.query.sinir) || 8, 20);
        const veri  = await _birlikteAlinanKurslariGetir(tohumKursId, sinir);

        return res.status(200).json({
            status:        'basarili',
            mesaj:         `Bu kursu alanların ${veri.length} ortak kursu getirildi.`,
            tohum_kurs_id: tohumKursId,
            veri
        });
    } catch (hata) {
        console.error('[BIRLIKTE_ALINAN] Hata:', hata.message);
        next(hata);
    }
};

// ============================================================
// MODÜL 4 — PUBLIC ROUTE HANDLER: Bu Kategoriden Alanlar Şuradan da Aldı
// @route GET /api/recommendations/kategori-carpraz?kategori_id=UUID
// @access Public
// ============================================================
exports.getKategoriCarpraz = async (req, res, next) => {
    try {
        const tohumKategoriId = req.query.kategori_id;
        if (!tohumKategoriId) {
            return res.status(400).json({
                status: 'hata',
                mesaj:  '`kategori_id` query parametresi zorunludur.'
            });
        }

        const sinir = Math.min(parseInt(req.query.sinir) || 5, 10);
        const veri  = await _kategoriCarprazGetir(tohumKategoriId, sinir);

        return res.status(200).json({
            status:              'basarili',
            mesaj:               `${veri.length} çapraz kategori önerisi getirildi.`,
            tohum_kategori_id:   tohumKategoriId,
            veri
        });
    } catch (hata) {
        console.error('[KATEGORI_CARPRAZ] Hata:', hata.message);
        next(hata);
    }
};

// ============================================================
// MODÜL 5 — PUBLIC ROUTE HANDLER: En Çok Beğenilenler
// @route GET /api/recommendations/en-cok-begenilen?min_yorum=5
// @access Public
// ============================================================
exports.getEnCokBegenilen = async (req, res, next) => {
    try {
        const sinir    = Math.min(parseInt(req.query.sinir)     || 8, 20);
        const minYorum = Math.max(parseInt(req.query.min_yorum) || 5,  1);
        const veri     = await _enCokBegenilenGetir(sinir, minYorum);

        return res.status(200).json({
            status: 'basarili',
            mesaj:  `En çok beğenilen ${veri.length} kurs getirildi (min ${minYorum} yorum).`,
            veri
        });
    } catch (hata) {
        console.error('[EN_COK_BEGENILEN] Hata:', hata.message);
        next(hata);
    }
};

// ============================================================
// ANA FONKSİYON — Tüm 5 modülü tek HTTP isteğinde döndürür
// @route GET /api/recommendations/anasayfa
// @access Public (opsiyonel: ?kurs_id, ?kategori_id)
// ============================================================
exports.getRecommendations = async (req, res, next) => {
    try {
        let tohumKursId     = req.query.kurs_id     || null;
        let tohumKategoriId = req.query.kategori_id || null;

        // Seed parametreleri yoksa platform geneli en popülerleri kullan
        if (!tohumKursId) {
            tohumKursId = await _enPopulerTohumKursuBul();
        }
        if (!tohumKategoriId) {
            tohumKategoriId = await _enPopulerTohumKategorisiniBul();
        }

        // Tüm modüller paralel çalışır — N+1 sorgu riski sıfır
        const [
            enPopulerKurslar,
            populerKategoriler,
            birlikteAlinanKurslar,
            kategoriBazliCarpraz,
            enCokBegenilen,
            populerEgitmenler
        ] = await Promise.all([
            _enPopulerKurslariGetir(9),
            _populerKategorileriGetir(9),
            tohumKursId     ? _birlikteAlinanKurslariGetir(tohumKursId, 9)     : Promise.resolve([]),
            tohumKategoriId ? _kategoriCarprazGetir(tohumKategoriId, 9)        : Promise.resolve([]),
            _enCokBegenilenGetir(9, 3),
            _populerEgitmenleriGetir(9)
        ]);

        return res.status(200).json({
            status: 'basarili',
            mesaj:  'Ana sayfa öneri modülleri hazırlandı.',
            meta: {
                tohum_kurs_id:     tohumKursId,
                tohum_kategori_id: tohumKategoriId
            },
            veri: {
                enPopulerKurslar,
                populerKategoriler,
                birlikteAlinanKurslar,
                kategoriBazliCarpraz,
                enCokBegenilen,
                populerEgitmenler
            }
        });
    } catch (hata) {
        console.error('[RECOMMENDATIONS_ANASAYFA] Hata:', hata.message);
        next(hata);
    }
};

// ============================================================
// GERİYE DÖNÜK UYUMLULUK — Eski frontend çağrıları için
// ============================================================

/**
 * Kişiselleştirilmiş öneriler — öğrencinin ilgi alanları
 * @route GET /api/recommendations/personalized
 * @access Private
 */
exports.getPersonalizedRecommendations = async (req, res, next) => {
    try {
        const ogrenciId = req.user.id;

        const ilgiAlanlari = await StudentInterest.findAll({
            where: { ogrenci_id: ogrenciId },
            attributes: ['kategori_id'],
            raw: true
        });

        // İlgi alanı yoksa en popülerleri döndür
        if (ilgiAlanlari.length === 0) {
            const veri = await _enPopulerKurslariGetir(5);
            return res.status(200).json({
                status: 'basarili',
                mesaj:  'İlgi alanı bulunamadı; genel öneriler döndürüldü.',
                veri
            });
        }

        const kategoriIdleri = ilgiAlanlari.map(i => i.kategori_id);

        const kayitliKurslar = await CourseEnrollment.findAll({
            where: { ogrenci_id: ogrenciId },
            attributes: ['kurs_id'],
            raw: true
        });
        const kayitliKursIdleri = kayitliKurslar.map(k => k.kurs_id);

        const whereKosulu = {
            kategori_id: { [Op.in]: kategoriIdleri },
            durum: 'yayinda'
        };
        if (kayitliKursIdleri.length > 0) {
            whereKosulu.id = { [Op.notIn]: kayitliKursIdleri };
        }

        const oneriler = await Course.findAll({
            where: whereKosulu,
            attributes: [
                'id', 'baslik', 'alt_baslik', 'fiyat', 'seviye', 'egitmen_id', 'kategori_id',
                [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'toplam_ogrenci'],
                [literal('(SELECT ROUND(AVG(puan), 2) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'ortalama_puan'],
                [literal('(SELECT COUNT(*) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'toplam_yorum']
            ],
            include: [
                { model: Profile,  as: 'Egitmen', attributes: ['id', 'ad', 'soyad'] },
                { model: Category, attributes: ['id', 'ad'] }
            ],
            order: [
                [literal('(SELECT ROUND(AVG(puan), 2) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'DESC'],
                [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'DESC']
            ],
            limit:    5,
            subQuery: false
        });

        return res.status(200).json({
            status: 'basarili',
            mesaj:  `${oneriler.length} kişiselleştirilmiş öneri hazırlandı.`,
            veri:   oneriler.map(kursBicimlendir)
        });
    } catch (hata) {
        console.error('[PERSONALIZED] Hata:', hata.message);
        next(hata);
    }
};

/** @route GET /api/recommendations/trending  @access Public */
exports.getTrendingCourses = async (_req, res, next) => {
    try {
        const veri = await _enPopulerKurslariGetir(10);
        return res.status(200).json({ status: 'basarili', mesaj: 'Trend kurslar getirildi.', veri });
    } catch (hata) { next(hata); }
};

/** @route GET /api/recommendations/top-rated  @access Public */
exports.getTopRatedCourses = async (_req, res, next) => {
    try {
        const veri = await _enCokBegenilenGetir(10, 1);
        return res.status(200).json({ status: 'basarili', mesaj: 'En yüksek puanlı kurslar getirildi.', veri });
    } catch (hata) { next(hata); }
};

// ============================================================
// MODÜL 6 — PUBLIC ROUTE HANDLER: En Popüler Eğitmenler
// @route GET /api/recommendations/populer-egitmenler?sinir=6
// @access Public
// ============================================================
exports.getPopulerEgitmenler = async (req, res, next) => {
    try {
        const sinir = Math.min(parseInt(req.query.sinir) || 6, 12);
        const veri  = await _populerEgitmenleriGetir(sinir);

        return res.status(200).json({
            status: 'basarili',
            mesaj:  `En popüler ${veri.length} eğitmen getirildi.`,
            veri
        });
    } catch (hata) {
        console.error('[POPULER_EGITMENLER] Hata:', hata.message);
        next(hata);
    }
};
