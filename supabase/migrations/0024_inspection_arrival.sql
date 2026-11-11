-- When the field team expects to arrive, shown to the client next to the visit date.
-- A named window (morning, midday, afternoon) or an exact Kenya time as HH:MM.
alter table inspections add column arrival_window text
  check (arrival_window is null or arrival_window in ('morning', 'midday', 'afternoon') or arrival_window ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
