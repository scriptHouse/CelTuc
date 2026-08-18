"""Tests del sistema de inconsistencias: qué se reporta, cuándo y quién lo cierra.

Dos mitades bien distintas:

- El **motor** (`jornada.detectar`) es puro: recibe el día ya analizado y el
  catálogo de reglas, y dice qué hay para revisar. Se prueba sin base.
- La **API** agrega lo que sí vive en la base: las reglas configuradas, la
  sucursal sin reloj y las justificaciones.

Lo que más se cuida acá es que apagar una regla apague de verdad (no solo la
inconsistencia, también el estado del día), y que una justificación sobreviva
a que se recalcule todo.
"""
from datetime import date, datetime, time, timedelta

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from empleados.models import Empleado
from inventario.models import Sucursal
from usuarios.models import Usuario

from . import jornada as J
from .models import (
    AsignacionSucursal,
    AsignacionTurno,
    Dispositivo,
    EstadoInconsistencia,
    EstadoMapeo,
    Feriado,
    Fichada,
    JustificacionInconsistencia,
    ReglaInconsistencia,
    Severidad,
    TipoFeriado,
    TipoInconsistencia,
    TramoTurno,
    Turno,
    hash_evento,
    resolver_reglas,
)

LUNES = date(2026, 8, 17)
T = TipoInconsistencia


def regla(tipo, *, activa=True, umbral=None, severidad=Severidad.MODERADA, justificar=True):
    return {
        'tipo': tipo, 'activa': activa, 'umbral': umbral,
        'severidad': severidad, 'requiere_justificacion': justificar,
    }


def catalogo(*reglas):
    return {r['tipo']: r for r in reglas}


def f(hora, minuto=0):
    from types import SimpleNamespace

    momento = timezone.make_aware(datetime.combine(LUNES, time(hora, minuto)))
    return SimpleNamespace(ocurrida_en=momento, tipo='unknown')


def turno_de_prueba(entrada=time(9, 0), salida=time(18, 0), dias=(0,), **kwargs):
    turno = Turno.objects.create(nombre=kwargs.pop('nombre', 'Comercio'), **kwargs)
    for dia in dias:
        TramoTurno.objects.create(
            turno=turno, indice_dia=dia, hora_entrada=entrada, hora_salida=salida
        )
    return turno


def tipos(jornada):
    return {i.tipo for i in jornada.inconsistencias}


class MotorSinReglasTests(TestCase):
    """Sin catálogo, el módulo se comporta como antes de que existiera."""

    def test_no_inventa_inconsistencias(self):
        turno = turno_de_prueba()
        jornada = J.calcular(LUNES, [f(9, 40), f(18)], turno=turno)
        self.assertEqual(jornada.inconsistencias, [])
        self.assertEqual(jornada.estado, 'tarde')  # el estado sí se sigue calculando


