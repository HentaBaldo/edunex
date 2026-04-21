/**
 * EduNex BunnyCDN Service - PRODUCTION READY
 * Rollback, Error Handling, Video Processing Monitoring
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const LIBRARY_ID = process.env.BUNNY_LIBRARY_ID;
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const API_TIMEOUT = process.env.BUNNY_API_TIMEOUT || 30000;
const MAX_VIDEO_SIZE = process.env.MAX_VIDEO_SIZE || 4 * 1024 * 1024 * 1024; // 4GB

// === VALIDATION ===
if (!LIBRARY_ID || !ACCESS_KEY) {
    const err = '[BUNNY SERVICE] KRITIK: BunnyCDN API kimlik bilgileri eksik (.env)';
    console.error(err);
    // Production'da kilitlenmeliyiz
    if (process.env.NODE_ENV === 'production') {
        throw new Error(err);
    }
}

// === BUNNY API CLIENT ===
const bunnyAPI = axios.create({
    baseURL: `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos`,
    headers: { AccessKey: ACCESS_KEY },
    timeout: API_TIMEOUT
});

// === ERROR HANDLER ===
bunnyAPI.interceptors.response.use(
    response => response,
    error => {
        const errorData = {
            status: error.response?.status,
            message: error.response?.data?.message || error.message,
            timestamp: new Date().toISOString()
        };
        
        console.error('[BUNNY API ERROR]', JSON.stringify(errorData));
        
        // Kategorize hata
        if (error.response?.status === 429) {
            const rateLimitErr = new Error('Bunny.net API rate limiti aşıldı. Lütfen birkaç dakika sonra deneyin.');
            rateLimitErr.statusCode = 429;
            throw rateLimitErr;
        }
        
        if (error.response?.status === 401 || error.response?.status === 403) {
            const authErr = new Error('Bunny.net API anahtarı geçersiz. Admin kontrol edin.');
            authErr.statusCode = 500;
            throw authErr;
        }
        
        if (error.code === 'ECONNABORTED') {
            const timeoutErr = new Error('Bunny.net bağlantısı zaman aşımına uğradı. Dosya çok büyük olabilir.');
            timeoutErr.statusCode = 408;
            throw timeoutErr;
        }
        
        throw error;
    }
);

/**
 * Video dosyasının boyutunu ve MIME type'ını kontrol et
 * @param {string} filePath - Dosya yolu
 * @returns {Promise<{size: number, mime: string}>}
 */
const validateVideoFile = async (filePath) => {
    try {
        const stats = fs.statSync(filePath);
        const size = stats.size;
        
        // Boyut kontrolü
        if (size > MAX_VIDEO_SIZE) {
            throw new Error(
                `Dosya çok büyük (${(size / 1024 / 1024 / 1024).toFixed(2)}GB). ` +
                `Maksimum: ${(MAX_VIDEO_SIZE / 1024 / 1024 / 1024).toFixed(2)}GB`
            );
        }
        
        if (size === 0) {
            throw new Error('Dosya boş. Lütfen geçerli bir video dosyası seçin.');
        }
        
        // MIME type kontrolü (basit)
        const ext = path.extname(filePath).toLowerCase();
        const validExtensions = ['.mp4', '.mkv', '.mov', '.avi', '.webm', '.flv', '.wmv'];
        
        if (!validExtensions.includes(ext)) {
            throw new Error(
                `Geçersiz dosya tipi (${ext}). ` +
                `İzin verilenleri: ${validExtensions.join(', ')}`
            );
        }
        
        return {
            size,
            extension: ext
        };
    } catch (error) {
        throw new Error(`Video dosyası doğrulama başarısız: ${error.message}`);
    }
};

/**
 * Bunny.net'te yeni video kaydı oluştur (GUID al)
 * @param {string} title - Video başlığı
 * @returns {Promise<string>} Video GUID
 */
const createVideoEntry = async (title) => {
    try {
        const response = await bunnyAPI.post('', { title });
        const videoGuid = response.data?.guid;
        
        if (!videoGuid) {
            throw new Error('Bunny API geçersiz yanıt döndü (guid eksik)');
        }
        
        console.log(`[BUNNY] Yeni video kaydı oluşturuldu: ${videoGuid}`);
        return videoGuid;
    } catch (error) {
        throw new Error(`Video kaydı oluşturulurken hata: ${error.message}`);
    }
};

/**
 * Video dosyasını Bunny.net'e yükle
 * @param {string} filePath - Dosya yolu
 * @param {string} videoGuid - Video GUID
 * @returns {Promise<void>}
 */
const uploadVideoFile = async (filePath, videoGuid) => {
    try {
        const fileStream = fs.createReadStream(filePath);
        
        // Stream'i API'ye gönder
        await bunnyAPI.put(`/${videoGuid}`, fileStream, {
            headers: {
                'Content-Type': 'application/octet-stream'
            }
        });
        
        console.log(`[BUNNY] Video dosyası yüklendi: ${videoGuid}`);
    } catch (error) {
        throw new Error(`Video yükleme başarısız: ${error.message}`);
    }
};

/**
 * Video processing durumunu kontrol et (Polling)
 * @param {string} videoGuid - Video GUID
 * @param {number} maxAttempts - Maksimum kontrol sayısı (default: 60 = 5 dakika)
 * @returns {Promise<boolean>} true = Ready, false = Still Processing
 */
