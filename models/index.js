const sequelize = require('../config/db');
const Profil = require('./user');
const Kategori = require('./Kategori');
const Kurs = require('./Kurs');
const KursBolum = require('./KursBolum');
const Ders = require('./Ders');
const EgitmenDetay = require('./EgitmenDetay');
const OgrenciDetay = require('./OgrenciDetay');
const OgrenciIlgiAlani = require('./OgrenciIlgiAlani');

// --- ILISKILER ---

// Profil <-> Kurs (Egitmen kurslari)
Profil.hasMany(Kurs, { foreignKey: 'egitmen_id' });
Kurs.belongsTo(Profil, { foreignKey: 'egitmen_id', as: 'egitmen' });

// Kategori <-> Kurs
Kategori.hasMany(Kurs, { foreignKey: 'kategori_id' });
Kurs.belongsTo(Kategori, { foreignKey: 'kategori_id', as: 'kategori' });

// Kurs <-> KursBolum
Kurs.hasMany(KursBolum, { foreignKey: 'kurs_id' });
KursBolum.belongsTo(Kurs, { foreignKey: 'kurs_id' });

// KursBolum <-> Ders
KursBolum.hasMany(Ders, { foreignKey: 'bolum_id' });
Ders.belongsTo(KursBolum, { foreignKey: 'bolum_id' });

// Profil <-> EgitmenDetay
Profil.hasOne(EgitmenDetay, { foreignKey: 'kullanici_id' });
EgitmenDetay.belongsTo(Profil, { foreignKey: 'kullanici_id' });

// Profil <-> OgrenciDetay
Profil.hasOne(OgrenciDetay, { foreignKey: 'kullanici_id' });
OgrenciDetay.belongsTo(Profil, { foreignKey: 'kullanici_id' });

// OgrenciIlgiAlani
Profil.hasMany(OgrenciIlgiAlani, { foreignKey: 'ogrenci_id' });
OgrenciIlgiAlani.belongsTo(Profil, { foreignKey: 'ogrenci_id' });
Kategori.hasMany(OgrenciIlgiAlani, { foreignKey: 'kategori_id' });
OgrenciIlgiAlani.belongsTo(Kategori, { foreignKey: 'kategori_id' });

module.exports = {
    sequelize,
    Profil,
    Kategori,
    Kurs,
    KursBolum,
    Ders,
    EgitmenDetay,
    OgrenciDetay,
    OgrenciIlgiAlani
};
