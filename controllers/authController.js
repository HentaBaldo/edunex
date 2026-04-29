const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sequelize, Profile, StudentDetail, InstructorDetail } = require('../models');

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
        const newUser = await Profile.create(
            {
                ad,
                soyad,
                eposta,
                sifre: hashedPassword,
                rol: userRol,
                profil_herkese_acik_mi: true,
                alinan_kurslari_goster: true
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

        // === ADIM 6: Transaction Commit (Hepsi Başarılı) ===
        await t.commit();
        console.log(`[AUTH] Kayıt işlemi tamamlandı: ${newUser.id}`);

        // === ADIM 7: Başarılı Yanıt ===
        return res.status(201).json({
            success: true,
            message: 'Kayıt işlemi başarıyla tamamlandı. Lütfen giriş yapınız.',
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

        // === Admin Kontrolü (Admin'ler Admin Portalından Girmeli) ===
        if (user.rol === 'admin') {
            const error = new Error('Yöneticiler admin portalını kullanmalıdır.');
            error.statusCode = 403;
            throw error;
        }

        console.log(`[AUTH] Giriş başarılı: ${user.id} (${user.rol})`);

        // === JWT Token Oluştur ===
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
        console.error(`[AUTH] Giriş hatası: ${error.message}`);
        next(error);
    }
};