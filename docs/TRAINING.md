# Cómo llenar clientes y fuentes

Guía para quien da de alta el catálogo. Sin jerga de sistemas: qué va en cada campo y con qué criterio.

La **fuente** es el sitio público (DOF, un congreso, COFEPRIS).  
El **cliente** es la empresa a la que le importa esa información (Arca).  
Una fuente se puede compartir entre varios clientes. Un cliente puede seguir muchas fuentes.

---

## Fuente

Piensa: “¿a qué página hay que entrar todos los días y qué tipo de documentos buscamos ahí?”

### Datos de identidad

**Nombre**  
Como lo dirían en la mesa: *Diario Oficial de la Federación*, *Congreso de Jalisco*, *COFEPRIS*. No pongas la URL aquí.

**Código**  
Un identificador corto, en minúsculas y guiones, único. Ejemplos: `dof`, `jalisco-congreso`, `conamer`. No se puede cambiar después. Si te equivocas, apaga esa fuente y crea otra.

**Categoría y plataforma**  
En este piloto: **oficial** y **página web**. No uses redes (YouTube, X, Facebook): aún no se monitorean.

**Dirección (URL)**  
La portada o la gaceta real, con `https://`. Ejemplos:

- DOF: `https://www.dof.gob.mx/`
- Diputados: `https://gaceta.diputados.gob.mx/`
- Jalisco: `https://www.congresojal.gob.mx/`
- COFEPRIS: `https://www.gob.mx/cofepris`
- CONAMER: `https://www.gob.mx/conamer`

La de un Facebook o un canal de YouTube no sirve aquí.

### Alcance geográfico

**Federal** — DOF, Cámara de Diputados, dependencias nacionales (COFEPRIS, CONAMER). No elijas estado.

**Estatal** — un congreso local. Ahí **sí** eliges la entidad: Jalisco → JAL, Nuevo León → NLE, Baja California → BCN, etc.

### Cuándo visitar el sitio

Días y hora en que suele publicarse material nuevo. Hora de la Ciudad de México.

| Tipo de sitio | Lo habitual |
|---------------|-------------|
| Gaceta diaria (DOF, Diputados) | Lunes a viernes, 7:00 |
| Congreso muy activo | Lunes a viernes, 7:00 |
| Congreso o dependencia que publica menos | Los días que ellos sesionan o sueltan comunicados (p. ej. lun / mié / vie, 7:00) |

Si no sabes, deja lunes a viernes a las 7:00.

Esto **no** es la hora del informe al cliente. Es solo “a qué hora pasamos por la página”.

### Qué buscar en ese sitio

**Secciones**  
Las áreas del sitio donde vive la norma, no el menú entero. Ejemplos: Gaceta, Iniciativas, Dictámenes, Comunicados, Alertas, Lineamientos.

**Palabras guía**  
Términos que suelen aparecer en *ese* sitio y que importan al piloto. En un DOF: NOM, etiquetado, IEPS, COFEPRIS, envases. En un congreso: salud, bebidas, escuelas, residuos. No pongas el nombre del cliente.

**Foco de búsqueda**  
En una frase: qué tipo de acto nos interesa.  
*“Decretos, NOM y acuerdos que generen obligación o plazo.”*  
*“Iniciativas o dictámenes de salud, alimentos, bebidas o publicidad.”*

**Notas**  
Un recado para quien revise: *“Priorizar etiquetado y publicidad infantil.”* Se puede dejar vacío.

### Estado

**Activa** — se visita según el horario (y se puede rastrear ahora).  
**Inactiva** — queda en el catálogo pero no se visita. No se borra: se apaga.

CONAMER está de ejemplo inactiva: se prende cuando quieran practicar el alta.

---

## Cliente

Piensa: “¿quién recibe el informe y qué le duele de la regulación?”

### Identidad

**Nombre**  
Como se conoce la empresa: *Arca Continental*.

**Correo**  
Un correo de asuntos regulatorios o de la cuenta con la que los contactan. No tiene que ser el de cada persona (eso va en contactos).

### Datos fiscales

Van al encabezado del PDF. Como en una factura:

| Campo | Ejemplo |
|-------|---------|
| Razón social | Arca Continental, S.A.B. de C.V. |
| RFC | 12 o 13 caracteres, en mayúsculas |
| Código postal | 5 dígitos del domicilio fiscal |
| Uso de CFDI | el que usen (p. ej. G03) |
| Régimen | clave SAT (p. ej. 601) |

Si un dato no lo tienen a la mano, no inventes un RFC.

### Contactos

Personas que más adelante recibirían el informe por correo. Nombre, correo y teléfono. Al menos uno. Hoy el PDF no se envía solo; igual hay que dejarlos bien.

### Perfil regulatorio (lo que más pesa)

Aquí se decide si una nota del DOF le importa a *esta* empresa. Escribe como el negocio, no como el sitio de gobierno.

**Nombre del perfil**  
*Perfil bebidas y empaques*

**Palabras clave**  
Productos y temas que, si salen en una gaceta, hay que avisar. Ejemplo Arca:

- bebidas azucaradas, refrescos, etiquetado, IEPS, PET  
- publicidad infantil, escuelas, COFEPRIS

**Categorías**  
Cajones grandes: salud, etiquetado, impuestos, envases, publicidad.

**Productos**  
Lo que venden o embotellan: refrescos, aguas, jugos, bebidas saborizadas.

No pongas aquí la URL del DOF ni “revisar el congreso”. Eso es de la fuente.

Si el perfil queda vago (*“todo lo de gobierno”*), van a salir hallazgos de más o de menos. Mejor corto y concreto.

### Entrega y semáforo

Para cada color, la acción que debe leer el cliente en el hallazgo:

- Verde — registrar como contexto (el verde **no** entra al PDF)  
- Amarillo — dar seguimiento  
- Naranja — elaborar nota y monitorear  
- Rojo — alertar de inmediato  

Deja el envío automático **apagado**. El horario de entrega no es “a qué hora se rastrea el DOF”.

### Fuentes que sigue este cliente

Marca las páginas que le aplican (DOF, Diputados, Jalisco, COFEPRIS…).  
Sin esta liga, el rastreo corre pero **no salen hallazgos** para ese cliente.

Si editas la lista, deja **todas** las que debe seguir, no solo la que acabas de agregar. Quitar una de la lista es dejar de seguirla.

Para practicar el alta, mejor un cliente de prueba. No rearmes la lista de Arca salvo que sea a propósito.

---

## Ejemplos ya cargados (para copiar el criterio)

**Arca** — perfil de bebidas y empaques; fiscales de la SAB; un contacto de asuntos regulatorios; sigue DOF, Diputados, Jalisco y COFEPRIS.

**DOF** — federal, lunes a viernes 7:00, foco en decretos/NOM/acuerdos.

**Jalisco** — estatal, entidad Jalisco, gaceta e iniciativas.

**CONAMER** — ya está dada de alta, inactiva. Prenderla y rastrear es el ejercicio de “nueva fuente” sin teclear la URL otra vez.

---

## Hallazgos e informe (solo el criterio de datos)

- **Editar** — corrige título, texto o color si la IA se equivocó.  
- **Excluir** — no va en *este* PDF; no borra el hallazgo. Se puede volver a incluir.  
- **Verde** — no se mete al informe.  
- **Generar PDF** — cuando el lote del día ya no esté analizando, y haya al menos un amarillo, naranja o rojo que no hayas excluido. Un PDF es de **un** cliente.
