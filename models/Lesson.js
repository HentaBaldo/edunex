module.exports = (sequelize, DataTypes) => {
  const Lesson = sequelize.define(
    'Lesson',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      bolum_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      baslik: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      video_saglayici_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      sure_saniye: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      onizleme_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      sira_numarasi: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      aciklama: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      icerik_tipi: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      kaynak_url: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      gizli_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Soft-delete bayragi. true ise ders ogrenciye gosterilmez ve ilerleme hesabindan dusulur.'
      },
      gizlenme_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'dersler',
      indexes: [
        { unique: true, fields: ['bolum_id', 'sira_numarasi'] },
        { fields: ['bolum_id'] },
      ],
    }
  );

  return Lesson;
};

