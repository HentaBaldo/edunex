const jwt = require('jsonwebtoken');

// 1. Sisteme giriş yapmış mı kontrolü (Token Doğrulama)
exports.verifyToken = (req, res, next) => {
    // Frontend'den gelen header içindeki token'ı alıyoruz
    const token = req.header('Authorization');

    if (!token) {
        return res.status(401).json({ hata: 'Erişim reddedildi. Token bulunamadı.' });
    }

    try {
        // "Bearer " kısmını atıp sadece token kodunu alıyoruz
        const ayrilmisToken = token.split(" ")[1];
        
        // Token'ı gizli anahtarımızla çözüyoruz
        const verified = jwt.verify(ayrilmisToken, process.env.JWT_SECRET);
        
        // Çözülen kullanıcı bilgilerini (id, eposta, rol) req.user içine ekliyoruz
        req.user = verified; 
        
        // İşlemin devam etmesine izin veriyoruz
        next();
    } catch (error) {
        res.status(400).json({ hata: 'Geçersiz token.' });
    }
};
// 2. Sadece Eğitmenler girebilsin kontrolü
exports.isEgitmen = (req, res, next) => {
    if (req.user.rol !== 'egitmen') {
        return res.status(403).json({ hata: 'Erişim reddedildi. Sadece eğitmenler bu işlemi yapabilir.' });
    }
    next();
};

// 3. Sadece Öğrenciler girebilsin kontrolü
exports.isOgrenci = (req, res, next) => {
    if (req.user.rol !== 'ogrenci') {
        return res.status(403).json({ hata: 'Erişim reddedildi. Sadece öğrenciler bu alanı görebilir.' });
    }
    next();
};