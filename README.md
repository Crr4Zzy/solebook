# SoleBook

App para llevar las ventas de zapatillas y ropa: clientes, cobros pendientes, reservas, inventario por tallas e informes por mes. Funciona en el móvil y en el PC, se instala como una app y sigue funcionando sin conexión.

## Qué hace

- **Panel**: facturación y beneficio del mes comparados con los mismos días del mes anterior, lo que te deben, reservas que vencen, ventas por enviar y avisos de stock parado.
- **Ventas en 2 pasos**: eliges el producto (o escaneas el código en Android/PC), tocas la talla que tienes, el cliente, el canal y cómo te paga (todo, señal o pendiente). El beneficio se calcula solo descontando comisiones.
- **Clientes**: historial, lo que te han dejado, lo que deben, lo que buscan (te avisa cuando lo tienes en stock) y botón directo a WhatsApp, incluido el recibo y el recordatorio de pago.
- **Inventario**: stock por modelo y talla, coste por unidad o por lote (se reparte solo), días en stock, fotos y una imagen lista para compartir por WhatsApp o Instagram.
- **Informes**: por mes o por año, beneficio por canal (StockX, Hypeboost y Alias se agrupan como «Plataformas»), por marca, tallas que más salen, mejores clientes y exportación a Excel (CSV).
- **Ajustes**: comisiones de cada canal, formas de pago, tema claro u oscuro, copias de seguridad y sincronización.

## Instalarla

Abre la dirección de la app (GitHub Pages) y:

- **iPhone**: en Safari, botón Compartir → «Añadir a pantalla de inicio».
- **Android**: en Chrome, menú ⋮ → «Instalar aplicación».
- **PC / Mac**: en Chrome o Edge, icono de instalar en la barra de direcciones.

## Tener los mismos datos en el móvil y el PC

Los datos se guardan en el propio dispositivo. Para sincronizarlos se usa una base de datos gratuita de [Supabase](https://supabase.com), que es tuya y solo tú puedes leer:

1. Crea una cuenta y un proyecto en Supabase.
2. En **SQL Editor** pega el código que aparece en *Ajustes → Móvil y PC sincronizados* y pulsa **Run**.
3. En **Project Settings → API** copia la *Project URL* y la clave *anon public*, y pégalas en Ajustes.
4. Pulsa «Crear usuario» con tu email y una contraseña. En el otro dispositivo pega los mismos datos y pulsa «Entrar».

Las claves y la sesión se guardan solo en tu dispositivo; no están en este repositorio.

## Para desarrollar

Es HTML, CSS y JavaScript sin dependencias ni compilación. Para probarla en local:

```bash
python3 -m http.server 5173
```

y abre `http://localhost:5173`.
