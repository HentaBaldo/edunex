const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sequelize, Profile, StudentDetail, InstructorDetail } = require('../models');

exports.register = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { ad, soyad, eposta, sifre, rol } = req.body;

        if (!ad || !soyad || !eposta || !sifre) {
            const error = new Error('Tüm zorunlu alanlar doldurulmalıdır.');
            error.statusCode = 400;
            throw error;
        }

        const existingUser = await Profile.findOne({ where: { eposta } });
        if (existingUser) {
            const error = new Error('Bu e-posta adresi zaten kayıtlı.');
            error.statusCode = 409;
            throw error;
        }

        const hashedPassword = await bcrypt.hash(sifre, 10);
        const userRol = rol === 'egitmen' ? 'egitmen' : 'ogrenci';

        const newUser = await Profile.create(
            { ad, soyad, eposta, sifre: hashedPassword, rol: userRol },
            { transaction: t }
        );

        if (userRol === 'egitmen') {
            await InstructorDetail.create({ kullanici_id: newUser.id }, { transaction: t });
        } else {
            await StudentDetail.create({ kullanici_id: newUser.id }, { transaction: t });
        }

        await t.commit();

        return res.status(201).json({
            success: true,
            message: 'Kayıt işlemi başarıyla tamamlandı.',
            data: {
                id: newUser.id,
                ad: newUser.ad,
                soyad: newUser.soyad,
                eposta: newUser.eposta,
                rol: newUser.rol
            }
        });

    } catch (error) {
        await t.rollback();
        next(error);
    }
};

exports.login = async (req, res, next) => {
    try {
        const { eposta, sifre } = req.body;

        if (!eposta || !sifre) {
            const error = new Error('E-posta ve şifre zorunludur.');
            error.statusCode = 400;
            throw error;
        }

        const user = await Profile.findOne({ where: { eposta } });
        if (!user) {
            const error = new Error('E-posta veya şifre hatalı.');
            error.statusCode = 401;
            throw error;
        }

        const isPasswordMatch = await bcrypt.compare(sifre, user.sifre);
        if (!isPasswordMatch) {
            const error = new Error('E-posta veya şifre hatalı.');
            error.statusCode = 401;
            throw error;
        }

        if (user.rol === 'admin') {
            const error = new Error('Yöneticiler admin portalını kullanmalıdır.');
            error.statusCode = 403;
            throw error;
        }

        const token = jwt.sign(
            { id: user.id, rol: user.rol },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        return res.status(200).json({
            success: true,
            message: 'Giriş başarılı.',
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
        next(error);
    }
};