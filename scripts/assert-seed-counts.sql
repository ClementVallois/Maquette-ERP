DO $$
DECLARE
  expected CONSTANT text[][] := ARRAY[
    ['public.offices','4'], ['public.practices','5'], ['public.personas','4'],
    ['public.consultants','49'], ['public.clients','5'], ['public.missions','7'],
    ['timesheet.cras','148'], ['billing.invoices','66'], ['public.domain_events','147']
  ];
  found bigint;
  mismatches text[] := ARRAY[]::text[];
BEGIN
  FOR i IN 1 .. array_length(expected, 1) LOOP
    EXECUTE format('SELECT count(*) FROM %s', expected[i][1]) INTO found;
    IF found <> expected[i][2]::bigint THEN
      mismatches := mismatches || format('%s reads %s rows, expected %s',
        expected[i][1], found, expected[i][2]);
    END IF;
  END LOOP;
  IF array_length(mismatches, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'erp_app: %', array_to_string(mismatches, '; ');
  END IF;
  RAISE NOTICE 'erp_app reads every seeded table at the expected volume.';
END
$$;
