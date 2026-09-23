-- Repair the exact malformed default shipped by the English UI release.
-- Do not replace literal \\n inside custom Markdown or code samples.
WITH known_default(body) AS (
  VALUES ($copy$# About Me

Hey, I'm Kaiyo. This is my corner of the web for software development notes and personal projects.

## What I Do

I build software, explore systems, and document what I learn along the way.

## Contact

Add your preferred contact links here from the admin settings.$copy$)
)
UPDATE settings
SET value = jsonb_set(settings.value, '{about}', to_jsonb(known_default.body))
FROM known_default
WHERE settings.value ->> 'about' = replace(known_default.body, chr(10), chr(92) || 'n');