const checkVideoStatus = async (videoGuid, maxAttempts = 60) => {
    try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const response = await bunnyAPI.get(`/${videoGuid}`);
            const videoStatus = response.data?.status;
            
            console.log(`[BUNNY] Video status kontrol (${attempt}/${maxAttempts}): ${videoStatus}`);
            
            if (videoStatus === 'finished' || videoStatus === 'ready') {
                console.log(`[BUNNY] Video hazır: ${videoGuid}`);
                return true;
            }
            
            if (videoStatus === 'error') {
                throw new Error(`Bunny.net video processing başarısız: ${response.data?.message}`);
            }
            
            // Waiting for processing... (transcoding vb.)
            // 5 saniye bekle
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
        
        // Timeout: İşlem hala devam ediyor
        console.warn(`[BUNNY] Video processing 5 dakikayı aştı: ${videoGuid}`);
        return false;
    } catch (error) {
        throw new Error(`Video status kontrolü başarısız: ${error.message}`);
    }
};

/**
 * Video'yu Bunny.net'ten sil (Rollback için)
 * @param {string} videoGuid - Video GUID
 * @returns {Promise<void>}
 */
const deleteVideo = async (videoGuid) => {
    try {
        await bunnyAPI.delete(`/${videoGuid}`);
        console.log(`[BUNNY] Video silindi (Rollback): ${videoGuid}`);
    } catch (error) {
        // Silme başarısız olsa da devam et, log'a kaydet
        console.error(`[BUNNY] Video silme başarısız (Rollback): ${videoGuid} - ${error.message}`);
    }
};

/**
 * ANA FONKSIYON: Video'yu Bunny.net'e yükle (FULL ERROR HANDLING)
 * @param {string} filePath - Sunucudaki geçici dosya yolu
 * @param {string} title - Video başlığı (Bunny Library'de görünecek)
 * @returns {Promise<{guid: string, title: string, uploadedAt: Date}>}
 * @throws {Error} Upload başarısız ise
 */
const uploadVideoToBunny = async (filePath, title) => {
    let videoGuid = null;
    let fileDeleted = false;
    
    try {
        console.log(`[BUNNY UPLOAD] Başlangıç: ${filePath}`);
        
        // === ADIM 1: Video dosyasını doğrula ===
        const fileInfo = await validateVideoFile(filePath);
        console.log(`[BUNNY UPLOAD] Dosya doğrulandı: ${fileInfo.size} bytes, ${fileInfo.extension}`);
        
        // === ADIM 2: Bunny'de yeni video kaydı oluştur ===
        videoGuid = await createVideoEntry(title);
        
        // === ADIM 3: Video dosyasını yükle ===
        await uploadVideoFile(filePath, videoGuid);
        
        // === ADIM 4: Geçici dosyayı sil ===
        fs.unlinkSync(filePath);
        fileDeleted = true;
        console.log(`[BUNNY UPLOAD] Geçici dosya silindi: ${filePath}`);
        
        // === ADIM 5: Video processing durumunu kontrol et (3 dakika bekle) ===
        const isReady = await checkVideoStatus(videoGuid, 36); // 36 * 5 saniye = 3 dakika
        
        if (!isReady) {
            console.warn(
                `[BUNNY UPLOAD] Video işleme devam ediyor (5 dakikayı aştı). ` +
                `GUID: ${videoGuid} - Frontend'de "Processing" durumu göster`
            );
        }
        
        // === BAŞARILI DÖNÜŞ ===
        const result = {
            guid: videoGuid,
            title: title,
            uploadedAt: new Date(),
            processingComplete: isReady,
            message: isReady 
                ? 'Video başarıyla yüklendi ve hazır'
                : 'Video yüklendi, şu an işleniyor (5+ dakika sürebilir)'
        };
        
        console.log(`[BUNNY UPLOAD] BAŞARILI: ${JSON.stringify(result)}`);
        return result;
        
    } catch (error) {
        // === ERROR HANDLING: ROLLBACK ===
        console.error(`[BUNNY UPLOAD] HATA: ${error.message}`);
        
        // Video GUID oluşturulduysa Bunny'de sil
        if (videoGuid) {
            await deleteVideo(videoGuid);
        }
        
        // Geçici dosya hala var ise sil
        if (!fileDeleted && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[BUNNY UPLOAD] Rollback: Geçici dosya silindi`);
        }
        
        // Öz hata at
        throw error;
    }
};

/**
 * Var olan video'yu güncelle (METADATA ONLY - dosya yükleme yok)
 * @param {string} videoGuid - Video GUID
 * @param {object} metadata - Güncellenecek metadata (title, description vb.)
 * @returns {Promise<object>}
 */
const updateVideoMetadata = async (videoGuid, metadata) => {
    try {
        const response = await bunnyAPI.post(`/${videoGuid}`, metadata);
        console.log(`[BUNNY] Video metadata güncellendi: ${videoGuid}`);
        return response.data;
    } catch (error) {
        throw new Error(`Video metadata güncelleme başarısız: ${error.message}`);
    }
};

module.exports = {
    uploadVideoToBunny,
    updateVideoMetadata,
    checkVideoStatus,
    deleteVideo,
    validateVideoFile
};