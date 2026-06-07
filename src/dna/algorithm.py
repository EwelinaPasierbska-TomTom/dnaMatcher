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


def _group_by_chrom(records: list[SNPRecord]) -> dict[str, list[SNPRecord]]:
    """Group SNPRecords by chromosome string (references only, no copying)."""
    groups: dict[str, list[SNPRecord]] = {}
    for r in records:
        groups.setdefault(r.chromosome, []).append(r)
    return groups


def _phaser_dict_for_chrom(
    records: list[SNPRecord], chrom_int: int
) -> dict[int, dict[str, _SNP]]:
    """Build a single-chromosome phaser dict for one profile.

    Returns the full {1..23: {}} structure that findMatchingBarCode expects,
    but only chrom_int is populated so segmentCreator skips the other 21.
    """
    phaser: dict[int, dict[str, _SNP]] = {i: {} for i in range(1, 24)}
    chrom_dict = phaser[chrom_int]
    for r in records:
        pos_str = str(r.position_bp)
        chrom_dict[pos_str] = _SNP(
            rsid=pos_str, position=pos_str, p1=r.allele1, p2=r.allele2
        )
    return phaser


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


def _run_chrom_by_chrom(
    profiles_by_chrom: list[dict[str, list[SNPRecord]]],
) -> list[Segment]:
    """Run DNAPhaser one chromosome at a time to stay within memory limits.

    Converting all ~700 K SNPs per profile to phaser format at once doubles
    the in-memory data (~200 MB × 2 profiles = ~400 MB before any processing).
    Processing one chromosome at a time keeps the peak phaser allocation
    to ~5-10 MB regardless of input size.
    """
    all_segments: list[Segment] = []

    for chrom_int in range(1, 23):
        chrom_str = _INT_TO_CHROM[chrom_int]

        # Extract this chromosome's SNPs for each profile
        chrom_records = [
            chrom_data.get(chrom_str, []) for chrom_data in profiles_by_chrom
        ]

        # Skip if any profile has no SNPs on this chromosome
        if any(len(recs) == 0 for recs in chrom_records):
            continue

        # Build minimal single-chromosome phaser dicts
        persons = [_phaser_dict_for_chrom(recs, chrom_int) for recs in chrom_records]

        # DNAPhaser: find common SNPs → classify → build segments
        bar_code = segment_matcher.findMatchingBarCode(persons)  # type: ignore[no-untyped-call]
        raw = segment_matcher.segmentCreator(bar_code)  # type: ignore[no-untyped-call]
        all_segments.extend(_phaser_to_segments(raw))

        # Release per-chromosome objects before the next iteration
        del persons, bar_code, raw, chrom_records

    return all_segments


def compare_pairwise(
    a: list[SNPRecord],
    b: list[SNPRecord],
    min_snp_count: int = 10,
    max_gap_bp: int | None = None,
    max_gap_cm: float | None = None,
) -> list[Segment]:
    """Compare two SNP profiles using the DNAPhaser algorithm."""
    return _run_chrom_by_chrom([_group_by_chrom(a), _group_by_chrom(b)])


def compare_three_way(
    a: list[SNPRecord],
    b: list[SNPRecord],
    c: list[SNPRecord],
    min_snp_count: int = 10,
    max_gap_bp: int | None = None,
    max_gap_cm: float | None = None,
) -> list[Segment]:
    """Compare three SNP profiles using the DNAPhaser algorithm."""
    return _run_chrom_by_chrom(
        [_group_by_chrom(a), _group_by_chrom(b), _group_by_chrom(c)]
    )
