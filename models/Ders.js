const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Ders = sequelize.define('Ders', {
    id: {
        type: DataTypes.STRING(36),
        primaryKey: true
    },
    bolum_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        references: {
            model: 'kurs_bolumleri',
            key: 'id'
        }
    },
    baslik: {
        type: DataTypes.STRING,
        allowNull: false
    },
    aciklama: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    icerik_tipi: {
        type: DataTypes.STRING,
        allowNull: true
    },
    kaynak_url: {
        type: DataTypes.STRING,
        allowNull: true
    },
    video_saglayici_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    sure_saniye: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0
    },
    onizleme_mi: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false
    },
    sira_numarasi: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    }
}, {
    tableName: 'dersler',
    timestamps: false
});

module.exports = Ders;
