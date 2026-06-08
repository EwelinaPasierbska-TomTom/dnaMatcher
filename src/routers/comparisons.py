from itertools import combinations
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from src.auth.client import get_supabase_client
from src.auth.dependencies import get_current_user
from src.auth.models import CurrentUser
from src.dna.algorithm import compare_pairwise, compare_three_way
from src.dna.models import Segment
from src.dna.parser import parse_myheritage_csv
from supabase import Client

router = APIRouter(tags=["comparisons"])


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class ProfileMeta(BaseModel):
    id: UUID
    name: str
    original_filename: str


class SegmentOut(BaseModel):
    chromosome: str
    match_type: str
    start_bp: int
    end_bp: int
    start_cm: float | None
    end_cm: float | None
    length_bp: int
    length_cm: float | None
    snp_count: int
    density: float | None


class ChromosomeBoundsOut(BaseModel):
    start_bp: int
    end_bp: int


class PairResult(BaseModel):
    profile_ids: list[UUID]
    person_names: list[str]
    segments: list[SegmentOut]
    chromosome_bounds: dict[str, ChromosomeBoundsOut]


class ComparisonResponse(BaseModel):
    id: UUID
    name: str
    created_at: str
    profiles: list[ProfileMeta]
    pairs: list[PairResult]


class ComparisonSummary(BaseModel):
    id: UUID
    name: str
    created_at: str
    person_names: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_MATCH_TYPE_TO_DB = {"FULL": "full_match", "HALF": "half_match", "NONE": "no_match"}
_DB_TO_MATCH_TYPE = {v: k for k, v in _MATCH_TYPE_TO_DB.items()}


def _segment_to_row(
    seg: Segment, comparison_id: str, pair_profile_ids: list[str]
) -> dict[str, object]:
    return {
        "comparison_id": comparison_id,
        "chromosome": seg.chromosome,
        "start_position": seg.start_bp,
        "end_position": seg.end_bp,
        "snp_count": seg.snp_count,
        "classification": _MATCH_TYPE_TO_DB[seg.match_type],
        "start_cm": seg.start_cm,
        "end_cm": seg.end_cm,
        "length_bp": seg.length_bp,
        "length_cm": seg.length_cm,
        "density": seg.density,
        "pair_profile_ids": pair_profile_ids,
    }


def _compute_chromosome_bounds(
    segments: list[SegmentOut],
) -> dict[str, ChromosomeBoundsOut]:
    bounds: dict[str, ChromosomeBoundsOut] = {}
    for s in segments:
        existing = bounds.get(s.chromosome)
        if existing is None:
            bounds[s.chromosome] = ChromosomeBoundsOut(
                start_bp=s.start_bp, end_bp=s.end_bp
            )
        else:
            bounds[s.chromosome] = ChromosomeBoundsOut(
                start_bp=min(existing.start_bp, s.start_bp),
                end_bp=max(existing.end_bp, s.end_bp),
            )
    return bounds


