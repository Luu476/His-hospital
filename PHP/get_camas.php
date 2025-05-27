<?php
header('Content-Type: application/json');
$conexion = new PDO("mysql:host=localhost;dbname=hospital", "usuario", "contraseña");

$query = "
SELECT 
  alas.nombre AS ala,
  habitaciones.numero AS habitacion,
  camas.numero AS cama_numero,
  camas.esta_ocupada,
  camas.esta_higienizada,
  pacientes.sexo
FROM camas
JOIN habitaciones ON camas.habitacion_id = habitaciones.id
JOIN alas ON habitaciones.ala_id = alas.id
LEFT JOIN admisiones ON camas.id = admisiones.cama_id AND admisiones.estado = 1
LEFT JOIN pacientes ON admisiones.paciente_id = pacientes.id
ORDER BY ala, habitacion, cama_numero
";

$data = [];
foreach ($conexion->query($query) as $row) {
  $ala = $row['ala'];
  $habitacion = $row['habitacion'];
  $estado = $row['esta_ocupada'] ? 'ocupada' : ($row['esta_higienizada'] ? 'libre' : 'higienizando');

  $data[$ala][$habitacion][] = [
    'numero' => $row['cama_numero'],
    'estado' => $estado,
    'sexo' => $row['sexo']
  ];
}

echo json_encode($data);
?>
