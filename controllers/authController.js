const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sequelize, Profile, StudentDetail, InstructorDetail } = require('../models');
const { sendVerificationEmail } = require('../services/emailService');

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

        // E-posta zaten kayıtlı mı?
        const existingUser = await Profile.findOne(
            { where: { eposta } },
            { transaction: t }
        );

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

        // === ADIM 8: Doğrulama Maili Gönder ===
        // sendVerificationEmail throw etmez; { ok, error } doner — register asla bloklanmaz.
        // Mail gitmezse kullanici resend endpoint'iyle tekrar deneyebilir.
        const mailResult = await sendVerificationEmail(eposta, verifyToken);
        if (mailResult.ok) {
            console.log(`[AUTH] Doğrulama maili gönderildi: ${eposta}`);
        } else {
            console.error(`[AUTH] Doğrulama maili gönderilemedi (${eposta}): ${mailResult.error}`);
        }

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

        // sendVerificationEmail throw etmez; resend'de hatayi kullaniciya bildirmemiz
        // gerekiyor (enumeration zaten ustte handle edildi, burada kullanici dogru).
        const mailResult = await sendVerificationEmail(eposta, newToken);
        if (mailResult.ok) {
            console.log(`[AUTH] Doğrulama maili yeniden gönderildi: ${eposta}`);
        } else {
            console.error(`[AUTH] Resend mail hatasi (${eposta}): ${mailResult.error}`);
            const error = new Error('Mail gönderimi sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
            error.statusCode = 502;
            throw error;
        }

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