# Contexto

Actualmente no esta funcionando correctamente el obtener el usuario en los metodos que requieren autorizacion.
Al hacer login obtenemos un token que enviamos en la respuesta. Despues en un pedido que no tenga el @Public se necesita validar ese token.
Hay confusion en los que esta haciendo el modulo common, ya que existe otra archivo jwt-strategy.ts en la carpeta guards del modulo auth.
Se necesita que los endpoint que marquemos como @Public no pidan el token y los que que no tengan tengan se necesite el token.

## Modulos con token requerido

- accounts
- categories
- dashboard
- imports
- transactions
- users
- transfers
- statistics
- health

## Modulos sin tokens requeridos

- auth (excepto /me /logout)
- integrations
- imports

`COMMON ES EL QUE ME CONFUNDE`

# Tarea

1. Quiero que corrigas el tema de obtener el usuario una vez que se haya iniciado sesion.
2. Quiero que soluciones el tema del token en cada uno de los metodos y modulos que señale
3. Quiero que elimines los archivos que veas que ya no son necesarios o son redundantes que esten relacionados a este tema
4. Quiero que crees un test en el que se pruebe el login (no requiere token) -> obtener token -> llamar al GET categories (que requiere token) para ver si todo esta funcionando correctamente y elimines el resto de test.
5. Crear un archivo MEMORY.md donde me muestres todos los cambios que realizaste junto a informacion que deba saber.

---

# Task 2

# Contexto

Actualmente vi que en la base de datos existen dos tablas que en terminos de negocio seran la misma estas son Categoria y Subcategoria.
Quiero cambiar esta duplicidad para que tenga una relacion jerarquica (lista de adyacencia)

El backend debera:

## Subcategorias

- Crear una subcategoria -> endpoint api/v1/subcategories (pasar obligatorio parentCategoryId, nombre)
  - El sistema debe verificar que el parentCategoryId esta en la tabla Category y que el campo parentCategoryId sea null (solo permitir dos niveles de jerarquia)
  - Debe obtener la informacion de ese Category (color, icono)
  - Debe crear una nueva Category pero esta vez con el parentCategoryId que recibimos, el mismo icono, aplicar degrado al campo color (explico en el siguiente punto)
- Editar solo el nombre de la subcategoria
- Traer todas las subcategorias de una categoryId

### Variacion de color

- Si el padre no tiene una subcategoria aplicar degradado del color, por ejemplo de "#FF5733" -> "#ff7e61", si ya tiene una subcategoria obtener la mas actual y degradar ese color.

# Tarea

1. Cambia el schema de prisma para implementar esta nueva logica
2. Crea los nuevos endpoint para crear subcategoria
3. Implementar autenticacion JWT para los nuevos endpoints
4. Aplicar nueva migracion a la base de datos
5. Incluir en el seed la siguiente categoria: Prestamos | subcategorias: Juan Pablo, Ana.
6. Quiero que crees un test en el que se pruebe el login (no requiere token) -> obtener token -> y probar los nuevos endpoints (muestrame en consola los valores que retorne las respuestas de los endpoints )

# Task 3

# Contexto

La base de datos cambio para que subcategorias exista en la misma tabla categories, añadiendo un parendId, por lo que cambiamos la logica para
crear categorias y subcategorias.

Actualmente no estan funcionando correctamente los siguientes endpoints:

## GET /categories

- Para listar las categorias se estan devolviendo categorias con un parenId lleno, eso no puede suceder solo debe retornar categorias con parentId null y sus subcategorias.
- Debe devolver las categorias globales userId null y las que esten asociadas a el user logado
- Puede haber casos en que el usuario cree subcategorias a las categorias globales, en ese caso debemos retornar la categoria junto con las subcategorias que tengan el userId del usuario

# Tarea

1. Arregla los endpoints para retornar de forma correcta las categorias junto con sus subcategorias.
   #FF5733
   #ff795c
   #ff8d74

# Task 4

# Contexto

Quiero que creemos un e2e test que se llame categories que pruebe todo el camino para crear una categoria

# Pasos

- Hacer login con un user valido (en este caso el del seed) y obtener el token
- Primero quiero que pruebe el endpoint para traer las categorias (globales y del usuario)
- Luego quiero que pruebe crear una categoria
- Luego que la edite (nombre, icono, color )
- Luego quiero que cree una subcategoria
- Luego quiero que edite esa subcategoria
- Luego quiero la elimine esa subcategoria
- Luego quiero que elimine esa categoria creada

