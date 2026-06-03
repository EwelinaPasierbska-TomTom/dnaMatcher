import pytest

from src.dna.algorithm import compare_pairwise, compare_three_way
from src.dna.models import SNPRecord


def _snp(chrom: str, pos: int, g: str, rsid: str = "rs0") -> SNPRecord:
    a, b = sorted(g)
    return SNPRecord(
        chromosome=chrom,
        position_bp=pos,
        position_cm=None,
        allele1=a,
        allele2=b,
    )


# --- Single-SNP classification via pairwise ---


def test_pairwise_full_match() -> None:
    a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]
    b = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert len(segs) == 1
    assert segs[0].match_type == "FULL"


def test_pairwise_half_match() -> None:
    a = [_snp("1", i * 100, "AG", f"rs{i}") for i in range(1, 11)]
    b = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert len(segs) == 1
    assert segs[0].match_type == "HALF"


def test_pairwise_none_match() -> None:
    a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]
    b = [_snp("1", i * 100, "GG", f"rs{i}") for i in range(1, 11)]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert len(segs) == 1
    assert segs[0].match_type == "NONE"


# --- Segmentation ---


def test_consecutive_same_type_forms_one_segment() -> None:
    a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 6)]
    b = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 6)]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert len(segs) == 1
    assert segs[0].snp_count == 5


def test_type_change_splits_segment() -> None:
    a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 6)]
    b = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 4)] + [
        _snp("1", i * 100, "GG", f"rs{i}") for i in range(4, 6)
    ]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert len(segs) == 2
    assert segs[0].match_type == "FULL"
    assert segs[1].match_type == "NONE"


def test_min_snp_count_filters_short_full_segments() -> None:
    a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 3)]
    b = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 3)]
    segs = compare_pairwise(a, b, min_snp_count=3)
    assert segs == []


def test_none_not_filtered_by_min_snp_count() -> None:
    """NONE segments must be preserved regardless of min_snp_count.

    This is the key fix for the all-FULL bug: without this, short NONE stretches
    are dropped and adjacent FULL regions merge into one large FULL segment.
    """
    a = [_snp("1", 1000, "AA")]
    b = [_snp("1", 1000, "GG")]
    segs = compare_pairwise(a, b, min_snp_count=10)
    assert len(segs) == 1
    assert segs[0].match_type == "NONE"


def test_none_prevents_full_regions_from_merging() -> None:
    """A short NONE stretch between two FULL regions must not be absorbed."""
    # 10 FULL, 1 NONE, 10 FULL — with min_snp_count=5 the FULL segments pass
    # but the single NONE SNP must still separate them into distinct segments.
    a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 22)]
    b = (
        [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]  # FULL ×10
        + [_snp("1", 1100, "GG", "rs11")]  # NONE ×1
        + [_snp("1", i * 100, "AA", f"rs{i}") for i in range(12, 22)]  # FULL ×10
    )
    segs = compare_pairwise(a, b, min_snp_count=5)
    types = [s.match_type for s in segs]
    assert "NONE" in types
    assert types.count("FULL") == 2


def test_no_common_positions_returns_empty() -> None:
    a = [_snp("1", 1000, "AA")]
    b = [_snp("1", 2000, "AA")]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert segs == []


def test_invalid_alleles_skipped() -> None:
    """Positions with non-ACGT alleles are silently skipped."""

    def _snp_raw(pos: int, a1: str, a2: str) -> SNPRecord:
        return SNPRecord(
            chromosome="1", position_bp=pos, position_cm=None, allele1=a1, allele2=a2
        )

    # 10 valid FULL SNPs plus 3 invalid positions mixed in
    valid_a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]
    valid_b = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]

    # Insert invalid SNPs at positions 50, 150, 250 (non-ACGT allele)
    invalid = [_snp_raw(50, "N", "A"), _snp_raw(150, "-", "G"), _snp_raw(250, "0", "T")]
    a_all = sorted(valid_a + invalid, key=lambda s: s.position_bp)

    b_all = sorted(
        valid_b
        + [_snp_raw(50, "N", "A"), _snp_raw(150, "-", "G"), _snp_raw(250, "0", "T")],
        key=lambda s: s.position_bp,
    )

    segs = compare_pairwise(a_all, b_all, min_snp_count=1)
    # Invalid positions must not break the segment; all valid SNPs form one FULL segment
    assert len(segs) == 1
    assert segs[0].match_type == "FULL"
    assert segs[0].snp_count == 10


# --- 3-way classification ---


def test_three_way_full() -> None:
    a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]
    b = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]
    c = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]
    segs = compare_three_way(a, b, c, min_snp_count=1)
    assert len(segs) == 1
    assert segs[0].match_type == "FULL"


def test_three_way_half_shared_allele() -> None:
    # A=AG, B=AC, C=AT — all share A
    a = [_snp("1", i * 100, "AG", f"rs{i}") for i in range(1, 11)]
    b = [_snp("1", i * 100, "AC", f"rs{i}") for i in range(1, 11)]
    c = [_snp("1", i * 100, "AT", f"rs{i}") for i in range(1, 11)]
    segs = compare_three_way(a, b, c, min_snp_count=1)
    assert len(segs) == 1
    assert segs[0].match_type == "HALF"


def test_three_way_none() -> None:
    a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 11)]
    b = [_snp("1", i * 100, "GG", f"rs{i}") for i in range(1, 11)]
    c = [_snp("1", i * 100, "CC", f"rs{i}") for i in range(1, 11)]
    segs = compare_three_way(a, b, c, min_snp_count=1)
    assert len(segs) == 1
    assert segs[0].match_type == "NONE"


# --- Segment fields ---


def test_segment_length_bp() -> None:
    a = [_snp("1", i * 1000, "AA", f"rs{i}") for i in range(1, 6)]
    b = [_snp("1", i * 1000, "AA", f"rs{i}") for i in range(1, 6)]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert segs[0].length_bp == 4000  # 5000 - 1000
    assert segs[0].start_bp == 1000
    assert segs[0].end_bp == 5000


def _snp_cm(chrom: str, pos_bp: int, pos_cm: float, g: str) -> SNPRecord:
    a, b = sorted(g)
    return SNPRecord(
        chromosome=chrom, position_bp=pos_bp, position_cm=pos_cm, allele1=a, allele2=b
    )


def test_segment_length_cm_and_density() -> None:
    # 10 FULL SNPs, position_cm from 10.0 to 19.0 (step 1.0)
    a = [_snp_cm("1", (i + 1) * 1000, 10.0 + i, "AA") for i in range(10)]
    b = [_snp_cm("1", (i + 1) * 1000, 10.0 + i, "AA") for i in range(10)]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert len(segs) == 1
    seg = segs[0]
    assert seg.length_cm == pytest.approx(9.0)  # abs(19.0 - 10.0)
    assert seg.density == pytest.approx(10 / 9.0)  # snp_count / length_cm


def test_segment_density_none_when_no_cm_data() -> None:
    # SNPs with position_cm=None → density must be None
    a = [_snp("1", i * 1000, "AA", f"rs{i}") for i in range(1, 6)]
    b = [_snp("1", i * 1000, "AA", f"rs{i}") for i in range(1, 6)]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert segs[0].length_cm is None
    assert segs[0].density is None
