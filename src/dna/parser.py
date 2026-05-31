import csv
import io
import sys

from src.dna.models import SNPRecord

_INVALID_GENOTYPES = {"--", "00", "NN", ""}


def _normalize_genotype(raw: str) -> tuple[str, str] | None:
    """Return sorted (allele1, allele2) or None if invalid."""
    g = raw.strip()
    if g in _INVALID_GENOTYPES:
        return None
    if len(g) != 2 or not g.isalpha():
        return None
    a, b = sorted(g)
    return a, b


def _chromosome_sort_key(chrom: str) -> tuple[int, str]:
    """Sort chromosomes numerically where possible, then lexicographically."""
    try:
        return (int(chrom), "")
    except ValueError:
        return (100, chrom)


def parse_myheritage_csv(data: bytes) -> list[SNPRecord]:
    """Parse a MyHeritage DNA CSV file and return a sorted list of SNPRecords.

    Format: rsID;chromosome;position_bp;genotype;position_cm(opt);;
    No header row. Invalid/missing genotype rows are silently skipped.
    Raises ValueError if no valid rows are found.
    """
    # TextIOWrapper over BytesIO avoids decoding the entire file into a Python
    # str (saves ~16 MB per file vs decode() + StringIO).
    reader = csv.reader(
        io.TextIOWrapper(io.BytesIO(data), encoding="utf-8", errors="replace"),
        delimiter=";",
    )

    records: list[SNPRecord] = []
    for row in reader:
        if len(row) < 4:
            continue
        chrom, pos_str, genotype = row[1], row[2], row[3]

        alleles = _normalize_genotype(genotype)
        if alleles is None:
            continue

        try:
            position_bp = int(pos_str.strip())
        except ValueError:
            continue

        position_cm: float | None = None
        if len(row) > 4:
            try:
                position_cm = float(row[4].strip())
            except ValueError:
                pass

        records.append(
            SNPRecord(
                # sys.intern shares the ~25 unique chromosome strings across
                # all SNPs instead of allocating one object per row (~37 MB/file).
                chromosome=sys.intern(chrom.strip()),
                position_bp=position_bp,
                position_cm=position_cm,
                allele1=alleles[0],
                allele2=alleles[1],
            )
        )

    if not records:
        raise ValueError(
            "Plik CSV nie zawiera żadnych prawidłowych danych SNP. "
            "Upewnij się, że plik jest w formacie MyHeritage."
        )

    records.sort(key=lambda r: (_chromosome_sort_key(r.chromosome), r.position_bp))
    return records
