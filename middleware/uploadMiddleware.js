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
    // Video dosyaları kabul et
    const validMimes = [
        'video/mp4',
        'video/x-msvideo',
        'video/quicktime',
        'video/x-matroska',
        'video/webm',
        'video/x-ms-wmv',
        'application/octet-stream'  // Bazı tarayıcılar .mp4'ü buna dönüştürüyor
    ];
    
    const validExtensions = /\.(mp4|avi|mov|mkv|webm|flv|wmv|m4v)$/i;
    
    if (validMimes.includes(file.mimetype) || validExtensions.test(file.originalname)) {
        console.log(`[MULTER] Dosya kabul edildi: ${file.originalname} (${file.mimetype})`);
        cb(null, true);
    } else {
        console.error(`[MULTER] Dosya reddedildi: ${file.originalname} (${file.mimetype})`);
        cb(new Error(`Geçersiz dosya tipi: ${file.mimetype}. İzin verilen: MP4, AVI, MOV, MKV, WebM`), false);
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