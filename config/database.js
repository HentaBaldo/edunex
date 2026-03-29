const dotenv = require('dotenv');
const { Sequelize } = require('sequelize');

dotenv.config();

const {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_SSL,
  NODE_ENV,
} = process.env;

const sslEnabled =
  String(DB_SSL || '').toLowerCase() === 'true' || NODE_ENV === 'production';

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT ? Number(DB_PORT) : undefined,
  dialect: 'mysql',
  logging: false,
  dialectOptions: sslEnabled
    ? {
        ssl: {
          rejectUnauthorized: true,
        },
      }
    : undefined,
  define: {
    freezeTableName: true,
    underscored: true,
    timestamps: false,
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

module.exports = sequelize;

