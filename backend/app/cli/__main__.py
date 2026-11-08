"""Command-line entrypoints, wrapped by the root Makefile.

    python -m app.cli seed-locations
    python -m app.cli seed-places
    python -m app.cli make-admin USERNAME
    python -m app.cli dump [--out DIR]
    python -m app.cli synthetic [--count N]

Each command runs in one transaction and rolls back on failure.
"""

import argparse
import asyncio
import sys

from app.cli import commands


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("seed-locations", help="Load subcategories, cities and locations from data/")
    sub.add_parser("seed-places", help="Load data/seed_places.csv as Unverified places")
    admin = sub.add_parser("make-admin", help="Grant the admin flag to a user")
    admin.add_argument("username")
    admin.add_argument("--revoke", action="store_true")
    dump = sub.add_parser("dump", help="Write the open data dump")
    dump.add_argument("--out", default=None, help="Base directory (default: dumps/)")
    sub.add_parser("rollup-events", help="Roll usage events into daily totals; expire old raw events")
    synth = sub.add_parser("synthetic", help="Load synthetic places/rankings for load testing")
    synth.add_argument("--count", type=int, default=50000)
    synth.add_argument("--seed", type=int, default=42)
    args = parser.parse_args(argv)

    try:
        message = asyncio.run(commands.run(args.command, vars(args)))
    except commands.CommandError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main())
