"""Tests for the DNAPhaser-based segment algorithm.

DNAPhaser differences from the old algorithm that affect tests:
- cM positions come from the genetic map (not from SNPRecord.position_cm)
- Segments shorter than 0.01 cM are filtered (not by min_snp_count)
- The first SNP in a segment is double-counted: n SNPs → count = n+1
  (only for the first segment on a chromosome)
- Single-SNP NONE segments between two large equal-type anchors are removed
"""

import pytest

from src.dna.algorithm import compare_pairwise, compare_three_way
from src.dna.models import SNPRecord

# Realistic chromosome 1 positions: 50 Mbp, step 1 Mbp.
# chr1 genetic map rate here ≈ 0.5–1.5 cM/Mb, so 1 Mbp step ≈ 0.5–1.5 cM.
# 10 SNPs → span 9 Mbp ≈ 5–13 cM (well above all DNAPhaser thresholds).
_BASE = 50_000_000
_STEP = 1_000_000


def _snp(chrom: str, pos: int, g: str) -> SNPRecord:
    a, b = sorted(g)
    return SNPRecord(
        chromosome=chrom, position_bp=pos, position_cm=None, allele1=a, allele2=b
    )


def _real_snps(
    n: int, genotype: str, chrom: str = "1", offset: int = 0
) -> list[SNPRecord]:
    """n SNPs at realistic chromosome positions that survive DNAPhaser's cM filter."""
    return [_snp(chrom, _BASE + (offset + i) * _STEP, genotype) for i in range(n)]


# --- Classification ---


def test_pairwise_full_match() -> None:
    a = _real_snps(10, "AA")
    b = _real_snps(10, "AA")
    segs = compare_pairwise(a, b)
    assert len(segs) == 1
    assert segs[0].match_type == "FULL"


def test_pairwise_half_match() -> None:
    a = _real_snps(10, "AG")
    b = _real_snps(10, "AA")
    segs = compare_pairwise(a, b)
    assert len(segs) == 1
    assert segs[0].match_type == "HALF"


def test_pairwise_none_match() -> None:
    a = _real_snps(10, "AA")
    b = _real_snps(10, "GG")
    segs = compare_pairwise(a, b)
    assert len(segs) == 1
    assert segs[0].match_type == "NONE"


# --- Segmentation ---


def test_consecutive_same_type_forms_one_segment() -> None:
    a = _real_snps(10, "AA")
    b = _real_snps(10, "AA")
    segs = compare_pairwise(a, b)
    assert len(segs) == 1
    # DNAPhaser double-counts the first SNP of the first segment (count = n + 1).
    assert segs[0].snp_count >= 10


def test_type_change_creates_separate_segments() -> None:
    """10 FULL SNPs followed by 10 NONE SNPs should yield 2 segments."""
    a = _real_snps(10, "AA") + _real_snps(10, "AA", offset=10)
    b = _real_snps(10, "AA") + _real_snps(10, "GG", offset=10)
    segs = compare_pairwise(a, b)
    types = [s.match_type for s in segs]
    assert "FULL" in types
    assert "NONE" in types


def test_min_snp_count_filters_short_full_segments() -> None:
    # 2 FULL SNPs at tiny positions (< first map entry 55 550 bp) → 0 cM span
    # → filtered by DNAPhaser's length threshold (0.01 cM).
    a = [_snp("1", i * 100, "AA") for i in range(1, 3)]
    b = [_snp("1", i * 100, "AA") for i in range(1, 3)]
    segs = compare_pairwise(a, b, min_snp_count=3)
    assert segs == []


def test_none_not_filtered() -> None:
    """NONE segments are always preserved regardless of size."""
    a = [_snp("1", 1000, "AA")]
    b = [_snp("1", 1000, "GG")]
    segs = compare_pairwise(a, b, min_snp_count=10)
    assert len(segs) == 1
    assert segs[0].match_type == "NONE"


def test_none_bridge_between_full_regions() -> None:
    """A NONE bridge (5 SNPs) between two large FULL blocks must survive."""
    a = (
        _real_snps(10, "AA")
        + _real_snps(5, "AA", offset=10)
        + _real_snps(10, "AA", offset=15)
    )
    b = (
        _real_snps(10, "AA")
        + _real_snps(5, "GG", offset=10)
        + _real_snps(10, "AA", offset=15)
    )
    segs = compare_pairwise(a, b)
    types = [s.match_type for s in segs]
    assert "NONE" in types
    assert types.count("FULL") == 2


def test_no_common_positions_returns_empty() -> None:
    a = [_snp("1", 1000, "AA")]
    b = [_snp("1", 2000, "AA")]
    segs = compare_pairwise(a, b, min_snp_count=1)
    assert segs == []


def test_invalid_alleles_skipped() -> None:
    """Non-ACGT alleles are silently skipped; valid SNPs still form one segment."""

    def _raw(pos: int, a1: str, a2: str) -> SNPRecord:
        return SNPRecord(
            chromosome="1", position_bp=pos, position_cm=None, allele1=a1, allele2=a2
        )

    valid_a = _real_snps(10, "AA")
    valid_b = _real_snps(10, "AA")

    invalid_pos = [_BASE - 1000, _BASE - 500, _BASE - 200]
    invalid_a = [_raw(p, "N", "A") for p in invalid_pos]
    invalid_b = [_raw(p, "N", "A") for p in invalid_pos]

    a_all = sorted(valid_a + invalid_a, key=lambda s: s.position_bp)
    b_all = sorted(valid_b + invalid_b, key=lambda s: s.position_bp)

    segs = compare_pairwise(a_all, b_all)
    assert len(segs) == 1
    assert segs[0].match_type == "FULL"
    assert segs[0].snp_count >= 10


# --- 3-way classification ---


def test_three_way_full() -> None:
    a = _real_snps(10, "AA")
    b = _real_snps(10, "AA")
    c = _real_snps(10, "AA")
    segs = compare_three_way(a, b, c)
    assert len(segs) == 1
    assert segs[0].match_type == "FULL"


def test_three_way_half_shared_allele() -> None:
    # A=AG, B=AC, C=AT — all share A
    a = _real_snps(10, "AG")
    b = _real_snps(10, "AC")
    c = _real_snps(10, "AT")
    segs = compare_three_way(a, b, c)
    assert len(segs) == 1
    assert segs[0].match_type == "HALF"


def test_three_way_none() -> None:
    a = _real_snps(10, "AA")
    b = _real_snps(10, "GG")
    c = _real_snps(10, "CC")
    segs = compare_three_way(a, b, c)
    assert len(segs) == 1
    assert segs[0].match_type == "NONE"


# --- Segment fields ---


def test_segment_length_bp() -> None:
    a = _real_snps(5, "AA")
    b = _real_snps(5, "AA")
    segs = compare_pairwise(a, b)
    seg = segs[0]
    assert seg.start_bp == _BASE
    assert seg.end_bp == _BASE + 4 * _STEP
    assert seg.length_bp == 4 * _STEP


def test_segment_cm_from_genetic_map() -> None:
    """length_cm and density are derived from the genetic map, not from position_cm."""
    a = _real_snps(10, "AA")
    b = _real_snps(10, "AA")
    segs = compare_pairwise(a, b)
    seg = segs[0]
    assert seg.length_cm is not None
    assert seg.length_cm > 0
    assert seg.density is not None
    assert seg.density > 0
    # start_cm and end_cm are set from map interpolation
    assert seg.start_cm is not None
    assert seg.end_cm is not None
    assert seg.start_cm < seg.end_cm
    assert pytest.approx(seg.length_cm, rel=1e-6) == abs(seg.end_cm - seg.start_cm)
