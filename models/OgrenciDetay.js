const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const OgrenciDetay = sequelize.define('OgrenciDetay', {
   
    kullanici_id: {
        type: DataTypes.STRING(36),
        primaryKey: true,
        allowNull: false,
        
    },
    baslik: {
        type: DataTypes.STRING,
        allowNull: true
    },
    biyografi: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    egitim_seviyesi: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'ogrenci_detaylari',
    timestamps: false
});

module.exports = OgrenciDetay;
