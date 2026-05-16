const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sequelize, Profile, StudentDetail, InstructorDetail } = require('../models');
const { sendVerificationEmailAsync, sendPasswordResetEmailAsync } = require('../services/emailService');

// === Şifre Sıfırlama Sabitleri ===
// 1 saatlik gecerlilik (kullanici talebi). Daha kisa = guvenli ama UX kotu;
// daha uzun = phishing penceresi acik kalir. 1 saat sektor standardi.
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
// Yeni sifre minimum karakter sayisi — register/login akisinda enforce edilmiyor olabilir
// ama sifre RESET zaten guvenlik akisi oldugu icin burada hard-enforce ediyoruz.
const MIN_PASSWORD_LENGTH = 8;

// Sifre guclulugu: en az 8 karakter + en az bir harf (A-Z/a-z) + en az bir rakam.
// Lookahead'ler sayesinde sira/konum onemli degil; ornekler:
//   "abc12345"  -> gecerli
//   "Sifre2026" -> gecerli
//   "12345678"  -> gecersiz (harf yok)
//   "abcdefgh"  -> gecersiz (rakam yok)
//   "abc1"      -> gecersiz (8 karakter sarti)
const STRONG_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const WEAK_PASSWORD_MESSAGE = 'Şifreniz en az 8 karakter uzunluğunda olmalı, en az bir harf ve bir rakam içermelidir.';

/**
 * Ham reset token'i SHA-256 ile hash'ler. Mail'e HAM, DB'ye HASH gider.
 * Sebep: DB sizintisi durumunda saldirgan tokenlari dogrudan kullanamasin.
 * bcrypt yerine SHA-256 secimi bilincli — token zaten 256-bit entropy'ye sahip,
 * brute-force pratik degil; hashing sadece "data-at-rest" korumasi icin.
 */
function hashResetToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Kullanıcı Kayıt Olma (Register)
 * @route POST /api/auth/register
 * 
 * MANTIK:
 * 1. Yeni Profile (profiller) kaydı oluştur
 * 2. HEMEN SONRA profile rolüne göre detail kaydı oluştur
 *    - Öğrenci ise: StudentDetail (ogrenci_detaylari)
 *    - Eğitmen ise: InstructorDetail (egitmen_detaylari)
 * 3. Transaction ile atomik işlem (hepsi başarılı veya hiçbiri)
 */