def _segments_to_pair_result(
    segments: list[Segment],
    profile_ids: list[UUID],
    person_names: list[str],
) -> PairResult:
    segs_out = [
        SegmentOut(
            chromosome=s.chromosome,
            match_type=s.match_type,
            start_bp=s.start_bp,
            end_bp=s.end_bp,
            start_cm=s.start_cm,
            end_cm=s.end_cm,
            length_bp=s.length_bp,
            length_cm=s.length_cm,
            snp_count=s.snp_count,
            density=s.density,
        )
        for s in segments
    ]
    return PairResult(
        profile_ids=profile_ids,
        person_names=person_names,
        segments=segs_out,
        chromosome_bounds=_compute_chromosome_bounds(segs_out),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/comparisons", response_model=ComparisonResponse)
async def create_comparison(
    name: str = Form(...),
    min_snp_count: int = Form(10),
    person_names: list[str] = Form(...),
    files: list[UploadFile] = File(...),
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> ComparisonResponse:
    if not (2 <= len(files) <= 3):
        raise HTTPException(status_code=400, detail="Wymagane 2 lub 3 pliki CSV.")
    if len(files) != len(person_names):
        raise HTTPException(
            status_code=400,
            detail="Liczba plików musi odpowiadać liczbie imion.",
        )

    # Parse files one at a time and free raw bytes immediately — keeps peak RAM
    # low on Render free tier (512 MB).  Each 16 MB CSV parses to ~80 MB of
    # SNPRecord objects; holding all raw bytes simultaneously would add another
    # 32–48 MB for nothing.
    _MAX_CSV_BYTES = 20 * 1024 * 1024
    parsed: list[list] = []
    for f in files:
        content = await f.read(_MAX_CSV_BYTES + 1)
        if len(content) > _MAX_CSV_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Plik CSV jest zbyt duży (max 20 MB).",
            )
        try:
            parsed.append(parse_myheritage_csv(content))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        del content  # free raw bytes before reading the next file

    db = client.postgrest.auth(current_user.access_token)

    # Create dna_profiles records
    profile_rows = [
        {
            "user_id": str(current_user.id),
            "name": person_names[i],
            "original_filename": files[i].filename or f"profile_{i + 1}.csv",
        }
        for i in range(len(files))
    ]
    profiles_res = db.from_("dna_profiles").insert(profile_rows).execute()
    profiles_data = profiles_res.data
    profile_ids = [row["id"] for row in profiles_data]

    # Create comparisons record — cleanup profiles on failure to avoid orphaned rows
    try:
        comp_res = (
            db.from_("comparisons")
            .insert(
                {
                    "user_id": str(current_user.id),
                    "name": name,
                    "profile_ids": profile_ids,
                }
            )
            .execute()
        )
    except Exception:
        db.from_("dna_profiles").delete().in_("id", profile_ids).execute()
        raise HTTPException(
            status_code=500,
            detail="Błąd zapisu danych. Spróbuj ponownie.",
        )
    comparison_id: str = comp_res.data[0]["id"]
    created_at: str = comp_res.data[0]["created_at"]

    # Run algorithm and collect result rows
    n = len(parsed)
    pair_indices = list(combinations(range(n), 2))
    all_result_rows: list[dict[str, object]] = []
    pair_results: list[PairResult] = []

    total_segments = 0

    for i, j in pair_indices:
        segs = compare_pairwise(parsed[i], parsed[j], min_snp_count=min_snp_count)
        total_segments += len(segs)
        ids_ij = [profile_ids[i], profile_ids[j]]
        for seg in segs:
            all_result_rows.append(_segment_to_row(seg, comparison_id, ids_ij))
        pair_results.append(
            _segments_to_pair_result(
                segs,
                [UUID(profile_ids[i]), UUID(profile_ids[j])],
                [person_names[i], person_names[j]],
            )
        )

    if n == 3:
        segs_3 = compare_three_way(
            parsed[0], parsed[1], parsed[2], min_snp_count=min_snp_count
        )
        total_segments += len(segs_3)
        for seg in segs_3:
            all_result_rows.append(_segment_to_row(seg, comparison_id, profile_ids))
        pair_results.append(
            _segments_to_pair_result(
                segs_3,
                [UUID(pid) for pid in profile_ids],
                person_names,
            )
        )

    if total_segments == 0:
        # Clean up and return error
        db.from_("comparisons").delete().eq("id", comparison_id).execute()
        db.from_("dna_profiles").delete().in_("id", profile_ids).execute()
        raise HTTPException(
            status_code=400,
            detail=(
                "Nie znaleziono wspólnych pozycji SNP między profilami. "
                "Upewnij się, że pliki pochodzą z tej samej platformy."
            ),
        )

    if all_result_rows:
        db.from_("comparison_results").insert(all_result_rows).execute()

    profiles_out = [
        ProfileMeta(
            id=UUID(row["id"]),
            name=row["name"],
            original_filename=row["original_filename"],
        )
        for row in profiles_data
    ]

    return ComparisonResponse(
        id=UUID(comparison_id),
        name=name,
        created_at=created_at,
        profiles=profiles_out,
        pairs=pair_results,
    )


@router.get("/comparisons", response_model=list[ComparisonSummary])
def list_comparisons(
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> list[ComparisonSummary]:
    db = client.postgrest.auth(current_user.access_token)
    comps_res = (
        db.from_("comparisons")
        .select("id, name, created_at, profile_ids")
        .eq("user_id", str(current_user.id))
        .order("created_at", desc=True)
        .execute()
    )
    if not comps_res.data:
        return []

    all_profile_ids = list(
        {pid for row in comps_res.data for pid in row["profile_ids"]}
    )
    profiles_res = (
        db.from_("dna_profiles").select("id, name").in_("id", all_profile_ids).execute()
    )
    id_to_name = {row["id"]: row["name"] for row in profiles_res.data}

    return [
        ComparisonSummary(
            id=UUID(row["id"]),
            name=row["name"],
            created_at=row["created_at"],
            person_names=[id_to_name.get(pid, "") for pid in row["profile_ids"]],
        )
        for row in comps_res.data
    ]


@router.get("/comparisons/{comparison_id}", response_model=ComparisonResponse)
def get_comparison(
    comparison_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> ComparisonResponse:
    db = client.postgrest.auth(current_user.access_token)
    comp_res = (
        db.from_("comparisons")
        .select("*")
        .eq("id", str(comparison_id))
        .eq("user_id", str(current_user.id))
        .execute()
    )
    if not comp_res.data:
        raise HTTPException(status_code=404, detail="Porównanie nie znalezione.")

    comp = comp_res.data[0]
    profile_ids: list[str] = comp["profile_ids"]

    profiles_res = (
        db.from_("dna_profiles")
        .select("id, name, original_filename")
        .in_("id", profile_ids)
        .execute()
    )
    profiles_map = {row["id"]: row for row in profiles_res.data}

    results_res = (
        db.from_("comparison_results")
        .select("*")
        .eq("comparison_id", str(comparison_id))
        .execute()
    )

    # Group results by pair_profile_ids (convert list→tuple for dict key)
    pair_map: dict[tuple[str, ...], list[SegmentOut]] = {}
    for row in results_res.data:
        key = tuple(row["pair_profile_ids"])
        seg = SegmentOut(
            chromosome=row["chromosome"],
            match_type=_DB_TO_MATCH_TYPE.get(
                row["classification"], row["classification"]
            ),
            start_bp=row["start_position"],
            end_bp=row["end_position"],
            start_cm=row.get("start_cm"),
            end_cm=row.get("end_cm"),
            length_bp=row.get("length_bp", 0),
            length_cm=row.get("length_cm"),
            snp_count=row["snp_count"],
            density=row.get("density"),
        )
        pair_map.setdefault(key, []).append(seg)

    pairs = [
        PairResult(
            profile_ids=[UUID(pid) for pid in key],
            person_names=[profiles_map.get(pid, {}).get("name", "") for pid in key],
            segments=segs,
            chromosome_bounds=_compute_chromosome_bounds(segs),
        )
        for key, segs in pair_map.items()
    ]

    return ComparisonResponse(
        id=UUID(comp["id"]),
        name=comp["name"],
        created_at=comp["created_at"],
        profiles=[
            ProfileMeta(
                id=UUID(row["id"]),
                name=row["name"],
                original_filename=row["original_filename"],
            )
            for row in profiles_res.data
        ],
        pairs=pairs,
    )


@router.delete("/comparisons/{comparison_id}", status_code=204)
def delete_comparison(
    comparison_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> None:
    db = client.postgrest.auth(current_user.access_token)
    comp_res = (
        db.from_("comparisons")
        .select("profile_ids")
        .eq("id", str(comparison_id))
        .eq("user_id", str(current_user.id))
        .execute()
    )
    if not comp_res.data:
        raise HTTPException(status_code=404, detail="Porównanie nie znalezione.")

    profile_ids: list[str] = comp_res.data[0]["profile_ids"]

    # comparison_results cascade on comparison delete
    db.from_("comparisons").delete().eq("id", str(comparison_id)).execute()
    # profiles don't have FK cascade — delete explicitly
    db.from_("dna_profiles").delete().in_("id", profile_ids).execute()
