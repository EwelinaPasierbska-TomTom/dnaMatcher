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
    a = [_snp("1", 1000, "AA")] * 10
    b = [_snp("1", 1000, "AA")] * 10
    # build distinct positions
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


def test_min_snp_count_filters_short_segments() -> None:
    a = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 3)]
    b = [_snp("1", i * 100, "AA", f"rs{i}") for i in range(1, 3)]
    segs = compare_pairwise(a, b, min_snp_count=3)
    assert segs == []


def test_no_common_positions_returns_empty() -> None:
    a = [_snp("1", 1000, "AA")]
    b = [_snp("1", 2000, "AA")]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert segs == []


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