class MotorPuntualidadTests(TestCase):
    def setUp(self):
        self.turno = turno_de_prueba(tolerancia_entrada=10, tolerancia_salida=10)

    def test_llegada_tarde_sobre_el_umbral(self):
        reglas = catalogo(regla(T.LLEGADA_TARDE, umbral=10))
        jornada = J.calcular(LUNES, [f(9, 25), f(18)], turno=self.turno, reglas=reglas)
        self.assertEqual(tipos(jornada), {T.LLEGADA_TARDE})
        self.assertEqual(jornada.inconsistencias[0].minutos, 25)

    def test_dentro_del_umbral_no_es_inconsistencia(self):
        reglas = catalogo(regla(T.LLEGADA_TARDE, umbral=10))
        jornada = J.calcular(LUNES, [f(9, 8), f(18)], turno=self.turno, reglas=reglas)
        self.assertEqual(jornada.inconsistencias, [])
        self.assertEqual(jornada.estado, 'ok')

    def test_el_umbral_de_la_regla_le_gana_a_la_tolerancia_del_turno(self):
        """Turno tolera 10; la regla exige 30: a los 20 minutos no pasa nada."""
        reglas = catalogo(regla(T.LLEGADA_TARDE, umbral=30))
        jornada = J.calcular(LUNES, [f(9, 20), f(18)], turno=self.turno, reglas=reglas)
        self.assertEqual(jornada.inconsistencias, [])
        self.assertEqual(jornada.estado, 'ok')
        self.assertEqual(jornada.llegada_tarde_minutos, 0)

    def test_umbral_vacio_usa_la_tolerancia_del_turno(self):
        reglas = catalogo(regla(T.LLEGADA_TARDE, umbral=None))
        jornada = J.calcular(LUNES, [f(9, 20), f(18)], turno=self.turno, reglas=reglas)
        self.assertEqual(tipos(jornada), {T.LLEGADA_TARDE})

    def test_apagar_la_regla_tambien_apaga_el_estado(self):
        """Apagar «llegó tarde» es decir que no interesa: el día queda en OK."""
        reglas = catalogo(regla(T.LLEGADA_TARDE, activa=False))
        jornada = J.calcular(LUNES, [f(10, 30), f(18)], turno=self.turno, reglas=reglas)
        self.assertEqual(jornada.inconsistencias, [])
        self.assertEqual(jornada.llegada_tarde_minutos, 0)
        self.assertEqual(jornada.estado, 'ok')

    def test_salida_temprana(self):
        reglas = catalogo(regla(T.SALIDA_TEMPRANA, umbral=12))
        jornada = J.calcular(LUNES, [f(9), f(17, 30)], turno=self.turno, reglas=reglas)
        self.assertEqual(tipos(jornada), {T.SALIDA_TEMPRANA})
        self.assertEqual(jornada.inconsistencias[0].minutos, 30)

    def test_salida_temprana_dentro_del_umbral(self):
        reglas = catalogo(regla(T.SALIDA_TEMPRANA, umbral=12))
        jornada = J.calcular(LUNES, [f(9), f(17, 50)], turno=self.turno, reglas=reglas)
        self.assertEqual(jornada.inconsistencias, [])


class MotorMarcasFaltantesTests(TestCase):
    """El número impar de marcas: falta una punta, hay que decir cuál."""

    def setUp(self):
        self.turno = turno_de_prueba()
        self.reglas = catalogo(
            regla(T.FALTA_SALIDA, severidad=Severidad.GRAVE),
            regla(T.FALTA_ENTRADA, umbral=180, severidad=Severidad.GRAVE),
            regla(T.LLEGADA_TARDE, umbral=10),
        )

    def test_entro_y_no_marco_la_salida(self):
        jornada = J.calcular(LUNES, [f(9)], turno=self.turno, reglas=self.reglas)
        self.assertEqual(tipos(jornada), {T.FALTA_SALIDA})
        self.assertEqual(jornada.estado, 'incompleta')

    def test_una_sola_marca_muy_tarde_es_una_entrada_que_falto(self):
        """A las 17:00 con turno 9 a 18: esa marca es la salida, no la entrada."""
        jornada = J.calcular(LUNES, [f(17)], turno=self.turno, reglas=self.reglas)
        self.assertEqual(tipos(jornada), {T.FALTA_ENTRADA})

    def test_si_falto_la_entrada_no_se_reporta_ademas_una_tardanza(self):
        """El atraso mediría una marca que no es la de llegada: sería inventado."""
        jornada = J.calcular(LUNES, [f(17)], turno=self.turno, reglas=self.reglas)
        self.assertNotIn(T.LLEGADA_TARDE, tipos(jornada))
        self.assertNotIn(T.FALTA_SALIDA, tipos(jornada))

    def test_tres_marcas_tambien_dejan_la_jornada_abierta(self):
        jornada = J.calcular(LUNES, [f(9), f(13), f(14)], turno=self.turno, reglas=self.reglas)
        self.assertIn(T.FALTA_SALIDA, tipos(jornada))


