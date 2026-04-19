/**
 * EduNex - Rate Limiting Middleware
 * API endpoints'i DDoS/brute-force saldırılarından koru
 */

const rateLimit = require('express-rate-limit');

// ✅ Helper: User ID al
const getUserId = (req) => req.user?.id || null;

// === GENEL API RATE LIMIT ===
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getUserId(req) || 'anonymous',
    handler: (req, res) => {
        return res.status(429).json({
            success: false,
            message: 'Çok fazla istek gönderildi. Lütfen 15 dakika sonra tekrar deneyin.',
            retryAfter: req.rateLimit.resetTime
        });
    },
    skip: (req) => req.user?.rol === 'admin'
});

// === VIDEO UPLOAD RATE LIMIT ===
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => getUserId(req) || 'anonymous_uploader',
    handler: (req, res) => {
        return res.status(429).json({
            success: false,
            message: 'Çok fazla video yüklediyiniz. Saatte maksimum 10 video yükleyebilirsiniz.',
            retryAfter: req.rateLimit.resetTime
        });
    },
    skip: (req) => req.user?.rol !== 'egitmen'
});

// === LOGIN BRUTE FORCE PROTECTION ===
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => req.body?.eposta || 'anonymous_login',
    handler: (req, res) => {
        return res.status(429).json({
            success: false,
            message: 'Çok fazla başarısız giriş denemesi. Lütfen 15 dakika sonra tekrar deneyin.',
            retryAfter: req.rateLimit.resetTime
        });
    },
    skipSuccessfulRequests: true
});

// === COURSE CREATION RATE LIMIT (Günde 50 kurs) ===
const courseCreateLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,  // 24 saat
    max: 50,  // ✅ 50 KURS GÜNDE
    keyGenerator: (req) => getUserId(req) || 'anonymous_creator',
    handler: (req, res) => {
        return res.status(429).json({
            success: false,
            message: 'Günde maksimum 50 kurs oluşturabilirsiniz. Yarın tekrar deneyebilirsiniz.',
            retryAfter: req.rateLimit.resetTime
        });
    },
    skip: (req) => req.user?.rol === 'admin'
});

// === SECTION CREATION RATE LIMIT ===
const sectionCreateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyGenerator: (req) => getUserId(req) || 'anonymous_section_creator',
    handler: (req, res) => {
        return res.status(429).json({
            success: false,
            message: 'Çok fazla bölüm oluşturmaya çalışıyorsunuz. Lütfen birkaç dakika sonra deneyin.'
        });
    }
});

module.exports = {
    apiLimiter,
    uploadLimiter,
    loginLimiter,
    courseCreateLimiter,
    sectionCreateLimiter
};