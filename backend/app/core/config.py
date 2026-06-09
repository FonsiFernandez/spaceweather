from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    NOAA_BASE: str = Field(
        default="https://services.swpc.noaa.gov",
        validation_alias="NOAA_BASE_URL",
    )

    NASA_API_KEY: str = Field(
        default="DEMO_KEY",
        validation_alias="NASA_API_KEY",
    )

    NASA_DONKI_BASE: str = Field(
        default="https://api.nasa.gov/DONKI",
        validation_alias="NASA_DONKI_BASE_URL",
    )

    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    ENABLE_INGESTION: bool = True

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()