exports.register = async (req, res, next) => {
    const t = await sequelize.transaction(); // ✅ Transaction başlat
    
    try {
        const { ad, soyad, eposta, sifre, rol } = req.body;

        // === ADIM 1: Validasyon ===
        if (!ad || !soyad || !eposta || !sifre) {
            const error = new Error('Tüm zorunlu alanlar doldurulmalıdır. (ad, soyad, eposta, sifre)');
            error.statusCode = 400;
            throw error;
        }

        // === ADIM 1b: Sifre Guclulugu (DB sorgusu OLMADAN once) ===
        // typeof kontrolu: JSON body'den number/array/object gelirse regex.test()
        // bunlari coerce ederek beklenmedik sonuc verebilir; en bastan reddediyoruz.
        // throw + catch pattern dosyadaki diger validasyonlarla tutarli — catch
        // blogu transaction'i otomatik rollback eder. Global error handler frontend'e
        // {success:false, message} JSON'unu 400 ile doner.
        if (typeof sifre !== 'string' || !STRONG_PASSWORD_REGEX.test(sifre)) {
            const error = new Error(WEAK_PASSWORD_MESSAGE);
            error.statusCode = 400;
            throw error;
        }

        // E-posta zaten kayıtlı mı?
        const existingUser = await Profile.findOne({ where: { eposta }, transaction: t });

        if (existingUser) {
            const error = new Error('Bu e-posta adresi zaten kayıtlı.');
            error.statusCode = 409;
            throw error;
        }

        // === ADIM 2: Şifreyi Hash'le ===
        const hashedPassword = await bcrypt.hash(sifre, 10);

        // === ADIM 3: Rol Kontrolü & Standartlaştırma ===
        const userRol = rol === 'egitmen' ? 'egitmen' : 'ogrenci';
        console.log(`[AUTH] Yeni kullanıcı kaydı: ${eposta}, Rol: ${userRol}`);

        // === ADIM 4: Profile Tablosuna Kayıt Oluştur ===
        // eposta_onayli_mi default=true (mevcut kullanicilarin kilitlenmemesi icin),
        // bu yuzden YENI kayitlarda EXPLICIT olarak false set edilmek zorunda.
        const newUser = await Profile.create(
            {
                ad,
                soyad,
                eposta,
                sifre: hashedPassword,
                rol: userRol,
                profil_herkese_acik_mi: true,
                alinan_kurslari_goster: true,
                eposta_onayli_mi: false
            },
            { transaction: t } // ✅ Transaction içinde oluştur
        );

        console.log(`[AUTH] Profile oluşturuldu: ${newUser.id}`);

        // === ADIM 5: KRITIK - Role Göre Detail Kaydı Oluştur ===
        
        if (userRol === 'egitmen') {
            // ✅ Eğitmen ise InstructorDetail (egitmen_detaylari) oluştur
            await InstructorDetail.create(
                {
                    kullanici_id: newUser.id,
                    unvan: null,
                    deneyim_yili: 0,
                    iban_no: null,
                    baslik: null,
                    biyografi: null
                },
                { transaction: t } // ✅ Transaction içinde oluştur
            );

            console.log(`[AUTH] InstructorDetail oluşturuldu: ${newUser.id}`);

        } else if (userRol === 'ogrenci') {
            // ✅ Öğrenci ise StudentDetail (ogrenci_detaylari) oluştur
            await StudentDetail.create(
                {
                    kullanici_id: newUser.id,
                    egitim_seviyesi: null,
                    baslik: null,
                    biyografi: null
                },
                { transaction: t } // ✅ Transaction içinde oluştur
            );

            console.log(`[AUTH] StudentDetail oluşturuldu: ${newUser.id}`);
        }

        // === ADIM 6: E-posta Doğrulama Token Üret & Kaydet ===
        const verifyToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 saat

        await newUser.update(
            { onay_tokeni: verifyToken, onay_token_gecerlilik: tokenExpiry },
            { transaction: t }
        );

        // === ADIM 7: Transaction Commit (Hepsi Başarılı) ===
        await t.commit();
        console.log(`[AUTH] Kayıt işlemi tamamlandı: ${newUser.id}`);

        // === ADIM 8: Doğrulama Maili Gönder (Fire & Forget) ===
        // Render Health Check 10sn'lik response limiti var; SMTP donanca register
        // endpoint'i yanit veremiyor ve SIGTERM aliyoruz. Bu yuzden maili arka plana
        // itiyoruz — response hemen 201 doner, mail bg'de gonderilir.
        sendVerificationEmailAsync(eposta, verifyToken);
        console.log(`[AUTH] Doğrulama maili kuyruga alindi: ${eposta}`);

        // === ADIM 9: Başarılı Yanıt ===
        return res.status(201).json({
            success: true,
            message: 'Kayıt işlemi başarıyla tamamlandı. Lütfen e-posta adresinizi doğrulayın.',
            data: {
                id: newUser.id,
                ad: newUser.ad,
                soyad: newUser.soyad,
                eposta: newUser.eposta,
                rol: newUser.rol
            }
        });

    } catch (error) {
        // === ERROR HANDLING: Transaction Rollback ===
        console.error(`[AUTH] Kayıt hatası: ${error.message}`);
        await t.rollback(); // ✅ Hata varsa Transaction'ı geri al
        
        next(error);
    }
};

/**
 * Kullanıcı Girişi (Login)
 * @route POST /api/auth/login
 */
