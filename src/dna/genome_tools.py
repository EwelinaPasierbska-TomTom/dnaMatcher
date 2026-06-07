import functools
import pathlib
import re
from dataclasses import dataclass

_MAP_DIR = pathlib.Path(__file__).parent / "genetic_maps"


@dataclass(frozen=True)
class MapPoint:
    bp: int
    rate_cM_per_Mb: float
    map_cM: float


def read_genetic_map_tsv(path: str) -> dict[str, list[MapPoint]]:
    """
    Reads a genetic map file with header:
    Chromosome  Position(bp)  Rate(cM/Mb)  Map(cM)
    Returns dict: chrom -> sorted list of MapPoint by bp.
    """
    chrom_to_points: dict[str, list[MapPoint]] = {}

    with open(path, encoding="utf-8") as f:
        f.readline()  # skip header

        for line_no, line in enumerate(f, start=2):
            line = line.strip()
            if not line:
                continue
            parts = re.split(r"\s+", line)
            if len(parts) < 4:
                n = len(parts)
                raise ValueError(f"Bad line {line_no}: expected 4 columns, got {n}")
            chrom = parts[0]
            bp = int(parts[1])
            rate = float(parts[2])
            map_cm = float(parts[3])

            chrom_to_points.setdefault(chrom, []).append(
                MapPoint(bp=bp, rate_cM_per_Mb=rate, map_cM=map_cm)
            )

    for chrom, pts in chrom_to_points.items():
        pts.sort(key=lambda p: p.bp)
    return chrom_to_points


@functools.lru_cache(maxsize=22)
def readChromosomeMap(chromosomeNum: int) -> list[MapPoint] | None:
    if not (1 <= chromosomeNum <= 22):
        raise ValueError("chromosomeNum must be between 1 and 22")
    path = str(_MAP_DIR / f"genetic_map_GRCh37_chr{chromosomeNum}.txt")
    return read_genetic_map_tsv(path).get(f"chr{chromosomeNum}")
