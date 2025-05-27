// db.js
import mysql2 from 'mysql2/promise';

const conexion = await mysql2.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'his_hospital'
});

console.log("Conectado a la base de datos desde db.js");
export default conexion;
