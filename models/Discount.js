/**
 * Discount Modeli
 *
 * Bir derse veya tüm derslere (ders_id NULL) uygulanabilen indirim kaydı.
 * Iki finansman tarafi vardir:
 *   - 'egitmen'  : indirim eğitmenin gelirinden duser (kendi kursuna)
 *   - 'platform' : indirim platform komisyonundan duser (admin tarafindan)
 *
 * Yuzde_indirim VEYA sabit_indirim'den biri dolu olmalidir (controller validate).
 * Bir derse ayni anda birden fazla aktif indirim bulunabilir; ornegin bir
 * 'egitmen' indirimi + bir 'platform' indirimi additive (toplanarak) uygulanir.
 */
module.exports = (sequelize, DataTypes) => {
  const Discount = sequelize.define(
    'Discount',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // NULL = tum dersler (yalniz admin/platform indirimleri icin)
      ders_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // 1-99 arasi yuzde. NULL ise sabit_indirim dolu olmali.
      yuzde_indirim: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 1, max: 99 },
      },
      // TL cinsinden sabit dususs. NULL ise yuzde_indirim dolu olmali.
      sabit_indirim: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      // Maliyeti kim ustleniyor?
      finansman_tarafi: {
        type: DataTypes.ENUM('egitmen', 'platform'),
        allowNull: false,
        defaultValue: 'egitmen',
      },
      baslik: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      aciklama: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      baslangic: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      bitis: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      aktif_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      olusturan_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      olusturan_rol: {
        type: DataTypes.ENUM('admin', 'egitmen'),
        allowNull: false,
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      guncellenme_tarihi: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'indirimler',
      timestamps: false,
      indexes: [
        { fields: ['ders_id', 'aktif_mi'] },
        { fields: ['finansman_tarafi', 'aktif_mi'] },
      ],
      hooks: {
        beforeUpdate: (rec) => {
          rec.guncellenme_tarihi = new Date();
        },
      },
    }
  );

  return Discount;
};
