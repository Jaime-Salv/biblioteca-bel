# Biblioteca Bel

Aplicación web privada para inventariar, localizar y descubrir una colección de libros. Incluye autenticación, perfil y avatar, escáner de cámara EAN-13/ISBN, búsqueda externa, importación manual, estanterías, compra y documentos, valoraciones, géneros, estadísticas, logros, retos, exportación CSV y copia JSON.

## Desarrollo local

1. Copia `.env.example` como `.env.local`.
2. Completa las dos variables públicas del cliente de Supabase.
3. Ejecuta:

```bash
npm install
npm run dev
```

La app solo acepta una clave publicable de Supabase en el navegador. Nunca añadas una clave secreta o `service_role` a variables `VITE_*`.

## Compilación

```bash
npm run build
npm run preview
```

## Netlify

El repositorio incluye `netlify.toml` con compilación Vite, publicación desde `dist`, rutas SPA y cabeceras de seguridad. En Netlify configura estas variables para todos los contextos necesarios:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

La cámara requiere HTTPS; Netlify lo proporciona automáticamente. En Supabase, añade la URL de producción y las URLs de deploy preview autorizadas en la configuración de redirecciones de Auth.

## Datos privados

Los avatares y tickets se guardan en buckets privados y se muestran mediante URLs firmadas temporales. Las políticas RLS del proyecto Supabase deben limitar todas las tablas y rutas de Storage al propietario o miembro de cada biblioteca.

## Orden visual de los muebles

Para conservar el orden exacto de las portadas dentro de cada mueble, ejecuta una vez `supabase/shelf-position.sql` desde el SQL Editor de Supabase. Es una actualización compatible con bibliotecas existentes.
