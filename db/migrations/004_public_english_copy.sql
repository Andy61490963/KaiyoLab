-- Translate only known default/public copy. Preserve custom content.
WITH defaults(key, old_value, new_value) AS (
  VALUES
    ('tagline', '技術筆記與開源作品', 'Software engineering notes and open-source projects'),
    ('description', '整理開發筆記、做過的專案，以及正在學習的事', 'Sharing software development notes, personal projects, and things I am learning'),
    ('bio', '分享程式開發筆記與個人作品', 'Software engineer sharing development notes and personal projects'),
    ('about',
      E'## 關於我\n\n這裡可以介紹自己的背景、正在做的專案，以及聯絡方式\n\n登入管理後台後，就能編輯這段文字',
      E'# About Me\n\nHey, I''m Kaiyo. This is my corner of the web for software development notes and personal projects.\n\n## What I Do\n\nI build software, explore systems, and document what I learn along the way.\n\n## Contact\n\nAdd your preferred contact links here from the admin settings.')
), patches AS (
  SELECT settings.id, jsonb_object_agg(defaults.key, defaults.new_value) AS value
  FROM settings
  CROSS JOIN defaults
  WHERE settings.value ->> defaults.key = defaults.old_value
  GROUP BY settings.id
)
UPDATE settings
SET value = settings.value || patches.value
FROM patches
WHERE settings.id = patches.id;

UPDATE settings
SET value = jsonb_set(
  value,
  '{homeIntro}',
  to_jsonb(
    replace(
      replace(
        replace(
          replace(
            value ->> 'homeIntro',
            '# 嗨，我是 [**Andy**](https://kaiyo.zeabur.app/about)**.**',
            '# I''m **Andy**'
          ),
          '# 嗨，我是 [**Andy**](https://kaiyo.zeabur.app/about).',
          '# I''m **Andy**'
        ),
        '# 嗨，我是 [**Andy**](https://kaiyo.zeabur.app/about)',
        '# I''m **Andy**'
      ),
      '嗨，我是 [**Andy**](https://kaiyo.zeabur.app/about)',
      'I''m **Andy**'
    )
  )
)
WHERE value ? 'homeIntro'
  AND value ->> 'homeIntro' LIKE '%嗨，我是 [**Andy**](https://kaiyo.zeabur.app/about)%';
