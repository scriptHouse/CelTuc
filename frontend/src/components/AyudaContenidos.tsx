import {
  AyudaCampos,
  AyudaEjemplo,
  AyudaPasos,
  AyudaSeccion,
  AyudaTip,
} from '@/components/ui/AyudaInfo'

/**
 * Contenidos de las guías de uso de cada pantalla (los botones ⓘ).
 * Escritos como un manual de usuario: pasos numerados, ejemplos con valores
 * reales de la lista y explicación de cada campo.
 */

// ============================================================ PRODUCTOS ====

export function AyudaProductosPagina() {
  return (
    <>
      <AyudaSeccion titulo="Qué es esta pantalla">
        <p>
          Es el <b>catálogo central de todo lo que se vende</b>: fundas, cargadores, auriculares,
          parlantes, consolas, celulares Xiaomi/Samsung, productos Apple y los iPhone que se
          carguen. Cada producto muestra sus dos precios:
        </p>
        <AyudaCampos
          campos={[
            [<>Lista</>, <>El precio "normal": tarjeta de crédito en 1-3 cuotas sin interés (o más cuotas con recargo, según el Simulador).</>],
            [<>Cash</>, <>El precio con descuento abonando el <b>100 % en efectivo, débito o transferencia</b>. Si el cliente no paga todo así, va precio de lista.</>],
          ]}
        />
        <p>
          Algunas categorías (Samsung y productos Apple) <b>no tienen precio cash</b>: se venden a
          precio de lista + cuotas de equipos — lo indica la etiqueta «Lista + cuotas».
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Cómo buscar un producto">
        <AyudaPasos
          pasos={[
            <>Escribí en el buscador grande: nombre, marca o calidad (ej: <b>“fuente 20w”</b>, <b>“JBL”</b>, <b>“hidrogel”</b>). Busca en todas las categorías y agrupa los resultados.</>,
            <>O tocá una <b>categoría</b> (Fundas, Cables, Auriculares…) para recorrerla completa. Dentro de Cables vas a ver separadores por tipo (USB-C a Lightning, etc.).</>,
            <>Afiná con los desplegables de <b>marca</b> y <b>calidad</b>: se combinan con la búsqueda y con la categoría elegida. El chip «Todas» vuelve a mostrar todo.</>,
          ]}
        />
        <AyudaEjemplo titulo="el cliente pide una funda para su iPhone 13">
          <p>
            Escribí <b>“funda”</b> o andá a la categoría <b>Fundas</b>. Cada fila muestra Lista y
            Cash: <i>Silicone Case — Lista US$ 11,22 · $ 17.400 / Cash US$ 8,98 · $ 14.000</i>. Si
            la funda dice «x2 $6.000» en gris, es precio por cantidad.
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Qué significan las etiquetas">
        <AyudaCampos
          campos={[
            ['Apple original / Calidad original / Original', 'La calidad de la pieza. "Calidad original" (CO) es compatible de primera línea; "Apple original" es pieza genuina.'],
            ['A pedido', 'No hay stock inmediato: se encarga con seña previa.'],
            ['Nuevo', 'Producto recién ingresado al catálogo.'],
            ['Cash −30 %', 'Esa categoría tiene un descuento cash propio, distinto del general. Los admins lo cambian desde Configurar → Descuento cash.'],
          ]}
        />
      </AyudaSeccion>

      <AyudaTip>
        Los precios en pesos salen del <b>dólar del negocio</b> (se ve arriba a la derecha) y se
        actualizan solos cuando un administrador lo cambia. No hace falta recalcular nada a mano.
      </AyudaTip>
    </>
  )
}

