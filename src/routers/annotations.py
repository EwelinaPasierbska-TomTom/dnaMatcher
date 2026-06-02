from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.auth.client import get_supabase_client
from src.auth.dependencies import get_current_user
from src.auth.models import CurrentUser
from supabase import Client

router = APIRouter(tags=["annotations"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class AnnotationIn(BaseModel):
    profile_id: UUID
    chromosome: str
    start_position: int
    end_position: int
    strand: Literal["maternal", "paternal"]
    ancestor_label: str


class AnnotationOut(BaseModel):
    id: UUID
    profile_id: UUID
    chromosome: str
    start_position: int
    end_position: int
    strand: str
    ancestor_label: str
    created_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_out(row: dict[str, object]) -> AnnotationOut:
    return AnnotationOut(
        id=UUID(str(row["id"])),
        profile_id=UUID(str(row["profile_id"])),
        chromosome=str(row["chromosome"]),
        start_position=int(str(row["start_position"])),
        end_position=int(str(row["end_position"])),
        strand=str(row["strand"]),
        ancestor_label=str(row["ancestor_label"]),
        created_at=str(row["created_at"]),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/comparisons/{comparison_id}/annotations",
    response_model=list[AnnotationOut],
)
def get_annotations(
    comparison_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> list[AnnotationOut]:
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
    if not profile_ids:
        return []

    ann_res = (
        db.from_("ancestor_annotations")
        .select("*")
        .in_("profile_id", profile_ids)
        .execute()
    )
    return [_row_to_out(row) for row in (ann_res.data or [])]


@router.post(
    "/comparisons/{comparison_id}/annotations",
    response_model=AnnotationOut,
)
def upsert_annotation(
    comparison_id: UUID,
    body: AnnotationIn,
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> AnnotationOut:
    db = client.postgrest.auth(current_user.access_token)

    profile_res = (
        db.from_("dna_profiles")
        .select("id")
        .eq("id", str(body.profile_id))
        .eq("user_id", str(current_user.id))
        .execute()
    )
    if not profile_res.data:
        raise HTTPException(status_code=403, detail="Profil nie należy do użytkownika.")

    row: dict[str, object] = {
        "user_id": str(current_user.id),
        "profile_id": str(body.profile_id),
        "chromosome": body.chromosome,
        "start_position": body.start_position,
        "end_position": body.end_position,
        "strand": body.strand,
        "ancestor_label": body.ancestor_label,
    }
    result = (
        db.from_("ancestor_annotations")
        .upsert(row, on_conflict="profile_id,chromosome,start_position,end_position")
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Błąd zapisu adnotacji.")

    return _row_to_out(result.data[0])


@router.delete("/annotations/{annotation_id}", status_code=204)
def delete_annotation(
    annotation_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> None:
    db = client.postgrest.auth(current_user.access_token)

    result = (
        db.from_("ancestor_annotations")
        .delete()
        .eq("id", str(annotation_id))
        .eq("user_id", str(current_user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Adnotacja nie znaleziona.")