# Tarea

1. Quiero que cree este nuevo test y lo llame categories-flow
2. Quiero que me muestre el resultado de cada respuesta en consola
3. Quiero que este sea el test para saber que no rompemos el flow de categorias
4. Si debes arreglar algo en los metodos reales de categories hazlo

# Task 5

## Contexto

Actualmente en la BD tenemos una tabla llamada import_events que tiene la informacion que recibiremos de las integraciones que creemos, la integracion (tabla integrations) contendra el tokenHash que llevara el pedido de las import que quieran entrar al sistema de transacciones.

Quiero añadir un nuevo campo "message" a la tabla import_events que sera el mensaje de la notificacion que recibira el endpoint /imports/shortcut, desde iphone, por ejemplo "Has enviado 1€ a Andres Francisco Agreda Toledo. Llegara en segundo". Y un campo "finalDecision" que tendra el resultado de como se creo la transaccion como "EXPENSE, INCOME, N/A" N/A en caso de que no cree una transaccion.

### Proceso de creacion de transaccion por integracion

Antes el usuario crea un integracion en integrations y obtiene un token Hash

- Se envia una peticion a /imports/shortcut con el tokenHash en el encabezado y con el cuerpo json { "message": "texto notificacion", "date": "fecha del iphone"}
- API recibe el pedido verifica que el tokenHash es valido y obtiene el user y la cuenta a la que esta ligada.
- Se debe obtener el monto que venga en el mensage por lo general vienen antes del simbolo de la currency, por el momento es €, asi que debemos guardar ese numero para poder crear la transaccion.
- Si el mensaje contiene ["Has enviado","Has gastado"], el sistema crea una transaccion como EXPENSE y marca finalDecision como EXPENSE
- Si el mensaje contiene ["Has recibido","te ha enviado dinero"] el sistema crea una transaccion como INCOME y marca finalDecision como INCOME
- Si el mensaje no contiene ninguna de las palabras anteriores el sistema no crea una transaccion y marca finalDecision como N/A
- Las transacciones que se creen deben estar en el estado UNCLASSIFIED

## Tarea