export function AyudaProductosManager() {
  return (
    <>
      <AyudaSeccion titulo="La regla de oro: cargá solo la Lista USD">
        <p>
          El sistema calcula los otros tres precios solo. Vos cargás <b>un número</b> (Lista USD) y
          salen: Cash USD (con el descuento), Lista $ (por el dólar del negocio) y Cash $.
        </p>
        <AyudaEjemplo titulo="qué pasa si cargo Lista USD 25">
          <p className="tnum">
            Lista <b>US$ 25</b> → Cash <b>US$ 20</b> (−20 %) → Lista <b>$ 38.800</b> (25 × dólar
            1.550, redondeado) → Cash <b>$ 31.000</b>.
          </p>
          <p>
            Los tres campos calculados muestran su valor como <b>placeholder gris</b>: si los dejás
            vacíos, se calculan; si escribís un número, ese número manda (queda “pisado” y no se
            actualiza con el dólar).
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Ejemplo 1 · Cargar una funda">
        <AyudaPasos
          pasos={[
            <>Elegí la categoría <b>Fundas</b> en los chips y tocá <b>«Nuevo producto»</b>.</>,
            <>Nombre: <b>Silicone Case</b>. No hace falta poner la línea en el nombre.</>,
            <>En <b>«Equipos vinculados»</b> elegí <b>«Línea 13 (toda)»</b> — con eso la funda aparece en la Ficha de cada iPhone 13. Podés sumar más líneas o equipos sueltos.</>,
            <>Lista USD: <b>11,22</b>. Dejá los otros tres precios vacíos (se calculan solos).</>,
            <>Guardar. Listo: ya se ve en la página y en la Ficha de equipo.</>,
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Ejemplo 2 · Cargar un cargador Apple original">
        <AyudaPasos
          pasos={[
            <>Categoría <b>Fuentes de carga y powerbanks</b> → «Nuevo producto».</>,
            <>Nombre: <b>Fuente 20W</b> · Marca: <b>Apple</b> · Calidad: <b>Apple original</b>. Así se distingue de la “Fuente 20W” calidad original, que es otro producto con otro precio.</>,
            <>Lista USD: <b>60</b> → el sistema muestra Cash US$ 48 · $ 93.000 · $ 75.000.</>,
            <>Si es una promo tipo “si compran equipo”, cargalo como <b>otro producto</b> igual pero con la aclaración en <b>Nota</b> y su precio.</>,
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Ejemplo 3 · Cargar un iPhone para la venta">
        <AyudaPasos
          pasos={[
            <>Elegí la categoría <b>iPhones</b> (ya está creada y configurada: sin precio cash, cuotas de equipos).</>,
            <>Nombre: <b>iPhone 15 128GB</b> · Marca: <b>Apple</b>.</>,
            <>En «Equipos vinculados» agregá <b>iPhone 15</b> — así aparece en el bloque <b>Venta</b> de su Ficha de equipo.</>,
            <>Lista USD: <b>700</b> → Lista $ 1.085.000. No va a mostrar cash porque la categoría lo tiene desactivado.</>,
            <>Si es a pedido, tildá <b>«A pedido (seña previa)»</b>.</>,
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Cargar varios de una: «Carga masiva»">
        <p>
          Al lado de «Nuevo producto» está <b>«Carga masiva»</b>: una planilla con un producto por
          fila (nombre, marca, calidad, nota y los 4 precios) donde agregás todas las filas que
          necesites y un solo <b>Guardar</b> los crea juntos. Las filas vacías se ignoran; si
          alguna falla, queda en la planilla con el motivo para corregirla y reintentar. Lo que no
          está en la planilla (equipos vinculados, «a pedido», «nuevo») se completa después
          editando el producto.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Qué es cada campo del producto">
        <AyudaCampos
          campos={[
            ['Nombre', 'Cómo se muestra en la lista. Corto y claro: "Silicone Case", "iPad Air M3 11\'\' 128GB".'],
            ['Marca', 'Para el filtro de marcas (JBL, Xiaomi, Spigen…). Opcional.'],
            ['Calidad', 'Apple original / Calidad original / Original / Réplica… Se muestra como etiqueta al lado del nombre.'],
            ['Nota', 'Aclaración corta visible en gris: "x2 $6.000", "precio si compran equipo".'],
            ['A pedido', 'Muestra la etiqueta "A pedido" (seña previa, sin stock inmediato).'],
            ['Producto nuevo', 'Muestra la etiqueta "Nuevo".'],
            ['Equipos vinculados', 'Con qué equipos es compatible (o cuál ES, si es un celular). Alimenta la Ficha de equipo. Podés agregar líneas enteras de un toque.'],
            ['Lista USD', 'El único precio que normalmente cargás. De acá derivan los otros tres.'],
            ['Cash USD / Lista $ / Cash $', 'Dejalos VACÍOS para que se calculen (el placeholder muestra cuánto daría). Escribí un valor solo para pisar la fórmula.'],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Categorías y subgrupos">
        <p>
          Con <b>«Nueva»</b> creás una categoría. Si en «Subgrupo de…» elegís una madre (ej:
          Cables), se convierte en un <b>separador interno</b> de esa categoría, como “USB-C a
          Lightning”. Cada categoría define lo común a sus productos:
        </p>
        <AyudaCampos
          campos={[
            ['Nota / garantía', 'Se muestra bajo el título: "3 meses de garantía".'],
            ['Desc. cash propio', 'Si difiere del global: auriculares y smartwatch usan 30. Vacío = usa el global (20).'],
            ['Muestra precio cash', 'Destildalo para categorías sin cash (Samsung, Apple): solo lista + cuotas.'],
            ['Cuotas del simulador', 'Qué tabla de recargos aplica: "accesorios" o "equipos".'],
            ['Es venta de equipos', 'Tildado, sus productos salen como VENTA en la Ficha de equipo (iPhones, Xiaomi, Samsung, Apple).'],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="El dólar del negocio">
        <AyudaTip>
          Es <b>uno solo para todo el sistema</b>: cambiarlo acá recalcula al instante este catálogo
          y también la lista de Service. Los precios que pisaste a mano no se tocan.
        </AyudaTip>
      </AyudaSeccion>
    </>
  )
}

// ============================================================== SERVICE ====

export function AyudaServicePagina() {
  return (
    <>
      <AyudaSeccion titulo="Qué es esta pantalla">
        <p>
          La <b>lista de precios del taller</b> que se cobra al público: baterías, módulos,
          cámaras, tapa, reparación de placa, etc. Cada fila muestra:
        </p>
        <AyudaCampos
          campos={[
            ['Lista', 'Precio en tarjeta 1-3 cuotas sin interés (en USD y en pesos).'],
            ['Cash', 'Con el descuento abonando efectivo/transferencia (algunas secciones tienen promo propia, ej: tapa −30 %).'],
            ['Calidades', 'En Módulos vas a ver 3 precios: Certificada (LCD), Original (OLED) y Apple Original. En Baterías, con y sin reconocimiento de pieza original.'],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Cómo cotizarle un arreglo a un cliente">
        <AyudaPasos
          pasos={[
            <>Lo más rápido: elegí el equipo en el <b>selector</b> (“iPhone 13 Pro”) — aparece TODO lo que le aplica, agrupado por sección (batería, módulo, cámaras…).</>,
            <>O buscá por texto: <b>“baño químico”</b>, <b>“13 pro”</b>, <b>“iPad”</b> — recorre todas las secciones.</>,
            <>Con un equipo elegido podés acotar tocando una <b>sección</b> (ej: solo Baterías). El chip «Todas» vuelve al perfil completo.</>,
            <>Leé la <b>nota gris</b> de cada sección: ahí están las demoras y condiciones (“demora 72-96 hs”, “con láser 2-3 días”).</>,
          ]}
        />
        <AyudaEjemplo titulo="cliente con un 13 Pro con la batería agotada">
          <p className="tnum">
            Selector → iPhone 13 Pro → sección Baterías: <b>Lista US$ 100 · $ 155.000</b> / Cash
            US$ 77 · $ 124.000. Si quiere que el equipo reconozca la batería como original:
            $ 195.000 (cash $ 164.000).
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaTip>
        Los pesos salen del <b>dólar del negocio</b> y se recalculan solos cuando cambia. Si un
        precio te parece raro, avisale a un administrador en vez de cotizar de memoria.
      </AyudaTip>
    </>
  )
}

export function AyudaServiceManager() {
  return (
    <>
      <AyudaSeccion titulo="Cómo funcionan los precios">
        <p>
          Igual que en Productos: cargás la <b>Lista USD</b> y el sistema deriva Cash USD, Lista $
          y Cash $ con el dólar del negocio. Campo vacío = fórmula (el placeholder muestra cuánto
          daría); número escrito = ese manda.
        </p>
        <AyudaEjemplo titulo="actualizar el precio de una batería">
          <AyudaPasos
            pasos={[
              <>Elegí la sección <b>Baterías</b> en los chips.</>,
              <>Buscá la fila (ej: <b>iPhone 15</b>) y tocala para desplegarla.</>,
              <>Cambiá <b>Lista USD</b> de 120 a <b>125</b> → los pesos se recalculan solos. Guardar.</>,
            ]}
          />
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Agregar una fila nueva a una sección">
        <AyudaPasos
          pasos={[
            <>Elegí la sección → <b>«Nuevo ítem»</b>.</>,
            <>Etiqueta: el modelo o grupo (ej: <b>iPhone 18</b> o <b>iPhone 18 / 18 Plus</b>).</>,
            <>En <b>«Equipos que abarca»</b> vinculá los equipos (o la línea entera): eso hace que aparezca al filtrar por equipo y en la Ficha.</>,
            <>Cargá la Lista USD de cada variante que aplique (si la sección tiene calidades, vas a ver un bloque por calidad). Guardar.</>,
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Cargar varias filas de una: «Carga masiva»">
        <p>
          Al lado de «Nuevo ítem» está <b>«Carga masiva»</b>: una planilla con un ítem por fila
          (etiqueta, nota y los precios de cada variante) donde agregás todas las filas que
          necesites y un solo <b>Guardar</b> los crea juntos. Las filas vacías se ignoran; si
          alguna falla, queda en la planilla con el motivo para corregirla y reintentar. Los
          equipos que abarca cada fila se vinculan después, editando el ítem.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Secciones, variantes y equipos">
        <AyudaCampos
          campos={[
            ['Sección', 'Un bloque de la lista (Baterías, Módulos…). Podés crear nuevas (ej: "Parlantes") sin tocar nada más.'],
            ['Variantes', 'Las calidades de la sección (LCD / OLED / Apple Original). Renombrarlas conserva los precios; quitarlas los borra (te pide confirmación).'],
            ['Desc. cash propio', 'Para promos: tapa trasera tiene 30 en vez del 20 global.'],
            ['Pestaña Equipos', 'El catálogo de equipos (iPhone 6 → 17, iPad, Mac, Watch). Cuando salga un modelo nuevo, agregalo acá con su línea y después vinculalo en las filas.'],
          ]}
        />
      </AyudaSeccion>

      <AyudaTip>
        El <b>dólar del negocio</b> de arriba es el mismo de Productos: cambiarlo recalcula las dos
        listas de una. Ideal para actualizar todo en un solo lugar cuando se mueve el dólar.
      </AyudaTip>
    </>
  )
}

// ========================================================= COTIZACIONES ====

export function AyudaCotizacionesPagina() {
  return (
    <>
      <AyudaSeccion titulo="Qué es esta pantalla">
        <p>
          Los <b>rangos de compra de equipos usados</b>: cuánto paga el negocio por cada iPhone
          según su capacidad (mínimo–máximo, en USD), y los costos de service que se descuentan al
          cotizar (batería, módulo, tapa).
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Cómo cotizar un usado">
        <AyudaPasos
          pasos={[
            <>Buscá el modelo (ej: <b>“13 pro”</b>) o filtrá con los chips de generación (11, 12, 13…).</>,
            <>Leé el rango de su capacidad: <span className="tnum">iPhone 13 Pro 128 GB → <b>US$ 310 – 330</b></span>. El máximo es para un equipo impecable, sin piezas cambiadas y batería ≥ 98 %.</>,
            <>Si tiene batería al 82 % o menos, o módulo/tapa dañados, <b>descontá</b> los valores de la sección Service de la tarjeta (batería −US$ 70, etc.).</>,
            <>¿Te preguntan por WhatsApp? Tocá el botón <b>WhatsApp</b> de la tarjeta: copia la respuesta tipo con el precio aproximado, lista para pegar en el chat.</>,
          ]}
        />
        <AyudaTip>
          Seguí los <b>tips para cotizar</b> del panel de arriba: arrancá por debajo del mínimo y
          subí en la negociación; al recibir en parte de pago, restaurá de fábrica y probá con una
          SIM para descartar bloqueo de operador.
        </AyudaTip>
      </AyudaSeccion>
    </>
  )
}

export function AyudaCotizacionesManager() {
  return (
    <>
      <AyudaSeccion titulo="Agregar un modelo nuevo (ej: sale el iPhone 18)">
        <AyudaPasos
          pasos={[
            <>Tocá <b>«Nuevo modelo»</b>.</>,
            <>Marca <b>iPhone</b> · Modelo <b>18</b>.</>,
            <>Agregá sus capacidades con el rango de compra: <span className="tnum">GB <b>256</b> · Mín <b>900</b> · Máx <b>950</b></span>. Una fila por capacidad; si una no se toma, no la cargues.</>,
            <>Cargá los costos de service que se descuentan al cotizar (batería, módulo, tapa) — dejá vacío el que todavía no tenga precio.</>,
            <>Guardar. Si el equipo ya existe en el catálogo de Service, se vincula solo y aparece en la Ficha de equipo.</>,
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Actualizar rangos">
        <p>
          Tocá el modelo, corregí Mín/Máx y guardá. El botón de WhatsApp de la página usa el punto
          medio del rango total del modelo, así que se actualiza solo.
        </p>
        <AyudaCampos
          campos={[
            ['Pestaña "Tipos de service"', 'Los descuentos que se aplican al cotizar (batería, módulo, tapa…). Agregar uno nuevo (ej: "Cambio de cámara") habilita su columna en todos los modelos.'],
            ['Mín / Máx', 'En USD. El máximo es para equipo impecable; el mínimo es el piso normal de negociación.'],
          ]}
        />
      </AyudaSeccion>
    </>
  )
}

// ================================================================ DÓLAR ====

export function AyudaDolar() {
  return (
    <>
      <AyudaSeccion titulo="Qué es esta pantalla">
        <AyudaCampos
          campos={[
            [<>Dólar del negocio</>, <>El valor con el que se calculan <b>todos</b> los precios en pesos de Service y Productos. Lo define el negocio (no es el del mercado): incluye el margen cambiario.</>],
            [<>Dólar blue · DolarAPI</>, <>La cotización de mercado en vivo (compra y venta), como referencia. <b>Nunca</b> modifica el del negocio por sí sola.</>],
            [<>La comparación</>, <>Cuánto está tu dólar por encima o por debajo de la venta blue, en pesos y porcentaje — el dato para decidir si conviene actualizarlo.</>],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Dos maneras de definirlo (solo admins)">
        <AyudaCampos
          campos={[
            [<><b>Manual</b></>, <>Escribís el valor (ej: <b>1600</b>), opcionalmente un motivo, y tocás <b>Guardar</b>. Queda fijo hasta que lo cambies.</>],
            [<><b>Automático</b></>, <>El dólar <b>sigue al blue</b> con tu ajuste: elegís la referencia (venta, compra o promedio), si sumás o restás, <b>pesos fijos o un porcentaje</b> (ej: blue venta + $25, o + 2 %) y a qué múltiplo redondear ($1, $5, $10…). Abajo ves en vivo cuánto quedaría antes de guardar.</>],
            [<>Afinar</>, <>«No actualizar si el cambio es menor a $X»: para que una oscilación chica del blue no mueva toda la lista.</>],
            [<>Volver a manual</>, <>Elegí la tarjeta <b>Manual</b>, poné el valor y guardá: deja de seguir al blue y queda fijo.</>],
          ]}
        />
        <AyudaEjemplo titulo="blue venta $1.555, regla «+ $25, redondear a $5»">
          <p className="tnum">
            1.555 + 25 = 1.580 → el dólar del negocio queda en <b>$ 1.580</b>. Si mañana el blue
            pasa a $1.570, el dólar se mueve solo a $ 1.595 y todas las listas se recalculan.
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Cuándo se actualiza el automático">
        <p>
          Cada vez que alguien usa el sistema: al abrir el Panel o la página Dólar, al listar
          Productos o Service, y cada 5 minutos mientras el gestor está abierto. Si de noche nadie
          entra, no cambia hasta la primera apertura de la mañana, y en ese momento ya está al
          día antes de mostrar un precio. Si DolarAPI no responde, el dólar <b>queda como
          estaba</b>: nunca se pone en cero ni se inventa un valor.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Historial">
        <p>
          En la página Dólar, debajo del gestor, está <b>cada valor que tuvo el dólar</b>: desde
          qué día y hora rigió, hasta cuándo, cuánto duró, si lo fijó una persona (y quién) o lo
          calculó la regla (con el blue que usó), y el motivo si se anotó. Se filtra por fechas.
        </p>
      </AyudaSeccion>

      <AyudaTip>
        Este mismo gestor está en el <b>Panel</b> (inicio) y dentro de Configurar en Service y
        Productos: es uno solo, mires donde lo mires. El botón ↻ refresca la cotización del blue
        (se actualiza sola cada 2 minutos). Cada cotización queda <b>guardada</b>: si DolarAPI
        alguna vez no responde, vas a ver la última guardada con un aviso ⚠ de cuándo se obtuvo
        — nunca te quedás sin referencia.
      </AyudaTip>
    </>
  )
}

// =========================================================== INVENTARIO ====

export function AyudaInventario() {
  return (
    <>
      <AyudaSeccion titulo="Qué es esta pantalla">
        <p>
          El <b>stock real de cada sucursal</b>, conectado al catálogo central: los productos y
          sus precios son los mismos de la pantalla Productos (se mueven solos con el dólar).
          Acá solo se manejan <b>cantidades</b>: cuántas unidades hay, dónde, y cuándo reponer.
        </p>
        <AyudaCampos
          campos={[
            [<>Pestañas de sucursal</>, <>Elegís qué local estás mirando (Solar, Centro…). <b>Todas</b> muestra las dos columnas juntas con el total.</>],
            [<>Vistas</>, <>«Con stock» es el día a día; «Todo el catálogo» muestra también lo que está en 0; «Bajo mínimo» es la lista de reposición; «No informado» junta los productos cuya cantidad nunca se cargó.</>],
            [<>Botones − / +</>, <>Restan o suman de a una unidad (vendí una / encontré una). Quedan registrados con tu usuario.</>],
            [<><b>Transferir</b> ⇄</>, <>Mueve unidades de este producto a otra sucursal: sale de la que estás mirando y entra en la que elijas.</>],
            [<><b>Editar</b> ✎</>, <>Abre el detalle: cantidad exacta, stock mínimo y los últimos movimientos.</>],
            [<><b>Nuevo producto</b></>, <>(Solo administradores) Da de alta un producto del catálogo sin salir de acá. Nace sin unidades: después se las cargás con el <b>+</b>.</>],
            [<><b>Importar por sucursal</b></>, <>Sube la planilla de un local y actualiza su stock de una vez, mostrándote antes qué cambia en cada fila.</>],
            [<><b>Borrar stock</b> 🗑</>, <>(Solo administradores) Pone en cero el stock de una o varias sucursales de una vez. Antes guarda un respaldo completo, que solo el superadministrador puede restaurar.</>],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Por qué un precio no es «USD × dólar» exacto">
        <p>
          Los pesos salen del precio de lista en dólares multiplicado por el dólar del negocio y
          <b> redondeados para arriba</b> al múltiplo configurado en Catálogo (hoy, la lista a $100 y el
          contado a $1.000). En los productos baratos ese redondeo pesa más que el dólar: por eso un
          cambio chico del dólar puede no mover un precio, y dividir pesos por dólares no da el dólar
          exacto. La tarjeta <b>Cómo se calculan los precios</b>, arriba de la lista, muestra la cuenta
          hecha sobre un producto real; cada precio también la trae al pasar el mouse.
        </p>
        <AyudaEjemplo titulo="adaptador de USD 2,04 con dólar $1.565">
          <p className="tnum">
            2,04 × 1.565 = $ 3.192,60 → redondeado para arriba a $100 → <b>$ 3.200</b> (parece «dólar
            1.569»). El contado: USD 1,63 × 1.565 = $ 2.550,95 → a $1.000 → <b>$ 3.000</b>. Con el
            redondeo en «Exacto», quedarían $ 3.193 y $ 2.551.
          </p>
        </AyudaEjemplo>
        <p>
          Un producto con la etiqueta <b>fijado en $</b> tiene el precio en pesos cargado a mano: no
          sigue al dólar hasta que se borre ese valor desde <b>Precio</b>.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Cómo cargar mercadería que llegó">
        <AyudaPasos
          pasos={[
            <>Pará en la pestaña de la sucursal donde entró (ej: <b>Solar</b>).</>,
            <>Buscá el producto (ej: <b>funda Spigen Liquid Air</b>). La búsqueda recorre todo el catálogo, tenga stock o no.</>,
            <>Tocá <b>+</b> por cada unidad, o <b>✎ Editar</b> para poner la cantidad exacta (ej: llegaron 10) y una nota tipo «pedido del mayorista».</>,
          ]}
        />
        <AyudaEjemplo titulo="llegaron 5 cargadores 20W a Centro">
          <p className="tnum">
            Pestaña Centro → buscar «fuente 20» → ✎ → cantidad 8 (había 3) → nota «llegó pedido»
            → Guardar. El movimiento queda registrado: +5, quién y cuándo.
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Transferir entre sucursales">
        <AyudaPasos
          pasos={[
            <>En la fila del producto tocá <b>⇄ Transferir</b>. Está en todas las pestañas, incluida <b>Todas</b>.</>,
            <>Elegí <b>desde</b> qué sucursal sale y <b>hacia</b> cuál va (cada opción muestra cuántas unidades tiene hoy). Si entraste parado en una sucursal, esa ya viene puesta como origen.</>,
            <>Poné las unidades. Abajo ves cómo queda cada sucursal después de mover.</>,
            <>Listo: sale de una y entra en la otra <b>en una sola operación</b> (nunca queda por la mitad), y queda asentado en el historial de las dos.</>,
          ]}
        />
        <AyudaEjemplo titulo="pasar 3 vidrios de Solar a Centro">
          <p className="tnum">
            Pestaña Solar → buscar «vidrio 15» → ⇄ Transferir → destino Centro → 3 → Transferir.
            Solar queda con 3 menos y Centro con 3 más.
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Importar la planilla de una sucursal">
        <p>
          Cuando cada local hace su conteo en el Excel del negocio, no hace falta cargarlo fila
          por fila: <b>Importar por sucursal</b> lo sube todo junto. Nada se toca hasta que vos
          lo confirmás.
        </p>
        <AyudaPasos
          pasos={[
            <>Elegí <b>de qué local</b> es la planilla (solo se toca el stock de esa sucursal).</>,
            <>Arrastrá el archivo <b>.xlsx</b> y tocá <b>Analizar planilla</b>.</>,
            <>Revisá el resultado: cada fila muestra <b>lo que hay hoy → lo que dice la planilla</b> y cuánto sube o baja. Los filtros de arriba separan las que suben, las que bajan, las nuevas y las que hay que revisar.</>,
            <><b>Destildá</b> lo que no quieras tocar (o usá «Desmarcar» y marcá solo lo que va) y tocá <b>Aplicar</b>.</>,
          ]}
        />
        <AyudaCampos
          campos={[
            [<>Celda vacía</>, <>Si la planilla no puso cantidad, esa fila <b>no se toca</b>: un vacío no es un cero. Aparecen en «Fuera de la importación».</>],
            [<><b>Nuevo</b></>, <>Ese producto no está en el catálogo. Marcarlo lo da de alta con el precio de lista de la planilla (solo administradores).</>],
            [<><b>Revisar</b></>, <>Hay más de un producto con ese nombre: elegís cuál es en el desplegable de la misma fila.</>],
            [<><b>Repetido</b></>, <>Dos filas de la planilla apuntan al mismo producto (ej: «8» y «8+» son un solo «8 / 8+»): dejás marcada una sola.</>],
            [<><b>Aproximado</b></>, <>El nombre no era idéntico y se buscó el más parecido. Chequeá que sea el correcto antes de aplicar.</>],
          ]}
        />
        <AyudaEjemplo titulo="Solar hizo el conteo del mes">
          <p className="tnum">
            Importar por sucursal → Solar → subir «Stock Solar.xlsx» → analizar → 201 suben, 57
            bajan, 2 nuevos → Aplicar. Cada cambio queda en el historial del producto con el
            nombre de la planilla.
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Borrar el stock de una sucursal (y volver atrás)">
        <p>
          Cuando un local arranca el conteo <b>de cero</b> —o lo que figura ya no existe—, el
          botón <b>Borrar stock</b> de arriba (solo administradores) pone en <b>0</b> todas las
          cantidades de las sucursales que elijas, de una sola vez. Se pueden marcar{' '}
          <b>varias juntas</b>.
        </p>
        <AyudaPasos
          pasos={[
            <>Marcá <b>una o más sucursales</b>. Cada tarjeta te dice cuántos productos, cuántas unidades y cuánta plata a lista tiene hoy.</>,
            <>Revisá el resumen: qué se borra, lo que más pesa y —sobre todo— <b>lo que NO se toca</b>.</>,
            <>Escribí <b>BORRAR</b> para confirmar. Recién ahí las cantidades se ponen en cero.</>,
          ]}
        />
        <AyudaCampos
          campos={[
            [<>Qué NO se borra</>, <>Los productos del catálogo, sus precios, las otras sucursales y el historial de movimientos y ventas. Lo único que cambia son las cantidades.</>],
            [<><b>Respaldo</b></>, <>Antes de borrar se guarda una foto producto por producto. Queda en la solapa <b>Respaldos</b>, con quién lo hizo, cuándo, el motivo y cuánto se borró.</>],
            [<><b>Restaurar</b></>, <>Devuelve el stock a como estaba. Lo hace <b>solo el superadministrador</b>. Si alguien volvió a cargar unidades desde entonces, te lo avisa y elegís: dejar todo como estaba o sumar lo guardado a lo de hoy.</>],
          ]}
        />
        <AyudaEjemplo titulo="Salta rehace el inventario desde cero">
          <p className="tnum">
            Borrar stock → marcar Salta (312 productos · 1.048 u.) → revisar → escribir BORRAR.
            Queda en 0 y con el respaldo guardado; si hizo falta volver atrás, el
            superadministrador lo restaura entero desde <b>Respaldos</b>.
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="El stock mínimo (alertas de reposición)">
        <p>
          Si a un producto le ponés un mínimo (ej: <b>2</b>), cuando la cantidad llega a ese
          número la fila se marca y el producto aparece en la vista «Bajo mínimo» y en el bloque
          «Reposición» del Panel. Sin mínimo cargado, no hay alerta.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Qué significa «(no informado)»">
        <p>
          Son los productos que en las planillas originales tenían la <b>celda de stock vacía</b>:
          nadie los contó, así que ese 0 <b>no es un conteo real</b>. Se muestran con un guion (—)
          y la etiqueta <b>(no informado)</b> para distinguirlos de un 0 de verdad. En cuanto
          alguien carga la cantidad real (con + / − o el ✎, aunque sea 0), la marca desaparece
          sola. La vista «No informado» los junta a todos para ir bajándolos con el conteo.
        </p>
      </AyudaSeccion>

      <AyudaTip>
        Todo cambio de stock queda en el historial con usuario, fecha, cantidad y nota (lo ves
        abajo del detalle ✎). Los administradores además pueden gestionar las sucursales desde el
        botón de arriba y ver el <b>costo</b> de cada producto. Los precios NO se editan acá:
        eso vive en Productos.
      </AyudaTip>
    </>
  )
}

// ================================================================ FICHA ====

export function AyudaFichaEquipo() {
  return (
    <>
      <AyudaSeccion titulo="Qué es esta pantalla">
        <p>
          La <b>vista 360° de un equipo</b>: elegís un modelo (o una línea completa) y ves junto
          todo lo que el negocio sabe de él, con datos vivos de los otros módulos.
        </p>
        <AyudaCampos
          campos={[
            ['Venta', 'Los productos del catálogo que SON ese equipo (ej: "iPhone 15 128GB" con su precio de venta).'],
            ['Toma de usado', 'Cuánto se paga por ese equipo usado, por capacidad, con el botón de WhatsApp y los descuentos al cotizar.'],
            ['Service', 'Todos los precios de reparación que le aplican (batería, módulo, cámaras…), con lista y cash.'],
            ['Accesorios compatibles', 'Fundas, templados y demás productos vinculados a ese equipo.'],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Cómo usarla en el mostrador">
        <AyudaEjemplo titulo="cliente con un 13 Pro: quiere venderlo, arreglarlo o cambiarlo">
          <AyudaPasos
            pasos={[
              <>Elegí <b>iPhone 13 Pro</b> en el selector.</>,
              <>“¿Cuánto me dan?” → bloque <b>Toma de usado</b>: 128 GB US$ 310–330. Botón WhatsApp si es por chat.</>,
              <>“¿Y arreglarle la batería?” → bloque <b>Service</b>: Baterías US$ 100 · $ 155.000 (cash $ 124.000).</>,
              <>“¿Tenés uno nuevo / una funda?” → bloques <b>Venta</b> y <b>Accesorios</b>.</>,
            ]}
          />
        </AyudaEjemplo>
        <p>
          Eligiendo <b>«Línea 13 (completa)»</b> ves lo mismo para toda la familia (13 mini, 13,
          13 Pro, 13 Pro Max y SE 2022) — útil cuando el cliente no sabe el modelo exacto.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="¿Por qué a veces falta un bloque?">
        <AyudaCampos
          campos={[
            ['No hay datos', 'Un bloque sin información no se muestra. Ej: el bloque Venta aparece recién cuando se cargan iPhones en Productos (con el equipo vinculado).'],
            ['Permisos', 'Cada bloque respeta el permiso de su módulo: si tu cuenta no puede ver Cotizaciones, no vas a ver la toma de usados.'],
            ['¿Cómo lleno Venta?', 'En Productos → Configurar → categoría iPhones → Nuevo producto, y vinculale el equipo. La guía ⓘ de esa pantalla tiene el paso a paso.'],
          ]}
        />
      </AyudaSeccion>
    </>
  )
}

// ============================================================ CAJA ====

export function AyudaCaja() {
  return (
    <>
      <AyudaSeccion titulo="Qué es esta pantalla">
        <p>
          Es el <b>control del efectivo y de los cobros del día</b>, con el mismo modelo que usan
          los POS profesionales (Square, Shopify, Odoo, Fudo): se <b>abre un turno</b> declarando el
          fondo, se registran los <b>movimientos</b> (ventas, ingresos, egresos, retiros) y al final
          se hace el <b>arqueo</b>: contás lo que hay, el sistema lo compara con lo que debería
          haber y emite un <b>comprobante Z</b> inmutable. Todo queda guardado de verdad en el
          servidor, igual que el stock.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Las dos cajas: lo del RI y lo demás">
        <p>
          La plata se separa sola en <b>dos cajas</b> según cómo se factura la venta:
          «<b>Facturación RI</b>» recibe lo facturado con Responsable Inscripto (Factura A/B) y
          «<b>Monotributo y sin factura</b>» recibe la Factura C del monotributo y las ventas sin
          factura. Al registrar la venta elegís cómo se factura y <b>el sistema la manda a la caja
          correcta</b>, sin importar cuál tengas seleccionada en pantalla. Cada caja tiene su
          propio turno, su arqueo y sus comprobantes Z, así los números de cada régimen nunca se
          mezclan.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Cada sucursal con su caja">
        <p>
          Un administrador puede <b>separar las cajas por sucursal</b> desde «Configurar»: cada
          sucursal que tiene caja recibe sus dos cajas (Facturación RI y Monotributo y sin factura),
          con su propio turno y su propio cierre. Arriba elegís <b>de qué sucursal</b> es la caja
          (arranca en la tuya) y la venta entra sola a las cajas <b>de la sucursal de la venta</b>:
          la plata de un local nunca cae en el cajón de otro. Una sucursal <b>sin caja</b> vende
          igual, pero sus ventas no entran a ningún arqueo.
        </p>
        <p>
          Si tu cuenta tiene una <b>sucursal asignada</b>, ves y operás <b>solo la caja de tu
          sucursal</b> (su turno, sus movimientos y sus cierres). El administrador y el
          superadministrador ven todas: arriba eligen una sucursal o <b>«Todas»</b>, que muestra las
          cajas de cada sucursal agrupadas.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="La venta de mostrador (el botón VERDE)">
        <p>
          El botón <b>verde</b> «Registrar venta» es la puerta de entrada de la plata: una venta
          ahí <b>descuenta el stock del Inventario al instante</b> Y <b>entra sola al arqueo</b> de
          la caja que corresponde, con su medio de pago. Una sola carga para las dos cosas. Si esa
          caja no tiene turno abierto, la venta vale igual (el stock baja) pero te avisa que no
          entró en ningún arqueo.
        </p>
        <AyudaPasos
          pasos={[
            <>Tocá <b>«Registrar venta»</b> y elegí la <b>sucursal</b> de la que sale la mercadería.</>,
            <>Marcá <b>cómo se factura</b> (Sin factura, Factura C o Factura A/B): eso decide a qué caja entra la plata, y abajo te muestra a cuál.</>,
            <>Si marcaste Factura C o A/B, al guardar te ofrece <b>«Facturar ahora»</b>: te lleva a Facturación con los ítems precargados para emitir el comprobante con CAE (mismo flujo de siempre; el stock no se vuelve a descontar).</>,
            <>Buscá los productos (el precio se sugiere solo: <b>cash</b> para efectivo/transferencia, <b>lista</b> para tarjeta) y ajustá cantidades o precios si hace falta.</>,
            <>Elegí la forma de pago y confirmá: el stock baja al instante y la venta queda registrada.</>,
          ]}
        />
        <AyudaEjemplo titulo="venden una funda y un templado en Solar">
          <p className="tnum">
            Registrar venta → Solar → «Silicone Case» (+1) y «Templado 9D» (+1) → Efectivo →
            Registrar. En Inventario: Silicone Case y Templado bajan 1 en Solar, con el
            movimiento «Venta #12» a tu nombre.
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Abrir el turno">
        <AyudaPasos
          pasos={[
            <>Tocá <b>«Abrir caja»</b> y declará el <b>fondo inicial</b>. Se sugiere solo el fondo que dejó el último cierre: si ayer dejaste <span className="tnum">$ 10.000</span>, hoy arrancás con <span className="tnum">$ 10.000</span>.</>,
            <>Si querés precisión total, usá <b>«Contar el fondo por billetes»</b>: la grilla arma el monto sola.</>,
            <>Con <b>«Nuevo»</b> cargás los movimientos manuales de efectivo: ingresos, egresos con motivo y <b>retiros a bóveda</b> para no acumular plata en el cajón (la mejor práctica antirrobo). Las ventas NO van por acá: van por el botón verde.</>,
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Cerrar la caja, paso a paso">
        <p>
          Tocá <b>«Cerrar caja»</b> y seguí las pantallas: una sola cosa por vez, con un
          <b> «¿Qué hago acá?»</b> en cada una. Arriba ves en qué paso estás y cuántos faltan; abajo
          siempre tenés el botón para seguir (y «Volver» si te equivocaste).
        </p>
        <AyudaPasos
          pasos={[
            <><b>Antes de empezar:</b> tildás las tareas del local y, si hubo tarjetas, el <b>cierre de lote del posnet</b> (la maquinita imprime un ticket con el total de tarjetas). Si no hay nada para tildar, este paso no aparece.</>,
            <><b>Contar efectivo:</b> tocás cada billete una vez por cada uno que tenés (o escribís el total, según cómo esté configurado). Las monedas van juntas en «Monedas y sueltos».</>,
            <><b>Otros cobros:</b> para cada transferencia o tarjeta te pregunta <b>«¿Es lo mismo que ves?»</b>. Si es igual, tocás «Sí»; si no, escribís lo que ves en el banco o en el ticket.</>,
            <><b>¿Cuadra?:</b> la respuesta grande — cuadra, falta o sobra — y la cuenta explicada renglón por renglón. Si no cuadra, primero te ofrece <b>volver a contar</b>.</>,
            <><b>Para mañana:</b> elegís cuánta plata queda en el cajón para dar vuelto; el resto se guarda aparte.</>,
            <><b>Cerrar:</b> ves todo el resumen en palabras (con «Cambiar» al lado de cada parte) y tocás <b>«Cerrar la caja»</b>. Se guarda el comprobante <b>Z</b> y te dice qué hacer con la plata.</>,
          ]}
        />
        <AyudaEjemplo titulo="la caja no cuadra">
          <p>
            Tendría que haber <span className="tnum">$ 153.500</span> y contaste <span className="tnum">$ 152.500</span> →
            el paso «¿Cuadra?» muestra <b>«Falta plata: $ 1.000»</b>. Primero volvé a contar (casi
            siempre es un billete que se pasó). Si igual falta y la diferencia es chica, tocás «Vi la
            diferencia»; si es grande, elegís qué pasó y lo contás con tus palabras. Todo queda en el
            comprobante para siempre.
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Configurar (solo administradores)">
        <p>
          En <b>«Configurar»</b> la pestaña <b>«Cierre de caja»</b> está ordenada igual que el cierre:
          arriba ves qué pasos va a ver quien cierra, y abajo las opciones de cada paso, todas con su
          explicación. Los cambios se guardan solos.
        </p>
        <AyudaCampos
          campos={[
            ['Tareas antes de cerrar', 'Una lista propia del local («Cerrar la persiana», «Guardar los celulares»…) que hay que tildar antes de contar. Quedan en el comprobante.'],
            ['Pedir el cierre del posnet', 'Si hubo ventas con tarjeta, pide confirmar el cierre de lote antes de contar.'],
            ['Cómo se cuenta', 'Billete por billete (recomendado), escribiendo el total, o que elija quien cierra.'],
            ['Esconder cuánto tendría que haber', 'Quien cuenta no ve el número esperado hasta terminar: así cuenta de verdad (antes se llamaba «cierre ciego»).'],
            ['Revisar transferencias y tarjetas', 'Apagado, ese paso no aparece y se toma lo que anotó el sistema.'],
            ['Cuándo explicar una diferencia', 'Solo si es grande (más de un monto), siempre, o nunca.'],
            ['Plata para mañana', 'Preguntar cada vez, dejar siempre el mismo monto, o dejar toda la plata en la caja.'],
            ['Cajas y sucursales', 'Retiros durante el día, varias cajas, caja por sucursal y la lista de cajas con su tipo.'],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Modo práctica (para aprender sin miedo)">
        <p>
          El botón <b>«Práctica»</b> (el del matraz) abre una <b>caja de mentira</b> con una guía de
          4 pasos que se tilda sola: abrir, vender, mover plata y cerrar con arqueo. Todo lo de ese
          modo es de juguete — <b>no toca el stock, no se guarda nada</b> y desaparece al salir. El
          cierre de práctica sigue <b>la misma configuración</b> que el real (tareas, forma de contar,
          plata para mañana), así se ensaya exactamente lo que después se hace. Es la forma ideal de
          enseñarle la caja a alguien nuevo antes de operar en serio.
        </p>
      </AyudaSeccion>

      <AyudaTip>
        Los cierres son <b>inmutables</b>: si algo quedó mal cargado, se corrige con un movimiento
        en el turno siguiente, nunca editando un Z. Tocá cualquier fila del historial para ver el
        comprobante completo, con el detalle de billetes contados.
      </AyudaTip>
    </>
  )
}
