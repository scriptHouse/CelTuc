/**
 * Envío por WhatsApp vía "click to chat" (wa.me): se arma un link con el número
 * del cliente y el mensaje ya redactado, y WhatsApp (app o Web) se abre con el
 * chat y el texto precargados — solo falta apretar enviar. Sale del WhatsApp
 * del vendedor: sin APIs, credenciales ni costo por mensaje.
 *
 * Doc oficial del formato: https://faq.whatsapp.com/5913398998672934
 */

/**
 * Normaliza un teléfono argentino a formato internacional para wa.me:
 * "549" + código de área + número (13 dígitos), sin "+" ni espacios.
 *
 * Acepta las variantes que se tipean en la vida real — "381 555-4433",
 * "0381 15-555-4433", "+54 9 381 5554433" — y devuelve null si no logra
 * reducirlo a un celular argentino válido (mejor avisar que abrir WhatsApp
 * apuntando a un número roto).
 */
export function waNumeroArgentino(telefono: string): string | null {
  let d = telefono.replace(/\D/g, '')

  // Prefijo de salida internacional discado "a mano" (00 54...).
  if (d.startsWith('00')) d = d.slice(2)

  // Código de país y el "9" de celular, si vinieron: se quitan acá y se
  // re-agregan al final, para que todas las variantes converjan a lo mismo.
  if (d.startsWith('54')) {
    d = d.slice(2)
    if (d.startsWith('9')) d = d.slice(1)
  }

  // "0" inicial del discado nacional (0381...).
  if (d.startsWith('0')) d = d.slice(1)

  // El "15" local va ENTRE el área y el abonado ("381 15 555-4433"). Si con él
  // quedaron 12 dígitos, se lo busca tras un área de 2 a 4 dígitos y se elimina
  // (los abonados no empiezan con 1, así que el falso positivo es improbable).
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === '15') {
        d = d.slice(0, area) + d.slice(area + 2)
        break
      }
    }
  }

  // Número nacional argentino: área + abonado suman SIEMPRE 10 dígitos.
  if (d.length !== 10) return null
  return `549${d}`
}

/**
 * Link "click to chat" con el mensaje precargado. Con número abre ese chat
 * directo; sin número, WhatsApp pide elegir el chat (útil cuando la factura
 * no tiene teléfono cargado pero el cliente ya está en los contactos).
 */
export function waLink(mensaje: string, numero?: string | null): string {
  const texto = encodeURIComponent(mensaje)
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`
}
