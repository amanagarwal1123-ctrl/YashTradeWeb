"""Staging shared-v1 website BFF. No legacy OTP, role seeds or customer master writes."""
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / '.env')
from bff.config import Settings, BUILD, CONTRACT_COMMIT
from bff.canonical import Canonical, UpstreamError
from bff.security import security_middleware
from bff.routes import router
from bff.proxy import router as proxy_router

logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)


def create_app(settings=None, database=None, provider=None):
    cfg = settings or Settings.from_env()
    mongo = None if database is not None else AsyncIOMotorClient(cfg.mongo_url)
    database = database if database is not None else mongo[cfg.db_name]

    @asynccontextmanager
    async def lifespan(app):
        for name in ('bff_sessions', 'bff_browsers', 'bff_drafts', 'bff_limits'):
            await database[name].create_index('expires_at', expireAfterSeconds=0)
        yield
        if mongo:
            mongo.close()

    app = FastAPI(title='Yash Ornaments website BFF', version=BUILD, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url='/api/openapi.json')
    app.state.cfg, app.state.db = cfg, database
    app.state.canonical = provider or Canonical(cfg)
    app.middleware('http')(security_middleware)

    @app.exception_handler(UpstreamError)
    async def upstream_error(request, exc):
        response = JSONResponse({'code': exc.code, 'detail': exc.detail, **({'fields': exc.fields} if exc.fields else {})}, status_code=exc.status)
        if exc.status == 401:
            response.delete_cookie('__Host-yash_session', path='/', secure=True, httponly=True, samesite='lax')
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_body(request, exc):
        # Pydantic's default error includes the OTP/body as input. Never echo it.
        return JSONResponse({'code': 'VALIDATION_ERROR', 'detail': 'Check the required fields.',
                             'fields': ['.'.join(str(x) for x in e['loc'][1:]) for e in exc.errors()]}, status_code=422)

    @app.get('/api/health')
    async def health():
        return {'status': 'ok', 'build': BUILD, 'commit': cfg.build_commit or 'unrecorded',
                'app_contract_commit': CONTRACT_COMMIT, 'integration_ready': cfg.ready,
                'configuration': cfg.presence(), 'production_changed_by_this_task': False}

    app.include_router(router)
    app.include_router(proxy_router)
    return app


app = create_app()