1. Cambia el schema para implementar esta nueva logica
2. Cambia lo que necesites para adaptar los nuevos requerimientos
3. Implementa un test e2e llamado importTotransaction que siga los siguientes pasos. - Hacer login con user { "email":"test@cushqui.local", "password :"Password123!" } - Crear una integracion llamada shortcut_test guardar el token que devuelve el pedido - Ligar la integracion a la cuenta revolut-account - llamar a la ruta /imports/shortcut y crear un import_event para INCOME, EXPENSE y un N/A
4. Muestrame los resultados de las respuestas en la consola

# Task 6

## Contexto

Actualmente tengo en la BD las tablas transactions y accounts, las cuales seran una parte vital de la API ya que tendran contenida la informacion de los gastos, ingresos, transferencias y balances. Actualmente accounts no tiene un campo currentBalance, solo tiene el initialBalance, quiero que añadamos este campo ya que sera necesario para realizar las siguientes operaciones.

### Movimientos manuales

Son los movimientos que se ingresara manualmente por la API una vez logado.

- Iniciar sesion y obtener token de inicio de sesion
- Se envia una peticion de crear una transaction donde enviamos el tipo de transaccion EXPENSE, INCOME y dependiendo de esta realizamos la operacion al currentBalance de nuestra accounts (debemos enviar tambien la cuenta donde se realiza esta operacion)
  - Si es expense se debe restar al valor que tiene el currentBalance
  - Si es income se debe sumar el valor que tiene el currentBalance
  - Si esta con categoria y subcategoria sin llenar, se la crea como UNCLASSIFIED, sino es CLASSIFIED

Path: Login -> obtener token -> llamar endpoint para crear transaction -> actualizar cuenta -> crear transaction manual

### Movimientos por import

Son los movimientos que se enviaran por integracion (shortcut) los cuales crean un ImportEvent y luego crean una transaccion. Actualmente las imports funcionan y crean transacciones, pero no actualizan el valor del balance en la cuenta y debemos arreglar eso siguiendo la misma logica,
si es INCOME o EXPENSE de los movimientos manuales

Path: Integracion envia pedido al endpoint /imports/shotcut con el token de la integracion -> sistema crea un import event con el mensaje -> crea un transaction si es posible -> actualiza el valor del account.

`Esta sera la operacion de mayor criticidad del sistema`

### Transferencias

Son movimientos que no deben crear un income o un expense en ambas cuentas sino crear un transaction type TRANSFER y ,

- Restar el monto que se reciba en la cuenta origen
- Sumar el monto que se reciba en la cuenta destino
- No debe tener categoria ni subcategoria y el estado debe ser CLASSIFIED.

Path: Login -> obtener token -> llamar endpoint para crear transferencia -> actualizar cuenta origen y destino -> crear transaction

### Editar transactions

Debe ser posible editar un monto de una transaccion, que a su vez refleje este cambio en el balance de la cuenta en donde se realizo. El sistema debe realizar esta modificacion. Tambien se podra editar su tipo y su estado. Si es transferencia debe actualizar el valor en ambas cuentas

Path: Login -> obtener token -> llamar endpoint para editar transaction -> actualizar cuenta -> editar transaccion

### Eliminar transaction

Cuando se elimine la transaction debe ser un eliminado logico y no borrarlo de la base de datos para consultarlo despues.

Path: Login -> obtener token -> llamar endpoint para eliminar transaction -> eliminar transaccion -> actualizar cuenta.

## Tarea

Categoria ID: cat-loans | subcategoria ID: 8e06b53d-d31d-41fc-bb31-f86cac468307 | Account ID From: revolut-account | Account ID to: activobank-account

1. Cambia el schema para implementar estos nuevos requerimientos
2. Implementa la logica para realizar las operaciones mencionadas, puedes eliminar codigo que ya no haga sentido relacionado a estos puntos.
3. Crea un test que se llame transaction-manual que haga siga la path para crear una transaction INCOME de 10 eur y verifique si se actualizo el currentBalance de la cuenta y es el correcto, luego que edite esa transaccion a 5 eur y luego la elimine y verifique si funciona bien, usando la categoria que esta arriba.
4. Crea un test que se llame transfer-account que pruebe el camino de las transferencias y use las cuentas de arriba
5. Actualiza el test shortcut-balance para usar la integracion del .env contenida en SHORCUT_INTEGRATION_TOKEN y realice el path para crear la transaccion sin clasificar por import y luego mofique el estado a CLASSIFIED , usando la categoria que esta arriba.
6. Recuerda mostrar siempre el resultado de los pedido en consola.

# Task 7

## Contexto

Actualmente en el endpoint de transferencia, se estan creando dos transactions lo cual esta mal ya que se debe crear una sola transaccion en la que se identifique la cuenta origen y la cuenta destino.

Al realizar una transferencia la operación matemática es:

- Cuenta de origen: saldoActual + importeAnterior - importeNuevo
- Cuenta de destino: saldoActual - importeAnterior + importeNuevo
  Y esta operacion debe tener como resultado: actualizar la cuenta origen, actualizar la cuenta destino y crear una sola transaction de tipo TRANSFER.

## Tarea

Account ID From: revolut-account | Account ID to: activobank-account

1. Cambia el schema para implementar estos nuevos requerimientos
2. Altera el codigo para que la transferencia ya no cree dos transaction sino solo una.
3. Actualizar el test transfer-account que pruebe el camino de las transferencias y use las cuentas de arriba

# Task 7

## Contexto

Actualmente los endpoint de Account no estan aceptando iconos y colores cuando se lo crean o editan y deberia aceptarlos

## Tarea

1. Cambia el schema para implementar estos nuevos requerimientos
2. Altera el codigo relacionado a Accounts para implementar estos nuevos cambios
3. Crea un test que se llame account-flow, donde se corra el siguiente path: login-> crear un cuenta con balance 0 y emoticon de casa y color amarillo -> luego se edite el emoticon para un trebol y el color a verde ademas del balance a 30 eur

# Tarea 8

## Contexto

En esta carpeta tienes una xlsx llamado Transactions, tambien tienes fotos con el
formato YYYY-X.jpeg (YYYY es el año y X es el orden en que se tomaron las imagenes en
este caso 1 seria la mas antigua, por ende 1 es la imagen con el contenido de mas
atras)

Dentro de estas imagenes veras una lista de movimientos en los que y las fechas en
las que se realizo.

Simbolo de flecha abajo significa que se hizo una transferencia, simbolo de lapiz
significa que se ajusto una cuenta y si ves el simbolo de ($) (no confundir con la
bolsa de la exquina superior derecha) significa que se abrio una cuenta.

## Tarea

Quiero que dentro de Transactions, abras una nueva sheet llamada Movements,
actualmente tienes (Gastos, Ingresos, Transferencias). E ingreses los valores que hay
en las imagenes y los clasifiques como Adjust, transfer, opening (guiandote en los
simbolos que ves). Y coloques la date,type(ADJUST,TRANSGER,OPENING), account (cuenta
origen si es transfer), accountTo (cuenta destino solo llenado si es transfer),
ammount (valor mostrado a la derecha), sign (+ o - si es adjust o opening),
comentario si hay algun comentario (presente en transfer debajo de la cuenta que
recibe).

## Ejemplos

Ejemplo en la imagen @2024-1.jpeg en la parte inferior, se muestra

1 de marzo de 2024(vie)
Principal
(simbolo flecha abajo) 225€
Revolut Inversion

Esto refresenta:

Una transferencia y deberia ser una linea de la siguiente forma

01/03/2024|TRANSFER|Principal| Revolut Inversion| 225|-- |-- |

Ejemplo 2: En la imagen @2024-1.jpeg arriba de 1 de marzo de 2024(vie) se
muestra:

Principal
($)Balance Inicial +16.039,55

Esto representa:
04/03/2024|OPENING|Principal| ------ |16039.55| + |---|

Ejemplo3: En la imagen @2024-1.jpeg arriba de Moey esta:

Principal
(simbolo lapiz) -1.148,56
Ajuste de balance

Esto representa:
04/03/2024|ADJUS|Principal| ------ |1148.56| - |---|

## Reglas:

- Si en la imagen no ves la fecha del movimiento lee la siguiente imagen y relaciona
  hasta que encuentres la fecha.
- Cuando ya hayas añadido las lineas y ordenado por fecha descendiente, si hay una
  cuenta que aun no tiene un Balance inicial significa que se hizo un opening con 0,
  crea esa linea tambien y añadela a la fecha en la que se hizo un movimiento con esa
  cuenta por primera vez. Por ejemplo Revolut Inversion no tiene ese Balance inicial
  debe ser creada una linea con el 1 de marzo que fue su primer movimiento que lo
  relaciona.

# Test

npx jest --config ./test/jest-e2e.json test/account-flow.e2e-spec.ts --no-cache

# Task 9: Extraer categorias

leyendo el archivo Transaction.xlsx listame las categorias de gastos e ingresos:
Y quiero que me dentro de la categoria Prestamo me muestres subcategorias tomando el nombre antes de los dos puntos en comentario:
Ejemplo: Comentario -> "JP: comida y trago finde" -> esta seria una subcategoria JP.

Categorias Gastos:

- Cafe
- Transporte
- Prestamo - JP - Etc
- etc
  Categorias Ingresos:
- Salario
- etc

# Task 10: Crear BD test con datos reales

# Task 11: Despligue de BD to Supabase y Backend to Vercel.

## Contexto

Actualmente todo el proyecto funciona localmente con un BD remota en Supabase, la aplicacion Nestjs no tiene repositorio y quiero añadirlo a Github.

## Especificacion

Quiero hacer un despliegue del backend y la bd a un ambiente de pruebas que no sea
local.

Quiero que para el proyecto nest en mi entendimiento haga lo siguiente:

Tener un repositorio GitHub donde aloje el codigo:

- Crear una rama main (production) y un rama dev (development)
- La rama de main sera la que este desplegada en Vercel

Cuando desarrolle:

- Crear una branch desde development para una de feature y probarla localmente, pero que los cambios se muestren en la BD de prueba (como funciona hasta ahora)
- Cuando ya este listo hacer el PR a development y luego PR a main y hacer el despligue
- Automatizar si es posible las configuraciones. pPra yo escribir por ejemplo npm run deploy:prod (sistema cambia los URL de la base de datos y todo lo relacionado y despliega a vercel)
- posiblemente podemos tener un despliegue dev del proyecto Nesths pero creo que consumiria muchos recursos, por lo que solo quiero el prod (vercel) y local con url apuntando a bd dev

### BD

Cuando haga el despliegue a prod los URL deben apuntar a mi BD prod y cuando haga las pruebas en local quiero que los datos vayan a BD dev,
quiero que me digas como puedo lograr esto.

### Tener en cuenta

No necesito los datos seed creados en la BD prod y BD dev ya que pienso añadirlos mas tarde, por el momento solo quiero las tablas y que esten vacias.
