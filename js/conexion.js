let mysql2 = require("mysql2");

let conexion = mysql2.createConnection({
    host: "localhost", 
    database: "his_hospital",
    user: "root",
    password: ""
});

conexion.connect(function(err){
    if(err){
        throw err;
    }else{
        console.log("conexion exitosa");
    }
});

conexion.end();