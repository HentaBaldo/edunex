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
 * Finans/Hakedis modulune erisim icin yetki kontrolu (Super-Admin RBAC).
 *
 * Yetki modeli (sektor standardi):
 *   1) rol === 'admin'           -> KOK YONETICI: tum modullere otomatik erisim.
 *                                   profiller.finans_yetkili flag'i kontrol EDILMEZ,
 *                                   sadece denetim (audit) loguna yazilir.
 *   2) Gelecekte 'staff' / 'moderator' gibi alt-admin roller eklendiginde,
 *      onlar icin profiller.finans_yetkili = true sarti opt-in olarak isler.
 *
 * Tasarim notu (neden kok admin'in bayragi yok-sayiliyor):
 *   - "Iki kati savunma" admin kullanicisini DB flag'i unutuldugunda kilitliyordu
 *     (urun ekibinde tek admin varsa kendini disari atabilir). Endustri pratigi
 *     kok admin'i super-user kabul edip granular permission'i alt rollere uygulamak.
 *   - Audit log her finans erisimini izleyebilmek icin tam detayla yaziliyor.
 *
 * NOT: verifyToken middleware'inden sonra kullanilmali.
 */
exports.isFinanceAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Oturum bilgisi cozumlenemedi.',
            });
        }

        // Kok admin: dogrudan gecir. Audit icin loglanir (bayrak durumu da kayda alinir).
        if (req.user.rol === 'admin') {
            // Lazy import: dairesel bagimliligi onlemek icin runtime'da yukle.
            // Audit icin finans_yetkili bayrak degerini de yakaliyoruz (DB var ise).
            try {
                const { Profile } = require('../models');
                const profile = await Profile.findByPk(req.user.id, {
                    attributes: ['id', 'finans_yetkili'],
                });
                console.log('[AUDIT] Finance access granted', {
                    user_id: req.user.id,
                    rol: req.user.rol,
                    finans_yetkili_flag: profile ? !!profile.finans_yetkili : 'UNKNOWN',
                    super_admin_bypass: profile ? !profile.finans_yetkili : true,
                    method: req.method,
                    path: req.originalUrl,
                    ts: new Date().toISOString(),
                });
            } catch (auditErr) {
                // Audit loglamasi DB hatasinda erisimi blokelemez (super-admin kuralinin sebebi).
                console.warn('[AUDIT] Finance audit log atildi (DB hatasi):', auditErr.message);
            }
            return next();
        }

        // Kok admin degil -> alt-admin rolleri icin granular kontrol.
        // (Su an EduNex'te 'staff' rolu yok; ileride eklendiginde bu blok aktif rol oynar.)
        const { Profile } = require('../models');
        const profile = await Profile.findByPk(req.user.id, {
            attributes: ['id', 'finans_yetkili', 'rol'],
        });

        if (!profile) {
            return res.status(403).json({
                success: false,
                message: 'Yetki dogrulanamadi.',
            });
        }

        if (!profile.finans_yetkili) {
            console.log('[AUDIT] Finance access DENIED', {
                user_id: req.user.id,
                rol: profile.rol,
                reason: 'finans_yetkili=false',
                path: req.originalUrl,
            });
            return res.status(403).json({
                success: false,
                message: 'Finans modulune erisim icin ek yetki gerekiyor. Lutfen sistem yoneticisinden talep edin.',
            });
        }

        console.log('[AUDIT] Finance access granted (staff)', {
            user_id: req.user.id,
            rol: profile.rol,
            path: req.originalUrl,
        });
        next();
    } catch (error) {
        console.error('[AUTH] isFinanceAdmin hatasi:', error.message);
        return res.status(503).json({
            success: false,
            message: 'Yetkilendirme servisi gecici olarak kullanilamiyor.',
        });
    }
};