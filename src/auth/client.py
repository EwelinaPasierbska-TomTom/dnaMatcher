import os
from functools import cache

import httpx
from supabase import Client, create_client


@cache
def get_supabase_client() -> Client:
    client = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_ANON_KEY"],
    )
    # Replace postgrest httpx session with a pool that never reuses idle
    # connections. Prevents ReadError: EAGAIN after Render inactivity periods
    # when the remote (Supabase) silently closes TCP connections.
    old = client.postgrest.session
    client.postgrest.session = httpx.Client(
        base_url=old.base_url,
        headers=dict(old.headers),
        timeout=old.timeout,
        limits=httpx.Limits(
            max_connections=10,
            max_keepalive_connections=0,  # never reuse idle connections
        ),
    )
    old.close()
    return client
