from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.auth.client import get_supabase_client
from src.auth.dependencies import get_current_user
from src.auth.models import CurrentUser
from supabase import Client

router = APIRouter(tags=["ancestors"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class AncestorIn(BaseModel):
    name: str
    color: str


class AncestorOut(BaseModel):
    id: UUID
    name: str
    color: str
    created_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _row_to_out(row: dict[str, object]) -> AncestorOut:
    return AncestorOut(
        id=UUID(str(row["id"])),
        name=str(row["name"]),
        color=str(row["color"]),
        created_at=str(row["created_at"]),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/ancestors", response_model=list[AncestorOut])
def list_ancestors(
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> list[AncestorOut]:
    db = client.postgrest.auth(current_user.access_token)
    result = (
        db.from_("ancestors")
        .select("*")
        .eq("user_id", str(current_user.id))
        .order("created_at")
        .execute()
    )
    return [_row_to_out(row) for row in (result.data or [])]


@router.post("/ancestors", response_model=AncestorOut, status_code=201)
def create_ancestor(
    body: AncestorIn,
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> AncestorOut:
    db = client.postgrest.auth(current_user.access_token)
    try:
        result = (
            db.from_("ancestors")
            .insert(
                {
                    "user_id": str(current_user.id),
                    "name": body.name,
                    "color": body.color,
                }
            )
            .execute()
        )
    except Exception:
        raise HTTPException(
            status_code=409, detail="Przodek o tej nazwie już istnieje."
        )
    if not result.data:
        raise HTTPException(status_code=500, detail="Błąd zapisu przodka.")
    return _row_to_out(result.data[0])


@router.put("/ancestors/{ancestor_id}", response_model=AncestorOut)
def update_ancestor(
    ancestor_id: UUID,
    body: AncestorIn,
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> AncestorOut:
    db = client.postgrest.auth(current_user.access_token)
    result = (
        db.from_("ancestors")
        .update({"name": body.name, "color": body.color})
        .eq("id", str(ancestor_id))
        .eq("user_id", str(current_user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Przodek nie znaleziony.")
    return _row_to_out(result.data[0])


@router.delete("/ancestors/{ancestor_id}", status_code=204)
def delete_ancestor(
    ancestor_id: UUID,
    current_user: CurrentUser = Depends(get_current_user),
    client: Client = Depends(get_supabase_client),
) -> None:
    db = client.postgrest.auth(current_user.access_token)
    result = (
        db.from_("ancestors")
        .delete()
        .eq("id", str(ancestor_id))
        .eq("user_id", str(current_user.id))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Przodek nie znaleziony.")
