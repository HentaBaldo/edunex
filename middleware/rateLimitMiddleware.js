/**
 * EduNex - Rate Limiting Middleware
 * API endpoints'i DDoS/brute-force saldırılarından koru
 */

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// ipKeyGenerator — express-rate-limit v7+ tarafindan saglanan, IPv6-uyumlu
// IP -> key donusturucu. Ham req.ip kullanildiginda IPv6'da farkli /128
// adresler ayni saldirgandan gelse bile farkli bucket'a duser; kutuphane
// bunu engellemek icin ERR_ERL_KEY_GEN_IPV6 firlatir. ipKeyGenerator IPv6
// adresini /64 prefix'e indirip guvenli key uretir.

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

// === PASSWORD RESET RATE LIMIT ===
// Sifre sifirlama akisi (forgot + reset) icin ayri limiter.
// Sebep: loginLimiter req.body.eposta'ya gore key olusturuyor; reset-password
// uc noktasinda eposta yok (token tabanli), tum istekler 'anonymous_login'
// bucket'inda toplanir ve mesru kullanicilari da bloklar.
// Burada IP bazli kontrol yapariz (15 dk / 5 istek).
//
// IPv6 NOTU: express-rate-limit v7+ ham req.ip kullanimini ERR_ERL_KEY_GEN_IPV6
// hatasiyla engelliyor. ipKeyGenerator helper'i IPv6 adresini /64 prefix'e
// indirip ayni subnet'ten gelen istekleri ayni bucket'a yerlestirir. IPv4'e
// dokunmaz (oldugu gibi gecirir). req.ip undefined ise (proxy hatasi vs.)
// helper bos string doner; bu durumda manuel fallback'imizi devreye sokuyoruz.
const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        // Guvenli IP key uretimi (IPv6-uyumlu).
        // DIKKAT: ipKeyGenerator imzasi: (ip, ipv6Subnet?) — 2. arg subnet mask
        // SAYISI'dir (default 56), res DEGIL. res gecersek Address6 constructor'i
        // "Invalid subnet mask" hatasi atip 500 dondurur. Tek argumanla cagiriyoruz.
        const ipKey = ipKeyGenerator(req.ip);
        return ipKey || 'anonymous_pwreset';
    },
    handler: (req, res) => {
        return res.status(429).json({
            success: false,
            message: 'Çok fazla şifre sıfırlama talebi. Lütfen 15 dakika sonra tekrar deneyin.',
            retryAfter: req.rateLimit.resetTime
        });
    }
});

module.exports = {
    apiLimiter,
    uploadLimiter,
    loginLimiter,
    passwordResetLimiter,
    courseCreateLimiter,
    sectionCreateLimiter
};