-- Ejecutar una vez en Supabase SQL Editor para guardar el orden visual de los libros.
alter table public.book_copies
  add column if not exists shelf_position integer;

create index if not exists book_copies_location_shelf_position_idx
  on public.book_copies (library_id, location_id, shelf_position);
