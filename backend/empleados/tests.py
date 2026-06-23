from django.test import TestCase

from usuarios.models import Usuario

from .models import Empleado


class EmpleadoTests(TestCase):
    def test_empleado_solo_con_nombre(self):
        emp = Empleado.objects.create(nombre='Juan')
        self.assertEqual(emp.apellido, '')
        self.assertIsNone(emp.usuario)
        self.assertFalse(emp.puede_loguear)
        self.assertEqual(str(emp), 'Juan')

    def test_empleado_con_apellido_y_usuario(self):
        user = Usuario.objects.create_user(
            email='juan@celtuc.ar', username='juanp', password='clave-segura-123',
        )
        emp = Empleado.objects.create(nombre='Juan', apellido='Perez', usuario=user)
        self.assertEqual(emp.nombre_completo, 'Juan Perez')
        self.assertTrue(emp.puede_loguear)
        # Relacion inversa: desde el usuario se llega al empleado.
        self.assertEqual(user.empleado, emp)

    def test_un_usuario_no_puede_estar_en_dos_empleados(self):
        from django.db import IntegrityError, transaction

        user = Usuario.objects.create_user(
            email='ana@celtuc.ar', username='ana', password='clave-segura-123',
        )
        Empleado.objects.create(nombre='Ana', usuario=user)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Empleado.objects.create(nombre='Otra', usuario=user)

    def test_borrar_usuario_no_borra_empleado(self):
        user = Usuario.objects.create_user(
            email='caja@celtuc.ar', username='caja', password='clave-segura-123',
        )
        emp = Empleado.objects.create(nombre='Caja', usuario=user)
        user.delete()
        emp.refresh_from_db()
        # SET_NULL: el empleado sobrevive, solo pierde el acceso al login.
        self.assertIsNone(emp.usuario)
