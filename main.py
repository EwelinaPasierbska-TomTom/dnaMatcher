from fastapi import FastAPI

app = FastAPI(title="dnaMatcher", version="0.1.0")


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "project": "dnaMatcher", "version": "0.1.0"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "version": "0.1.0"}
