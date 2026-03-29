module.exports = (sequelize, DataTypes) => {
  const LessonProgress = sequelize.define(
    'LessonProgress',
    {
      ogrenci_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      ders_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      tamamlandi_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      tamamlanma_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'ders_ilerlemesi',
      indexes: [{ fields: ['ders_id'] }],
    }
  );

  return LessonProgress;
};

