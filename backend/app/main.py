from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import alerts, briefing, events, forecast, risk, solar_wind
from app.ingestion.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    await scheduler.start()
    yield
    await scheduler.stop()


app = FastAPI(
    title="Space Weather Mission Control",
    version="0.1.0",
    description="Space weather monitoring and alerting prototype",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(alerts.router)
app.include_router(events.router)
app.include_router(risk.router)
app.include_router(solar_wind.router)
app.include_router(forecast.router)
app.include_router(briefing.router)


@app.get("/")
async def root():
    return {
        "name": "Space Weather Mission Control",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
    }