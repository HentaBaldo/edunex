const { Kategori } = require('../models');

exports.getKategoriler = async (req, res) => {
    try {
        // Tüm kategorileri veritabanından çekiyoruz
        // ust_kategori_id NULL olanlar Ana Kategori sayılır
        const kategoriler = await Kategori.findAll({
            attributes: ['id', 'ad', 'ust_kategori_id'],
            order: [['ust_kategori_id', 'ASC'], ['ad', 'ASC']]
        });

        res.status(200).json(kategoriler);
    } catch (error) {
        console.error("Kategoriler cekilirken hata:", error.message);
        res.status(500).json({ hata: 'Kategoriler yuklenemedi. Lutfen daha sonra tekrar deneyin.' });
    }
};