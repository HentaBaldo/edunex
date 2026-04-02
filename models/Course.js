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
        allowNull: true,
      },
      kategori_id: {
        type: DataTypes.UUID,
        allowNull: true,
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
        type: DataTypes.STRING(255),
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