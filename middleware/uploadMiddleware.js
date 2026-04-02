const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Kayıt edilecek klasör yolu (public/uploads/avatars)
const uploadDir = path.join(__dirname, '../public/uploads/avatars');

// Klasör yoksa otomatik oluştur
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer disk depolama ayarları
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Dosya ismini benzersiz yap: avatar-kullaniciId-zamanDamgasi.uzanti
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'avatar-' + req.user.id + '-' + uniqueSuffix + ext);
    }
});

// Sadece izin verilen MIME türleri
const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];

// Sadece izin verilen dosya uzantıları
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

// Güvenlik açısından iyileştirilmiş fileFilter
const fileFilter = (req, file, cb) => {
    // 1. MIME type kontrolü (whitelist)
    if (!allowedMimes.includes(file.mimetype)) {
        return cb(new Error('Geçersiz dosya türü. Sadece JPEG, PNG ve WebP destekleniyor.'), false);
    }
    
    // 2. Dosya uzantısı kontrolü (spoofing saldırılarını engelle)
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
        return cb(new Error(`Geçersiz dosya uzantısı: ${ext}. Sadece .jpg, .jpeg, .png, .webp destekleniyor.`), false);
    }
    
    // 3. MIME type ile uzantı uyuşması kontrolü
    const mimeToExt = {
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/webp': ['.webp']
    };
    
    if (!mimeToExt[file.mimetype].includes(ext)) {
        return cb(new Error('Dosya adı ile MIME type uyuşmuyor. Dosya tahrif edilmiş olabilir.'), false);
    }
    
    cb(null, true);
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB sınırı
    }
});

module.exports = upload;