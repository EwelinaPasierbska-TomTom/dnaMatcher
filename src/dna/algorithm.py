from itertools import groupby

from src.dna.models import Segment, SNPRecord

# Only standard DNA base characters are valid; anything else (N, -, 0, etc.)
# marks a low-confidence call and the position is skipped entirely.
_VALID_ALLELES: frozenset[str] = frozenset("ACGT")


def _classify(snps: list[SNPRecord]) -> str:
    """Classify co-located SNPs across N people.

    Mirrors DNAPhaser's getSnpMachting logic:
      FULL  — every person carries the identical (allele1, allele2) pair
      HALF  — there exists one specific allele carried by every person
               (i.e. each person has that allele at least once)
      NONE  — no single allele is shared by all people
      EMPTY — any person has a non-ACGT allele; caller skips the position
    """
    for snp in snps:
        if snp.allele1 not in _VALID_ALLELES or snp.allele2 not in _VALID_ALLELES:
            return "EMPTY"

    # FULL: all people have the same sorted genotype tuple
    g0 = (snps[0].allele1, snps[0].allele2)
    if all(s.allele1 == g0[0] and s.allele2 == g0[1] for s in snps[1:]):
        return "FULL"

    # HALF: there is a single allele present in every person's genotype
    for allele in _VALID_ALLELES:
        if all(s.allele1 == allele or s.allele2 == allele for s in snps):
            return "HALF"

    return "NONE"


def _emit_segment(snps: list[SNPRecord], stype: str) -> Segment:
    first, last = snps[0], snps[-1]
    start_cm = first.position_cm
    end_cm = last.position_cm
    length_cm = (
        abs(end_cm - start_cm) if start_cm is not None and end_cm is not None else None
    )
    snp_count = len(snps)
    # None check must precede > 0: `None > 0` raises TypeError in Python.
    density = snp_count / length_cm if length_cm and length_cm > 0 else None
    return Segment(
        chromosome=first.chromosome,
        match_type=stype,
        start_bp=first.position_bp,
        end_bp=last.position_bp,
        start_cm=start_cm,
        end_cm=end_cm,
        length_bp=last.position_bp - first.position_bp,
        length_cm=length_cm,
        snp_count=snp_count,
        density=density,
    )


def _build_segments(
    classified: list[tuple[SNPRecord, str]],
    max_gap_bp: int | None,
    max_gap_cm: float | None,
    min_snp_count: int,
) -> list[Segment]:
    """Convert (SNPRecord, match_type) pairs into a filtered Segment list.

    Asymmetric filtering (inspired by DNAPhaser's removeInsignificantNotNoneSegments):
      - NONE segments: always kept (threshold = 1).  Dropping short NONE stretches
        would merge flanking FULL/HALF regions across real non-matching loci, which
        is the primary cause of spurious all-FULL output on real data.
      - FULL / HALF segments: filtered by min_snp_count.
      - EMPTY positions: silently skipped; they do not break the current segment.
    """
    segments: list[Segment] = []
    if not classified:
        return segments

    def chrom_key(item: tuple[SNPRecord, str]) -> str:
        return item[0].chromosome

    for _chrom, chrom_iter in groupby(classified, key=chrom_key):
        seg_snps: list[SNPRecord] = []
        seg_type: str = ""

        for snp, mtype in chrom_iter:
            if mtype == "EMPTY":
                # Low-confidence call: skip without breaking the current segment
                continue

            if not seg_snps:
                seg_snps = [snp]
                seg_type = mtype
                continue

            prev = seg_snps[-1]
            gap_bp_exceeded = (
                max_gap_bp is not None
                and (snp.position_bp - prev.position_bp) > max_gap_bp
            )
            gap_cm_exceeded = (
                max_gap_cm is not None
                and snp.position_cm is not None
                and prev.position_cm is not None
                and (snp.position_cm - prev.position_cm) > max_gap_cm
            )

            if mtype != seg_type or gap_bp_exceeded or gap_cm_exceeded:
                threshold = 1 if seg_type == "NONE" else min_snp_count
                if len(seg_snps) >= threshold:
                    segments.append(_emit_segment(seg_snps, seg_type))
                seg_snps = [snp]
                seg_type = mtype
            else:
                seg_snps.append(snp)

        if seg_snps:
            threshold = 1 if seg_type == "NONE" else min_snp_count
            if len(seg_snps) >= threshold:
                segments.append(_emit_segment(seg_snps, seg_type))

    return segments


def _index_by_position(records: list[SNPRecord]) -> dict[tuple[str, int], SNPRecord]:
    return {(r.chromosome, r.position_bp): r for r in records}


def compare_pairwise(
    a: list[SNPRecord],
    b: list[SNPRecord],
    min_snp_count: int = 10,
    max_gap_bp: int | None = None,
    max_gap_cm: float | None = None,
) -> list[Segment]:
    """Compare two SNP profiles and return classified segments."""
    idx_b = _index_by_position(b)
    classified: list[tuple[SNPRecord, str]] = []

    for snp_a in a:
        key = (snp_a.chromosome, snp_a.position_bp)
        snp_b = idx_b.get(key)
        if snp_b is None:
            continue
        classified.append((snp_a, _classify([snp_a, snp_b])))

    return _build_segments(classified, max_gap_bp, max_gap_cm, min_snp_count)


def compare_three_way(
    a: list[SNPRecord],
    b: list[SNPRecord],
    c: list[SNPRecord],
    min_snp_count: int = 10,
    max_gap_bp: int | None = None,
    max_gap_cm: float | None = None,
) -> list[Segment]:
    """Compare three SNP profiles and return classified segments."""
    idx_b = _index_by_position(b)
    idx_c = _index_by_position(c)
    classified: list[tuple[SNPRecord, str]] = []

    for snp_a in a:
        key = (snp_a.chromosome, snp_a.position_bp)
        snp_b = idx_b.get(key)
        snp_c = idx_c.get(key)
        if snp_b is None or snp_c is None:
            continue
        classified.append((snp_a, _classify([snp_a, snp_b, snp_c])))

    return _build_segments(classified, max_gap_bp, max_gap_cm, min_snp_count)