class MotorRestoDeTiposTests(TestCase):
    def setUp(self):
        self.turno = turno_de_prueba(dias=(0,))  # solo trabaja los lunes

    def test_ausencia(self):
        reglas = catalogo(regla(T.AUSENCIA, severidad=Severidad.GRAVE))
        jornada = J.calcular(LUNES, [], turno=self.turno, reglas=reglas)
        self.assertEqual(tipos(jornada), {T.AUSENCIA})
        self.assertEqual(jornada.estado, 'ausente')

    def test_pausa_excesiva(self):
        reglas = catalogo(regla(T.PAUSA_EXCESIVA, umbral=90))
        jornada = J.calcular(
            LUNES, [f(9), f(13), f(15, 30), f(18)], turno=self.turno, reglas=reglas
        )
        self.assertEqual(tipos(jornada), {T.PAUSA_EXCESIVA})
        self.assertEqual(jornada.inconsistencias[0].minutos, 150)

    def test_una_pausa_corta_no_molesta(self):
        reglas = catalogo(regla(T.PAUSA_EXCESIVA, umbral=90))
        jornada = J.calcular(
            LUNES, [f(9), f(13), f(14), f(18)], turno=self.turno, reglas=reglas
        )
        self.assertEqual(jornada.inconsistencias, [])

    def test_exceso_de_jornada(self):
        reglas = catalogo(regla(T.EXCESO_JORNADA, umbral=60, justificar=False))
        jornada = J.calcular(LUNES, [f(8), f(20)], turno=self.turno, reglas=reglas)
        self.assertEqual(tipos(jornada), {T.EXCESO_JORNADA})
        self.assertEqual(jornada.inconsistencias[0].minutos, 180)
        self.assertFalse(jornada.inconsistencias[0].requiere_justificacion)
        self.assertEqual(jornada.pendientes, 0)

    def test_jornada_incompleta(self):
        reglas = catalogo(regla(T.JORNADA_INCOMPLETA, umbral=30))
        jornada = J.calcular(LUNES, [f(9), f(16)], turno=self.turno, reglas=reglas)
        self.assertEqual(tipos(jornada), {T.JORNADA_INCOMPLETA})
        self.assertEqual(jornada.inconsistencias[0].minutos, 120)

    def test_trabajo_en_su_dia_franco(self):
        reglas = catalogo(regla(T.DIA_NO_LABORABLE, justificar=False))
        martes = LUNES + timedelta(days=1)
        jornada = J.calcular(martes, [f(9), f(18)], turno=self.turno, reglas=reglas)
        self.assertEqual(jornada.estado, 'no_laborable')
        self.assertEqual(tipos(jornada), {T.DIA_NO_LABORABLE})

    def test_trabajo_en_feriado(self):
        reglas = catalogo(regla(T.TRABAJO_EN_FERIADO, justificar=False))
        feriado = Feriado.objects.create(
            fecha=LUNES, nombre='Día de prueba', tipo=TipoFeriado.NACIONAL
        )
        jornada = J.calcular(
            LUNES, [f(9), f(18)], turno=self.turno, feriado=feriado, reglas=reglas
        )
        self.assertEqual(tipos(jornada), {T.TRABAJO_EN_FERIADO})

    def test_un_feriado_sin_trabajo_no_reporta_nada(self):
        reglas = catalogo(regla(T.TRABAJO_EN_FERIADO), regla(T.AUSENCIA))
        feriado = Feriado.objects.create(
            fecha=LUNES, nombre='Día de prueba', tipo=TipoFeriado.NACIONAL
        )
        jornada = J.calcular(LUNES, [], turno=self.turno, feriado=feriado, reglas=reglas)
        self.assertEqual(jornada.inconsistencias, [])

    def test_con_licencia_no_se_reporta_nada(self):
        from .models import Licencia, TipoLicencia

        empleado = Empleado.objects.create(nombre='Nacho')
        licencia = Licencia.objects.create(
            empleado=empleado, tipo=TipoLicencia.VACACIONES, desde=LUNES, hasta=LUNES
        )
        reglas = catalogo(regla(T.AUSENCIA), regla(T.LLEGADA_TARDE, umbral=10))
        jornada = J.calcular(LUNES, [], turno=self.turno, licencia=licencia, reglas=reglas)
        self.assertEqual(jornada.inconsistencias, [])

    def test_sucursal_incorrecta(self):
        reglas = catalogo(regla(T.SUCURSAL_INCORRECTA))
        jornada = J.calcular(
            LUNES, [f(9), f(18)], turno=self.turno, reglas=reglas,
            sucursal_esperada={'id': 1, 'nombre': 'Yerba Buena'},
            sucursales_fichadas=[{'id': 2, 'nombre': 'Salta'}],
        )
        self.assertIn(T.SUCURSAL_INCORRECTA, tipos(jornada))
        detalle = jornada.inconsistencias[0].detalle
        self.assertIn('Yerba Buena', detalle)
        self.assertIn('Salta', detalle)


