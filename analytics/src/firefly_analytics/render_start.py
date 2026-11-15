"""Render entry point: authenticated API, one worker, platform-assigned port."""
import os
import uvicorn


def main():
    if not os.environ.get('ANALYTICS_API_TOKEN', '').strip():
        raise SystemExit('ANALYTICS_API_TOKEN must be configured before public deployment')
    port = int(os.environ.get('PORT', '10000'))
    if not 1 <= port <= 65535:
        raise SystemExit('Invalid PORT')
    uvicorn.run('firefly_analytics.service:app', host='0.0.0.0', port=port, workers=1)


if __name__ == '__main__':
    main()
