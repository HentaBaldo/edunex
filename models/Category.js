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
      slug: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      ust_kategori_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      kapak_fotografi: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      aciklama: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      yildiz: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false,
        defaultValue: 0.00,
      },
    },
    {
      tableName: 'kategoriler'
    }
  );

  return Category;
};
