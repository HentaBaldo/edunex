module.exports = (sequelize, DataTypes) => {
  const CourseEnrollment = sequelize.define(
    'CourseEnrollment',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      ogrenci_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      kurs_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      siparis_kalemi_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      ilerleme_yuzdesi: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      kayit_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'kurs_kayitlari',
      indexes: [
        { unique: true, fields: ['ogrenci_id', 'kurs_id'] },
        { fields: ['kurs_id'] },
        { fields: ['siparis_kalemi_id'] },
      ],
    }
  );

  return CourseEnrollment;
};

