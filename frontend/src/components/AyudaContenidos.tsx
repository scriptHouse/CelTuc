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
            ['Cash −30 %', 'Esa categoría tiene un descuento cash distinto del general (auriculares y smartwatch).'],
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

      <AyudaSeccion titulo="Cómo actualizar el dólar del negocio (solo admins)">
        <AyudaPasos
          pasos={[
            <>Mirá la referencia: si el blue se movió y tu margen quedó corto, es momento de actualizar.</>,
            <>Escribí el valor nuevo en el campo (ej: <b>1600</b>) y tocá <b>Guardar</b>.</>,
            <>Listo: <b>todas</b> las listas (Service y Productos) quedan recalculadas al instante. Los precios que alguna vez se pisaron a mano no se tocan.</>,
          ]}
        />
        <AyudaEjemplo titulo="el blue subió de $1.510 a $1.600">
          <p className="tnum">
            Tu dólar está en $ 1.550 → quedaste <b>por debajo</b> del mercado. Lo subís a
            $ 1.650 (para recuperar el margen) → la batería que costaba $ 155.000 pasa a
            $ 165.000 automáticamente, en las dos listas.
          </p>
        </AyudaEjemplo>
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
            [<>Vistas</>, <>«Con stock» es el día a día; «Todo el catálogo» muestra también lo que está en 0; «Bajo mínimo» es la lista de reposición.</>],
            [<>Botones − / +</>, <>Restan o suman de a una unidad (vendí una / encontré una). Quedan registrados con tu usuario.</>],
            [<>El lápiz ✎</>, <>Abre el detalle: cantidad exacta, stock mínimo, transferencia a otra sucursal y los últimos movimientos.</>],
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Cómo cargar mercadería que llegó">
        <AyudaPasos
          pasos={[
            <>Pará en la pestaña de la sucursal donde entró (ej: <b>Solar</b>).</>,
            <>Buscá el producto (ej: <b>funda Spigen Liquid Air</b>). La búsqueda recorre todo el catálogo, tenga stock o no.</>,
            <>Tocá <b>+</b> por cada unidad, o el <b>✎</b> para poner la cantidad exacta (ej: llegaron 10) y una nota tipo «pedido del mayorista».</>,
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
            <>Abrí el <b>✎</b> del producto parado en la sucursal de <b>origen</b>.</>,
            <>En «Transferir a otra sucursal» poné la cantidad y el destino.</>,
            <>Listo: sale de una y entra en la otra <b>en una sola operación</b> (nunca queda por la mitad).</>,
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="El stock mínimo (alertas de reposición)">
        <p>
          Si a un producto le ponés un mínimo (ej: <b>2</b>), cuando la cantidad llega a ese
          número la fila se marca y el producto aparece en la vista «Bajo mínimo» y en el bloque
          «Reposición» del Panel. Sin mínimo cargado, no hay alerta.
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
          haber y emite un <b>comprobante Z</b> inmutable.
        </p>
      </AyudaSeccion>

      <AyudaSeccion titulo="Abrir el turno">
        <AyudaPasos
          pasos={[
            <>Tocá <b>«Abrir caja»</b> y declará el <b>fondo inicial</b> (el efectivo que queda en el cajón para dar vuelto). Se sugiere el fondo que dejó el último cierre.</>,
            <>Si querés precisión total, usá <b>«Contar el fondo por billetes»</b>: la grilla arma el monto sola.</>,
            <>Durante el día, cargá cada movimiento con <b>«Nuevo»</b>: ventas con su medio de pago, egresos con motivo, y <b>retiros a bóveda</b> para no acumular efectivo (la mejor práctica antirrobo).</>,
          ]}
        />
      </AyudaSeccion>

      <AyudaSeccion titulo="Cerrar la caja (3 pasos)">
        <AyudaPasos
          pasos={[
            <><b>Revisar:</b> el checklist confirma que no quede nada afuera (si hubo tarjetas, te pide el <b>cierre de lote</b> de la terminal).</>,
            <><b>Contar:</b> el efectivo con la grilla de billetes (+ «Sueltos» para monedas) y los otros medios contra el ticket de lote y los extractos.</>,
            <><b>Confirmar:</b> ves la diferencia por medio (sobrante / faltante), definís cuánto queda de <b>fondo para el próximo turno</b> — el sistema calcula cuánto retirar — y se emite el <b>Z</b>.</>,
          ]}
        />
        <AyudaEjemplo titulo="la caja no cuadra">
          <p>
            Esperado <span className="tnum">$ 153.500</span>, contado <span className="tnum">$ 152.500</span> →
            el paso 3 muestra <b>«Faltante $ 1.000»</b>. Si está dentro de la tolerancia, confirmás
            y listo; si la supera, tenés que recontar o dejar <b>motivo y nota</b>, que quedan en el
            comprobante para siempre.
          </p>
        </AyudaEjemplo>
      </AyudaSeccion>

      <AyudaSeccion titulo="Funciones que podés prender y apagar (Configurar)">
        <AyudaCampos
          campos={[
            ['Cierre ciego', 'Quien cuenta no ve el «esperado» del efectivo hasta confirmar. Evita conteos acomodados y muestra las diferencias reales.'],
            ['Tolerancia', 'Si la diferencia supera el monto configurado, el cierre exige motivo + nota (patrón Toast/Fudo).'],
            ['Retiros a bóveda', 'Habilita el movimiento de retiro parcial durante el turno.'],
            ['Multi-caja', 'Varias cajas nombradas (Mostrador, Service…), cada una con su turno y su arqueo.'],
            ['Billetes de la grilla', 'Qué denominaciones muestra el arqueo; lo que no está en la grilla va por «Sueltos».'],
          ]}
        />
      </AyudaSeccion>

      <AyudaTip>
        Los cierres son <b>inmutables</b>: si algo quedó mal cargado, se corrige con un movimiento
        en el turno siguiente, nunca editando un Z. Tocá cualquier fila del historial para ver el
        comprobante completo, con el detalle de billetes contados.
      </AyudaTip>
    </>
  )
}
