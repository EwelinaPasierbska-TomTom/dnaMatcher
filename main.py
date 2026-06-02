import os
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.routers import annotations as annotations_router
from src.routers import comparisons as comparisons_router
from src.routers import me as me_router

app = FastAPI(title="dnaMatcher", version="0.1.0")

_cors_origins = os.getenv("CORS_ORIGIN", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
api_router.include_router(me_router.router)
api_router.include_router(comparisons_router.router)
api_router.include_router(annotations_router.router)
app.include_router(api_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "version": "0.1.0"}


# SPA serving — MUST appear after all app.include_router() calls.
# StaticFiles handles /assets/* (CSS/JS). Catch-all serves index.html for
# all other paths so React Router handles client-side navigation on hard refresh.
_frontend_dist = Path(__file__).parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(_frontend_dist / "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        return FileResponse(str(_frontend_dist / "index.html"))
