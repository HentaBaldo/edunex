module.exports = (sequelize, DataTypes) => {
  const Quiz = sequelize.define(
    'Quiz',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      ders_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        comment: 'icerik_tipi=quiz olan Lesson ile 1-to-1 ilişki.',
      },
      gecme_puani: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 70,
        comment: 'Geçmek için gereken minimum yüzde (0-100).',
      },
      sure_dakika: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Opsiyonel süre limiti. NULL = süresiz.',
      },
    },
    {
      tableName: 'quizler',
      timestamps: false,
      indexes: [{ unique: true, fields: ['ders_id'] }],
    }
  );
  return Quiz;
};
