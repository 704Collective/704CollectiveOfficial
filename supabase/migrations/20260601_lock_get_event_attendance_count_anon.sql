-- Lock down get_event_attendance_count: anonymous users get 0 instead of real count.
-- Plugs a leak where signed-out visitors could see exact attendee numbers on /events/[id].

CREATE OR REPLACE FUNCTION public.get_event_attendance_count(p_event_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  
  SELECT COUNT(*)::integer INTO v_count
  FROM attendance_credentials
  WHERE event_id = p_event_id
    AND status IN ('active', 'used');
  
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_event_attendance_count(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_event_attendance_count(uuid) FROM PUBLIC;