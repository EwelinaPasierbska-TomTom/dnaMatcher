from fastapi import APIRouter, Depends

from src.auth.dependencies import get_current_user
from src.auth.models import CurrentUser

router = APIRouter(tags=["auth"])


@router.get("/me")
def me(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return current_user
