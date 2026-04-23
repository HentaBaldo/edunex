module.exports = (sequelize, DataTypes) => {
  const StudentDetail = sequelize.define(
    'StudentDetail',
    {
      kullanici_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      egitim_seviyesi: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      baslik: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      biyografi: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'ogrenci_detaylari',
      timestamps: false
    }
  );

  return StudentDetail;
};