exports.login = async (req, res, next) => {
    try {
        const { eposta, sifre } = req.body;

        // === Validasyon ===
        if (!eposta || !sifre) {
            const error = new Error('E-posta ve şifre zorunludur.');
            error.statusCode = 400;
            throw error;
        }

        console.log(`[AUTH] Giriş denemesi: ${eposta}`);

        // === Kullanıcı Bul ===
        const user = await Profile.findOne({ where: { eposta } });

        if (!user) {
            const error = new Error('E-posta veya şifre hatalı.');
            error.statusCode = 401;
            throw error;
        }

        // === Şifre Kontrol ===
        const isPasswordMatch = await bcrypt.compare(sifre, user.sifre);

        if (!isPasswordMatch) {
            const error = new Error('E-posta veya şifre hatalı.');
            error.statusCode = 401;
            throw error;
        }

        // === E-posta Doğrulama Kontrolü ===
        if (!user.eposta_onayli_mi) {
            const error = new Error('Lütfen giriş yapmadan önce e-posta adresinizi doğrulayın.');
            error.statusCode = 403;
            throw error;
        }

        // === Admin Kontrolü (Admin'ler Admin Portalından Girmeli) ===
        if (user.rol === 'admin') {
            const error = new Error('Yöneticiler admin portalını kullanmalıdır.');
            error.statusCode = 403;
            throw error;
        }

        console.log(`[AUTH] Giriş başarılı: ${user.id} (${user.rol})`);

        // === JWT Token Oluştur ===
        // JWT_SECRET .env'de tanimli degilse jwt.sign cryptic bir hata firlatip 500'e dusuyor.
        // Bunu acik bir mesajla erken yakalayarak debug'i kolaylastiriyoruz.
        if (!process.env.JWT_SECRET) {
            const error = new Error('Sunucu yapilandirma hatasi: JWT_SECRET tanimli degil (.env).');
            error.statusCode = 500;
            throw error;
        }

        const token = jwt.sign(
            { id: user.id, rol: user.rol },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // === Başarılı Yanıt ===
        return res.status(200).json({
            success: true,
            message: 'Giriş başarılı.',
            data: {
                token,
                user: {
                    id: user.id,
                    ad: user.ad,
                    soyad: user.soyad,
                    eposta: user.eposta,
                    rol: user.rol
                }
            }
        });

    } catch (error) {
        // Tam hata detayini (name, message, stack, sql, original) terminale dokuyoruz —
        // 500 dustugunde kok nedeni gormek icin sart.
        console.error('LOGIN ERROR:', error);
        if (error?.original) console.error('LOGIN ERROR (DB original):', error.original);
        next(error);
    }
};

/**
 * Doğrulama Mailini Yeniden Gönder
 * @route POST /api/auth/resend-verification
 *
 * Senaryo:
 *  - register sırasında mail gönderimi başarısız oldu (hesap mahsur kaldı)
 *  - 24 saatlik token süresi doldu
 *
 * Güvenlik:
 *  - Kayıtlı olmayan/zaten doğrulanmış e-postalar için bile 200 dönülür
 *    (e-posta enumeration saldırılarını önler). Sadece gerçekten gerekli
 *    durumlarda yeni token üretilip mail gönderilir.
 */
exports.resendVerification = async (req, res, next) => {
    try {
        const { eposta } = req.body;

        if (!eposta) {
            const error = new Error('E-posta zorunludur.');
            error.statusCode = 400;
            throw error;
        }

        const user = await Profile.findOne({ where: { eposta } });

        // Enumeration koruması — kullanıcı yoksa ya da zaten doğrulanmışsa
        // generic mesajla 200 dön; loglarda iz birakalim ama disariya bilgi sizmasin.
        if (!user) {
            console.log(`[AUTH] Resend istegi — kayitli olmayan e-posta: ${eposta}`);
            return res.status(200).json({
                success: true,
                message: 'Eğer bu e-posta sistemde kayıtlıysa, doğrulama bağlantısı tekrar gönderildi.'
            });
        }

        if (user.eposta_onayli_mi) {
            console.log(`[AUTH] Resend istegi — zaten dogrulanmis: ${eposta}`);
            return res.status(200).json({
                success: true,
                message: 'Eğer bu e-posta sistemde kayıtlıysa, doğrulama bağlantısı tekrar gönderildi.'
            });
        }

        // Yeni token üret ve süreyi 24 saat ileri al
        const newToken = crypto.randomBytes(32).toString('hex');
        const newExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await user.update({
            onay_tokeni: newToken,
            onay_token_gecerlilik: newExpiry,
        });

        // Fire-and-forget — Render Health Check icin senkron beklemeyiz.
        // Enumeration korumasi zaten ustte yapildigi icin generic 200 doneriz.
        // Mail bg'de gonderilir; basarisizsa sadece logda gorunur.
        sendVerificationEmailAsync(eposta, newToken);
        console.log(`[AUTH] Doğrulama maili (resend) kuyruga alindi: ${eposta}`);

        return res.status(200).json({
            success: true,
            message: 'Eğer bu e-posta sistemde kayıtlıysa, doğrulama bağlantısı tekrar gönderildi.'
        });

    } catch (error) {
        console.error('[AUTH] resendVerification hatasi:', error.message);
        next(error);
    }
};

/**
 * E-posta Doğrulama
 * @route GET /api/auth/verify?token=XYZ
 */
exports.verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.query;

        if (!token) {
            const error = new Error('Doğrulama tokeni eksik.');
            error.statusCode = 400;
            throw error;
        }

        const user = await Profile.findOne({ where: { onay_tokeni: token } });

        if (!user) {
            const error = new Error('Geçersiz doğrulama bağlantısı.');
            error.statusCode = 400;
            throw error;
        }

        if (!user.onay_token_gecerlilik || user.onay_token_gecerlilik < new Date()) {
            const error = new Error('Doğrulama bağlantısının süresi dolmuş. Lütfen "Doğrulama Mailini Yeniden Gönder" özelliğini kullanın.');
            error.statusCode = 400;
            throw error;
        }

        await user.update({
            eposta_onayli_mi: true,
            onay_tokeni: null,
            onay_token_gecerlilik: null,
        });

        console.log(`[AUTH] E-posta doğrulandı: ${user.eposta}`);

        return res.redirect('/auth/index.html?verified=true');

    } catch (error) {
        console.error('[AUTH] E-posta doğrulama hatası:', error.message);
        next(error);
    }
};

