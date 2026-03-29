module.exports = (sequelize, DataTypes) => {
  const CourseSection = sequelize.define(
    'CourseSection',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      kurs_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      baslik: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      aciklama: {
        type: DataTypes.TEXT,
        allowNull: true, // Açıklama girmek zorunlu olmasın
      },
      sira_numarasi: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
    },
    {
      tableName: 'kurs_bolumleri',
      indexes: [{ unique: true, fields: ['kurs_id', 'sira_numarasi'] }],
    }
  );

  return CourseSection;
};