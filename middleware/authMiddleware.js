const jwt = require('jsonwebtoken');

// 1. Token Doğrulama (Kullanıcı giriş yapmış mı?)
exports.verifyToken = (req, res, next) => {
  // Frontend'den gelen token genellikle header içinde "Bearer <token>" formatında gelir
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(403).json({ mesaj: 'Erişim reddedildi. Geçerli bir token bulunamadı.' });
  }

  try {
    // Token'ı .env içindeki gizli anahtarımızla çözüyoruz
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Çözülen veriyi (kullanici id ve rol) req nesnesine ekliyoruz ki sonraki adımlarda kullanabilelim
    req.kullanici = decoded; 
    
    next(); // Her şey yolundaysa kapıyı aç ve asıl işleme (controller'a) geç
  } catch (error) {
    return res.status(401).json({ mesaj: 'Geçersiz veya süresi dolmuş token.' });
  }
};

// 2. Eğitmen Yetkisi Kontrolü (Sadece eğitmenlerin yapabileceği işlemler için)
exports.isInstructor = (req, res, next) => {
  if (req.kullanici && req.kullanici.rol === 'egitmen') {
    next();
  } else {
    return res.status(403).json({ mesaj: 'Bu işlem için eğitmen yetkisine sahip olmalısınız.' });
  }
};

// İhtiyaç duyarsan ileride buraya isAdmin veya isStudent kontrolleri de ekleyebilirsin.