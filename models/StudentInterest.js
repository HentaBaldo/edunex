module.exports = (sequelize, DataTypes) => {
  const StudentInterest = sequelize.define(
    'StudentInterest',
    {
      ogrenci_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      kategori_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
    },
    {
      tableName: 'ogrenci_ilgi_alanlari',
      indexes: [{ fields: ['kategori_id'] }],
    }
  );

  return StudentInterest;
};

