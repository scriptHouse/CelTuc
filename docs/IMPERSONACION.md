# Impersonar a un usuario

> Ver el sistema **exactamente como lo ve un empleado** —sus módulos, su
> sucursal, sus permisos— desde el admin de Django, sin pedirle la contraseña a
> nadie. Sirve para dar soporte ("no me aparece el botón de caja") y para
> reproducir un problema tal cual lo vive la persona.
>
> Código: `backend/usuarios/impersonacion.py` (el flujo explicado),
> `backend/usuarios/admin.py` (el botón), `frontend/src/pages/ImpersonarPage.tsx`
> y `frontend/src/components/BannerImpersonacion.tsx`.

---

## 1. Cómo se usa

1. Entrar a **https://celtuc.scripthouse.com.ar/admin/usuarios/usuario/**.
2. En el renglón de la persona, botón **«Impersonar»** (última columna).
3. Confirmar en la pantalla que aparece.
4. Listo: el navegador cae en el panel **ya logueado como esa cuenta**, con una
   barra ámbar arriba que avisa de quién es la sesión.
5. Para volver: **«Volver a mi cuenta»** en esa misma barra. Vuelve a la sesión
   propia sin tener que iniciar sesión de nuevo.

El botón **solo lo ve el superadministrador**. La sesión del admin de Django no
se toca: si volvés a `/admin/` seguís siendo vos.

## 2. Reglas

| Regla | Por qué |
|---|---|
| Solo impersona el superadministrador | Es la llave maestra del sistema |
| Nunca a otro superadministrador | Evita la escalada entre pares |
| Nunca a uno mismo, ni a cuentas inactivas o borradas | No tendría sentido / no podrían entrar por su cuenta |
| La sesión dura **2 horas como máximo** | Tope absoluto: no se estira renovando el token |
| Si al superadmin le quitan el poder, la sesión muere en el acto | Se revalida en cada petición |

Durante la impersonación **no se marca presencia**: la cuenta no figura "en
línea" ni se le toca el `último ingreso`, porque no es cierto que esté usando el
sistema. La contraseña tampoco se toca nunca.

## 3. Qué queda registrado

Todo va al historial de `/auditoria`:

- El **inicio**: "dueno entró como noe", con la IP.
- Cada acción hecha durante la sesión queda **a nombre de la cuenta impersonada**
  (es lo que pasó) con una etiqueta **«vía dueno»** que dice quién estaba
  realmente detrás. Se puede filtrar por la acción *Impersonaciones*.

## 4. Cómo funciona por dentro

El panel se autentica con JWT en el navegador, así que el admin de Django tiene
que "pasarle" una sesión al frontend. Se hace con un pase de un solo uso:

1. El POST del botón emite un **pase** (`TicketImpersonacion`) que vive **1
   minuto** y sirve **una sola vez**. En la base se guarda solo su **hash**,
   igual que una contraseña.
2. Se redirige a `/impersonar#ticket=…`. El pase viaja en el **fragmento** de la
   URL: el navegador nunca lo manda al servidor, así que no queda en los logs de
   nginx ni del proxy. El frontend lo borra de la barra de direcciones apenas lo
   lee.
3. El frontend lo canjea en `POST /api/auth/impersonar/canjear/` por el par de
   tokens de esa cuenta. El pase se quema ahí.
4. Esos tokens llevan dos marcas: `act` (quién está detrás, estilo RFC 8693) e
   `imp_exp` (el tope de 2 h). El *refresh* las arrastra, así que la
   impersonación no se convierte en una sesión normal ajena al renovarse.

La sesión propia queda guardada en el navegador mientras dure la impersonación:
por eso «Volver a mi cuenta» es instantáneo.

## 5. Desarrollo local

En producción el frontend y el admin viven en el mismo origen, así que la
redirección relativa funciona sola y **no hay nada que configurar**.

Con Vite en otro puerto (`npm run dev` en 5173 + `runserver` en 8000), hay que
decirle al backend a dónde volver, en `backend/.env`:

```
FRONTEND_URL=http://localhost:5173
```
