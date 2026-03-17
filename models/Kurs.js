const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Kurs = sequelize.define('Kurs', {
    id: {
        type: DataTypes.STRING(36),
        primaryKey: true
    },
    egitmen_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        references: {
            model: 'profiller',
            key: 'id'
        }
    },
    kategori_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'kategoriler',
            key: 'id'
        }
    },
    baslik: {
        type: DataTypes.STRING,
        allowNull: false
    },
    alt_baslik: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: ''
    },
    dil: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Turkce'
    },
    seviye: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'Baslangic'
    },
    fiyat: {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0
    },
    durum: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: 'taslak'
    },
    kazanimlar: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    gereksinimler: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    olusturulma_tarihi: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'kurslar',
    timestamps: false
});

module.exports = Kurs;
