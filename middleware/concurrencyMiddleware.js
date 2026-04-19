/**
 * EduNex - Concurrent Request Protection
 * Aynı kullanıcının aynı anda mehrere request göndermesini engelle
 */

const activeRequests = new Map(); // { userId: { courseId: count } }

/**
 * Concurrent upload kontrolü
 * Aynı eğitmen aynı kursa 2 ders aynı anda upload edemez
 */
const preventConcurrentLesson = (req, res, next) => {
    const userId = req.user?.id;
    const courseId = req.params?.courseId;
    
    if (!userId || !courseId) return next();
    
    const key = `${userId}:${courseId}`;
    const currentCount = activeRequests.get(key) || 0;
    
    if (currentCount >= 1) {
        return res.status(429).json({
            success: false,
            message: 'Bu kursa şu an bir ders ekliyorsunuz. Lütfen tamamlanmasını bekleyin.'
        });
    }
    
    // Request başladığını kaydet
    activeRequests.set(key, currentCount + 1);
    
    // Response gönderildikten sonra temizle
    res.on('finish', () => {
        const newCount = activeRequests.get(key) - 1;
        if (newCount <= 0) {
            activeRequests.delete(key);
        } else {
            activeRequests.set(key, newCount);
        }
    });
    
    next();
};

module.exports = { preventConcurrentLesson };