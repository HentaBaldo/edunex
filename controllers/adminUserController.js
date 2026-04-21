const { Profile } = require('../models');

/**
 * Tüm Kullanıcıları Listele (Admin Paneli İçin)
 * @route GET /api/admin/users
 */
exports.getAllUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const rol = req.query.rol || null;

        console.log(`[ADMIN] Kullanıcılar istendi - Sayfa: ${page}, Rol: ${rol}`);

        const where = rol ? { rol } : {};

        const { count, rows } = await Profile.findAndCountAll({
            where,
            attributes: ['id', 'ad', 'soyad', 'eposta', 'rol', 'createdAt'],
            order: [['createdAt', 'DESC']],
            limit,
            offset
        });

        const totalPages = Math.ceil(count / limit);

        return res.status(200).json({
            success: true,
            data: rows,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: count,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error(`[ADMIN] Kullanıcıları listeme hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Kullanıcı Detaylarını Getir
 * @route GET /api/admin/users/:id
 */
exports.getUserDetail = async (req, res, next) => {
    try {
        const { id } = req.params;

        console.log(`[ADMIN] Kullanıcı detayı istendi: ${id}`);

        const user = await Profile.findOne({
            where: { id },
            attributes: ['id', 'ad', 'soyad', 'eposta', 'rol', 'createdAt']
        });

        if (!user) {
            const error = new Error('Kullanıcı bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error(`[ADMIN] Kullanıcı detay hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Kullanıcı Güncelle
 * @route PUT /api/admin/users/:id
 */
exports.updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { ad, soyad, rol } = req.body;

        console.log(`[ADMIN] Kullanıcı güncelleniyor: ${id}`);

        // === VALIDASYON ===
        if (!ad || !soyad || !rol) {
            const error = new Error('Ad, soyad ve rol gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        const validRoles = ['ogrenci', 'egitmen', 'admin'];
        if (!validRoles.includes(rol)) {
            const error = new Error(`Geçersiz rol. İzin verilen: ${validRoles.join(', ')}`);
            error.statusCode = 400;
            throw error;
        }

        // === YETKİ KONTROLÜ: Admin rolü değiştirilemez ===
        const user = await Profile.findOne({ where: { id } });

        if (!user) {
            const error = new Error('Kullanıcı bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (user.rol === 'admin' && rol !== 'admin') {
            const error = new Error('Admin rolü kaldırılamaz.');
            error.statusCode = 403;
            throw error;
        }

        // === GÜNCELLEME ===
        await user.update({ ad, soyad, rol });

        console.log(`[ADMIN] Kullanıcı güncellendi: ${id}`);

        return res.status(200).json({
            success: true,
            message: 'Kullanıcı başarıyla güncellendi.',
            data: user
        });
    } catch (error) {
        console.error(`[ADMIN] Kullanıcı güncelleme hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Kullanıcı Sil
 * @route DELETE /api/admin/users/:id
 */
exports.deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        console.log(`[ADMIN] Kullanıcı siliniyor: ${id}`);

        // === YETKİ KONTROLÜ: Admin silinemez ===
        const user = await Profile.findOne({ where: { id } });

        if (!user) {
            const error = new Error('Kullanıcı bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (user.rol === 'admin') {
            const error = new Error('Admin kullanıcı silinemez.');
            error.statusCode = 403;
            throw error;
        }

        // === SİLME ===
        await user.destroy();

        console.log(`[ADMIN] Kullanıcı silindi: ${id}`);

        return res.status(200).json({
            success: true,
            message: 'Kullanıcı başarıyla silindi.'
        });
    } catch (error) {
        console.error(`[ADMIN] Kullanıcı silme hatası: ${error.message}`);
        next(error);
    }
};

// === MODULE EXPORTS ===
module.exports = {
    getAllUsers: exports.getAllUsers,
    getUserDetail: exports.getUserDetail,
    updateUser: exports.updateUser,
    deleteUser: exports.deleteUser
};