class MotorSinRelojTests(TestCase):
    """Sin reloj en la sucursal no se le puede exigir una marca a nadie."""

    def setUp(self):
        self.turno = turno_de_prueba()
        self.reglas = catalogo(
            regla(T.AUSENCIA), regla(T.LLEGADA_TARDE, umbral=10),
            regla(T.SALIDA_TEMPRANA, umbral=10), regla(T.FALTA_SALIDA),
        )

    def test_no_se_juzga_nada(self):
        jornada = J.calcular(
            LUNES, [f(10, 30)], turno=self.turno, reglas=self.reglas, evaluar=False
        )
        self.assertEqual(jornada.estado, 'sin_reloj')
        self.assertEqual(jornada.inconsistencias, [])
        self.assertEqual(jornada.llegada_tarde_minutos, 0)
        self.assertEqual(jornada.salida_temprana_minutos, 0)

    def test_igual_muestra_las_horas_trabajadas(self):
        """No juzgar no es esconder: lo que hizo se sigue viendo."""
        jornada = J.calcular(
            LUNES, [f(9), f(18)], turno=self.turno, reglas=self.reglas, evaluar=False
        )
        self.assertEqual(jornada.minutos_trabajados, 540)
        self.assertEqual(jornada.minutos_esperados, 540)
        self.assertEqual(len(jornada.tramos), 1)


class ReglasPorTurnoTests(TestCase):
    def setUp(self):
        self.dia = turno_de_prueba(nombre='Día')
        self.noche = turno_de_prueba(nombre='Noche')

    def test_la_regla_del_turno_le_gana_a_la_global(self):
        ReglaInconsistencia.objects.filter(
            tipo=T.LLEGADA_TARDE, turno__isnull=True
        ).update(umbral_minutos=5)
        ReglaInconsistencia.objects.create(
            tipo=T.LLEGADA_TARDE, turno=self.noche, umbral_minutos=45
        )
        todas = list(ReglaInconsistencia.objects.all())

        self.assertEqual(resolver_reglas(todas, self.dia.id)[T.LLEGADA_TARDE]['umbral'], 5)
        self.assertEqual(resolver_reglas(todas, self.noche.id)[T.LLEGADA_TARDE]['umbral'], 45)

    def test_sin_regla_propia_el_turno_usa_la_global(self):
        ReglaInconsistencia.objects.filter(
            tipo=T.AUSENCIA, turno__isnull=True
        ).update(activa=False)
        todas = list(ReglaInconsistencia.objects.all())
        self.assertFalse(resolver_reglas(todas, self.noche.id)[T.AUSENCIA]['activa'])


