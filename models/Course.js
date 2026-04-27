module.exports = (sequelize, DataTypes) => {
  const Course = sequelize.define(
    'Course',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      egitmen_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      kategori_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      baslik: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      alt_baslik: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: '',
      },
      dil: {
        type: DataTypes.ENUM('Turkce', 'Ingilizce'),
        allowNull: true,
        defaultValue: 'Turkce',
      },
      seviye: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: 'Baslangic',
      },
      gereksinimler: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      fiyat: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
      },
      durum: {
        type: DataTypes.ENUM('taslak', 'onay_bekliyor', 'onaylandi', 'yayinda', 'arsiv'),
        allowNull: false,
        defaultValue: 'taslak',
        comment: 'Kurs durumu: taslak (taslak), onay_bekliyor (yönetici onayını bekliyor), onaylandi (onaylanmış), yayinda (yayında), arsiv (arşiv)'
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      kazanimlar: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      son_duzenleme_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Mufredat veya kurs meta verisi son ne zaman degistirildi.'
      },
      onaydan_sonra_duzenlendi_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Onay/yayin durumundayken duzenleme yapildi mi (admin paneline rozet basmak icin).'
      },
    },
    {
      tableName: 'kurslar',
      indexes: [
        { fields: ['egitmen_id'] },
        { fields: ['kategori_id'] },
      ],
    }
  );

  return Course;
};