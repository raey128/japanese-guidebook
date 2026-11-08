# Data licence

All user-contributed content in Japanese Guidebook (places, rankings, notes and the public scores
derived from them) is licensed under
[Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).

- **Address data** is © OpenStreetMap contributors, available under the
  [ODbL](https://opendatacommons.org/licenses/odbl/1-0/). See <https://www.openstreetmap.org/copyright>.
- **Open data dump.** Every week (and on demand with `make dump`) the dataset is exported as CSV and
  Parquet to `dumps/YYYY-MM-DD/`, together with a `LICENSE` file containing the same terms.
- **Privacy.** Users with a private profile appear in the dump only as an opaque, stable id
  (`anon-<16 hex>`), never by username. Places hidden by moderators, and notes removed by
  moderators, are not exported.

This file covers the data only; the source code is licensed separately.
