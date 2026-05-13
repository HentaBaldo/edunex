/**
 * EduNex Authentication Middleware
 * Kullanici oturum dogrulama ve rol bazli yetkilendirme (RBAC) islemlerini yonetir.
 */

const jwt = require('jsonwebtoken');
const sequelize = require('../config/database');

if (!process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET .env dosyasında tanımlı değil. Sunucu güvenli şekilde başlatılamaz.');
    process.exit(1);
}

/**
 * Throttled "son aktivite" yazimi.
 *
 * Her authenticate'li istekte tetiklenir ama DB'ye yalnizca en az 1 dakika
 * gecmisse yazar — WHERE clause'undaki tarih kosulu DB-level throttle gorevi gorur.
 *
 * Asenkron + fire-and-forget: request akisini bloklamaz. Sema henuz olusmamissa
 * (sunucu ilk kez baslatiliyor) hata sessizce loglanir.
 */
function touchLastActive(userId) {
    if (!userId) return;
    // raw query, fire-and-forget. Sutun yoksa hata catch'e duser, swallow ederiz.
    sequelize.query(
        `UPDATE profiller
            SET son_aktivite_tarihi = NOW()
          WHERE id = :id
            AND (son_aktivite_tarihi IS NULL OR son_aktivite_tarihi < (NOW() - INTERVAL 1 MINUTE))`,
        {
            replacements: { id: userId },
            type: sequelize.QueryTypes.UPDATE,
        }
    ).catch((err) => {
        // ER_BAD_FIELD_ERROR: kolon henuz sync ile eklenmemis olabilir; sessiz gec.
        if (err?.original?.code !== 'ER_BAD_FIELD_ERROR') {
            console.warn('[AUTH] touchLastActive hata:', err.message);
        }
    });
}

/**
 * HTTP Authorization header uzerinden gelen JWT'yi dogrular.
 * Token gecerli ise icindeki veriyi req.user nesnesine ekler.
 */
exports.verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    // Bearer token formatini kontrol et (Örn: "Bearer eyJhbGci...")
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Erisim reddedildi. Oturum acmaniz gerekiyor.'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Token dogrulamasi (SECRET_KEY .env dosyasindan okunur)
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Decoded veriyi (id, rol vb.) sonraki islemlerde kullanmak uzere req nesnesine ata
        req.user = decoded;

        // Online takip: throttled fire-and-forget DB update (request'i bloklamaz)
        touchLastActive(decoded?.id);

        next();
    } catch (error) {
        console.error('[AUTH] Token dogrulama hatasi:', error.message);
        return res.status(401).json({
            success: false,
            message: 'Oturum sureniz dolmus veya gecersiz token. Lutfen tekrar giris yapin.'
        });
    }
};

/**
 * Kullanicinin 'egitmen' (instructor) rolune sahip olup olmadigini kontrol eder.
 * Not: verifyToken middleware'inden sonra kullanilmalidir.
 */
exports.isInstructor = (req, res, next) => {
    if (req.user && req.user.rol === 'egitmen') {
        next();
    } else {
        return res.status(403).json({ 
            success: false, 
            message: 'Bu islem icin egitmen yetkisine sahip olmaniz gerekmektedir.' 
        });
    }
};

/**
 * Kullanicinin 'admin' rolune sahip olup olmadigini kontrol eder.
 * Not: verifyToken middleware'inden sonra kullanilmalidir.
 */
exports.isAdmin = (req, res, next) => {
    // ✅ DOĞRU: req.user.rol === 'admin' kontrolü yapıyor
    if (req.user && req.user.rol === 'admin') {
        next();
    } else {
        return res.status(403).json({ 
            success: false, 
            message: 'Bu alan sadece sistem yoneticilerinin erisimine aciktir.' 
        });
    }
};

/**
 * Opsiyonel: Student Rol Kontrolü
 */
exports.isStudent = (req, res, next) => {
    if (req.user && req.user.rol === 'ogrenci') {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Bu alan sadece ogrencilerin erisimine aciktir.'
        });
    }
};

/**
 * Finans/Hakedis modulune erisim icin ust dvuzey yetki kontrolu.
 *
 * Iki kati guvenlik:
 *   1) JWT'deki rol mutlaka 'admin' olmali (isAdmin'in yaptigi kontrol)
 *   2) DB'den profiller.finans_yetkili = true dogrulanmali
 *
 * NOT: verifyToken middleware'inden sonra kullanilmali.
 * NOT: Bu kontrol her istekte ek 1 DB read yapar (KPI sayfasi gunde 100x acilsa bile dert degil).
 */
exports.isFinanceAdmin = async (req, res, next) => {
    try {
        if (!req.user || req.user.rol !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Bu islem icin yonetici yetkisi gerekiyor.',
            });
        }

        // Lazy import: dairesel bagimliligi onlemek icin runtime'da yukle.
        const { Profile } = require('../models');
        const profile = await Profile.findByPk(req.user.id, {
            attributes: ['id', 'finans_yetkili'],
        });

        if (!profile) {
            return res.status(403).json({
                success: false,
                message: 'Yetki dogrulanamadi.',
            });
        }

        if (!profile.finans_yetkili) {
            return res.status(403).json({
                success: false,
                message: 'Finans modulune erisim icin ek yetki gerekiyor. Lutfen sistem yoneticisinden talep edin.',
            });
        }

        next();
    } catch (error) {
        console.error('[AUTH] isFinanceAdmin hatasi:', error.message);
        // Kolon yoksa (sync henuz alinmadi): erisimi reddet (fail-safe).
        return res.status(503).json({
            success: false,
            message: 'Yetkilendirme servisi gecici olarak kullanilamiyor.',
        });
    }
};