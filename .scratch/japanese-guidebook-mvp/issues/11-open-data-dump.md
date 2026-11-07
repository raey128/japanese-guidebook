# 11: Open data dump

**What to build:** Every week (or on demand) the project publishes its data as open CSV + Parquet files with a proper licence, respecting privacy and moderation. See REQUIREMENTS R10 and SPEC.md "Dump".

**Blocked by:** 08 (Public scores, ranked lists & search), 09 (Want-to-go & profiles), 10 (Flags & moderation)

**Status:** ready-for-agent

- [ ] `make dump` writes places (name, coordinates, address, subcategory, location, city), rankings, notes and public scores as CSV and Parquet into a dated `dumps/YYYY-MM-DD/` folder
- [ ] A LICENSE file states CC BY-SA 4.0 with "Address data © OpenStreetMap contributors, ODbL"
- [ ] Private users appear only as an opaque ID with no username; hidden places and notes are absent
- [ ] The cron container runs the same entrypoint weekly
- [ ] CLI-seam tests check file contents, the privacy rules and hidden exclusion
