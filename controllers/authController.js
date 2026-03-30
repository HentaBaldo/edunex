const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sequelize, Profile, StudentDetail, InstructorDetail } = require('../models');

/**
 * Kullanıcı Kayıt (Register)
 * @route POST /api/auth/register
 */
exports.register = async (req, res, next) => {
    const t = await sequelize.transaction();

    try {
        const { ad, soyad, eposta, sifre, rol } = req.body;

        // 1. Veri Doğrulama (Validation)
        if (!ad || !soyad || !eposta || !sifre) {
            const error = new Error('All required fields must be filled.');
            error.statusCode = 400;
            throw error;
        }

        // 2. E-posta Kontrolü
        const existingUser = await Profile.findOne({ where: { eposta } });
        if (existingUser) {
            const error = new Error('This email address is already registered.');
            error.statusCode = 409;
            throw error;
        }

        // 3. Şifre Hashleme
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(sifre, saltRounds);

        // 4. Ana Profil Oluşturma (Admin rolü ile kayıt olunması imkansızlaştırıldı)
        const userRol = rol === 'egitmen' ? 'egitmen' : 'ogrenci';
        const newUser = await Profile.create(
            {
                ad,
                soyad,
                eposta,
                sifre: hashedPassword,
                rol: userRol,
            },
            { transaction: t }
        );

        // 5. Role Dayalı Detay Kaydı
        if (userRol === 'egitmen') {
            await InstructorDetail.create(
                { kullanici_id: newUser.id },
                { transaction: t }
            );
        } else {
            await StudentDetail.create(
                { kullanici_id: newUser.id },
                { transaction: t }
            );
        }

        // 6. Transaction Onaylama
        await t.commit();

        // 7. Başarılı Yanıt
        return res.status(201).json({
            status: 'success',
            message: 'Registration completed successfully.',
            data: {
                id: newUser.id,
                ad: newUser.ad,
                soyad: newUser.soyad,
                eposta: newUser.eposta,
                rol: newUser.rol
            }
        });

    } catch (error) {
        // Hata durumunda transaction geri alma
        if (t) await t.rollback();
        next(error); // Global Error Handler'a pasla
    }
};

/**
 * Kullanıcı Giriş (Login)
 * @route POST /api/auth/login
 */
exports.login = async (req, res, next) => {
    try {
        const { eposta, sifre } = req.body;

        // 1. Girdi Kontrolü
        if (!eposta || !sifre) {
            const error = new Error('Email and password are required.');
            error.statusCode = 400;
            throw error;
        }

        // 2. Kullanıcı Sorgulama
        const user = await Profile.findOne({ where: { eposta } });
        
        // Güvenlik gerekçesiyle hata mesajı her iki durumda da aynıdır
        if (!user) {
            const error = new Error('Invalid email or password.');
            error.statusCode = 401;
            throw error;
        }

        // 3. Şifre Doğrulama
        const isPasswordMatch = await bcrypt.compare(sifre, user.sifre);
        if (!isPasswordMatch) {
            const error = new Error('Invalid email or password.');
            error.statusCode = 401;
            throw error;
        }

        // 🚨 4. GÜVENLİK DUVARI: Yöneticilerin genel portaldan girmesi engellendi
        if (user.rol === 'admin') {
            const error = new Error('Unauthorized access. Admins must use the secure admin portal.');
            error.statusCode = 403;
            throw error;
        }

        // 5. Token Üretimi
        const token = jwt.sign(
            { id: user.id, rol: user.rol },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        // 6. Başarılı Yanıt
        return res.status(200).json({
            status: 'success',
            message: 'Login successful.',
            data: {
                token,
                user: {
                    id: user.id,
                    ad: user.ad,
                    soyad: user.soyad,
                    rol: user.rol
                }
            }
        });

    } catch (error) {
        next(error); // Global Error Handler'a pasla
    }
};