class InconsistenciasAPITests(TestCase):
    """El circuito completo: se detecta, se lista, se justifica, se reabre."""

    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.sucursal = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=self.sucursal, nombre='Reloj Salta', host='192.168.1.31'
        )
        self.empleado = Empleado.objects.create(nombre='Nacho', sucursal=self.sucursal)
        turno = turno_de_prueba(dias=(0, 1, 2, 3, 4), tolerancia_entrada=10)
        AsignacionTurno.objects.create(
            empleado=self.empleado, turno=turno, desde=date(2026, 1, 1)
        )

    def _fichar(self, hora, minuto=0):
        momento = timezone.make_aware(datetime.combine(LUNES, time(hora, minuto)))
        return Fichada.objects.create(
            dispositivo=self.dispositivo, empleado=self.empleado,
            estado_mapeo=EstadoMapeo.MAPEADA, numero_reloj='Nacho',
            ocurrida_en=momento, tipo='unknown', metodo='multiple',
            hash_evento=hash_evento(
                self.dispositivo.id, '', 'Nacho', momento, 'unknown', 'multiple'
            ),
        )

    def _listar(self, **extra):
        params = {'desde': LUNES.isoformat(), 'hasta': LUNES.isoformat()}
        params.update(extra)
        return self.cliente.get(reverse('asistencia:inconsistencias'), params)

    def _resolver(self, tipo, **extra):
        cuerpo = {
            'empleado': self.empleado.id, 'fecha': LUNES.isoformat(), 'tipo': tipo,
        }
        cuerpo.update(extra)
        return self.cliente.post(
            reverse('asistencia:inconsistencia-resolver'), cuerpo, format='json'
        )

    def test_las_reglas_recomendadas_vienen_cargadas(self):
        respuesta = self.cliente.get(reverse('asistencia:reglas'), {'globales': '1'})
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(len(respuesta.data), len(T.choices))

    def test_el_catalogo_se_explica_solo(self):
        respuesta = self.cliente.get(reverse('asistencia:inconsistencias-catalogo'))
        self.assertEqual(respuesta.status_code, 200)
        tarde = next(t for t in respuesta.data['tipos'] if t['tipo'] == T.LLEGADA_TARDE)
        self.assertTrue(tarde['usa_umbral'])
        self.assertTrue(tarde['ayuda'])
        falta_salida = next(
            t for t in respuesta.data['tipos'] if t['tipo'] == T.FALTA_SALIDA
        )
        self.assertFalse(falta_salida['usa_umbral'])

    def test_detecta_la_tardanza_con_las_reglas_de_la_base(self):
        self._fichar(9, 40)
        self._fichar(18)
        respuesta = self._listar()
        self.assertEqual(respuesta.status_code, 200)
        fila = respuesta.data['resultados'][0]
        self.assertEqual(fila['tipo'], T.LLEGADA_TARDE)
        self.assertEqual(fila['minutos'], 40)
        self.assertEqual(fila['estado'], 'pendiente')
        self.assertEqual(respuesta.data['resumen']['pendientes'], 1)

    def test_apagar_la_regla_la_hace_desaparecer(self):
        self._fichar(9, 40)
        self._fichar(18)
        regla_tarde = ReglaInconsistencia.objects.get(
            tipo=T.LLEGADA_TARDE, turno__isnull=True
        )
        self.cliente.patch(
            reverse('asistencia:regla', args=[regla_tarde.id]),
            {'activa': False}, format='json',
        )
        self.assertEqual(self._listar().data['resultados'], [])

    def test_subir_el_umbral_la_hace_desaparecer(self):
        self._fichar(9, 40)
        self._fichar(18)
        regla_tarde = ReglaInconsistencia.objects.get(
            tipo=T.LLEGADA_TARDE, turno__isnull=True
        )
        self.cliente.patch(
            reverse('asistencia:regla', args=[regla_tarde.id]),
            {'umbral_minutos': 60}, format='json',
        )
        self.assertEqual(self._listar().data['resultados'], [])

    def test_justificar_la_saca_de_pendientes(self):
        self._fichar(9, 40)
        self._fichar(18)
        respuesta = self._resolver(T.LLEGADA_TARDE, motivo='Vino del médico con certificado')
        self.assertEqual(respuesta.status_code, 201, respuesta.data)

        datos = self._listar().data
        self.assertEqual(datos['resultados'][0]['estado'], 'justificada')
        self.assertEqual(
            datos['resultados'][0]['motivo'], 'Vino del médico con certificado'
        )
        self.assertEqual(datos['resumen']['pendientes'], 0)
        self.assertEqual(datos['resumen']['justificadas'], 1)

    def test_justificar_sin_motivo_no_se_acepta(self):
        self._fichar(9, 40)
        self._fichar(18)
        self.assertEqual(self._resolver(T.LLEGADA_TARDE, motivo='').status_code, 400)

    def test_rechazar_no_necesita_motivo_pero_deja_de_estar_pendiente(self):
        self._fichar(9, 40)
        self._fichar(18)
        respuesta = self._resolver(T.LLEGADA_TARDE, estado=EstadoInconsistencia.RECHAZADA)
        self.assertEqual(respuesta.status_code, 201, respuesta.data)
        datos = self._listar().data
        self.assertEqual(datos['resultados'][0]['estado'], 'rechazada')
        self.assertEqual(datos['resumen']['pendientes'], 0)

    def test_se_puede_volver_a_dejar_pendiente(self):
        self._fichar(9, 40)
        self._fichar(18)
        self._resolver(T.LLEGADA_TARDE, motivo='Me equivoqué')
        borrado = self.cliente.delete(
            reverse('asistencia:inconsistencia-resolver'),
            {'empleado': self.empleado.id, 'fecha': LUNES.isoformat(),
             'tipo': T.LLEGADA_TARDE},
            format='json',
        )
        self.assertEqual(borrado.status_code, 204)
        self.assertEqual(self._listar().data['resultados'][0]['estado'], 'pendiente')

    def test_la_justificacion_sobrevive_al_recalculo(self):
        """Se justifica, se cambia el umbral y se vuelve atrás: sigue justificada.

        Es la prueba de fondo del diseño: las inconsistencias se recalculan
        siempre, así que lo único que puede perderse es lo que alguien decidió.
        """
        self._fichar(9, 40)
        self._fichar(18)
        self._resolver(T.LLEGADA_TARDE, motivo='Corte de calle')

        regla_tarde = ReglaInconsistencia.objects.get(
            tipo=T.LLEGADA_TARDE, turno__isnull=True
        )
        url = reverse('asistencia:regla', args=[regla_tarde.id])
        self.cliente.patch(url, {'umbral_minutos': 60}, format='json')
        self.assertEqual(self._listar().data['resultados'], [])

        self.cliente.patch(url, {'umbral_minutos': 10}, format='json')
        fila = self._listar().data['resultados'][0]
        self.assertEqual(fila['estado'], 'justificada')
        self.assertEqual(fila['motivo'], 'Corte de calle')

    def test_reabrir_tambien_funciona_por_querystring(self):
        """Es como la manda la interfaz: un DELETE con cuerpo no viaja siempre."""
        self._fichar(9, 40)
        self._fichar(18)
        self._resolver(T.LLEGADA_TARDE, motivo='Se resuelve')
        url = reverse('asistencia:inconsistencia-resolver')
        respuesta = self.cliente.delete(
            f'{url}?empleado={self.empleado.id}&fecha={LUNES.isoformat()}'
            f'&tipo={T.LLEGADA_TARDE}'
        )
        self.assertEqual(respuesta.status_code, 204)
        self.assertEqual(self._listar().data['resultados'][0]['estado'], 'pendiente')

    def test_reabrir_sin_datos_no_borra_nada(self):
        self.assertEqual(
            self.cliente.delete(reverse('asistencia:inconsistencia-resolver')).status_code,
            400,
        )

    def test_filtra_por_tipo_y_por_estado(self):
        self._fichar(9, 40)  # tarde y jornada abierta
        self.assertEqual(len(self._listar(tipo=T.LLEGADA_TARDE).data['resultados']), 1)
        self.assertEqual(len(self._listar(tipo=T.FALTA_SALIDA).data['resultados']), 1)
        self.assertEqual(len(self._listar(estado='justificada').data['resultados']), 0)

    def test_un_umbral_en_un_tipo_que_no_lo_usa_se_rechaza(self):
        regla_falta = ReglaInconsistencia.objects.get(
            tipo=T.FALTA_SALIDA, turno__isnull=True
        )
        respuesta = self.cliente.patch(
            reverse('asistencia:regla', args=[regla_falta.id]),
            {'umbral_minutos': 15}, format='json',
        )
        self.assertEqual(respuesta.status_code, 400)

    def test_sembrar_no_duplica(self):
        respuesta = self.cliente.post(reverse('asistencia:reglas-sembrar'), {}, format='json')
        self.assertEqual(respuesta.data['creadas'], 0)

    def test_el_resumen_trae_las_mismas_inconsistencias(self):
        self._fichar(9, 40)
        self._fichar(18)
        resumen = self.cliente.get(
            reverse('asistencia:resumen'),
            {'desde': LUNES.isoformat(), 'hasta': LUNES.isoformat()},
        )
        fila = resumen.data['resultados'][0]
        self.assertEqual(len(fila['inconsistencias']), 1)
        self.assertEqual(fila['pendientes'], 1)
        self.assertEqual(resumen.data['resumen']['pendientes'], 1)


