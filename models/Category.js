module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define(
    'Category',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      ad: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      ust_kategori_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: 'kategoriler',
      indexes: [{ fields: ['ust_kategori_id'] }],
    }
  );

  return Category;
};

