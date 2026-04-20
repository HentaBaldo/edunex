/**
 * EduNex Upload Middleware
 * FormData ve dosya yüklemeleri için Multer konfigürasyonu
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Yükleme dizini
const uploadDir = path.join(__dirname, '../uploads/temp');

// Dizin yoksa oluştur
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// === STORAGE CONFIGURATION ===
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

// === FILE FILTER ===
const fileFilter = (req, file, cb) => {
    
    // 1. Profil Fotoğrafı Yüklemesi İçin Kontrol
    if (file.fieldname === 'avatar') {
        const validImageMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (validImageMimes.includes(file.mimetype)) {
            return cb(null, true);
        }
        return cb(new Error('Geçersiz format! Profil için sadece JPG, PNG veya WEBP yükleyebilirsiniz.'), false);
    }

    // 2. Ders İçeriği (Video, PDF, Word, Quiz Resmi vb.) İçin Kontrol
    const validLessonMimes = [
        // Videolar
        'video/mp4', 'video/x-msvideo', 'video/quicktime', 'video/x-matroska', 'video/webm', 'application/octet-stream',
        // Belgeler
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
        'application/vnd.ms-powerpoint', 
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
        // Quiz için Resimler
        'image/jpeg', 'image/jpg', 'image/png'
    ];
    
    const validExtensions = /\.(mp4|avi|mov|mkv|webm|pdf|doc|docx|ppt|pptx|jpg|jpeg|png)$/i;
    
    if (validLessonMimes.includes(file.mimetype) || validExtensions.test(file.originalname)) {
        cb(null, true);
    } else {
        cb(new Error(`Geçersiz ders dosyası tipi. Video, PDF, Word, PPT veya Resim yükleyebilirsiniz.`), false);
    }
};

// === MULTER CONFIGURATION ===
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 4 * 1024 * 1024 * 1024  // 4GB
    }
});

// === ERROR HANDLER WRAPPER ===
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
            return res.status(413).json({
                success: false,
                message: `Dosya çok büyük. Maksimum: 4GB`
            });
        }
        return res.status(400).json({
            success: false,
            message: `Dosya yükleme hatası: ${err.message}`
        });
    } else if (err) {
        return res.status(400).json({
            success: false,
            message: err.message || 'Dosya yükleme hatası'
        });
    }
    next();
};

// ✅ EXPORT
module.exports = upload;