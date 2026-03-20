const { Sequelize } = require('sequelize');
require('dotenv').config();

// Sequelize'a .env dosyamızdaki Aiven bilgilerini veriyoruz
const sequelize = new Sequelize(
    process.env.DB_NAME, 
    process.env.DB_USER, 
    process.env.DB_PASSWORD, 
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql', // SQLite yerine MySQL kullanacağımızı belirttik
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false // Aiven'in SSL güvenlik duvarını geçmek için KRİTİK ayar!
            }
        },
        logging: false // Terminali karmaşık SQL sorgularıyla boğmamak için false yapıyoruz
    }
);

module.exports = sequelize;