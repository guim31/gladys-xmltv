# Guía de TV XMLTV

Lo que se emite **ahora, después y esta noche** en las cadenas que sigue,
leído de **cualquier guía XMLTV**: un dispositivo por cadena, un widget para
el panel, un disparador de escena por palabras clave («LaLiga», «MasterChef»)
y dos acciones de escena.

Probada con guías públicas reales (xmltvfr.fr, epgshare01), todavía no en
muchas instalaciones de Gladys: sus comentarios son bienvenidos en el foro de
Gladys.

## Qué necesita

- Gladys Assistant **5.1.0** o posterior.
- La dirección de una guía XMLTV que cubra sus cadenas, `.xml` o `.xml.gz`
  (vea más abajo). Sin cuenta ni clave de API.

## Encontrar una guía

- **Francia, Bélgica, Suiza, África francófona**:
  [xmltvfr.fr](https://xmltvfr.fr) publica guías gratuitas, rehechas cada
  día, por ejemplo `https://xmltvfr.fr/xmltv/xmltv_tnt.xml.gz` (TDT francesa,
  1 MB) o `https://xmltvfr.fr/xmltv/xmltv.xml.gz` (todas las cadenas, 18 MB).
- **Otros países**: el proyecto
  [iptv-org/epg](https://github.com/iptv-org/epg) reúne las fuentes y las
  herramientas para crear una guía; sitios comunitarios publican guías listas
  por país.
- **Su box o proveedor IPTV**: muchos ofrecen una dirección XMLTV (a menudo
  `…/xmltv.php?username=…&password=…`). Se acepta tal cual y nunca se escribe
  en los registros.
- **Un archivo**: una guía copiada en el volumen de datos de la integración se
  lee con una dirección como `/data/guide.xml.gz`.

## Configuración

1. En **Integraciones → XMLTV TV guide → Configuración**, indique la
   **dirección de la guía**.
2. En **Cadenas seguidas**, enumere las cadenas, separadas por comas, 20 como
   máximo: su **identificador** en la guía (`La1.es`) o su **nombre**
   (`Antena 3`). El botón **Listar las cadenas** (con una búsqueda como `tve`)
   muestra los identificadores y nombres de la guía.
3. Elija el **inicio de la noche** (21:00 por defecto) y cada cuánto se
   **descarga** la guía (cada 12 horas por defecto).
4. Si lo desea, indique **palabras clave** para las escenas y el **aviso
   anticipado**.
5. Pulse **Probar la guía**: descarga la guía e indica qué cadenas seguidas
   contiene y hasta cuándo.
6. En la pestaña **Descubrimiento**, añada a Gladys las cadenas que desee.

El **idioma de los textos** define los nombres de las funciones, los textos
publicados y las salidas de las escenas (francés por defecto).

## El dispositivo de cada cadena

| Función                 | Ejemplo                |
| ----------------------- | ---------------------- |
| Ahora                   | `MasterChef`           |
| Fin del programa actual | `00:30`                |
| Tiempo restante (min)   | `42`                   |
| A continuación          | `00:30 · Telediario 3` |
| Esta noche              | `22:00 · MasterChef`   |

«Esta noche» es el primer programa de al menos 20 minutos que empieza a partir
de 10 minutos antes del inicio de la noche (se saltan el tiempo y los
avances), o el programa en emisión a esa hora. Una vez terminado, muestra el
de la noche siguiente, precedido de «mañana». Las horas están en la zona
horaria de Gladys.

## Panel

El widget **Guía de TV** muestra hasta 8 cadenas añadidas a Gladys, con el
nombre que usted les dio: lo que se emite ahora con el tiempo restante, o
(ajuste **Mostrar**) esta noche con la hora de inicio. La insignia se puede
ocultar. Al tocar una cadena se ve ahora, después y esta noche, con los
horarios, el episodio y la categoría.

## Escenas

### Disparadores

**Programa con una palabra clave**: un programa cuyo título contiene una de
las **palabras clave** configuradas empieza en una cadena seguida (sin tener
en cuenta acentos ni mayúsculas). Filtros: la palabra clave (tal como está
escrita en la configuración), la cadena y el momento — **al inicio**, o
**antes del inicio** según el aviso anticipado configurado. Variables: palabra
clave, cadena, título, subtítulo, categoría, inicio, fin, duración. Un
programa ya empezado cuando arranca la integración no activa nada.

### Acciones

- **Leer el programa de una cadena**: ahora, después o esta noche en una
  cadena. Salidas: encontrado (1 o 0), cadena, título, subtítulo, categoría,
  día, inicio, fin, y los minutos hasta el inicio (o restantes, para ahora).
- **Buscar un programa**: la próxima emisión de un título (o de una parte) en
  las cadenas seguidas, mismas salidas.

### Ideas de escenas

- A las 20:00, decir «Esta noche en La 1: {{title}} a las {{start}}».
- «LaLiga» empieza en 10 minutos: enviar un mensaje y encender la tele.
- Cada sábado por la mañana, buscar «MasterChef» y anunciar su día.

## Descargas y carga

- La guía se descarga al arrancar y luego cada 6, 12 o 24 horas, con una
  petición condicional: una guía sin cambios no se vuelve a descargar. Un
  fallo se reintenta 30 minutos después, y los programas ya conocidos se
  siguen mostrando.
- La guía se lee en flujo, aunque pese cientos de megabytes: solo se guardan
  las cadenas seguidas (unos 100 MB de memoria como máximo al leer la guía
  completa de xmltvfr.fr, menos de 60 MB en reposo).
- Los programas de las cadenas seguidas se guardan en caché en el volumen de
  datos: un reinicio no vuelve a descargar la guía antes de tiempo.
- Los estados se calculan cada minuto en memoria y solo se publican cuando
  cambian.

Respete las condiciones de la guía utilizada: las guías gratuitas se rehacen
una o dos veces al día, descargarlas más a menudo no aporta nada.

## Solución de problemas

- **«La dirección no lleva a una guía XMLTV»**: la dirección devuelve una
  página web (inicio de sesión, error). Ábrala en un navegador: debe
  descargar un archivo `.xml` o `.xml.gz`.
- **Una cadena seguida «no se encuentra»**: use **Listar las cadenas** con
  una parte de su nombre y copie su identificador.
- **«Ningún programa»**: la guía no tiene programas para esa cadena a esa
  hora; algunas guías solo cubren pocos días.
- **Horas desfasadas**: compruebe la zona horaria de Gladys; las fechas de la
  guía llevan su propio desfase.

## Límites

- Solo XMLTV (`.xml` o gzip `.xml.gz`; ni `.zip` ni `.xz`).
- 20 cadenas seguidas, programas guardados hasta 8 días por adelantado.
- Sin imagen, sin resumen, sin grabación: es una guía, no un receptor (para
  los receptores, vea la integración Enigma2).
