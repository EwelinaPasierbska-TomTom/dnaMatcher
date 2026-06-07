from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.dna import segment_matcher
from src.dna.genome_tools import readChromosomeMap
from src.dna.models import Segment, SNPRecord
from src.dna.segment_matcher import interpolate_map_cm

# Chromosome string ↔ DNAPhaser integer mapping (1-22 only; X/Y skipped by
# segmentCreator which iterates range(1, 23)).
_CHROM_TO_INT: dict[str, int] = {str(i): i for i in range(1, 23)}
_INT_TO_CHROM: dict[int, str] = {v: k for k, v in _CHROM_TO_INT.items()}

_MATCH_TYPE: dict[str, str] = {"full": "FULL", "half": "HALF", "none": "NONE"}


@dataclass
class _SNP:
    """Thin bridge: exposes the interface DNAPhaser's getSnpMachting expects."""

    rsid: str
    position: str
    p1: str
    p2: str


def _to_phaser_format(records: list[SNPRecord]) -> dict[int, dict[str, _SNP]]:
    """Convert list[SNPRecord] → {chrom_int: {position_str: _SNP}}."""
    result: dict[int, dict[str, _SNP]] = {i: {} for i in range(1, 24)}
    for r in records:
        chrom_int = _CHROM_TO_INT.get(r.chromosome)
        if chrom_int is None:
            continue
        pos_str = str(r.position_bp)
        result[chrom_int][pos_str] = _SNP(
            rsid=pos_str,
            position=pos_str,
            p1=r.allele1,
            p2=r.allele2,
        )
    return result


def _phaser_to_segments(raw: Any) -> list[Segment]:
    """Convert DNAPhaser segment dict → list[Segment] with cM positions from map."""
    out: list[Segment] = []
    for chrom_int, segs in raw.items():
        if not segs:
            continue
        chrom_str = _INT_TO_CHROM.get(chrom_int)
        if chrom_str is None:
            continue

        chrom_map = readChromosomeMap(chrom_int)
        bps = [p.bp for p in chrom_map] if chrom_map else []

        for seg in segs:
            match_type = _MATCH_TYPE.get(seg.type)
            if not match_type:
                continue  # skip "gap" and "empty"

            start_bp = int(seg.startingPoint)
            end_bp = int(seg.endPoint)

            if chrom_map:
                start_cm = interpolate_map_cm(chrom_map, start_bp, bps)  # type: ignore[no-untyped-call]
                end_cm = interpolate_map_cm(chrom_map, end_bp, bps)  # type: ignore[no-untyped-call]
            else:
                start_cm = None
                end_cm = None

            out.append(
                Segment(
                    chromosome=chrom_str,
                    match_type=match_type,
                    start_bp=start_bp,
                    end_bp=end_bp,
                    start_cm=start_cm,
                    end_cm=end_cm,
                    length_bp=end_bp - start_bp,
                    length_cm=seg.length,
                    snp_count=seg.count,
                    density=seg.density,
                )
            )
    return out


def compare_pairwise(
    a: list[SNPRecord],
    b: list[SNPRecord],
    min_snp_count: int = 10,
    max_gap_bp: int | None = None,
    max_gap_cm: float | None = None,
) -> list[Segment]:
    """Compare two SNP profiles using the DNAPhaser algorithm."""
    persons = [_to_phaser_format(a), _to_phaser_format(b)]
    bar_code = segment_matcher.findMatchingBarCode(persons)  # type: ignore[no-untyped-call]
    raw = segment_matcher.segmentCreator(bar_code)  # type: ignore[no-untyped-call]
    return _phaser_to_segments(raw)


def compare_three_way(
    a: list[SNPRecord],
    b: list[SNPRecord],
    c: list[SNPRecord],
    min_snp_count: int = 10,
    max_gap_bp: int | None = None,
    max_gap_cm: float | None = None,
) -> list[Segment]:
    """Compare three SNP profiles using the DNAPhaser algorithm."""
    persons = [_to_phaser_format(a), _to_phaser_format(b), _to_phaser_format(c)]
    bar_code = segment_matcher.findMatchingBarCode(persons)  # type: ignore[no-untyped-call]
    raw = segment_matcher.segmentCreator(bar_code)  # type: ignore[no-untyped-call]
    return _phaser_to_segments(raw)
