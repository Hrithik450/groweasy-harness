-- Legacy detail rows stored `<sourceSessionId>:<step>` as turnId, which is not
-- a DOM anchor. Resolve each to the real turn from the session ledger, using
-- the saved row id in the tool result that created it.
WITH resolved AS (
	SELECT
		d.`session_id`,
		d.`field`,
		d.`id`,
		(
			SELECT json_extract(e.`data`, '$.turn')
			FROM `session_events` e
			WHERE e.`session_id` = json_extract(d.`data`, '$.sourceSessionId')
				AND e.`type` = 'tool/result'
				AND CAST(json_extract(e.`data`, '$.step') AS INTEGER) = CAST(
					substr(
						json_extract(d.`data`, '$.turnId'),
						instr(json_extract(d.`data`, '$.turnId'), ':') + 1
					) AS INTEGER
				)
				AND json_extract(e.`data`, '$.message.content') LIKE '%' || d.`id` || '%'
			ORDER BY e.`seq` DESC
			LIMIT 1
		) AS `turn`
	FROM `detail_bar_items` d
	WHERE json_extract(d.`data`, '$.turnId') IS NOT NULL
		AND json_extract(d.`data`, '$.turnId') NOT LIKE 'turn-%'
		AND json_extract(d.`data`, '$.sourceSessionId') IS NOT NULL
)
UPDATE `detail_bar_items`
SET `data` = json_set(
	`data`,
	'$.turnId',
	'turn-' || (
		SELECT r.`turn`
		FROM resolved r
		WHERE r.`session_id` = `detail_bar_items`.`session_id`
			AND r.`field` = `detail_bar_items`.`field`
			AND r.`id` = `detail_bar_items`.`id`
	)
)
WHERE EXISTS (
	SELECT 1
	FROM resolved r
	WHERE r.`session_id` = `detail_bar_items`.`session_id`
		AND r.`field` = `detail_bar_items`.`field`
		AND r.`id` = `detail_bar_items`.`id`
		AND r.`turn` IS NOT NULL
);
