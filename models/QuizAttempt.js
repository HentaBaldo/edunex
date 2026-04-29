module.exports = (sequelize, DataTypes) => {
  const QuizAttempt = sequelize.define(
    'QuizAttempt',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      quiz_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      ogrenci_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      puan: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '0-100 yüzde puanı.',
      },
      dogru_sayisi: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      toplam_soru: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      gecti_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: 'quiz_denemeleri',
      indexes: [
        { fields: ['quiz_id', 'ogrenci_id'] },
        { fields: ['ogrenci_id'] },
      ],
    }
  );
  return QuizAttempt;
};
