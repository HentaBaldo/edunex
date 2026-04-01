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

// Sadece resim dosyalarına izin ver
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Lütfen sadece resim dosyası (JPG, PNG vb.) yükleyin.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Maksimum 5 MB
    fileFilter: fileFilter
});

module.exports = upload;