import express from "express";
import mysql2 from "mysql2/promise";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3000;

// Necesario para usar __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use((err, req, res, next)=> {
  if(err instanceof SyntaxError && err.status === 400 && 'body' in err){
    console.error('JSON invalido recibido: ', err);
    return res.status(400).json({mensaje: 'JSON invalido'});
  }
  next();
});
app.use(express.static('public'));
app.use("/css", express.static(path.join(__dirname, "../css")));
app.use(express.static(path.join(__dirname, "img")));
app.use(express.static(path.join(__dirname, "../"))); // para las camas

// Conexión global
let conexion;

try {
  conexion = await mysql2.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'his_hospital'
  });
  console.log('Conectado a la base de datos MySQL');
} catch (err) {
  console.error('Error al conectar a la base de datos:', err);
  process.exit(1);
}

// Ruta para verificar DNI
app.get('/verificar-dni/:dni', async (req, res) => {
  try {
    const dni = req.params.dni;
    const [results] = await conexion.execute('SELECT * FROM pacientes WHERE dni = ?', [dni]);
    res.json({ existe: results.length > 0, paciente: results[0] || null });
  } catch (error) {
    console.error('Error en la consulta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para agregar paciente
app.post("/agregar-paciente", async (req, res) => {
  console.log('POST /agregar-paciente recibido');
  console.log('Body: ', req.body);
  const { dni, nombre, fecha, direcc, contacto, sexo, derivado, telefono } = req.body;

  // Validar el sexo antes de formatear
  let sexoFormateado;
  if (sexo === 'masculino') {
    sexoFormateado = 'M';
  } else if (sexo === 'femenino') {
    sexoFormateado = 'F';
  } else {
    return res.status(400).json({ mensaje: "Sexo inválido. Debe ser 'masculino' o 'femenino'" });
  }

  if (!dni || !nombre || !fecha || !direcc || !contacto || !telefono) {
    return res.status(400).json({ mensaje: "Faltan datos obligatorios" });
  }

  try {
    const sql = `
      INSERT INTO pacientes 
      (dni, nombre_completo, fecha_nacimiento, direccion, contacto_emergencia, sexo, derivado, telefono) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    await conexion.execute(sql, [dni, nombre, fecha, direcc, contacto, sexoFormateado, derivado ? 1 : 0, telefono]);

    res.status(200).json({ mensaje: 'Paciente guardado correctamente' });
  } catch (err) {
    console.error('Error al guardar el paciente:', err);
    res.status(500).json({ mensaje: 'Error al guardar el paciente' });
  }
});

app.get('/pacientes-disponibles', async (req, res) => {
  try {
    const [pacientes] = await conexion.execute('SELECT dni, nombre_completo FROM pacientes');
    res.status(200).json(pacientes);
  } catch (error) {
    console.error('Error al obtener pacientes:', error);
    res.status(500).json({ mensaje: 'Error al obtener pacientes' });
  }
});


// Ruta para obtener camas con estado
app.get("/camas-disponibles", async (req, res) => {
  try {
    const [camas] = await conexion.execute(`
      SELECT camas.id, camas.estado, habitaciones.id AS habitacion_id, alas.nombre AS ala_nombre
      FROM camas
      JOIN habitaciones ON camas.habitacion_id = habitaciones.id
      JOIN alas ON habitaciones.ala_id = alas.id
    `);
    
    res.status(200).json(camas);
  } catch (error) {
    console.error('Error al obtener las camas:', error);
    res.status(500).json({ mensaje: 'Error al obtener las camas' });
  }
});

app.get("/camas-ocupadas", async (req, res) => {
  try {
    const [camas] = await conexion.execute(`
      SELECT camas.id, camas.estado, habitaciones.id AS habitacion_id, alas.nombre AS ala_nombre
      FROM camas
      JOIN habitaciones ON camas.habitacion_id = habitaciones.id
      JOIN alas ON habitaciones.ala_id = alas.id
      WHERE camas.estado = 'ocupada'
    `);
    
    res.status(200).json(camas);
  } catch (error) {
    console.error('Error al obtener camas ocupadas:', error);
    res.status(500).json({ mensaje: 'Error al obtener camas ocupadas' });
  }
});

app.get("/camas-libres", async (req, res) => {
  try {
    const [camas] = await conexion.execute(`
      SELECT camas.id, camas.estado, habitaciones.id AS habitacion_id, alas.nombre AS ala_nombre
      FROM camas
      JOIN habitaciones ON camas.habitacion_id = habitaciones.id
      JOIN alas ON habitaciones.ala_id = alas.id
      WHERE camas.estado = 'libre'
    `);
    
    res.status(200).json(camas);
  } catch (error) {
    console.error('Error al obtener camas libres:', error);
    res.status(500).json({ mensaje: 'Error al obtener camas libres' });
  }
});



app.post("/asignar-cama", async (req, res) => {
  const { paciente_id, cama_id } = req.body;

  if (!paciente_id || !cama_id) {
    return res.status(400).json({ mensaje: "Faltan datos necesarios" });
  }

  try {
    // Verificar que el paciente no tenga una asignación activa
    const [asignacionActiva] = await conexion.execute(`
      SELECT * FROM asignaciones_camas 
      WHERE paciente_id = ? AND fecha_alta IS NULL
    `, [paciente_id]);

    if (asignacionActiva.length > 0) {
      return res.status(400).json({ mensaje: 'El paciente ya tiene una cama asignada y no ha sido dado de alta.' });
    }

    // Verificar que la cama esté libre
    const [[cama]] = await conexion.execute('SELECT estado, habitacion_id FROM camas WHERE id = ?', [cama_id]);

    if (!cama) {
      return res.status(404).json({ mensaje: 'Cama no encontrada' });
    }

    if (cama.estado !== 'libre') {
      return res.status(400).json({ mensaje: 'La cama no está disponible.' });
    }

    // Obtener sexo del paciente
    const [[paciente]] = await conexion.execute('SELECT sexo FROM pacientes WHERE dni = ?', [paciente_id]);
    if (!paciente) {
      return res.status(404).json({ mensaje: "Paciente no encontrado" });
    }
    const sexoPaciente = paciente.sexo;

    // Buscar otra cama ocupada en la misma habitación
    const [ocupaciones] = await conexion.execute(`
      SELECT p.sexo
      FROM asignaciones_camas ac
      JOIN camas c ON ac.cama_id = c.id
      JOIN pacientes p ON ac.paciente_id = p.dni
      WHERE c.habitacion_id = ? AND ac.fecha_alta IS NULL
    `, [cama.habitacion_id]);

    if (ocupaciones.length > 0) {
      const mismoSexo = ocupaciones.every(o => o.sexo === sexoPaciente);
      if (!mismoSexo) {
        return res.status(400).json({ mensaje: "Solo se permiten pacientes del mismo sexo en habitaciones dobles." });
      }
    }

    // Asignar cama
    await conexion.execute('UPDATE camas SET estado = "ocupada" WHERE id = ?', [cama_id]);
    await conexion.execute(`
      INSERT INTO asignaciones_camas (paciente_id, cama_id, fecha_asignacion)
      VALUES (?, ?, NOW())
    `, [paciente_id, cama_id]);

    res.status(200).json({ mensaje: 'Cama asignada correctamente al paciente.' });

  } catch (error) {
    console.error('Error al asignar cama:', error);
    res.status(500).json({ mensaje: 'Error al asignar cama' });
  }
});

app.get("/test-ocupar/:id", async (req, res) => {
  try {
    await conexion.execute('UPDATE camas SET estado = "ocupada" WHERE id = ?', [req.params.id]);
    res.send("Cama actualizada a ocupada.");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al actualizar cama.");
  }
});

//dar alta al paciente
app.post("/dar-alta", async (req, res) => {
  const { paciente_id } = req.body;

  if (!paciente_id) {
    return res.status(400).json({ mensaje: "Paciente ID requerido" });
  }

  try {
    // Buscar asignación activa
    const [asignacion] = await conexion.execute(`
      SELECT * FROM asignaciones_camas 
      WHERE paciente_id = ? AND fecha_alta IS NULL
    `, [paciente_id]);

    if (asignacion.length === 0) {
      return res.status(404).json({ mensaje: "No hay asignación activa para este paciente" });
    }

    const cama_id = asignacion[0].cama_id;

    // Marcar la fecha de alta
    await conexion.execute(`
      UPDATE asignaciones_camas 
      SET fecha_alta = NOW() 
      WHERE id = ?
    `, [asignacion[0].id]);

    // Liberar la cama
    await conexion.execute(`
      UPDATE camas 
      SET estado = 'libre' 
      WHERE id = ?
    `, [cama_id]);

    res.status(200).json({ mensaje: "Alta realizada y cama liberada" });
  } catch (error) {
    console.error("Error al dar alta:", error);
    res.status(500).json({ mensaje: "Error al dar de alta al paciente" });
  }
});

//lista de pacientes
// Ruta para obtener pacientes con asignación activa
app.get("/pacientes-internados", async (req, res) => {
  try {
    const [internados] = await conexion.execute(`
      SELECT p.dni, p.nombre_completo, ac.id AS asignacion_id, ac.cama_id, ac.fecha_asignacion
      FROM pacientes p
      JOIN asignaciones_camas ac ON p.dni = ac.paciente_id
      WHERE ac.fecha_alta IS NULL
    `);

    res.json(internados);
  } catch (error) {
    console.error("Error al obtener pacientes internados:", error);
    res.status(500).json({ mensaje: "Error al obtener pacientes internados" });
  }
});


//medicos
app.get("/medicos", async (req, res) => {
  try {
    const [medicos] = await conexion.execute(`
      SELECT dni, nombre, correo, sexo, matricula, especialidad
      FROM medicos
      WHERE estado = 1
    `);
    console.log("Médicos activos:", medicos);
    res.status(200).json(medicos);
  } catch (error) {
    console.error("Error al obtener médicos:", error);
    res.status(500).json({ mensaje: "Error al obtener médicos" });
  }
});

// Ruta para agregar médico
app.post('/api/medicos', async (req, res) => {
  try {
    const { dni, nombre, correo, sexo, matricula, especialidad } = req.body;

    // Validaciones básicas
    if (!dni || !nombre || !correo || !sexo || !matricula || !especialidad) {
      return res.status(400).json({ message: 'Faltan datos obligatorios' });
    }

    // Validar sexo (puedes ajustar si tienes otros valores)
    if (!['Masculino', 'Femenino'].includes(sexo)) {
      return res.status(400).json({ message: 'Sexo inválido' });
    }

    // Insertar en la base de datos
    const sql = `
      INSERT INTO medicos (dni, nombre, correo, sexo, matricula, especialidad)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await conexion.execute(sql, [dni, nombre, correo, sexo, matricula, especialidad]);

    res.status(201).json({ message: 'Médico agregado correctamente' });
  } catch (error) {
    console.error('Error al agregar médico:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});


//editar medico
app.get('/api/medicos/:dni', async (req, res) => {
  try {
    const dni = req.params.dni;
    const [rows] = await conexion.execute('SELECT * FROM medicos WHERE dni = ?', [dni]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Médico no encontrado' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});
app.put('/api/medicos/:dni', async (req, res) => {
  try {
    const dni = req.params.dni;
    const { nombre, correo, sexo, matricula, especialidad } = req.body;

    // Validar que existan los campos obligatorios
    if (!nombre || !correo || !sexo || !matricula || !especialidad) {
      return res.status(400).json({ message: 'Faltan datos obligatorios' });
    }

    // Validar sexo
    if (!['Masculino', 'Femenino'].includes(sexo)) {
      return res.status(400).json({ message: 'Sexo inválido' });
    }

    const sql = `
      UPDATE medicos
      SET nombre = ?, correo = ?, sexo = ?, matricula = ?, especialidad = ?
      WHERE dni = ?
    `;
    const [result] = await conexion.execute(sql, [nombre, correo, sexo, matricula, especialidad, dni]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Médico no encontrado' });
    }

    res.json({ message: 'Médico actualizado correctamente' });
  } catch (error) {
    console.error('Error al actualizar médico:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

//eliminar medico


app.delete('/api/medicos/:dni', async (req, res) => {
  try {
    const dni = req.params.dni;
    const [result] = await conexion.execute('UPDATE medicos SET estado = 0 WHERE dni = ?', [dni]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Médico no encontrado' });
    }
    res.json({ message: 'Médico dado de baja' });
  } catch (error) {
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});


// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