/**
 * Şifre Sıfırlama Talebi — Mail Gönderimi
 * @route POST /api/auth/forgot-password
 * body: { eposta }
 *
 * GUVENLIK MODELI:
 *  - E-posta enumeration: kullanici var/yok fark etmeksizin AYNI generic 200 mesaji
 *    doner. Aksi halde saldirgan "bu eposta sistemde kayitli mi?" sorusunu cevaplar.
 *  - Token: 32 byte (256-bit) random hex; mail'e HAM, DB'ye SHA-256 hash gider.
 *  - TTL: 1 saat. Eski token aktifken yeni talep gelirse uzerine yazilir (idempotent).
 *  - Mail gonderimi fire-and-forget — response 200 hemen doner, mail bg'de gider
 *    (Render Health Check SIGTERM tetiklenmesin diye).
 */
exports.forgotPassword = async (req, res, next) => {
    try {
        const { eposta } = req.body;

        if (!eposta) {
            const error = new Error('E-posta zorunludur.');
            error.statusCode = 400;
            throw error;
        }

        console.log(`[AUTH] Sifre sifirlama talebi: ${eposta}`);

        const user = await Profile.findOne({ where: { eposta } });

        // === Enumeration koruması ===
        // Kullanici yoksa veya henuz dogrulanmamis bir hesapsa generic 200 doneriz.
        // (Dogrulanmamis hesaba reset linki gondermek anlamsiz; oncelik verify maili.)
        if (!user || !user.eposta_onayli_mi) {
            if (!user) console.log(`[AUTH] Sifre sifirlama — kayitli olmayan eposta: ${eposta}`);
            else console.log(`[AUTH] Sifre sifirlama — dogrulanmamis hesap: ${eposta}`);

            return res.status(200).json({
                success: true,
                message: 'Eğer bu e-posta sistemde kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.'
            });
        }

        // === Token uret & DB'ye HASH'li olarak yaz ===
        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = hashResetToken(rawToken);
        const expires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

        await user.update({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: expires,
        });

        // Fire-and-forget — Render Health Check'i bekletmeyiz.
        sendPasswordResetEmailAsync(eposta, rawToken);
        console.log(`[AUTH] Sifre sifirlama maili kuyruga alindi: ${eposta}`);

        return res.status(200).json({
            success: true,
            message: 'Eğer bu e-posta sistemde kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.'
        });

    } catch (error) {
        console.error('[AUTH] forgotPassword hatasi:', error.message);
        next(error);
    }
};

/**
 * Şifre Sıfırlama — Yeni Şifre Belirleme
 * @route POST /api/auth/reset-password
 * body: { token, newPassword }
 *
 * GUVENLIK MODELI:
 *  - DB'de hash tutuldugu icin gelen ham token SHA-256 ile hash'lenip aranir.
 *    (Frontend daima HAM token gonderir — mail linkindeki query param.)
 *  - Token bulunsa bile resetPasswordExpires kontrolu yapilir.
 *  - Basari sonrasi token alanlari NULL'a cekilir — replay attack onlenir.
 *  - Generic hata mesaji ('Geçersiz veya süresi dolmuş bağlantı') — token vs.
 *    expire ayrimi yapmiyoruz, saldirgana bilgi sizmaz.
 */
exports.resetPassword = async (req, res, next) => {
    try {
        const { token, newPassword } = req.body;

        // === Input Validasyonu ===
        if (!token || !newPassword) {
            const error = new Error('Token ve yeni şifre zorunludur.');
            error.statusCode = 400;
            throw error;
        }

        if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
            const error = new Error(`Yeni şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
            error.statusCode = 400;
            throw error;
        }

        // === Token'i hash'leyip DB'de ara ===
        const hashedToken = hashResetToken(token);

        const user = await Profile.findOne({
            where: { resetPasswordToken: hashedToken }
        });

        // Token bulunamadi VEYA suresi dolmus -> ayni generic mesaj (info leak yok)
        if (!user || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
            const error = new Error('Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen yeni bir talep oluşturun.');
            error.statusCode = 400;
            throw error;
        }

        // === Yeni sifreyi hash'le ve guncelle ===
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await user.update({
            sifre: hashedPassword,
            // Token alanlarini temizle — replay attack ve token reuse engelle.
            resetPasswordToken: null,
            resetPasswordExpires: null,
        });

        console.log(`[AUTH] Sifre basariyla sifirlandi: ${user.eposta}`);

        // NOT: JWT stateless oldugu icin aktif tokenlari sunucu tarafindan invalidate
        // edemiyoruz; ileride blacklist veya "password_changed_at" kontrolu eklenirse
        // burasi tetikleme noktasi olur. Su an: kullanici yeniden login olmali.
        return res.status(200).json({
            success: true,
            message: 'Şifreniz başarıyla güncellendi. Lütfen yeni şifrenizle giriş yapın.'
        });

    } catch (error) {
        console.error('[AUTH] resetPassword hatasi:', error.message);
        next(error);
    }
};