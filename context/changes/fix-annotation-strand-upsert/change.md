---
change_id: fix-annotation-strand-upsert
title: Fix annotation upsert overwriting sibling strand at the same genomic position
status: implementing
created: 2026-06-09
updated: 2026-06-09
archived_at: null
---

## Notes

fix upsert collision: maternal/paternal segments at the same genomic position overwrite each other because the unique constraint and on_conflict key omit the strand column
