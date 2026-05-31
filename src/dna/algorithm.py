from itertools import groupby

from src.dna.models import Segment, SNPRecord


def _classify_pairwise(a: SNPRecord, b: SNPRecord) -> str:
    sa = {a.allele1, a.allele2}
    sb = {b.allele1, b.allele2}
    if sa == sb:
        return "FULL"
    if sa & sb:
        return "HALF"
    return "NONE"


def _classify_three_way(a: SNPRecord, b: SNPRecord, c: SNPRecord) -> str:
    sa = {a.allele1, a.allele2}
    sb = {b.allele1, b.allele2}
    sc = {c.allele1, c.allele2}
    if sa == sb == sc:
        return "FULL"
    if sa & sb & sc:
        return "HALF"
    return "NONE"


def _build_segments(
    classified: list[tuple[SNPRecord, str]],
    max_gap_bp: int | None,
    max_gap_cm: float | None,
    min_snp_count: int,
) -> list[Segment]:
    """Convert a list of (SNPRecord, match_type) into filtered Segment list."""
    segments: list[Segment] = []
    if not classified:
        return segments

    # Group by chromosome first, then do run-length within each chromosome
    def chrom_key(item: tuple[SNPRecord, str]) -> str:
        return item[0].chromosome

    for _chrom, chrom_iter in groupby(classified, key=chrom_key):
        chrom_items = list(chrom_iter)

        seg_snps: list[SNPRecord] = []
        seg_type: str = ""

        def flush(snps: list[SNPRecord], stype: str) -> None:
            if not snps or len(snps) < min_snp_count:
                return
            first, last = snps[0], snps[-1]
            start_cm = first.position_cm
            end_cm = last.position_cm
            length_cm: float | None = None
            if start_cm is not None and end_cm is not None:
                length_cm = end_cm - start_cm
            segments.append(
                Segment(
                    chromosome=first.chromosome,
                    match_type=stype,
                    start_bp=first.position_bp,
                    end_bp=last.position_bp,
                    start_cm=start_cm,
                    end_cm=end_cm,
                    length_bp=last.position_bp - first.position_bp,
                    length_cm=length_cm,
                    snp_count=len(snps),
                )
            )

        for snp, mtype in chrom_items:
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
                flush(seg_snps, seg_type)
                seg_snps = [snp]
                seg_type = mtype
            else:
                seg_snps.append(snp)

        flush(seg_snps, seg_type)

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
        mtype = _classify_pairwise(snp_a, snp_b)
        classified.append((snp_a, mtype))

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
        mtype = _classify_three_way(snp_a, snp_b, snp_c)
        classified.append((snp_a, mtype))

    return _build_segments(classified, max_gap_bp, max_gap_cm, min_snp_count)
