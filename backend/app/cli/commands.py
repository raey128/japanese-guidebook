"""Command implementations. `run_in_session` is the in-process seam used by tests."""

from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app import identity, seeding
from app.db import get_engine, get_sessionmaker


class CommandError(Exception):
    pass


async def run_in_session(db: AsyncSession, command: str, options: dict[str, Any]) -> str:
    """Run a command inside an existing session/transaction. The caller commits."""
    try:
        if command == "seed-locations":
            reports = await seeding.seed_locations(db)
            return "; ".join(
                f"{name}: {r.created} created, {r.updated} updated" for name, r in reports.items()
            )
        if command == "seed-places":
            report = await seeding.seed_places(db)
            return f"places: {report.created} created, {report.skipped} already present"
        if command == "make-admin":
            user = await identity.set_admin(
                db, options["username"], is_admin=not options.get("revoke", False)
            )
            return f"{user.username}: admin={user.is_admin}"
        if command == "dump":
            from app import dump  # imported lazily: pulls in pyarrow

            out = Path(options["out"]) if options.get("out") else None
            folder = await dump.write_dump(db, out)
            return f"dump written to {folder}"
        if command == "synthetic":
            from app import synthetic

            n = await synthetic.generate(
                db, int(options.get("count", 50000)), int(options.get("seed", 42))
            )
            return f"synthetic: {n} places created"
    except (seeding.SeedError, LookupError) as e:
        raise CommandError(str(e)) from e
    raise CommandError(f"unknown command {command!r}")


async def run(command: str, options: dict[str, Any]) -> str:
    try:
        async with get_sessionmaker()() as db:
            try:
                message = await run_in_session(db, command, options)
            except BaseException:
                await db.rollback()
                raise
            await db.commit()
            return message
    finally:
        await get_engine().dispose()
