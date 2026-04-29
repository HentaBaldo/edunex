/**
 * EduNex Authentication Middleware
 * Kullanici oturum dogrulama ve rol bazli yetkilendirme (RBAC) islemlerini yonetir.
 */

const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
    console.error('[FATAL] JWT_SECRET .env dosyasında tanımlı değil. Sunucu güvenli şekilde başlatılamaz.');
    process.exit(1);
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