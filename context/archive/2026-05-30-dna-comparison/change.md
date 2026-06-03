---
change_id: dna-comparison
title: DNA Comparison (S-02 + S-03) — upload CSV + algorytm segmentacji + wyniki
status: archived
created: 2026-05-30
updated: 2026-06-03
archived_at: 2026-06-03T12:02:37Z
---

## Notes

Łączy S-02 (dna-profile-upload) i S-03 (dna-comparison-engine) w jeden spójny flow.
Zamiast osobnego zarządzania profilami, użytkownik uruchamia "Nowe porównanie" — jako część
tego flow uploaduje CSV-e i dostaje wyniki. Surowe CSV przetwarzane in-memory, nigdy nie zapisywane
(zgodnie z NFR o prywatności danych genetycznych).
