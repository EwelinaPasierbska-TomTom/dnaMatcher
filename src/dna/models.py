from dataclasses import dataclass


@dataclass
class SNPRecord:
    rsid: str
    chromosome: str
    position_bp: int
    position_cm: float | None
    allele1: str
    allele2: str


@dataclass
class Segment:
    chromosome: str
    match_type: str  # FULL | HALF | NONE
    start_bp: int
    end_bp: int
    start_cm: float | None
    end_cm: float | None
    length_bp: int
    length_cm: float | None
    snp_count: int
