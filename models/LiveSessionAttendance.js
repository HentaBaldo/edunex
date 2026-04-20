module.exports = (sequelize, DataTypes) => {
  const LiveSessionAttendance = sequelize.define(
    'LiveSessionAttendance',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      kullanici_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      canli_oturum_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      toplam_dakika: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      ilk_katilim_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      son_heartbeat_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'oturum_katilimlari',
      indexes: [
        { unique: true, fields: ['kullanici_id', 'canli_oturum_id'] },
        { fields: ['canli_oturum_id'] },
      ],
    }
  );

  return LiveSessionAttendance;
};
