const { Profile } = require('../models');

exports.getAllUsers = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
  
      const users = await Profile.findAndCountAll({
        attributes: { exclude: ['sifre'] },
        limit: limit,
        offset: offset,
        order: [['id', 'DESC']] 
      });
  
      res.status(200).json({
        success: true,
        data: users.rows,
        totalPages: Math.ceil(users.count / limit),
        currentPage: page
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Kullanıcılar getirilirken hata oluştu.', error: error.message });
    }
  };

exports.getUserById = async (req, res) => {
  try {
    const user = await Profile.findByPk(req.params.id, {
      attributes: { exclude: ['sifre'] }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kullanıcı detayı getirilirken hata oluştu.', error: error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await Profile.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    const { rol, ad, soyad, eposta } = req.body;
    
    await user.update({
      rol: rol || user.rol,
      ad: ad || user.ad,
      soyad: soyad || user.soyad,
      eposta: eposta || user.eposta
    });

    const updatedUser = await Profile.findByPk(req.params.id, { attributes: { exclude: ['sifre'] } });

    res.status(200).json({ success: true, message: 'Kullanıcı güncellendi.', data: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kullanıcı güncellenirken hata oluştu.', error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await Profile.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    await user.destroy();

    res.status(200).json({ success: true, message: 'Kullanıcı başarıyla silindi.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Kullanıcı silinirken hata oluştu.', error: error.message });
  }
};