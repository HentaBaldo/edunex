module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define(
    'Review',
    {
      kurs_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      ogrenci_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
      },
      puan: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 5,
        },
      },
      yorum: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'yorumlar',
      indexes: [{ fields: ['ogrenci_id'] }],
    }
  );

  return Review;
};