class SucursalSinRelojAPITests(TestCase):
    """Una sucursal sin reloj no genera ruido: ni ausencias ni inconsistencias."""

    def setUp(self):
        self.superadmin = Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        self.cliente = APIClient()
        self.cliente.force_authenticate(self.superadmin)

        self.con_reloj = Sucursal.objects.get_or_create(nombre='Salta')[0]
        self.sin_reloj = Sucursal.objects.get_or_create(nombre='Yerba Buena')[0]
        self.dispositivo = Dispositivo.objects.create(
            sucursal=self.con_reloj, nombre='Reloj Salta', host='192.168.1.31'
        )

        self.turno = turno_de_prueba(dias=(0, 1, 2, 3, 4))
        self.remoto = Empleado.objects.create(nombre='Remoto', sucursal=self.sin_reloj)
        self.local = Empleado.objects.create(nombre='Local', sucursal=self.con_reloj)
        for empleado in (self.remoto, self.local):
            AsignacionTurno.objects.create(
                empleado=empleado, turno=self.turno, desde=date(2026, 1, 1)
            )

    def _resumen(self):
        return self.cliente.get(
            reverse('asistencia:resumen'),
            {'desde': LUNES.isoformat(), 'hasta': LUNES.isoformat()},
        )

    def test_no_figura_ausente_quien_no_tiene_donde_fichar(self):
        filas = self._resumen().data['resultados']
        nombres = {f['nombre'] for f in filas}
        self.assertIn('Local', nombres)
        self.assertNotIn('Remoto', nombres)
        self.assertEqual([f['estado'] for f in filas], ['ausente'])

    def test_el_catalogo_avisa_que_sucursales_no_se_controlan(self):
        """Que alguien no aparezca en el resumen no puede ser un misterio."""
        respuesta = self.cliente.get(reverse('asistencia:inconsistencias-catalogo'))
        nombres = {s['nombre'] for s in respuesta.data['sucursales_sin_reloj']}
        self.assertIn('Yerba Buena', nombres)
        self.assertNotIn('Salta', nombres)

    def test_al_dar_de_alta_el_reloj_esa_sucursal_empieza_a_controlarse(self):
        Dispositivo.objects.create(
            sucursal=self.sin_reloj, nombre='Reloj YB', host='192.168.2.31'
        )
        nombres = {f['nombre'] for f in self._resumen().data['resultados']}
        self.assertIn('Remoto', nombres)

    def test_un_reloj_inactivo_no_cuenta(self):
        Dispositivo.objects.create(
            sucursal=self.sin_reloj, nombre='Reloj viejo',
            host='192.168.2.31', activo=False,
        )
        nombres = {f['nombre'] for f in self._resumen().data['resultados']}
        self.assertNotIn('Remoto', nombres)

    def test_si_ficho_igual_se_muestra_pero_no_se_juzga(self):
        """Fue a la sucursal que sí tiene reloj: se ve el día, sin reproches."""
        momento = timezone.make_aware(datetime.combine(LUNES, time(10, 45)))
        Fichada.objects.create(
            dispositivo=self.dispositivo, empleado=self.remoto,
            estado_mapeo=EstadoMapeo.MAPEADA, numero_reloj='Remoto',
            ocurrida_en=momento, tipo='unknown', metodo='multiple',
            hash_evento=hash_evento(
                self.dispositivo.id, '', 'Remoto', momento, 'unknown', 'multiple'
            ),
        )
        fila = next(
            f for f in self._resumen().data['resultados'] if f['nombre'] == 'Remoto'
        )
        self.assertEqual(fila['estado'], 'sin_reloj')
        self.assertEqual(fila['inconsistencias'], [])
        self.assertEqual(fila['llegada_tarde_minutos'], 0)

    def test_la_asignacion_de_sucursal_manda_sobre_la_del_empleado(self):
        """Aunque su local sea el de siempre, ese día le tocaba uno sin reloj."""
        AsignacionSucursal.objects.create(
            empleado=self.local, sucursal=self.sin_reloj, desde=LUNES, hasta=LUNES,
        )
        nombres = {f['nombre'] for f in self._resumen().data['resultados']}
        self.assertNotIn('Local', nombres)


class JustificacionesSoloSuperadminTests(TestCase):
    def test_un_admin_comun_no_puede_justificar(self):
        Usuario.objects.create_superuser(
            email='duenio@celtuc.test', username='duenio', password='clave123'
        )
        admin = Usuario.objects.create_user(
            email='admin@celtuc.test', username='admin', password='clave123', is_staff=True
        )
        cliente = APIClient()
        cliente.force_authenticate(admin)
        empleado = Empleado.objects.create(nombre='Nacho')
        respuesta = cliente.post(
            reverse('asistencia:inconsistencia-resolver'),
            {'empleado': empleado.id, 'fecha': LUNES.isoformat(),
             'tipo': T.LLEGADA_TARDE, 'motivo': 'porque sí'},
            format='json',
        )
        self.assertEqual(respuesta.status_code, 403)
        self.assertEqual(JustificacionInconsistencia.objects.count(), 0)
