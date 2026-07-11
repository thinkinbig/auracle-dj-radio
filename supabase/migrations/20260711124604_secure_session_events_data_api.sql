-- session_events is private telemetry written only by profile-service through
-- the Data API with a server-only secret key. Browser roles must not access it.
ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.session_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.session_events_id_seq FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.session_events_id_seq TO service_role;
