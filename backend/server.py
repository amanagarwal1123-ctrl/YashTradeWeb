"""Shared-v1 website BFF. No legacy OTP, role seeds or customer master writes."""
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
from bff.readiness import Readiness, health_report

logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)


def create_app(settings=None, database=None, provider=None):
    cfg = settings or Settings.from_env()
    mongo = None if database is not None else AsyncIOMotorClient(cfg.mongo_url)
    database = database if database is not None else mongo[cfg.db_name]

    @asynccontextmanager
    async def lifespan(app):
        if not cfg.ready:
            logging.getLogger('bff.configuration').warning('auth_configuration_incomplete %s',
                {flow: cfg.flow_issues(flow) for flow in ('staff', 'enrollment', 'deletion')})
        for name in ('bff_sessions', 'bff_browsers', 'bff_drafts', 'bff_limits'):
            await database[name].create_index('expires_at', expireAfterSeconds=0)
        yield
        if mongo:
            mongo.close()

    app = FastAPI(title='Yash Ornaments website BFF', version=BUILD, lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url='/api/openapi.json')
    app.state.cfg, app.state.db = cfg, database
    app.state.canonical = provider or Canonical(cfg)
    app.state.readiness = Readiness(cfg, app.state.canonical)
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
    @app.get('/api/health/ready')
    async def health():
        report = await health_report(app)
        return JSONResponse(report, status_code=200 if report['integration_ready'] else 503)

    @app.get('/api/health/live')
    async def live():
        return {'status': 'alive', 'build': BUILD}

    @app.get('/api/public/auth-status')
    async def auth_status(website_origin: str = ''):
        status = await app.state.readiness.public()
        allowed = not website_origin or website_origin in cfg.origins
        status['origin_allowed'] = allowed
        if not allowed:
            status['flows'] = {flow: {'available': False, 'message':
                'Verification is unavailable on this website address. Please contact the website administrator.'}
                for flow in status['flows']}
        return status

    app.include_router(router)
    app.include_router(proxy_router)
    return app


app = create_app()