-- Keep WhatsApp distinct from the existing phone field. Existing numbers are
-- left untouched; no assumption is made that they are registered on WhatsApp.
alter table users add column whatsapp text
  check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{6,14}$');
